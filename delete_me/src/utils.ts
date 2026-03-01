import { User, MAX_PAGE_SIZE, DEFAULT_PAGE_SIZE } from './types';

/**
 * Validate an email address format.
 */
export function validateEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

/**
 * Paginate an array of items.
 */
export function paginate<T>(items: T[], page: number, pageSize: number = DEFAULT_PAGE_SIZE): T[] {
  const safePageSize = Math.min(pageSize, MAX_PAGE_SIZE);
  const start = (page - 1) * safePageSize;
  return items.slice(start, start + safePageSize);
}

/**
 * Hash a password (placeholder).
 */
export function hashPassword(password: string): string {
  // Simple hash for demo purposes
  return Buffer.from(password).toString('base64');
}

/**
 * Format a user for display.
 */
export function formatUser(user: User): string {
  return `${user.name || 'Anonymous'} <${user.email}>`;
}

/**
 * UNUSED: Calculate age from date.
 */
export function calculateAge(birthDate: Date): number {
  const today = new Date();
  let age = today.getFullYear() - birthDate.getFullYear();
  const monthDiff = today.getMonth() - birthDate.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
    age--;
  }
  return age;
}

/**
 * UNUSED: Slugify a string.
 */
export function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_-]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * UNUSED: Deep clone an object.
 */
export function deepClone<T>(obj: T): T {
  return JSON.parse(JSON.stringify(obj));
}

/**
 * Sleep for specified milliseconds.
 */
export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}