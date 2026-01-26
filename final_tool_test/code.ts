// Service class
export class UserService {
  private readonly users: Array<User> = [];

  getUser(id: number): User {
    return this.users.find(u => u.id === id);
  }

  createUser(name: string): User {
    const user = { id: generateId(), name };
    this.users.push(user);
    return user; // Modified
  }

  deleteUser(id: number): boolean {
    const index = this.users.findIndex(u => u.id === id);
    if (index !== -1) {
      this.users.splice(index, 1);
      return true;
    }
    return false;
  }
}

export function helperFunction(): string {
  return "helper";
}

const CONSTANT_VALUE = 100;