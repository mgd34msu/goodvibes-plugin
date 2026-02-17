import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

/**
 * Middleware for security headers and HTTPS enforcement
 */
export function middleware(request: NextRequest) {
  // HTTPS enforcement in production — check before creating response to avoid
  // setting security headers on a response that will be discarded anyway
  if (process.env.NODE_ENV === 'production') {
    const proto = request.headers.get('x-forwarded-proto');
    if (proto === 'http') {
      const url = request.nextUrl.clone();
      url.protocol = 'https';
      return NextResponse.redirect(url, 301);
    }
  }

  const response = NextResponse.next();

  // Security Headers
  
  // Prevent clickjacking attacks
  response.headers.set('X-Frame-Options', 'DENY');
  
  // Prevent MIME type sniffing
  response.headers.set('X-Content-Type-Options', 'nosniff');
  
  // Enable XSS protection in older browsers
  response.headers.set('X-XSS-Protection', '1; mode=block');
  
  // Referrer policy - only send origin for cross-origin requests
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  
  // Content Security Policy - tighten in production (no unsafe-eval)
  const isDev = process.env.NODE_ENV !== 'production';
  const csp = [
    "default-src 'self'",
    isDev
      ? "script-src 'self' 'unsafe-eval' 'unsafe-inline'" // Next.js HMR requires unsafe-eval/inline in dev
      : "script-src 'self'",
    "style-src 'self' 'unsafe-inline'", // Allow inline styles for CSS-in-JS
    "img-src 'self' data: https:",
    "font-src 'self' data:",
    "connect-src 'self'",
    "frame-ancestors 'none'",
  ].join('; ');
  response.headers.set('Content-Security-Policy', csp);
  
  // Permissions Policy - restrict browser features
  const permissionsPolicy = [
    'camera=()',
    'microphone=()',
    'geolocation=()',
    'payment=()',
  ].join(', ');
  response.headers.set('Permissions-Policy', permissionsPolicy);
  
  // Strict Transport Security - enforce HTTPS (only in production)
  if (process.env.NODE_ENV === 'production') {
    response.headers.set(
      'Strict-Transport-Security',
      'max-age=31536000; includeSubDomains; preload'
    );
  }

  return response;
}

// Apply middleware to all routes
export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization)
     * - favicon.ico (favicon file)
     * - public folder
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
