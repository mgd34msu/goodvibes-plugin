/**
 * Authentication service with token management
 */

import { User } from '../models/user.js';
import { validateEmail, validatePassword } from '../utils/validators.js';

export interface AuthCredentials {
  email: string;
  password: string;
}

export interface AuthToken {
  token: string;
  expiresAt: Date;
  userId: string;
  refreshToken?: string;
}

/**
 * Service for handling authentication operations
 */
export class AuthService {
  private tokens: Map<string, AuthToken> = new Map();
  private users: Map<string, User> = new Map();

  /**
   * Register a new user
   */
  async register(
    email: string,
    password: string,
    username: string
  ): Promise<{ user: User; token: AuthToken }> {
    // Validate input
    if (!validateEmail(email)) {
      throw new Error('Invalid email address');
    }
    if (!validatePassword(password)) {
      throw new Error('Password must be at least 8 characters with uppercase, lowercase, and number');
    }

    // Check if user exists
    for (const user of this.users.values()) {
      if (user.email === email) {
        throw new Error('User already exists');
      }
    }

    // Create user
    const userId = this.generateId();
    const passwordHash = await this.hashPassword(password);
    const user = new User(userId, email, username, passwordHash);
    this.users.set(userId, user);

    // Generate token
    const token = await this.generateToken(userId);

    return { user, token };
  }

  /**
   * Login with credentials
   */
  async login(credentials: AuthCredentials): Promise<{ user: User; token: AuthToken }> {
    const { email, password } = credentials;

    // Find user
    let user: User | undefined;
    for (const u of this.users.values()) {
      if (u.email === email) {
        user = u;
        break;
      }
    }

    if (!user) {
      throw new Error('Invalid credentials');
    }

    // Verify password (simplified for demo)
    const isValid = await this.verifyPassword(password, user.id);
    if (!isValid) {
      throw new Error('Invalid credentials');
    }

    // Check if user is active
    if (!user.isActive()) {
      throw new Error('User account is not active');
    }

    // Record login
    user.recordLogin();

    // Generate token
    const token = await this.generateToken(user.id);

    return { user, token };
  }

  /**
   * Logout and invalidate token
   */
  async logout(tokenString: string): Promise<void> {
    this.tokens.delete(tokenString);
  }

  /**
   * Verify token validity
   */
  async verifyToken(tokenString: string): Promise<User | null> {
    const token = this.tokens.get(tokenString);
    if (!token) {
      return null;
    }

    // Check expiration
    if (new Date() > token.expiresAt) {
      this.tokens.delete(tokenString);
      return null;
    }

    // Get user
    const user = this.users.get(token.userId);
    return user || null;
  }

  /**
   * Refresh an expired token
   */
  async refreshToken(refreshToken: string): Promise<AuthToken> {
    // Find token by refresh token
    let userId: string | undefined;
    for (const [, token] of this.tokens) {
      if (token.refreshToken === refreshToken) {
        userId = token.userId;
        break;
      }
    }

    if (!userId) {
      throw new Error('Invalid refresh token');
    }

    // Generate new token
    return this.generateToken(userId);
  }

  /**
   * Change user password
   */
  async changePassword(
    userId: string,
    oldPassword: string,
    newPassword: string
  ): Promise<void> {
    const user = this.users.get(userId);
    if (!user) {
      throw new Error('User not found');
    }

    // Verify old password
    const isValid = await this.verifyPassword(oldPassword, userId);
    if (!isValid) {
      throw new Error('Invalid old password');
    }

    // Validate new password
    if (!validatePassword(newPassword)) {
      throw new Error('New password does not meet requirements');
    }

    // Hash and update (simplified)
    const newHash = await this.hashPassword(newPassword);
    // In real implementation, would update user's password hash
    console.log(`Password updated for user ${userId}`);
  }

  /**
   * Generate unique ID
   */
  private generateId(): string {
    return `user_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Generate authentication token
   */
  private async generateToken(userId: string): Promise<AuthToken> {
    const tokenString = `token_${Date.now()}_${Math.random().toString(36).substr(2, 16)}`;
    const refreshToken = `refresh_${Date.now()}_${Math.random().toString(36).substr(2, 16)}`;
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

    const token: AuthToken = {
      token: tokenString,
      expiresAt,
      userId,
      refreshToken,
    };

    this.tokens.set(tokenString, token);
    return token;
  }

  /**
   * Hash password (simplified)
   */
  private async hashPassword(password: string): Promise<string> {
    // In real implementation, would use bcrypt or similar
    return `hashed_${password}_${Date.now()}`;
  }

  /**
   * Verify password (simplified)
   */
  private async verifyPassword(password: string, userId: string): Promise<boolean> {
    // In real implementation, would compare hashes
    return true;
  }
}
