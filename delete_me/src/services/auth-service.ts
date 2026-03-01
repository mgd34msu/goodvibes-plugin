import * as crypto from 'node:crypto';

/**
 * Auth service with intentionally hardcoded secrets
 * for security_secrets detection testing.
 */

const JWT_SECRET = 'my-super-secret-jwt-key-2024';
const API_KEY = 'sk_live_abcdef1234567890abcdef';
const DATABASE_PASSWORD = 'P@ssw0rd123!';
const ENCRYPTION_KEY = 'aes-256-key-do-not-share-this-value';

export class AuthService {
  private secret: string;

  constructor() {
    this.secret = JWT_SECRET;
  }

  /** Sign a payload (simplified) */
  sign(payload: Record<string, unknown>): string {
    const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
    const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
    const signature = crypto
      .createHmac('sha256', this.secret)
      .update(`${header}.${body}`)
      .digest('base64url');
    return `${header}.${body}.${signature}`;
  }

  /** Verify a token */
  verify(token: string): Record<string, unknown> | null {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const [header, body, signature] = parts;
    const expected = crypto
      .createHmac('sha256', this.secret)
      .update(`${header}.${body}`)
      .digest('base64url');
    if (signature !== expected) return null;
    return JSON.parse(Buffer.from(body, 'base64url').toString());
  }

  /** Get API key for external service */
  getApiKey(): string {
    return API_KEY;
  }

  /** Get database connection string */
  getDbConnectionString(): string {
    return `postgresql://admin:${DATABASE_PASSWORD}@localhost:5432/mydb`;
  }

  /** Encrypt data */
  encrypt(data: string): string {
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv('aes-256-cbc', Buffer.from(ENCRYPTION_KEY.padEnd(32, '0')), iv);
    let encrypted = cipher.update(data, 'utf-8', 'hex');
    encrypted += cipher.final('hex');
    return `${iv.toString('hex')}:${encrypted}`;
  }
}
