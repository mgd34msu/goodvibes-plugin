// TypeScript test file
export interface User {
  id: number;
  name: string;
  email: string;
}

export class UserService {
  private users: User[] = [];

  addUser(user: User): void {
    this.users.push(user);
  }

  getUser(id: number): User | undefined {
    return this.users.find(u => u.id === id);
  }
}

export function validateEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export const API_URL = 'https://api.example.com';

export enum UserRole {
  Admin = 'admin',
  User = 'user',
  Guest = 'guest'
}

export type UserId = number;
