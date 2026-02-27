/**
 * Request logging middleware
 * Logs method, URL, status code, and response time with timestamp
 */
const logger = (req, res, next) => {
  if (process.env.NODE_ENV === 'test') return next();
  const start = Date.now();

  res.on('finish', () => {
    const duration = Date.now() - start;
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] ${req.method} ${req.url} ${res.statusCode} - ${duration}ms`);
  });

  next();
};

export default logger;
