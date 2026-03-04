export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  [key: string]: unknown;
}

const LEVEL_ORDER: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

function createLogger(minLevel: LogLevel = 'info') {
  function write(level: LogLevel, message: string, fields?: Record<string, unknown>): void {
    if (LEVEL_ORDER[level] < LEVEL_ORDER[minLevel]) return;

    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      ...fields,
    };

    process.stdout.write(JSON.stringify(entry) + '\n');
  }

  return {
    debug: (message: string, fields?: Record<string, unknown>) => write('debug', message, fields),
    info: (message: string, fields?: Record<string, unknown>) => write('info', message, fields),
    warn: (message: string, fields?: Record<string, unknown>) => write('warn', message, fields),
    error: (message: string, fields?: Record<string, unknown>) => write('error', message, fields),
  };
}

const VALID_LEVELS = new Set(['debug', 'info', 'warn', 'error']);
const envLevel = process.env['LOG_LEVEL'];
const defaultLevel: LogLevel = (envLevel && VALID_LEVELS.has(envLevel) ? envLevel : 'info') as LogLevel;
const logger = createLogger(defaultLevel);
export { createLogger };
export default logger;
