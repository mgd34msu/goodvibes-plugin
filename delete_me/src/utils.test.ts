import { validateEmail, paginate, hashPassword, formatUser } from './utils';
import { User } from './types';

describe('validateEmail', () => {
  it('should return true for valid emails', () => {
    expect(validateEmail('test@example.com')).toBe(true);
    expect(validateEmail('user+tag@domain.co')).toBe(true);
  });

  it('should return false for invalid emails', () => {
    expect(validateEmail('invalid')).toBe(false);
    expect(validateEmail('@domain.com')).toBe(false);
    expect(validateEmail('user@')).toBe(false);
  });
});

describe('paginate', () => {
  const items = Array.from({ length: 50 }, (_, i) => i + 1);

  it('should return correct page', () => {
    const result = paginate(items, 1, 10);
    expect(result).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  });

  it('should handle last page', () => {
    const result = paginate(items, 5, 10);
    expect(result).toEqual([41, 42, 43, 44, 45, 46, 47, 48, 49, 50]);
  });
});

describe('hashPassword', () => {
  it('should hash a password', () => {
    const hash = hashPassword('mypassword');
    expect(hash).toBeTruthy();
    expect(hash).not.toBe('mypassword');
  });
});

describe('formatUser', () => {
  it('should format user with name', () => {
    const user: User = { id: 1, email: 'test@test.com', name: 'John', role: 'user', createdAt: new Date() };
    expect(formatUser(user)).toBe('John <test@test.com>');
  });

  it('should format user without name', () => {
    const user: User = { id: 1, email: 'test@test.com', name: null, role: 'user', createdAt: new Date() };
    expect(formatUser(user)).toBe('Anonymous <test@test.com>');
  });
});