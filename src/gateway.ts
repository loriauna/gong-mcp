#!/usr/bin/env node

import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import { StdioToHttpGateway } from './gateway/stdio-to-http.js';
import { GatewayOptions } from './types/index.js';
import { defaultLogger } from './utils/logger.js';
import dotenv from 'dotenv';

dotenv.config();

const argv = yargs(hideBin(process.argv))
  .option('port', {
    alias: 'p',
    type: 'number',
    default: parseInt(process.env.PORT || '8000'),
    description: 'Port to run the gateway server on'
  })
  .option('command', {
    alias: 'c',
    type: 'string',
    default: 'node',
    description: 'Command to run the MCP server'
  })
  .option('args', {
    alias: 'a',
    type: 'array',
    default: ['dist/index.js'],
    description: 'Arguments for the MCP server command'
  })
  .option('cors', {
    type: 'boolean',
    default: true,
    description: 'Enable CORS headers'
  })
  .option('health-endpoint', {
    alias: 'h',
    type: 'string',
    default: '/health',
    description: 'Health check endpoint path'
  })
  .help()
  .parseSync();

async function main() {
  const options: GatewayOptions = {
    port: argv.port,
    command: argv.command,
    args: argv.args as string[],
    cors: argv.cors,
    healthEndpoint: argv['health-endpoint'],
    logger: defaultLogger
  };

  defaultLogger.info('Starting Gong MCP Gateway with options:', options);

  const gateway = new StdioToHttpGateway(options);
  
  try {
    await gateway.start();
  } catch (error) {
    defaultLogger.error('Failed to start gateway:', error);
    process.exit(1);
  }
}

main().catch((error) => {
  defaultLogger.error('Fatal error:', error);
  process.exit(1);
});