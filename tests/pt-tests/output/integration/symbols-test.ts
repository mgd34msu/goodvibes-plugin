export interface Person {
  name: string;
  age: number;
}

export class UserManager {
  private users: Person[] = [];
  
  addUser(user: Person): void {
    this.users.push(user);
  }
  
  getUsers(): Person[] {
    return this.users;
  }
}

export type UserId = string;

export enum Role {
  Admin = 'admin',
  User = 'user',
  Guest = 'guest'
}

export function createUser(name: string, age: number): Person {
  return { name, age };
}

export const DEFAULT_ROLE = Role.User;
