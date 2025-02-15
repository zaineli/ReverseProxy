import cluster from 'node:cluster';
import os from 'node:os';
import http from 'node:http';
import { Worker } from 'node:cluster';
import fs from 'node:fs';
import path from 'node:path';

import { createClient } from 'redis';

import { rootConfigSchema } from './config-schema';
import { WorkerMessage, workerMessageSchema, ReplyMessage } from './server-schema';

const STATIC_DIR = path.resolve('./public');

interface ServerConfig {
    port: number;
    workerCount: number;
    config: any;
}

// Rate limiting and throttling thresholds
const RATE_LIMIT_THRESHOLD = 100;         // max requests per minute per IP
const THROTTLE_THRESHOLD = 50;            // if requests > threshold then delay
const THROTTLE_DELAY_MS = 1000;           // delay 1 sec for throttling
const CACHE_TTL_SECONDS = 60;             // cache expiry

export async function createServer(config: ServerConfig) {
    const { workerCount } = config;
    const WORKER_POOL: Worker[] = [];

    // Create Redis client instance (primary only)
    const redisClient = createClient();
    redisClient.on('error', (err) => console.error('Redis Client Error', err));
    await redisClient.connect();

    if (cluster.isPrimary) {
        console.log("Master process is running");

        for (let i = 0; i < workerCount; i++) {
            const worker = cluster.fork({ config: JSON.stringify(config.config) });
            WORKER_POOL.push(worker);
            console.log(`Worker ${worker.process.pid} started`);
        }

        cluster.on("exit", (worker) => {
            console.warn(`Worker ${worker.process.pid} exited. Restarting...`);
            const newWorker = cluster.fork({ config: JSON.stringify(config.config) });
            WORKER_POOL.splice(WORKER_POOL.indexOf(worker), 1, newWorker);
            console.log(`New Worker ${newWorker.process.pid} started`);
        });

        let currentWorkerIndex = 0;
        const server = http.createServer((req, res) => {
            (async () => {
                if (WORKER_POOL.length === 0) {
                    res.statusCode = 500;
                    res.end("No worker available");
                    return;
                }
                
                // Rate limiting and throttling based on client IP
                const ip = req.socket.remoteAddress || 'unknown';
                const rateKey = `rate:${ip}`;
                const requests = await redisClient.incr(rateKey);
                if (requests === 1) {
                    await redisClient.expire(rateKey, 60);
                }
                if (requests > RATE_LIMIT_THRESHOLD) {
                    res.statusCode = 429;
                    res.end("Too many requests");
                    return;
                }
                if (requests > THROTTLE_THRESHOLD) {
                    // Delay the request handling if traffic is high
                    await new Promise(resolve => setTimeout(resolve, THROTTLE_DELAY_MS));
                }

                // If a rule matches a static file request, handle it immediately.
                const parsedConfig = config.config;
                const requestURL = req.url ?? '/';
                const rule = parsedConfig.server.rules.find((rule: any) => new RegExp(rule.path).test(requestURL));
                
                if (rule?.static_file) {
                    const filePath = path.join(STATIC_DIR, rule.static_file);
                    if (fs.existsSync(filePath)) {
                        res.writeHead(200, { 'Content-Type': 'text/html' });
                        fs.createReadStream(filePath).pipe(res);
                        return;
                    } else {
                        res.writeHead(404, { 'Content-Type': 'text/plain' });
                        res.end("Static file not found");
                        return;
                    }
                }

                // Caching: Check if the response is already cached.
                const cacheKey = `cache:${req.method}:${requestURL}`;
                const cachedResponse = await redisClient.get(cacheKey);
                if (cachedResponse) {
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(cachedResponse);
                    return;
                }

                // Round robin the worker pool
                const worker = WORKER_POOL[currentWorkerIndex];
                currentWorkerIndex = (currentWorkerIndex + 1) % WORKER_POOL.length;
                const payload: WorkerMessage = {
                    requestType: 'http',
                    headers: req.headers,
                    body: '',
                    url: requestURL,
                };

                worker.send(JSON.stringify(payload));

                worker.once('message', async (message: string) => {
                    const reply: ReplyMessage = JSON.parse(message);
                    if (reply.errorCode) {
                        res.statusCode = reply.errorCode;
                        res.end(reply.errorMessage);
                        return;
                    }
                    // Cache the successful response
                    await redisClient.set(cacheKey, reply.data, {
                        EX: CACHE_TTL_SECONDS,
                    });
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(reply.data);
                });
            })().catch(err => {
                console.error("Error processing request:", err);
                res.statusCode = 500;
                res.end("Internal server error");
            });
        });

        server.listen(config.port, () => {
            console.log(`Server is running on http://localhost:${config.port}`);
        });

    } else {
        try {
            const parsedConfig = await rootConfigSchema.parseAsync(JSON.parse(process.env.config ?? '{}'));
            console.log(`Worker ${process.pid} started with config:`, parsedConfig);

            process.on('message', async (message: string) => {
                try {
                    const messageValidated = await workerMessageSchema.parseAsync(JSON.parse(message));
                    console.log(`Worker ${process.pid} received message:`, messageValidated);

                    const requestURL = messageValidated.url;
                    const rule = parsedConfig.server.rules.find((rule: any) => new RegExp(rule.path).test(requestURL));

                    if (!rule) {
                        const reply: ReplyMessage = { errorCode: 404, errorMessage: `No rule found for ${requestURL}`, data: null };
                        process.send?.(JSON.stringify(reply));
                        return;
                    }

                    const upstreamID = rule.upstream?.[0];
                    if (!upstreamID) {
                        const reply: ReplyMessage = { errorCode: 500, errorMessage: 'No upstream found', data: null };
                        process.send?.(JSON.stringify(reply));
                        return;
                    }

                    const upstream = parsedConfig.server.upstreams.find((up: any) => up.id === upstreamID);
                    if (!upstream) {
                        const reply: ReplyMessage = { errorCode: 500, errorMessage: 'Invalid upstream configuration', data: null };
                        process.send?.(JSON.stringify(reply));
                        return;
                    }

                    const request = http.request(
                        {
                            hostname: upstream.url,
                            path: requestURL,
                            method: 'GET',
                            headers: { Authorization: 'Bearer my-secret-token' }
                        },
                        (response) => {
                            let data = '';
                            response.on('data', (chunk) => {
                                data += chunk;
                            });
                            response.on('end', () => {
                                process.send?.(JSON.stringify({ data }));
                            });
                        }
                    );

                    request.on('error', (err) => {
                        process.send?.(JSON.stringify({ errorCode: 500, errorMessage: err.message, data: null }));
                    });

                    request.end();
                } catch (error) {
                    console.error(`Worker ${process.pid} error:`, error);
                    const reply: ReplyMessage = { errorCode: 500, errorMessage: 'Internal server error', data: null };
                    process.send?.(JSON.stringify(reply));
                }
            });
        } catch (error) {
            console.error(`Worker ${process.pid} startup error:`, error);
        }
    }
}
