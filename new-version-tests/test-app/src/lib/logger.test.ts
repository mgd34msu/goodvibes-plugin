import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { logger, LogLevel, getClientIp } from './logger';

describe('logger.ts', () => {
  // Spy on console methods
  let consoleErrorSpy: any;
  let consoleWarnSpy: any;
  let consoleInfoSpy: any;
  let consoleDebugSpy: any;
  let originalEnv: string | undefined;

  beforeEach(() => {
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    consoleInfoSpy = vi.spyOn(console, 'info').mockImplementation(() => {});
    consoleDebugSpy = vi.spyOn(console, 'debug').mockImplementation(() => {});
    originalEnv = process.env.NODE_ENV;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    process.env.NODE_ENV = originalEnv;
  });

  describe('logger.log', () => {
    it('should log ERROR level to console.error', () => {
      logger.log(LogLevel.ERROR, 'Error message');

      expect(consoleErrorSpy).toHaveBeenCalledOnce();
      const logOutput = JSON.parse(consoleErrorSpy.mock.calls[0][0]);
      expect(logOutput.level).toBe('ERROR');
      expect(logOutput.message).toBe('Error message');
      expect(logOutput.timestamp).toBeDefined();
    });

    it('should log WARN level to console.warn', () => {
      logger.log(LogLevel.WARN, 'Warning message');

      expect(consoleWarnSpy).toHaveBeenCalledOnce();
      const logOutput = JSON.parse(consoleWarnSpy.mock.calls[0][0]);
      expect(logOutput.level).toBe('WARN');
      expect(logOutput.message).toBe('Warning message');
    });

    it('should log INFO level to console.info', () => {
      logger.log(LogLevel.INFO, 'Info message');

      expect(consoleInfoSpy).toHaveBeenCalledOnce();
      const logOutput = JSON.parse(consoleInfoSpy.mock.calls[0][0]);
      expect(logOutput.level).toBe('INFO');
      expect(logOutput.message).toBe('Info message');
    });

    it('should log DEBUG level to console.debug in test environment (not development)', () => {
      // Note: Logger isDevelopment is set at module load time (process.env.NODE_ENV = 'test')
      // So DEBUG logs are suppressed in test environment
      logger.log(LogLevel.DEBUG, 'Debug message');

      expect(consoleDebugSpy).not.toHaveBeenCalled();
    });

    it('should not log DEBUG level in test environment', () => {
      // Logger is already in test environment
      logger.log(LogLevel.DEBUG, 'Debug message');

      expect(consoleDebugSpy).not.toHaveBeenCalled();
    });

    it('should include context in log output', () => {
      const context = {
        method: 'GET',
        path: '/api/users',
        ip: '127.0.0.1',
        userAgent: 'Mozilla/5.0',
        userId: 123,
        duration: 45,
        status: 200,
      };

      logger.log(LogLevel.INFO, 'Request completed', context);

      const logOutput = JSON.parse(consoleInfoSpy.mock.calls[0][0]);
      expect(logOutput.method).toBe('GET');
      expect(logOutput.path).toBe('/api/users');
      expect(logOutput.ip).toBe('127.0.0.1');
      expect(logOutput.userAgent).toBe('Mozilla/5.0');
      expect(logOutput.userId).toBe(123);
      expect(logOutput.duration).toBe(45);
      expect(logOutput.status).toBe(200);
    });

    it('should include partial context', () => {
      const context = {
        method: 'POST',
        path: '/api/login',
      };

      logger.log(LogLevel.INFO, 'Login attempt', context);

      const logOutput = JSON.parse(consoleInfoSpy.mock.calls[0][0]);
      expect(logOutput.method).toBe('POST');
      expect(logOutput.path).toBe('/api/login');
      expect(logOutput.userId).toBeUndefined();
    });

    it('should create valid ISO timestamp', () => {
      logger.log(LogLevel.INFO, 'Test message');

      const logOutput = JSON.parse(consoleInfoSpy.mock.calls[0][0]);
      const timestamp = new Date(logOutput.timestamp);
      expect(timestamp).toBeInstanceOf(Date);
      expect(timestamp.getTime()).not.toBeNaN();
    });
  });

  describe('logger.error', () => {
    it('should call log with ERROR level', () => {
      logger.error('Error occurred');

      expect(consoleErrorSpy).toHaveBeenCalledOnce();
      const logOutput = JSON.parse(consoleErrorSpy.mock.calls[0][0]);
      expect(logOutput.level).toBe('ERROR');
      expect(logOutput.message).toBe('Error occurred');
    });

    it('should include context', () => {
      const context = { method: 'GET', path: '/api/fail', error: 'Internal error' };
      logger.error('Request failed', context);

      const logOutput = JSON.parse(consoleErrorSpy.mock.calls[0][0]);
      expect(logOutput.error).toBe('Internal error');
    });
  });

  describe('logger.warn', () => {
    it('should call log with WARN level', () => {
      logger.warn('Warning occurred');

      expect(consoleWarnSpy).toHaveBeenCalledOnce();
      const logOutput = JSON.parse(consoleWarnSpy.mock.calls[0][0]);
      expect(logOutput.level).toBe('WARN');
      expect(logOutput.message).toBe('Warning occurred');
    });

    it('should include context', () => {
      const context = { method: 'POST', status: 400 };
      logger.warn('Bad request', context);

      const logOutput = JSON.parse(consoleWarnSpy.mock.calls[0][0]);
      expect(logOutput.status).toBe(400);
    });
  });

  describe('logger.info', () => {
    it('should call log with INFO level', () => {
      logger.info('Info message');

      expect(consoleInfoSpy).toHaveBeenCalledOnce();
      const logOutput = JSON.parse(consoleInfoSpy.mock.calls[0][0]);
      expect(logOutput.level).toBe('INFO');
      expect(logOutput.message).toBe('Info message');
    });

    it('should include context', () => {
      const context = { method: 'GET', path: '/api/users', status: 200 };
      logger.info('Request successful', context);

      const logOutput = JSON.parse(consoleInfoSpy.mock.calls[0][0]);
      expect(logOutput.status).toBe(200);
    });
  });

  describe('logger.debug', () => {
    it('should not call console.debug in test environment', () => {
      // Logger isDevelopment is false in test environment
      logger.debug('Debug message');

      expect(consoleDebugSpy).not.toHaveBeenCalled();
    });
  });

  describe('getClientIp', () => {
    it('should extract IP from x-forwarded-for header', () => {
      const request = new Request('http://localhost', {
        headers: { 'x-forwarded-for': '203.0.113.1, 198.51.100.2' },
      });

      const ip = getClientIp(request);

      expect(ip).toBe('203.0.113.1');
    });

    it('should extract single IP from x-forwarded-for', () => {
      const request = new Request('http://localhost', {
        headers: { 'x-forwarded-for': '203.0.113.1' },
      });

      const ip = getClientIp(request);

      expect(ip).toBe('203.0.113.1');
    });

    it('should trim whitespace from x-forwarded-for IP', () => {
      const request = new Request('http://localhost', {
        headers: { 'x-forwarded-for': '  203.0.113.1  , 198.51.100.2' },
      });

      const ip = getClientIp(request);

      expect(ip).toBe('203.0.113.1');
    });

    it('should extract IP from x-real-ip header when x-forwarded-for is missing', () => {
      const request = new Request('http://localhost', {
        headers: { 'x-real-ip': '198.51.100.5' },
      });

      const ip = getClientIp(request);

      expect(ip).toBe('198.51.100.5');
    });

    it('should prefer x-forwarded-for over x-real-ip', () => {
      const request = new Request('http://localhost', {
        headers: {
          'x-forwarded-for': '203.0.113.1',
          'x-real-ip': '198.51.100.5',
        },
      });

      const ip = getClientIp(request);

      expect(ip).toBe('203.0.113.1');
    });

    it('should return "unknown" when no IP headers are present', () => {
      const request = new Request('http://localhost');

      const ip = getClientIp(request);

      expect(ip).toBe('unknown');
    });

    it('should handle IPv6 addresses in x-forwarded-for', () => {
      const request = new Request('http://localhost', {
        headers: { 'x-forwarded-for': '2001:0db8:85a3::8a2e:0370:7334' },
      });

      const ip = getClientIp(request);

      expect(ip).toBe('2001:0db8:85a3::8a2e:0370:7334');
    });

    it('should handle empty x-forwarded-for header', () => {
      const request = new Request('http://localhost', {
        headers: { 'x-forwarded-for': '' },
      });

      const ip = getClientIp(request);

      expect(ip).toBe('unknown');
    });
  });
});
