import { NextResponse } from 'next/server';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { db } from '@/lib/db';
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
  try {
    const body: unknown = await request.json();

    // Validate request body structure
    if (!body || typeof body !== 'object') {
      return NextResponse.json<ErrorResponse>(
        { error: 'Invalid request body' },
        { status: 400 }
      );
    }

    const { email, password } = body as Partial<AuthRequest>;

    // Validate required fields
    if (!email || typeof email !== 'string' || !isValidEmail(email)) {
      return NextResponse.json<ErrorResponse>(
        { error: 'Invalid email', details: 'Valid email address is required' },
        { status: 400 }
      );
    }

    if (!password || typeof password !== 'string' || password.length === 0) {
      return NextResponse.json<ErrorResponse>(
        { error: 'Invalid password', details: 'Password is required' },
        { status: 400 }
      );
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
      return NextResponse.json<ErrorResponse>(
        { error: 'Invalid credentials' },
        { status: 401 }
      );
    }

    const user = users[0];

    // Validate password_hash exists
    if (!user.password_hash) {
      console.error('User missing password_hash:', user.id);
      return NextResponse.json<ErrorResponse>(
        { error: 'Invalid credentials' },
        { status: 401 }
      );
    }

    // Verify password
    const valid = await bcrypt.compare(password, user.password_hash);

    if (!valid) {
      return NextResponse.json<ErrorResponse>(
        { error: 'Invalid credentials' },
        { status: 401 }
      );
    }

    // Generate JWT token with expiration
    const token = jwt.sign(
      { id: user.id, email: user.email, role: user.role },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES_IN }
    );

    const response: AuthResponse = { token };
    return NextResponse.json(response);
  } catch (error) {
    console.error('POST /api/auth error:', error);
    return NextResponse.json<ErrorResponse>(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
