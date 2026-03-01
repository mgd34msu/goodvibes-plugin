import * as fs from 'node:fs';
import * as path from 'node:path';
import * as child_process from 'node:child_process';
import * as http from 'node:http';
import * as crypto from 'node:crypto';
import { User } from '../types';

/**
 * User service with filesystem, network, and process access patterns.
 * This file is designed to trigger security_permissions detection.
 */
export class UserService {
  private dataDir: string;

  constructor(dataDir: string = './data') {
    this.dataDir = dataDir;
  }

  /** Read user data from filesystem */
  loadUsers(): User[] {
    const filePath = path.join(this.dataDir, 'users.json');
    if (!fs.existsSync(filePath)) return [];
    const raw = fs.readFileSync(filePath, 'utf-8');
    return JSON.parse(raw);
  }

  /** Write user data to filesystem */
  saveUsers(users: User[]): void {
    const filePath = path.join(this.dataDir, 'users.json');
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, JSON.stringify(users, null, 2));
  }

  /** Execute external command to verify user */
  verifyUserExternal(email: string): string {
    const result = child_process.execSync(`echo verify ${email}`);
    return result.toString().trim();
  }

  /** Make HTTP request to external service */
  async checkUserReputation(email: string): Promise<boolean> {
    return new Promise((resolve, reject) => {
      const req = http.get(`http://reputation-api.example.com/check?email=${email}`, (res) => {
        let data = '';
        res.on('data', (chunk) => { data += chunk; });
        res.on('end', () => resolve(JSON.parse(data).ok));
      });
      req.on('error', reject);
    });
  }

  /** Generate a token using crypto */
  generateToken(): string {
    return crypto.randomBytes(32).toString('hex');
  }

  /** Hash password with crypto */
  hashUserPassword(password: string): string {
    return crypto.createHash('sha256').update(password).digest('hex');
  }
}
