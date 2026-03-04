import type { IncomingMessage, ServerResponse } from 'node:http';
import logger from './logger.js';

export type Next = (err?: Error) => void;

export type RequestHandler = (
  req: IncomingMessage,
  res: ServerResponse,
  next: Next,
) => void;

export function requestLogger(): RequestHandler {
  return (req: IncomingMessage, res: ServerResponse, next: Next): void => {
    const startTime = Date.now();
    const method = req.method ?? 'UNKNOWN';
    const url = req.url ?? '/';

    res.on('finish', () => {
      const responseTime = Date.now() - startTime;
      const statusCode = res.statusCode;

      logger.info('request', {
        method,
        url,
        statusCode,
        responseTimeMs: responseTime,
      });
    });

    next();
  };
}
