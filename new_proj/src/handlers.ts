import type { RouteHandler, HealthResponse } from './types.js';

/**
 * Handles GET /health — returns a JSON health check response.
 */
export const healthHandler: RouteHandler = (_req, res): void => {
  const body: HealthResponse = {
    status: 'ok',
    timestamp: new Date().toISOString(),
  };
  const json = JSON.stringify(body);
  res.writeHead(200, {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(json),
  });
  res.end(json);
};

/**
 * Handles any unmatched route — returns a 404 JSON response.
 */
export const notFoundHandler: RouteHandler = (_req, res): void => {
  const body = JSON.stringify({ error: 'Not Found' });
  res.writeHead(404, {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(body),
  });
  res.end(body);
};
