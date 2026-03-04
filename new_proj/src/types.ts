import type { IncomingMessage, ServerResponse } from 'node:http';

/**
 * Handler function for an HTTP route.
 * Receives the raw Node.js request and response objects.
 */
export type RouteHandler = (
  req: IncomingMessage,
  res: ServerResponse
) => void | Promise<void>;

/**
 * Response payload returned by the GET /health endpoint.
 */
export interface HealthResponse {
  /** Always 'ok' when the server is running */
  status: 'ok';
  /** ISO 8601 timestamp of when the response was generated */
  timestamp: string;
}
