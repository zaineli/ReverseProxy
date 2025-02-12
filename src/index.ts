import { program } from 'commander';

async function main(){
    program.option('--config <path>');
    program.parse(process.argv);
    const options = program.opts();


}