import cluster from 'node:cluster';
import os from 'node:os';

import { rootConfigSchema } from './config-schema';

interface ServerConfig {
    port: number;
    workerCount: number;
    config: rootConfigSchema;
}

export async function createServer(config: ServerConfig) {
    const { workerCount } = config;
    const workers = new Array(workerCount);

    if (cluster.isPrimary) {
        console.log("Master process is running");

        for (let i = 0; i < workerCount; i++) {
            const worker = cluster.fork({ config: JSON.stringify(config.config) });
            workers[i] = worker;
            console.log(`Worker ${worker.process.pid} started`);
        }

    } else {
        // Parse worker config from environment variable
        const parsedConfig = await rootConfigSchema.parseAsync(JSON.parse(`${process.env.config}`));
        console.log(`Worker ${process.pid} started with config:`, parsedConfig);
        
        // Initialize actual proxy server logic here...
    }
}
