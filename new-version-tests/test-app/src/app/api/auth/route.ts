import { NextResponse } from 'next/server';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { db } from '@/lib/db';
import { logger, getClientIp } from '@/lib/logger';
import { rateLimiter, RATE_LIMITS } from '@/lib/rate-limiter';
import { ValidationError, AuthenticationError, RateLimitError, AppError } from '@/lib/errors';
import { validatePasswordStrength } from '@/lib/auth';
import type { User, AuthRequest, AuthResponse, ErrorResponse } from '@/types/api';

// Validate JWT secret from environment
if (!process.env.JWT_SECRET) {
  throw new Error('JWT_SECRET environment variable is required');
}

const JWT_SECRET = process.env.JWT_SECRET;
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d';

/**
 * Validates email format
 */
function isValidEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

/**
 * POST /api/auth
 * Authenticates a user and returns a JWT token
 */
export async function POST(request: Request) {
  const startTime = Date.now();
  const ip = getClientIp(request);

  try {
    // Stricter rate limiting for auth endpoint to prevent brute force attacks
    if (rateLimiter.check(`auth:${ip}`, RATE_LIMITS.auth)) {
      const info = rateLimiter.getInfo(`auth:${ip}`, RATE_LIMITS.auth);
      const retryAfter = info.resetAt - Date.now();
      throw new RateLimitError(retryAfter);
    }

    const body: unknown = await request.json();

    // Validate request body structure
    if (!body || typeof body !== 'object') {
      throw new ValidationError('Invalid request body');
    }

    const { email, password } = body as Partial<AuthRequest>;

    // Validate required fields
    if (!email || typeof email !== 'string' || !isValidEmail(email)) {
      throw new ValidationError('Invalid email', 'Valid email address is required');
    }

    if (!password || typeof password !== 'string' || password.length === 0) {
      throw new ValidationError('Invalid password', 'Password is required');
    }

    // Validate password strength for login attempts
    const passwordValidation = validatePasswordStrength(password);
    if (!passwordValidation.valid) {
      // Don't reveal password requirements on login to prevent enumeration
      // Just use generic error
      throw new AuthenticationError();
    }

    // Sanitize email
    const sanitizedEmail = email.trim().toLowerCase();

    // Query user using parameterized query to prevent SQL injection
    const users = await db.query<User[]>(
      'SELECT id, email, role, password_hash FROM users WHERE email = ?',
      [sanitizedEmail]
    );

    if (users.length === 0) {
      // Use generic error message to prevent user enumeration
      throw new AuthenticationError();
    }

    const user = users[0];

    // Validate password_hash exists
    if (!user.password_hash) {
      logger.error('POST /api/auth - User missing password_hash', {
        method: 'POST',
        path: '/api/auth',
        ip,
        userId: user.id,
      });
      throw new AuthenticationError();
    }

    // Verify password
    const valid = await bcrypt.compare(password, user.password_hash);

    if (!valid) {
      throw new AuthenticationError();
    }

    // Generate JWT token with expiration
    const token = jwt.sign(
      { id: user.id, email: user.email, role: user.role },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES_IN }
    );

    const response: AuthResponse = { token };

    const duration = Date.now() - startTime;
    logger.info('POST /api/auth - Login successful', {
      method: 'POST',
      path: '/api/auth',
      ip,
      userId: user.id,
      status: 200,
      duration,
    });

    return NextResponse.json(response);
  } catch (error) {
    const duration = Date.now() - startTime;

    if (error instanceof AppError) {
      logger.warn('POST /api/auth', {
        method: 'POST',
        path: '/api/auth',
        ip,
        status: error.statusCode,
        duration,
        error: error.message,
      });

      const response = NextResponse.json<ErrorResponse>(error.toJSON(), { status: error.statusCode });
      
      if (error instanceof RateLimitError) {
        response.headers.set('Retry-After', Math.ceil(error.retryAfter / 1000).toString());
      }
      
      return response;
    }

    logger.error('POST /api/auth', {
      method: 'POST',
      path: '/api/auth',
      ip,
      status: 500,
      duration,
      error: error instanceof Error ? error.message : 'Unknown error',
    });

    return NextResponse.json<ErrorResponse>(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
