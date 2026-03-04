import type { LogLevel } from './logger.js';

const VALID_LOG_LEVELS: ReadonlySet<string> = new Set<string>(['debug', 'info', 'warn', 'error']);

export function parseLogLevel(value: string | undefined): LogLevel {
  if (value && VALID_LOG_LEVELS.has(value)) {
    return value as LogLevel;
  }
  return 'info';
}

export function parsePort(value: string | undefined): number {
  const port = Number(value);
  if (Number.isInteger(port) && port > 0 && port < 65536) {
    return port;
  }
  return 3000;
}

export interface Config {
  port: number;
  host: string;
  logLevel: LogLevel;
}

export function loadConfig(): Config {
  return {
    port: parsePort(process.env['PORT']),
    host: process.env['HOST'] ?? '0.0.0.0',
    logLevel: parseLogLevel(process.env['LOG_LEVEL']),
  };
}

const config: Config = loadConfig();
export default config;
