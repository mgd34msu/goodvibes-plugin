import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { logger, getClientIp } from '@/lib/logger';
import { rateLimiter, RATE_LIMITS } from '@/lib/rate-limiter';
import { ValidationError, NotFoundError, ConflictError, RateLimitError, AppError } from '@/lib/errors';
import { verifyToken, requireRole } from '@/lib/auth';
import type { User, CreateUserRequest, CreateUserResponse, ErrorResponse, PaginatedResponse } from '@/types/api';

/**
 * Validates email format
 */
function isValidEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

/**
 * Validates user role
 */
function isValidRole(role: string): boolean {
  return ['admin', 'user', 'guest'].includes(role);
}

/**
 * GET /api/users
 * Query params: role (optional), page (default: 1), limit (default: 10, max: 100)
 */
export async function GET(request: Request) {
  const startTime = Date.now();
  const ip = getClientIp(request);
  const url = new URL(request.url);

  try {
    // Authentication required
    const user = verifyToken(request);

    // Rate limiting
    if (rateLimiter.check(ip, RATE_LIMITS.api)) {
      const info = rateLimiter.getInfo(ip, RATE_LIMITS.api);
      const retryAfter = info.resetAt - Date.now();
      throw new RateLimitError(retryAfter);
    }

    const role = url.searchParams.get('role');
    const pageParam = url.searchParams.get('page');
    const limitParam = url.searchParams.get('limit');

    // Validate role if provided
    if (role && !isValidRole(role)) {
      throw new ValidationError('Invalid role', 'Role must be one of: admin, user, guest');
    }

    // Pagination parameters with validation
    const page = pageParam ? parseInt(pageParam, 10) : 1;
    const limit = limitParam ? parseInt(limitParam, 10) : 10;

    if (isNaN(page) || page < 1) {
      throw new ValidationError('Invalid page', 'Page must be a positive integer');
    }

    if (isNaN(limit) || limit < 1 || limit > 100) {
      throw new ValidationError('Invalid limit', 'Limit must be between 1 and 100');
    }

    const offset = (page - 1) * limit;

    // Build queries
    let countQuery = 'SELECT COUNT(*) as total FROM users';
    let dataQuery = 'SELECT id, name, email, role, created_at, updated_at FROM users';
    const params: string[] = [];

    if (role) {
      const whereClause = ' WHERE role = ?';
      countQuery += whereClause;
      dataQuery += whereClause;
      params.push(role);
    }

    dataQuery += ' LIMIT ? OFFSET ?';

    // Execute queries
    const [countResult, users] = await Promise.all([
      db.query<{ total: number }[]>(countQuery, params),
      db.query<User[]>(dataQuery, [...params, limit.toString(), offset.toString()]),
    ]);

    const total = countResult[0]?.total || 0;
    const totalPages = Math.ceil(total / limit);

    const response: PaginatedResponse<User> = {
      data: users,
      pagination: {
        page,
        limit,
        total,
        totalPages,
        hasNext: page < totalPages,
        hasPrev: page > 1,
      },
    };

    const duration = Date.now() - startTime;
    logger.info('GET /api/users', {
      method: 'GET',
      path: '/api/users',
      ip,
      status: 200,
      duration,
    });

    return NextResponse.json(response);
  } catch (error) {
    const duration = Date.now() - startTime;

    if (error instanceof AppError) {
      logger.warn('GET /api/users', {
        method: 'GET',
        path: '/api/users',
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

    logger.error('GET /api/users', {
      method: 'GET',
      path: '/api/users',
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

/**
 * POST /api/users
 * Creates a new user
 */
export async function POST(request: Request) {
  const startTime = Date.now();
  const ip = getClientIp(request);

  try {
    // Authentication required - only admins can create users
    const currentUser = verifyToken(request);
    requireRole(currentUser, ['admin']);

    // Rate limiting
    if (rateLimiter.check(ip, RATE_LIMITS.api)) {
      const info = rateLimiter.getInfo(ip, RATE_LIMITS.api);
      const retryAfter = info.resetAt - Date.now();
      throw new RateLimitError(retryAfter);
    }

    const body: unknown = await request.json();

    // Validate request body structure
    if (!body || typeof body !== 'object') {
      throw new ValidationError('Invalid request body');
    }

    const { name, email, role } = body as Partial<CreateUserRequest>;

    // Validate required fields
    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      throw new ValidationError('Invalid name', 'Name is required and must be a non-empty string');
    }

    if (name.trim().length > 255) {
      throw new ValidationError('Invalid name', 'Name must not exceed 255 characters');
    }

    if (!email || typeof email !== 'string' || !isValidEmail(email)) {
      throw new ValidationError('Invalid email', 'Valid email address is required');
    }

    if (!role || typeof role !== 'string' || !isValidRole(role)) {
      throw new ValidationError('Invalid role', 'Role must be one of: admin, user, guest');
    }

    // Sanitize inputs
    const sanitizedName = name.trim();
    const sanitizedEmail = email.trim().toLowerCase();

    // Check if user already exists
    const existingUsers = await db.query<User[]>(
      'SELECT id FROM users WHERE email = ?',
      [sanitizedEmail]
    );

    if (existingUsers.length > 0) {
      throw new ConflictError('User already exists', 'A user with this email already exists');
    }

    // Insert new user using parameterized query
    const result = await db.query<{ insertId: number }>(
      'INSERT INTO users (name, email, role) VALUES (?, ?, ?)',
      [sanitizedName, sanitizedEmail, role]
    );

    const response: CreateUserResponse = {
      id: result.insertId,
      name: sanitizedName,
      email: sanitizedEmail,
      role,
    };

    const duration = Date.now() - startTime;
    logger.info('POST /api/users', {
      method: 'POST',
      path: '/api/users',
      ip,
      status: 201,
      duration,
    });

    return NextResponse.json(response, { status: 201 });
  } catch (error) {
    const duration = Date.now() - startTime;

    if (error instanceof AppError) {
      logger.warn('POST /api/users', {
        method: 'POST',
        path: '/api/users',
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

    logger.error('POST /api/users', {
      method: 'POST',
      path: '/api/users',
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

/**
 * DELETE /api/users
 * Query params: id (required)
 */
export async function DELETE(request: Request) {
  const startTime = Date.now();
  const ip = getClientIp(request);
  const url = new URL(request.url);

  try {
    // Authentication required - only admins can delete users
    const currentUser = verifyToken(request);
    requireRole(currentUser, ['admin']);

    // Rate limiting
    if (rateLimiter.check(ip, RATE_LIMITS.api)) {
      const info = rateLimiter.getInfo(ip, RATE_LIMITS.api);
      const retryAfter = info.resetAt - Date.now();
      throw new RateLimitError(retryAfter);
    }

    const id = url.searchParams.get('id');

    // Validate ID
    if (!id) {
      throw new ValidationError('Missing ID', 'User ID is required');
    }

    const userId = parseInt(id, 10);
    if (isNaN(userId) || userId <= 0) {
      throw new ValidationError('Invalid ID', 'User ID must be a positive integer');
    }

    // Check if user exists
    const existingUsers = await db.query<User[]>(
      'SELECT id FROM users WHERE id = ?',
      [userId]
    );

    if (existingUsers.length === 0) {
      throw new NotFoundError('User');
    }

    // Prevent users from deleting themselves
    if (userId === currentUser.id) {
      throw new ValidationError('Cannot delete yourself', 'Use a different admin account to delete this user');
    }

    // Delete user using parameterized query
    await db.query('DELETE FROM users WHERE id = ?', [userId]);

    const duration = Date.now() - startTime;
    logger.info('DELETE /api/users', {
      method: 'DELETE',
      path: '/api/users',
      ip,
      status: 200,
      duration,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    const duration = Date.now() - startTime;

    if (error instanceof AppError) {
      logger.warn('DELETE /api/users', {
        method: 'DELETE',
        path: '/api/users',
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

    logger.error('DELETE /api/users', {
      method: 'DELETE',
      path: '/api/users',
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
