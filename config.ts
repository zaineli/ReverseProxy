import fs from 'node:fs/promises';

import { parse } from 'yaml';

import { rootSchema } from './config-schema';


async function parseYAMLConfig(filePath: string) {
  const configFileContent  = await fs.readFile(filePath, 'utf-8');
  const configParsed = await parse(configFileContent);
    return JSON.stringify(configParsed);
}

