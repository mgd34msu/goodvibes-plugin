import { createServer } from 'node:http';
import config from './config.js';
import logger from './logger.js';
import { requestLogger } from './middleware.js';
import { healthHandler, notFoundHandler } from './handlers.js';

const logRequest = requestLogger();

const server = createServer((req, res): void => {
  logRequest(req, res, () => {
    const { method, url } = req;

    if (method === 'GET' && url === '/health') {
      healthHandler(req, res);
      return;
    }

    notFoundHandler(req, res);
  });
});

server.on('error', (err: NodeJS.ErrnoException) => {
  if (err.code === 'EADDRINUSE') {
    logger.error('Port already in use', { port: config.port, code: err.code });
  } else {
    logger.error('Server error', { message: err.message, code: err.code });
  }
  server.close(() => process.exit(1));
});

server.listen(config.port, config.host, () => {
  logger.info('Server listening', { url: `http://${config.host}:${config.port}` });
});
