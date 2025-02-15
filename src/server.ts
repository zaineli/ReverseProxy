import cluster from 'node:cluster';
import os from 'node:os';
import http from 'node:http';
import { Worker } from 'node:cluster';
import fs from 'node:fs';
import path from 'node:path';

import { rootConfigSchema } from './config-schema';
import { WorkerMessage, workerMessageSchema, ReplyMessage } from './server-schema';

const STATIC_DIR = path.resolve('./public');

interface ServerConfig {
    port: number;
    workerCount: number;
    config: any;
}

export async function createServer(config: ServerConfig) {
    const { workerCount } = config;
    const WORKER_POOL: Worker[] = [];

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
            if (WORKER_POOL.length === 0) {
                res.statusCode = 500;
                res.end("No worker available");
                return;
            }

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

            const worker = WORKER_POOL[currentWorkerIndex];
            currentWorkerIndex = (currentWorkerIndex + 1) % WORKER_POOL.length;
            const payload: WorkerMessage = {
                requestType: 'http',
                headers: req.headers,
                body: '',
                url: req.url ?? '/',
            };

            worker.send(JSON.stringify(payload));

            worker.once('message', (message: string) => {
                const reply: ReplyMessage = JSON.parse(message);
                if (reply.errorCode) {
                    res.statusCode = reply.errorCode;
                    res.end(reply.errorMessage);
                    return;
                }
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(reply.data);
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
