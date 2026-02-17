import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';
import { middleware } from './middleware';

describe('middleware.ts', () => {
  let originalEnv: string | undefined;

  beforeEach(() => {
    originalEnv = process.env.NODE_ENV;
  });

  afterEach(() => {
    process.env.NODE_ENV = originalEnv;
  });

  describe('Security Headers', () => {
    it('should set X-Frame-Options to DENY', () => {
      const request = new NextRequest('http://localhost:3000/api/test');
      const response = middleware(request);

      expect(response.headers.get('X-Frame-Options')).toBe('DENY');
    });

    it('should set X-Content-Type-Options to nosniff', () => {
      const request = new NextRequest('http://localhost:3000/api/test');
      const response = middleware(request);

      expect(response.headers.get('X-Content-Type-Options')).toBe('nosniff');
    });

    it('should set X-XSS-Protection header', () => {
      const request = new NextRequest('http://localhost:3000/api/test');
      const response = middleware(request);

      expect(response.headers.get('X-XSS-Protection')).toBe('1; mode=block');
    });

    it('should set Referrer-Policy header', () => {
      const request = new NextRequest('http://localhost:3000/api/test');
      const response = middleware(request);

      expect(response.headers.get('Referrer-Policy')).toBe('strict-origin-when-cross-origin');
    });

    it('should set Content-Security-Policy header', () => {
      const request = new NextRequest('http://localhost:3000/api/test');
      const response = middleware(request);

      const csp = response.headers.get('Content-Security-Policy');
      expect(csp).toContain("default-src 'self'");
      expect(csp).toContain("script-src 'self' 'unsafe-eval' 'unsafe-inline'");
      expect(csp).toContain("style-src 'self' 'unsafe-inline'");
      expect(csp).toContain("img-src 'self' data: https:");
      expect(csp).toContain("font-src 'self' data:");
      expect(csp).toContain("connect-src 'self'");
      expect(csp).toContain("frame-ancestors 'none'");
    });

    it('should set Permissions-Policy header', () => {
      const request = new NextRequest('http://localhost:3000/api/test');
      const response = middleware(request);

      const permissionsPolicy = response.headers.get('Permissions-Policy');
      expect(permissionsPolicy).toContain('camera=()');
      expect(permissionsPolicy).toContain('microphone=()');
      expect(permissionsPolicy).toContain('geolocation=()');
      expect(permissionsPolicy).toContain('payment=()');
    });

    it('should set all security headers on every request', () => {
      const request = new NextRequest('http://localhost:3000/');
      const response = middleware(request);

      expect(response.headers.get('X-Frame-Options')).toBeDefined();
      expect(response.headers.get('X-Content-Type-Options')).toBeDefined();
      expect(response.headers.get('X-XSS-Protection')).toBeDefined();
      expect(response.headers.get('Referrer-Policy')).toBeDefined();
      expect(response.headers.get('Content-Security-Policy')).toBeDefined();
      expect(response.headers.get('Permissions-Policy')).toBeDefined();
    });
  });

  describe('Strict-Transport-Security (HSTS)', () => {
    it('should set HSTS header in production', () => {
      process.env.NODE_ENV = 'production';
      
      const request = new NextRequest('http://localhost:3000/api/test');
      const response = middleware(request);

      const hsts = response.headers.get('Strict-Transport-Security');
      expect(hsts).toBe('max-age=31536000; includeSubDomains; preload');
    });

    it('should not set HSTS header in development', () => {
      process.env.NODE_ENV = 'development';
      
      const request = new NextRequest('http://localhost:3000/api/test');
      const response = middleware(request);

      expect(response.headers.get('Strict-Transport-Security')).toBeNull();
    });

    it('should not set HSTS header in test environment', () => {
      process.env.NODE_ENV = 'test';
      
      const request = new NextRequest('http://localhost:3000/api/test');
      const response = middleware(request);

      expect(response.headers.get('Strict-Transport-Security')).toBeNull();
    });
  });

  describe('HTTPS Enforcement', () => {
    it('should redirect HTTP to HTTPS in production', () => {
      process.env.NODE_ENV = 'production';
      
      const request = new NextRequest('http://example.com/api/test', {
        headers: { 'x-forwarded-proto': 'http' },
      });
      const response = middleware(request);

      expect(response.status).toBe(301);
      expect(response.headers.get('Location')).toBe('https://example.com/api/test');
    });

    it('should not redirect HTTPS requests in production', () => {
      process.env.NODE_ENV = 'production';
      
      const request = new NextRequest('https://example.com/api/test', {
        headers: { 'x-forwarded-proto': 'https' },
      });
      const response = middleware(request);

      expect(response.status).toBe(200);
      expect(response.headers.get('Location')).toBeNull();
    });

    it('should not redirect in development', () => {
      process.env.NODE_ENV = 'development';
      
      const request = new NextRequest('http://localhost:3000/api/test', {
        headers: { 'x-forwarded-proto': 'http' },
      });
      const response = middleware(request);

      expect(response.status).toBe(200);
      expect(response.headers.get('Location')).toBeNull();
    });

    it('should not redirect in test environment', () => {
      process.env.NODE_ENV = 'test';
      
      const request = new NextRequest('http://localhost:3000/api/test', {
        headers: { 'x-forwarded-proto': 'http' },
      });
      const response = middleware(request);

      expect(response.status).toBe(200);
      expect(response.headers.get('Location')).toBeNull();
    });

    it('should preserve query parameters in HTTPS redirect', () => {
      process.env.NODE_ENV = 'production';
      
      const request = new NextRequest('http://example.com/api/test?foo=bar&baz=qux', {
        headers: { 'x-forwarded-proto': 'http' },
      });
      const response = middleware(request);

      expect(response.status).toBe(301);
      expect(response.headers.get('Location')).toBe('https://example.com/api/test?foo=bar&baz=qux');
    });

    it('should preserve pathname in HTTPS redirect', () => {
      process.env.NODE_ENV = 'production';
      
      const request = new NextRequest('http://example.com/api/users/123', {
        headers: { 'x-forwarded-proto': 'http' },
      });
      const response = middleware(request);

      expect(response.status).toBe(301);
      expect(response.headers.get('Location')).toBe('https://example.com/api/users/123');
    });

    it('should handle missing x-forwarded-proto header in production', () => {
      process.env.NODE_ENV = 'production';
      
      const request = new NextRequest('http://example.com/api/test');
      const response = middleware(request);

      // Should not redirect if header is missing
      expect(response.status).toBe(200);
    });
  });

  describe('Response passthrough', () => {
    it('should return NextResponse when no redirect needed', () => {
      const request = new NextRequest('http://localhost:3000/api/test');
      const response = middleware(request);

      expect(response.status).toBe(200);
    });

    it('should work for different paths', () => {
      const paths = ['/', '/api/users', '/api/auth/login', '/dashboard'];
      
      paths.forEach(path => {
        const request = new NextRequest(`http://localhost:3000${path}`);
        const response = middleware(request);
        
        expect(response.headers.get('X-Frame-Options')).toBe('DENY');
      });
    });

    it('should work for different HTTP methods', () => {
      const methods = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'];
      
      methods.forEach(method => {
        const request = new NextRequest('http://localhost:3000/api/test', {
          method,
        });
        const response = middleware(request);
        
        expect(response.headers.get('X-Frame-Options')).toBe('DENY');
      });
    });
  });

  describe('Edge cases', () => {
    it('should handle root path', () => {
      const request = new NextRequest('http://localhost:3000/');
      const response = middleware(request);

      expect(response.headers.get('X-Frame-Options')).toBe('DENY');
    });

    it('should handle paths with special characters', () => {
      const request = new NextRequest('http://localhost:3000/api/test?param=value%20with%20spaces');
      const response = middleware(request);

      expect(response.headers.get('X-Frame-Options')).toBe('DENY');
    });

    it('should handle very long paths', () => {
      const longPath = '/api/' + 'segment/'.repeat(50) + 'end';
      const request = new NextRequest(`http://localhost:3000${longPath}`);
      const response = middleware(request);

      expect(response.headers.get('X-Frame-Options')).toBe('DENY');
    });

    it('should handle requests with custom headers', () => {
      const request = new NextRequest('http://localhost:3000/api/test', {
        headers: {
          'Custom-Header': 'custom-value',
          'User-Agent': 'Test Agent',
        },
      });
      const response = middleware(request);

      expect(response.headers.get('X-Frame-Options')).toBe('DENY');
    });
  });
});
