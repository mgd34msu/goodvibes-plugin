import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import type { User, CreateUserRequest, CreateUserResponse, ErrorResponse } from '@/types/api';

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
 * Query params: role (optional)
 */
export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const role = url.searchParams.get('role');

    // Validate role if provided
    if (role && !isValidRole(role)) {
      return NextResponse.json<ErrorResponse>(
        { error: 'Invalid role', details: 'Role must be one of: admin, user, guest' },
        { status: 400 }
      );
    }

    let query = 'SELECT id, name, email, role, created_at, updated_at FROM users';
    const params: string[] = [];

    if (role) {
      query += ' WHERE role = ?';
      params.push(role);
    }

    const users = await db.query<User[]>(query, params);
    return NextResponse.json(users);
  } catch (error) {
    console.error('GET /api/users error:', error);
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
  try {
    const body: unknown = await request.json();

    // Validate request body structure
    if (!body || typeof body !== 'object') {
      return NextResponse.json<ErrorResponse>(
        { error: 'Invalid request body' },
        { status: 400 }
      );
    }

    const { name, email, role } = body as Partial<CreateUserRequest>;

    // Validate required fields
    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      return NextResponse.json<ErrorResponse>(
        { error: 'Invalid name', details: 'Name is required and must be a non-empty string' },
        { status: 400 }
      );
    }

    if (!email || typeof email !== 'string' || !isValidEmail(email)) {
      return NextResponse.json<ErrorResponse>(
        { error: 'Invalid email', details: 'Valid email address is required' },
        { status: 400 }
      );
    }

    if (!role || typeof role !== 'string' || !isValidRole(role)) {
      return NextResponse.json<ErrorResponse>(
        { error: 'Invalid role', details: 'Role must be one of: admin, user, guest' },
        { status: 400 }
      );
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
      return NextResponse.json<ErrorResponse>(
        { error: 'User already exists', details: 'A user with this email already exists' },
        { status: 409 }
      );
    }

    // Insert new user using parameterized query
    const result: any = await db.query(
      'INSERT INTO users (name, email, role) VALUES (?, ?, ?)',
      [sanitizedName, sanitizedEmail, role]
    );

    const response: CreateUserResponse = {
      id: result.insertId,
      name: sanitizedName,
      email: sanitizedEmail,
      role,
    };

    return NextResponse.json(response, { status: 201 });
  } catch (error) {
    console.error('POST /api/users error:', error);
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
  try {
    const url = new URL(request.url);
    const id = url.searchParams.get('id');

    // Validate ID
    if (!id) {
      return NextResponse.json<ErrorResponse>(
        { error: 'Missing ID', details: 'User ID is required' },
        { status: 400 }
      );
    }

    const userId = parseInt(id, 10);
    if (isNaN(userId) || userId <= 0) {
      return NextResponse.json<ErrorResponse>(
        { error: 'Invalid ID', details: 'User ID must be a positive integer' },
        { status: 400 }
      );
    }

    // Check if user exists
    const existingUsers = await db.query<User[]>(
      'SELECT id FROM users WHERE id = ?',
      [userId]
    );

    if (existingUsers.length === 0) {
      return NextResponse.json<ErrorResponse>(
        { error: 'User not found' },
        { status: 404 }
      );
    }

    // Delete user using parameterized query
    await db.query('DELETE FROM users WHERE id = ?', [userId]);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('DELETE /api/users error:', error);
    return NextResponse.json<ErrorResponse>(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
