import jwt from 'jsonwebtoken';
import { AuthenticationError, AuthorizationError } from './errors';

if (!process.env.JWT_SECRET) {
  throw new Error('JWT_SECRET environment variable is required');
}

const JWT_SECRET = process.env.JWT_SECRET;

export interface TokenPayload {
  id: number;
  email: string;
  role: string;
}

/**
 * Extracts and verifies JWT token from Authorization header
 */
export function verifyToken(request: Request): TokenPayload {
  const authHeader = request.headers.get('Authorization');

  if (!authHeader) {
    throw new AuthenticationError('Missing authentication token');
  }

  if (!authHeader.startsWith('Bearer ')) {
    throw new AuthenticationError('Invalid authentication format. Use: Bearer <token>');
  }

  const token = authHeader.substring(7); // Remove 'Bearer ' prefix

  if (!token || token.trim().length === 0) {
    throw new AuthenticationError('Missing authentication token');
  }

  try {
    const payload = jwt.verify(token, JWT_SECRET) as TokenPayload;
    return payload;
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
      throw new AuthenticationError('Token has expired');
    }
    if (error instanceof jwt.JsonWebTokenError) {
      throw new AuthenticationError('Invalid token');
    }
    throw new AuthenticationError('Token verification failed');
  }
}

/**
 * Checks if user has required role(s)
 */
export function requireRole(payload: TokenPayload, allowedRoles: string[]): void {
  if (!allowedRoles.includes(payload.role)) {
    throw new AuthorizationError(
      `Access denied. Required role: ${allowedRoles.join(' or ')}`
    );
  }
}

/**
 * Validates password strength
 */
export function validatePasswordStrength(password: string): { valid: boolean; error?: string } {
  if (password.length < 8) {
    return { valid: false, error: 'Password must be at least 8 characters long' };
  }

  if (!/[a-z]/.test(password)) {
    return { valid: false, error: 'Password must contain at least one lowercase letter' };
  }

  if (!/[A-Z]/.test(password)) {
    return { valid: false, error: 'Password must contain at least one uppercase letter' };
  }

  if (!/[0-9]/.test(password)) {
    return { valid: false, error: 'Password must contain at least one number' };
  }

  if (!/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)) {
    return { valid: false, error: 'Password must contain at least one special character' };
  }

  return { valid: true };
}
