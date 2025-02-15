import { program } from 'commander';
import { parseYAMLConfig, validateConfig} from "./config"


async function main(){
    program.option('--config <path>');
    program.parse(process.argv);
    const options = program.opts();


    if(options && 'config' in options){
        const validatedConfig = await validateConfig( await parseYAMLConfig(options.config));
    
    }
}

main();