import { program } from 'commander';

import os from 'node:os';

import { parseYAMLConfig, validateConfig } from './config';
import { createServer } from './server';

async function main() {
    program.option('--config <path>');
    program.parse(process.argv);
    const options = program.opts();

    if (options?.config) {
        const validatedConfig = await validateConfig(await parseYAMLConfig(options.config));

        await createServer({
            port: validatedConfig.server.listen,
            workerCount: validatedConfig.server.workers ?? os.cpus().length,
            config: validatedConfig
        });
    } else {
        console.error("Error: Config file path is required. Use --config <path>");
        process.exit(1);
    }
}

main();
