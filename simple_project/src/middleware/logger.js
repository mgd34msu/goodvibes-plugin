/**
 * Simple request logger middleware.
 * Logs method, URL, and ISO timestamp for every incoming request.
 *
 * @param {import('express').Request} req
 * @param {import('express').Response} _res
 * @param {import('express').NextFunction} next
 */
export function loggerMiddleware(req, _res, next) {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] ${req.method} ${req.url}`);
  next();
}
