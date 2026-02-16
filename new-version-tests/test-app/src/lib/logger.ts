/**
 * Request logging utility
 * Structured logging for API requests with timing and error tracking
 */

export interface LogContext {
  method: string;
  path: string;
  ip?: string;
  userAgent?: string;
  userId?: number;
  duration?: number;
  status?: number;
  error?: string;
}

/**
 * Log levels
 */
export enum LogLevel {
  ERROR = 'ERROR',
  WARN = 'WARN',
  INFO = 'INFO',
  DEBUG = 'DEBUG',
}

class Logger {
  private isDevelopment = process.env.NODE_ENV === 'development';

  /**
   * Log a message with context
   */
  log(level: LogLevel, message: string, context?: LogContext): void {
    const timestamp = new Date().toISOString();
    const logEntry = {
      timestamp,
      level,
      message,
      ...context,
    };

    // In production, you'd send this to a logging service
    // For now, use console with structured output
    const output = JSON.stringify(logEntry);

    switch (level) {
      case LogLevel.ERROR:
        console.error(output);
        break;
      case LogLevel.WARN:
        console.warn(output);
        break;
      case LogLevel.INFO:
        console.info(output);
        break;
      case LogLevel.DEBUG:
        if (this.isDevelopment) {
          console.debug(output);
        }
        break;
    }
  }

  error(message: string, context?: LogContext): void {
    this.log(LogLevel.ERROR, message, context);
  }

  warn(message: string, context?: LogContext): void {
    this.log(LogLevel.WARN, message, context);
  }

  info(message: string, context?: LogContext): void {
    this.log(LogLevel.INFO, message, context);
  }

  debug(message: string, context?: LogContext): void {
    this.log(LogLevel.DEBUG, message, context);
  }
}

export const logger = new Logger();

/**
 * Helper to get client IP from request
 */
export function getClientIp(request: Request): string {
  // Check common headers for IP address
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) {
    return forwarded.split(',')[0].trim();
  }

  const realIp = request.headers.get('x-real-ip');
  if (realIp) {
    return realIp;
  }

  return 'unknown';
}
