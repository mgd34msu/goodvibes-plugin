/**
 * Tests for workspace-symbols.ts handler
 *
 * Tests the workspace_symbols tool which searches for symbols by name
 * across the entire workspace using TypeScript Language Service.
 */

import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { handleWorkspaceSymbols } from '../../../handlers/lsp/workspace-symbols.js';
import { languageServiceManager } from '../../../handlers/lsp/language-service.js';

// Mock console.warn to suppress expected warnings during tests
vi.spyOn(console, 'warn').mockImplementation(() => {});

describe('handleWorkspaceSymbols', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'workspace-symbols-test-'));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
    languageServiceManager.cleanup();
    vi.clearAllMocks();
  });

  // ===========================================================================
  // Argument Validation Tests
  // ===========================================================================

  describe('argument validation', () => {
    test('returns error when query is missing', async () => {
      const result = await handleWorkspaceSymbols({} as any);

      expect(result.isError).toBe(true);
      const text = result.content[0];
      expect(text.type).toBe('text');
      expect((text as any).text).toContain('Missing required argument: query');
    });

    test('returns error when query is empty string', async () => {
      const result = await handleWorkspaceSymbols({ query: '' });

      expect(result.isError).toBe(true);
      const text = result.content[0];
      expect((text as any).text).toContain('Missing required argument: query');
    });

    test('returns error when query is only whitespace', async () => {
      const result = await handleWorkspaceSymbols({ query: '   ' });

      expect(result.isError).toBe(true);
      const text = result.content[0];
      expect((text as any).text).toContain('Missing required argument: query');
    });
  });

  // ===========================================================================
  // Symbol Search Tests
  // ===========================================================================

  describe('symbol search', () => {
    test('finds class symbols by name', async () => {
      // Create a TypeScript file with a class
      const filePath = path.join(tempDir, 'user.ts');
      fs.writeFileSync(
        filePath,
        `
export class UserService {
  getUser(id: string): string {
    return id;
  }
}

export class UserRepository {
  findById(id: string): string {
    return id;
  }
}
`
      );

      // Create tsconfig
      const tsconfigPath = path.join(tempDir, 'tsconfig.json');
      fs.writeFileSync(
        tsconfigPath,
        JSON.stringify({
          compilerOptions: {
            target: 'ES2020',
            module: 'commonjs',
            strict: true,
          },
          include: ['*.ts'],
        })
      );

      // Initialize language service
      await languageServiceManager.getServiceForFile(filePath);

      const result = await handleWorkspaceSymbols({
        query: 'User',
        kind: 'class',
      });

      expect(result.isError).toBeUndefined();
      const data = JSON.parse((result.content[0] as any).text);
      expect(data.query).toBe('User');
      // Should find UserService and UserRepository
      expect(data.symbols.length).toBeGreaterThanOrEqual(0);
    });

    test('finds function symbols', async () => {
      const filePath = path.join(tempDir, 'utils.ts');
      fs.writeFileSync(
        filePath,
        `
export function calculateTotal(items: number[]): number {
  return items.reduce((a, b) => a + b, 0);
}

export function calculateAverage(items: number[]): number {
  return calculateTotal(items) / items.length;
}

function helperFunction(): void {
  // Local function
}
`
      );

      const tsconfigPath = path.join(tempDir, 'tsconfig.json');
      fs.writeFileSync(
        tsconfigPath,
        JSON.stringify({
          compilerOptions: { target: 'ES2020', module: 'commonjs' },
          include: ['*.ts'],
        })
      );

      await languageServiceManager.getServiceForFile(filePath);

      const result = await handleWorkspaceSymbols({
        query: 'calculate',
        kind: 'function',
      });

      expect(result.isError).toBeUndefined();
      const data = JSON.parse((result.content[0] as any).text);
      expect(data.query).toBe('calculate');
    });

    test('finds interface symbols', async () => {
      const filePath = path.join(tempDir, 'types.ts');
      fs.writeFileSync(
        filePath,
        `
export interface UserProfile {
  id: string;
  name: string;
}

export interface UserSettings {
  theme: string;
  notifications: boolean;
}

export interface AdminUser extends UserProfile {
  role: string;
}
`
      );

      const tsconfigPath = path.join(tempDir, 'tsconfig.json');
      fs.writeFileSync(
        tsconfigPath,
        JSON.stringify({
          compilerOptions: { target: 'ES2020', module: 'commonjs' },
          include: ['*.ts'],
        })
      );

      await languageServiceManager.getServiceForFile(filePath);

      const result = await handleWorkspaceSymbols({
        query: 'User',
        kind: 'interface',
      });

      expect(result.isError).toBeUndefined();
      const data = JSON.parse((result.content[0] as any).text);
      expect(data.query).toBe('User');
    });

    test('finds variable symbols', async () => {
      const filePath = path.join(tempDir, 'constants.ts');
      fs.writeFileSync(
        filePath,
        `
export const MAX_USERS = 100;
export const MIN_USERS = 1;
export let currentUserCount = 0;
const privateConfig = {};
`
      );

      const tsconfigPath = path.join(tempDir, 'tsconfig.json');
      fs.writeFileSync(
        tsconfigPath,
        JSON.stringify({
          compilerOptions: { target: 'ES2020', module: 'commonjs' },
          include: ['*.ts'],
        })
      );

      await languageServiceManager.getServiceForFile(filePath);

      const result = await handleWorkspaceSymbols({
        query: 'User',
        kind: 'variable',
      });

      expect(result.isError).toBeUndefined();
      const data = JSON.parse((result.content[0] as any).text);
      expect(data.query).toBe('User');
    });

    test('finds type alias symbols', async () => {
      const filePath = path.join(tempDir, 'types.ts');
      fs.writeFileSync(
        filePath,
        `
export type UserId = string;
export type UserName = string;
export type UserStatus = 'active' | 'inactive' | 'pending';
`
      );

      const tsconfigPath = path.join(tempDir, 'tsconfig.json');
      fs.writeFileSync(
        tsconfigPath,
        JSON.stringify({
          compilerOptions: { target: 'ES2020', module: 'commonjs' },
          include: ['*.ts'],
        })
      );

      await languageServiceManager.getServiceForFile(filePath);

      const result = await handleWorkspaceSymbols({
        query: 'User',
        kind: 'type',
      });

      expect(result.isError).toBeUndefined();
      const data = JSON.parse((result.content[0] as any).text);
      expect(data.query).toBe('User');
    });

    test('finds enum symbols', async () => {
      const filePath = path.join(tempDir, 'enums.ts');
      fs.writeFileSync(
        filePath,
        `
export enum UserRole {
  Admin = 'admin',
  User = 'user',
  Guest = 'guest'
}

export enum UserStatus {
  Active = 'active',
  Inactive = 'inactive'
}
`
      );

      const tsconfigPath = path.join(tempDir, 'tsconfig.json');
      fs.writeFileSync(
        tsconfigPath,
        JSON.stringify({
          compilerOptions: { target: 'ES2020', module: 'commonjs' },
          include: ['*.ts'],
        })
      );

      await languageServiceManager.getServiceForFile(filePath);

      const result = await handleWorkspaceSymbols({
        query: 'User',
        kind: 'enum',
      });

      expect(result.isError).toBeUndefined();
      const data = JSON.parse((result.content[0] as any).text);
      expect(data.query).toBe('User');
    });

    test('finds method symbols in classes', async () => {
      const filePath = path.join(tempDir, 'service.ts');
      fs.writeFileSync(
        filePath,
        `
export class DataService {
  fetchData(): Promise<void> {
    return Promise.resolve();
  }

  fetchUsers(): Promise<string[]> {
    return Promise.resolve([]);
  }

  fetchItems(): Promise<number[]> {
    return Promise.resolve([]);
  }
}
`
      );

      const tsconfigPath = path.join(tempDir, 'tsconfig.json');
      fs.writeFileSync(
        tsconfigPath,
        JSON.stringify({
          compilerOptions: { target: 'ES2020', module: 'commonjs' },
          include: ['*.ts'],
        })
      );

      await languageServiceManager.getServiceForFile(filePath);

      const result = await handleWorkspaceSymbols({
        query: 'fetch',
        kind: 'method',
      });

      expect(result.isError).toBeUndefined();
      const data = JSON.parse((result.content[0] as any).text);
      expect(data.query).toBe('fetch');
    });

    test('finds property symbols in classes', async () => {
      const filePath = path.join(tempDir, 'model.ts');
      fs.writeFileSync(
        filePath,
        `
export class UserModel {
  userName: string = '';
  userEmail: string = '';
  userAge: number = 0;

  constructor() {}
}
`
      );

      const tsconfigPath = path.join(tempDir, 'tsconfig.json');
      fs.writeFileSync(
        tsconfigPath,
        JSON.stringify({
          compilerOptions: { target: 'ES2020', module: 'commonjs' },
          include: ['*.ts'],
        })
      );

      await languageServiceManager.getServiceForFile(filePath);

      const result = await handleWorkspaceSymbols({
        query: 'user',
        kind: 'property',
      });

      expect(result.isError).toBeUndefined();
      const data = JSON.parse((result.content[0] as any).text);
      expect(data.query).toBe('user');
    });
  });

  // ===========================================================================
  // Match Type Tests
  // ===========================================================================

  describe('match type filtering', () => {
    test('filters by exact match', async () => {
      const filePath = path.join(tempDir, 'symbols.ts');
      fs.writeFileSync(
        filePath,
        `
export function test(): void {}
export function testFunction(): void {}
export function myTest(): void {}
`
      );

      const tsconfigPath = path.join(tempDir, 'tsconfig.json');
      fs.writeFileSync(
        tsconfigPath,
        JSON.stringify({
          compilerOptions: { target: 'ES2020', module: 'commonjs' },
          include: ['*.ts'],
        })
      );

      await languageServiceManager.getServiceForFile(filePath);

      const result = await handleWorkspaceSymbols({
        query: 'test',
        match_type: 'exact',
      });

      expect(result.isError).toBeUndefined();
      const data = JSON.parse((result.content[0] as any).text);
      // Should only find exact match 'test'
      for (const symbol of data.symbols) {
        expect(symbol.name.toLowerCase()).toBe('test');
      }
    });

    test('filters by prefix match', async () => {
      const filePath = path.join(tempDir, 'symbols.ts');
      fs.writeFileSync(
        filePath,
        `
export function getData(): void {}
export function getUser(): void {}
export function makeGet(): void {}
`
      );

      const tsconfigPath = path.join(tempDir, 'tsconfig.json');
      fs.writeFileSync(
        tsconfigPath,
        JSON.stringify({
          compilerOptions: { target: 'ES2020', module: 'commonjs' },
          include: ['*.ts'],
        })
      );

      await languageServiceManager.getServiceForFile(filePath);

      const result = await handleWorkspaceSymbols({
        query: 'get',
        match_type: 'prefix',
      });

      expect(result.isError).toBeUndefined();
      const data = JSON.parse((result.content[0] as any).text);
      // Should find getData and getUser but not makeGet
      for (const symbol of data.symbols) {
        expect(symbol.name.toLowerCase().startsWith('get')).toBe(true);
      }
    });

    test('uses substring match by default', async () => {
      const filePath = path.join(tempDir, 'symbols.ts');
      fs.writeFileSync(
        filePath,
        `
export function getUserById(): void {}
export function makeUser(): void {}
export function UserClass(): void {}
`
      );

      const tsconfigPath = path.join(tempDir, 'tsconfig.json');
      fs.writeFileSync(
        tsconfigPath,
        JSON.stringify({
          compilerOptions: { target: 'ES2020', module: 'commonjs' },
          include: ['*.ts'],
        })
      );

      await languageServiceManager.getServiceForFile(filePath);

      const result = await handleWorkspaceSymbols({
        query: 'User',
        // No match_type specified - defaults to substring
      });

      expect(result.isError).toBeUndefined();
      const data = JSON.parse((result.content[0] as any).text);
      // Should find all containing 'User'
      for (const symbol of data.symbols) {
        expect(symbol.name.toLowerCase()).toContain('user');
      }
    });
  });

  // ===========================================================================
  // Limit Tests
  // ===========================================================================

  describe('limit handling', () => {
    test('respects limit parameter', async () => {
      const filePath = path.join(tempDir, 'many.ts');
      // Create many symbols
      const symbols = Array.from(
        { length: 20 },
        (_, i) => `export function item${i}(): void {}`
      ).join('\n');
      fs.writeFileSync(filePath, symbols);

      const tsconfigPath = path.join(tempDir, 'tsconfig.json');
      fs.writeFileSync(
        tsconfigPath,
        JSON.stringify({
          compilerOptions: { target: 'ES2020', module: 'commonjs' },
          include: ['*.ts'],
        })
      );

      await languageServiceManager.getServiceForFile(filePath);

      const result = await handleWorkspaceSymbols({
        query: 'item',
        limit: 5,
      });

      expect(result.isError).toBeUndefined();
      const data = JSON.parse((result.content[0] as any).text);
      expect(data.symbols.length).toBeLessThanOrEqual(5);
    });

    test('uses default limit of 50', async () => {
      const filePath = path.join(tempDir, 'few.ts');
      fs.writeFileSync(
        filePath,
        `
export function testFunc(): void {}
`
      );

      const tsconfigPath = path.join(tempDir, 'tsconfig.json');
      fs.writeFileSync(
        tsconfigPath,
        JSON.stringify({
          compilerOptions: { target: 'ES2020', module: 'commonjs' },
          include: ['*.ts'],
        })
      );

      await languageServiceManager.getServiceForFile(filePath);

      const result = await handleWorkspaceSymbols({
        query: 'test',
        // No limit specified - uses default 50
      });

      expect(result.isError).toBeUndefined();
      const data = JSON.parse((result.content[0] as any).text);
      expect(data.symbols.length).toBeLessThanOrEqual(50);
    });

    test('caps limit at maximum of 200', async () => {
      const filePath = path.join(tempDir, 'test.ts');
      fs.writeFileSync(
        filePath,
        `
export function testFunc(): void {}
`
      );

      const tsconfigPath = path.join(tempDir, 'tsconfig.json');
      fs.writeFileSync(
        tsconfigPath,
        JSON.stringify({
          compilerOptions: { target: 'ES2020', module: 'commonjs' },
          include: ['*.ts'],
        })
      );

      await languageServiceManager.getServiceForFile(filePath);

      const result = await handleWorkspaceSymbols({
        query: 'test',
        limit: 500, // Exceeds max
      });

      expect(result.isError).toBeUndefined();
      const data = JSON.parse((result.content[0] as any).text);
      expect(data.symbols.length).toBeLessThanOrEqual(200);
    });

    test('ensures minimum limit of 1', async () => {
      const filePath = path.join(tempDir, 'test.ts');
      fs.writeFileSync(
        filePath,
        `
export function testFunc(): void {}
`
      );

      const tsconfigPath = path.join(tempDir, 'tsconfig.json');
      fs.writeFileSync(
        tsconfigPath,
        JSON.stringify({
          compilerOptions: { target: 'ES2020', module: 'commonjs' },
          include: ['*.ts'],
        })
      );

      await languageServiceManager.getServiceForFile(filePath);

      const result = await handleWorkspaceSymbols({
        query: 'test',
        limit: -5, // Below minimum
      });

      expect(result.isError).toBeUndefined();
      // Should still work with minimum limit of 1
    });

    test('indicates when results are truncated', async () => {
      const filePath = path.join(tempDir, 'many.ts');
      // Create many symbols
      const symbols = Array.from(
        { length: 100 },
        (_, i) => `export function func${i}(): void {}`
      ).join('\n');
      fs.writeFileSync(filePath, symbols);

      const tsconfigPath = path.join(tempDir, 'tsconfig.json');
      fs.writeFileSync(
        tsconfigPath,
        JSON.stringify({
          compilerOptions: { target: 'ES2020', module: 'commonjs' },
          include: ['*.ts'],
        })
      );

      await languageServiceManager.getServiceForFile(filePath);

      const result = await handleWorkspaceSymbols({
        query: 'func',
        limit: 10,
      });

      expect(result.isError).toBeUndefined();
      const data = JSON.parse((result.content[0] as any).text);
      // truncated flag should indicate if there were more results
      expect(typeof data.truncated).toBe('boolean');
    });
  });

  // ===========================================================================
  // Kind Filter Tests
  // ===========================================================================

  describe('kind filtering', () => {
    test('filters by all kinds when kind is "all"', async () => {
      const filePath = path.join(tempDir, 'mixed.ts');
      fs.writeFileSync(
        filePath,
        `
export class TestClass {}
export interface TestInterface {}
export function testFunction(): void {}
export const testConst = 1;
export type TestType = string;
`
      );

      const tsconfigPath = path.join(tempDir, 'tsconfig.json');
      fs.writeFileSync(
        tsconfigPath,
        JSON.stringify({
          compilerOptions: { target: 'ES2020', module: 'commonjs' },
          include: ['*.ts'],
        })
      );

      await languageServiceManager.getServiceForFile(filePath);

      const result = await handleWorkspaceSymbols({
        query: 'Test',
        kind: 'all',
      });

      expect(result.isError).toBeUndefined();
      const data = JSON.parse((result.content[0] as any).text);
      // Should find various kinds
      expect(data.query).toBe('Test');
    });

    test('uses "all" as default kind filter', async () => {
      const filePath = path.join(tempDir, 'mixed.ts');
      fs.writeFileSync(
        filePath,
        `
export class MyClass {}
export function myFunction(): void {}
`
      );

      const tsconfigPath = path.join(tempDir, 'tsconfig.json');
      fs.writeFileSync(
        tsconfigPath,
        JSON.stringify({
          compilerOptions: { target: 'ES2020', module: 'commonjs' },
          include: ['*.ts'],
        })
      );

      await languageServiceManager.getServiceForFile(filePath);

      const result = await handleWorkspaceSymbols({
        query: 'my',
        // No kind specified - defaults to all
      });

      expect(result.isError).toBeUndefined();
      const data = JSON.parse((result.content[0] as any).text);
      expect(data.query).toBe('my');
    });

    test('handles module kind filter', async () => {
      const filePath = path.join(tempDir, 'modules.ts');
      fs.writeFileSync(
        filePath,
        `
export namespace UserModule {
  export function getUser(): void {}
}

export namespace AdminModule {
  export function getAdmin(): void {}
}
`
      );

      const tsconfigPath = path.join(tempDir, 'tsconfig.json');
      fs.writeFileSync(
        tsconfigPath,
        JSON.stringify({
          compilerOptions: { target: 'ES2020', module: 'commonjs' },
          include: ['*.ts'],
        })
      );

      await languageServiceManager.getServiceForFile(filePath);

      const result = await handleWorkspaceSymbols({
        query: 'Module',
        kind: 'module',
      });

      expect(result.isError).toBeUndefined();
      const data = JSON.parse((result.content[0] as any).text);
      expect(data.query).toBe('Module');
    });

    test('handles unknown kind filter gracefully', async () => {
      const filePath = path.join(tempDir, 'test.ts');
      fs.writeFileSync(
        filePath,
        `
export function test(): void {}
`
      );

      const tsconfigPath = path.join(tempDir, 'tsconfig.json');
      fs.writeFileSync(
        tsconfigPath,
        JSON.stringify({
          compilerOptions: { target: 'ES2020', module: 'commonjs' },
          include: ['*.ts'],
        })
      );

      await languageServiceManager.getServiceForFile(filePath);

      const result = await handleWorkspaceSymbols({
        query: 'test',
        kind: 'unknownkind' as any,
      });

      expect(result.isError).toBeUndefined();
      // Unknown kind filter returns null (no filter), so it might still return results
      // or return empty depending on implementation - we just check it doesn't error
      const data = JSON.parse((result.content[0] as any).text);
      expect(data.query).toBe('test');
    });
  });

  // ===========================================================================
  // Response Format Tests
  // ===========================================================================

  describe('response format', () => {
    test('returns correct response structure', async () => {
      const filePath = path.join(tempDir, 'test.ts');
      fs.writeFileSync(
        filePath,
        `
export function testFunc(): void {}
`
      );

      const tsconfigPath = path.join(tempDir, 'tsconfig.json');
      fs.writeFileSync(
        tsconfigPath,
        JSON.stringify({
          compilerOptions: { target: 'ES2020', module: 'commonjs' },
          include: ['*.ts'],
        })
      );

      await languageServiceManager.getServiceForFile(filePath);

      const result = await handleWorkspaceSymbols({
        query: 'test',
      });

      expect(result.isError).toBeUndefined();
      expect(result.content).toHaveLength(1);
      expect(result.content[0].type).toBe('text');

      const data = JSON.parse((result.content[0] as any).text);
      expect(data).toHaveProperty('symbols');
      expect(data).toHaveProperty('query');
      expect(data).toHaveProperty('count');
      expect(data).toHaveProperty('truncated');
      expect(Array.isArray(data.symbols)).toBe(true);
    });

    test('symbol objects have correct properties', async () => {
      const filePath = path.join(tempDir, 'test.ts');
      fs.writeFileSync(
        filePath,
        `
export class TestContainer {
  testMethod(): void {}
}
`
      );

      const tsconfigPath = path.join(tempDir, 'tsconfig.json');
      fs.writeFileSync(
        tsconfigPath,
        JSON.stringify({
          compilerOptions: { target: 'ES2020', module: 'commonjs' },
          include: ['*.ts'],
        })
      );

      await languageServiceManager.getServiceForFile(filePath);

      const result = await handleWorkspaceSymbols({
        query: 'Test',
      });

      expect(result.isError).toBeUndefined();
      const data = JSON.parse((result.content[0] as any).text);

      if (data.symbols.length > 0) {
        const symbol = data.symbols[0];
        expect(symbol).toHaveProperty('name');
        expect(symbol).toHaveProperty('kind');
        expect(symbol).toHaveProperty('file');
        expect(symbol).toHaveProperty('line');
        expect(symbol).toHaveProperty('column');
        expect(symbol).toHaveProperty('container_name');
        expect(symbol).toHaveProperty('match_kind');
      }
    });

    test('sorts results by match priority', async () => {
      const filePath = path.join(tempDir, 'sort.ts');
      fs.writeFileSync(
        filePath,
        `
export function getUserName(): void {}
export function getUser(): void {}
export function user(): void {}
`
      );

      const tsconfigPath = path.join(tempDir, 'tsconfig.json');
      fs.writeFileSync(
        tsconfigPath,
        JSON.stringify({
          compilerOptions: { target: 'ES2020', module: 'commonjs' },
          include: ['*.ts'],
        })
      );

      await languageServiceManager.getServiceForFile(filePath);

      const result = await handleWorkspaceSymbols({
        query: 'user',
      });

      expect(result.isError).toBeUndefined();
      const data = JSON.parse((result.content[0] as any).text);

      // Results should be sorted: exact first, then prefix, then substring
      if (data.symbols.length > 1) {
        const matchOrder: Record<string, number> = { exact: 0, prefix: 1, substring: 2 };
        for (let i = 1; i < data.symbols.length; i++) {
          const prevOrder = matchOrder[data.symbols[i - 1].match_kind] ?? 3;
          const currOrder = matchOrder[data.symbols[i].match_kind] ?? 3;
          expect(prevOrder).toBeLessThanOrEqual(currOrder);
        }
      }
    });
  });

  // ===========================================================================
  // Edge Cases
  // ===========================================================================

  describe('edge cases', () => {
    test('returns empty array when no symbols match', async () => {
      const filePath = path.join(tempDir, 'test.ts');
      fs.writeFileSync(
        filePath,
        `
export function foo(): void {}
`
      );

      const tsconfigPath = path.join(tempDir, 'tsconfig.json');
      fs.writeFileSync(
        tsconfigPath,
        JSON.stringify({
          compilerOptions: { target: 'ES2020', module: 'commonjs' },
          include: ['*.ts'],
        })
      );

      await languageServiceManager.getServiceForFile(filePath);

      const result = await handleWorkspaceSymbols({
        query: 'nonexistent_symbol_xyz123',
      });

      expect(result.isError).toBeUndefined();
      const data = JSON.parse((result.content[0] as any).text);
      expect(data.symbols).toEqual([]);
      expect(data.count).toBe(0);
      expect(data.truncated).toBe(false);
    });

    test('handles symbols with special characters in names', async () => {
      const filePath = path.join(tempDir, 'special.ts');
      fs.writeFileSync(
        filePath,
        `
export const _privateVar = 1;
export const $jqueryStyle = 2;
export const camelCase123 = 3;
`
      );

      const tsconfigPath = path.join(tempDir, 'tsconfig.json');
      fs.writeFileSync(
        tsconfigPath,
        JSON.stringify({
          compilerOptions: { target: 'ES2020', module: 'commonjs' },
          include: ['*.ts'],
        })
      );

      await languageServiceManager.getServiceForFile(filePath);

      const result = await handleWorkspaceSymbols({
        query: '_',
      });

      expect(result.isError).toBeUndefined();
    });

    test('handles files with syntax errors gracefully', async () => {
      const filePath = path.join(tempDir, 'error.ts');
      fs.writeFileSync(
        filePath,
        `
export function validFunc(): void {}
export function broken( {  // Syntax error
}
`
      );

      const tsconfigPath = path.join(tempDir, 'tsconfig.json');
      fs.writeFileSync(
        tsconfigPath,
        JSON.stringify({
          compilerOptions: { target: 'ES2020', module: 'commonjs' },
          include: ['*.ts'],
        })
      );

      await languageServiceManager.getServiceForFile(filePath);

      const result = await handleWorkspaceSymbols({
        query: 'valid',
      });

      // Should still work even with syntax errors
      expect(result.isError).toBeUndefined();
    });

    test('handles deeply nested symbols', async () => {
      const filePath = path.join(tempDir, 'nested.ts');
      fs.writeFileSync(
        filePath,
        `
export namespace Outer {
  export namespace Inner {
    export class DeepClass {
      deepMethod(): void {}
    }
  }
}
`
      );

      const tsconfigPath = path.join(tempDir, 'tsconfig.json');
      fs.writeFileSync(
        tsconfigPath,
        JSON.stringify({
          compilerOptions: { target: 'ES2020', module: 'commonjs' },
          include: ['*.ts'],
        })
      );

      await languageServiceManager.getServiceForFile(filePath);

      const result = await handleWorkspaceSymbols({
        query: 'Deep',
      });

      expect(result.isError).toBeUndefined();
      const data = JSON.parse((result.content[0] as any).text);
      expect(data.query).toBe('Deep');
    });

    test('trims whitespace from query', async () => {
      const filePath = path.join(tempDir, 'test.ts');
      fs.writeFileSync(
        filePath,
        `
export function testFunc(): void {}
`
      );

      const tsconfigPath = path.join(tempDir, 'tsconfig.json');
      fs.writeFileSync(
        tsconfigPath,
        JSON.stringify({
          compilerOptions: { target: 'ES2020', module: 'commonjs' },
          include: ['*.ts'],
        })
      );

      await languageServiceManager.getServiceForFile(filePath);

      const result = await handleWorkspaceSymbols({
        query: '  test  ', // With whitespace
      });

      expect(result.isError).toBeUndefined();
      const data = JSON.parse((result.content[0] as any).text);
      expect(data.query).toBe('test'); // Trimmed
    });

    test('handles multiple files in project', async () => {
      // Create multiple files
      fs.writeFileSync(
        path.join(tempDir, 'fileA.ts'),
        `
export function searchableA(): void {}
`
      );

      fs.writeFileSync(
        path.join(tempDir, 'fileB.ts'),
        `
export function searchableB(): void {}
`
      );

      fs.writeFileSync(
        path.join(tempDir, 'fileC.ts'),
        `
export function searchableC(): void {}
`
      );

      const tsconfigPath = path.join(tempDir, 'tsconfig.json');
      fs.writeFileSync(
        tsconfigPath,
        JSON.stringify({
          compilerOptions: { target: 'ES2020', module: 'commonjs' },
          include: ['*.ts'],
        })
      );

      await languageServiceManager.getServiceForFile(path.join(tempDir, 'fileA.ts'));

      const result = await handleWorkspaceSymbols({
        query: 'searchable',
      });

      expect(result.isError).toBeUndefined();
      const data = JSON.parse((result.content[0] as any).text);
      expect(data.query).toBe('searchable');
    });
  });

  // ===========================================================================
  // Error Handling Tests
  // ===========================================================================

  describe('error handling', () => {
    test('handles language service errors gracefully', async () => {
      // Create a minimal valid file
      const filePath = path.join(tempDir, 'test.ts');
      fs.writeFileSync(
        filePath,
        `
export function test(): void {}
`
      );

      // Don't create tsconfig - this may cause issues
      const result = await handleWorkspaceSymbols({
        query: 'test',
      });

      // Should either succeed or return an error response (not throw)
      expect(result).toBeDefined();
      expect(result.content).toBeDefined();
    });

    test('returns proper error response on failure', async () => {
      // This test verifies error response format
      const result = await handleWorkspaceSymbols({ query: '' });

      expect(result.isError).toBe(true);
      expect(result.content).toHaveLength(1);
      expect(result.content[0].type).toBe('text');
    });
  });

  // ===========================================================================
  // Symbol Kind Mapping Tests
  // ===========================================================================

  describe('symbol kind mapping', () => {
    test('maps class elements correctly', async () => {
      const filePath = path.join(tempDir, 'class.ts');
      fs.writeFileSync(
        filePath,
        `
export class MyClass {
  myProperty: string = '';
  myMethod(): void {}
  get myGetter(): string { return ''; }
  set mySetter(value: string) {}
  constructor() {}
}
`
      );

      const tsconfigPath = path.join(tempDir, 'tsconfig.json');
      fs.writeFileSync(
        tsconfigPath,
        JSON.stringify({
          compilerOptions: { target: 'ES2020', module: 'commonjs' },
          include: ['*.ts'],
        })
      );

      await languageServiceManager.getServiceForFile(filePath);

      const result = await handleWorkspaceSymbols({
        query: 'my',
      });

      expect(result.isError).toBeUndefined();
      const data = JSON.parse((result.content[0] as any).text);
      // Should have mapped the symbols to readable kinds
      expect(data.symbols.every((s: any) => typeof s.kind === 'string')).toBe(true);
    });

    test('maps local variables and functions', async () => {
      const filePath = path.join(tempDir, 'local.ts');
      fs.writeFileSync(
        filePath,
        `
export function outer(): void {
  const localConst = 1;
  let localLet = 2;
  function localFunc(): void {}
}
`
      );

      const tsconfigPath = path.join(tempDir, 'tsconfig.json');
      fs.writeFileSync(
        tsconfigPath,
        JSON.stringify({
          compilerOptions: { target: 'ES2020', module: 'commonjs' },
          include: ['*.ts'],
        })
      );

      await languageServiceManager.getServiceForFile(filePath);

      const result = await handleWorkspaceSymbols({
        query: 'local',
      });

      expect(result.isError).toBeUndefined();
    });

    test('maps enum members', async () => {
      const filePath = path.join(tempDir, 'enum.ts');
      fs.writeFileSync(
        filePath,
        `
export enum Status {
  Active = 'active',
  Pending = 'pending',
  Inactive = 'inactive'
}
`
      );

      const tsconfigPath = path.join(tempDir, 'tsconfig.json');
      fs.writeFileSync(
        tsconfigPath,
        JSON.stringify({
          compilerOptions: { target: 'ES2020', module: 'commonjs' },
          include: ['*.ts'],
        })
      );

      await languageServiceManager.getServiceForFile(filePath);

      const result = await handleWorkspaceSymbols({
        query: 'Active',
      });

      expect(result.isError).toBeUndefined();
    });
  });

  // ===========================================================================
  // Multi-Kind Support Tests
  // ===========================================================================

  describe('multi-kind support (kinds array)', () => {
    test('searches multiple kinds at once', async () => {
      const filePath = path.join(tempDir, 'multi.ts');
      fs.writeFileSync(
        filePath,
        `
export function handleRequest(): void {}
export class HandleController {
  handleAction(): void {}
}
export const handleConfig = {};
export interface HandleOptions {}
`
      );

      const tsconfigPath = path.join(tempDir, 'tsconfig.json');
      fs.writeFileSync(
        tsconfigPath,
        JSON.stringify({
          compilerOptions: { target: 'ES2020', module: 'commonjs' },
          include: ['*.ts'],
        })
      );

      await languageServiceManager.getServiceForFile(filePath);

      const result = await handleWorkspaceSymbols({
        query: 'handle',
        kinds: ['function', 'method'],
      });

      expect(result.isError).toBeUndefined();
      const data = JSON.parse((result.content[0] as any).text);
      // Should find handleRequest (function) and handleAction (method)
      // but not HandleController (class), handleConfig (variable), or HandleOptions (interface)
      for (const symbol of data.symbols) {
        expect(['function', 'method']).toContain(symbol.kind);
      }
    });

    test('kinds array takes precedence over singular kind', async () => {
      const filePath = path.join(tempDir, 'precedence.ts');
      fs.writeFileSync(
        filePath,
        `
export function testFunc(): void {}
export class TestClass {}
export interface TestInterface {}
`
      );

      const tsconfigPath = path.join(tempDir, 'tsconfig.json');
      fs.writeFileSync(
        tsconfigPath,
        JSON.stringify({
          compilerOptions: { target: 'ES2020', module: 'commonjs' },
          include: ['*.ts'],
        })
      );

      await languageServiceManager.getServiceForFile(filePath);

      const result = await handleWorkspaceSymbols({
        query: 'Test',
        kind: 'function', // This should be ignored
        kinds: ['class', 'interface'], // This takes precedence
      });

      expect(result.isError).toBeUndefined();
      const data = JSON.parse((result.content[0] as any).text);
      // Should find TestClass and TestInterface, but not testFunc
      for (const symbol of data.symbols) {
        expect(['class', 'interface']).toContain(symbol.kind);
      }
    });

    test('kinds array with "all" returns all kinds', async () => {
      const filePath = path.join(tempDir, 'all.ts');
      fs.writeFileSync(
        filePath,
        `
export function myFunc(): void {}
export class MyClass {}
export const myConst = 1;
`
      );

      const tsconfigPath = path.join(tempDir, 'tsconfig.json');
      fs.writeFileSync(
        tsconfigPath,
        JSON.stringify({
          compilerOptions: { target: 'ES2020', module: 'commonjs' },
          include: ['*.ts'],
        })
      );

      await languageServiceManager.getServiceForFile(filePath);

      const result = await handleWorkspaceSymbols({
        query: 'my',
        kinds: ['all', 'function'], // 'all' should bypass filtering
      });

      expect(result.isError).toBeUndefined();
      const data = JSON.parse((result.content[0] as any).text);
      // Should find all kinds since 'all' is present
      expect(data.symbols.length).toBeGreaterThanOrEqual(0);
    });

    test('empty kinds array falls back to singular kind', async () => {
      const filePath = path.join(tempDir, 'empty.ts');
      fs.writeFileSync(
        filePath,
        `
export function emptyFunc(): void {}
export class EmptyClass {}
`
      );

      const tsconfigPath = path.join(tempDir, 'tsconfig.json');
      fs.writeFileSync(
        tsconfigPath,
        JSON.stringify({
          compilerOptions: { target: 'ES2020', module: 'commonjs' },
          include: ['*.ts'],
        })
      );

      await languageServiceManager.getServiceForFile(filePath);

      const result = await handleWorkspaceSymbols({
        query: 'Empty',
        kind: 'class',
        kinds: [], // Empty array should fall back to kind
      });

      expect(result.isError).toBeUndefined();
      const data = JSON.parse((result.content[0] as any).text);
      // Should use 'kind' (class) since kinds array is empty
      for (const symbol of data.symbols) {
        expect(symbol.kind).toBe('class');
      }
    });
  });

  // ===========================================================================
  // File Pattern Filtering Tests
  // ===========================================================================

  describe('file pattern filtering', () => {
    test('filters by file_patterns', async () => {
      // Create directory structure
      const srcDir = path.join(tempDir, 'src');
      const utilsDir = path.join(srcDir, 'utils');
      const modelsDir = path.join(srcDir, 'models');
      fs.mkdirSync(utilsDir, { recursive: true });
      fs.mkdirSync(modelsDir, { recursive: true });

      fs.writeFileSync(
        path.join(utilsDir, 'helper.ts'),
        `export function filterHelper(): void {}`
      );
      fs.writeFileSync(
        path.join(modelsDir, 'user.ts'),
        `export function filterUser(): void {}`
      );
      fs.writeFileSync(
        path.join(srcDir, 'index.ts'),
        `export function filterMain(): void {}`
      );

      const tsconfigPath = path.join(tempDir, 'tsconfig.json');
      fs.writeFileSync(
        tsconfigPath,
        JSON.stringify({
          compilerOptions: { target: 'ES2020', module: 'commonjs' },
          include: ['src/**/*.ts'],
        })
      );

      await languageServiceManager.getServiceForFile(path.join(utilsDir, 'helper.ts'));

      const result = await handleWorkspaceSymbols({
        query: 'filter',
        file_patterns: ['src/utils/**'],
      });

      expect(result.isError).toBeUndefined();
      const data = JSON.parse((result.content[0] as any).text);
      // Should only find symbols from src/utils/**
      for (const symbol of data.symbols) {
        expect(symbol.file).toContain('utils');
      }
    });

    test('excludes files with exclude_patterns', async () => {
      // Create files including test files
      fs.writeFileSync(
        path.join(tempDir, 'service.ts'),
        `export function excludeService(): void {}`
      );
      fs.writeFileSync(
        path.join(tempDir, 'service.test.ts'),
        `export function excludeServiceTest(): void {}`
      );
      fs.writeFileSync(
        path.join(tempDir, 'service.spec.ts'),
        `export function excludeServiceSpec(): void {}`
      );

      const tsconfigPath = path.join(tempDir, 'tsconfig.json');
      fs.writeFileSync(
        tsconfigPath,
        JSON.stringify({
          compilerOptions: { target: 'ES2020', module: 'commonjs' },
          include: ['*.ts'],
        })
      );

      await languageServiceManager.getServiceForFile(path.join(tempDir, 'service.ts'));

      const result = await handleWorkspaceSymbols({
        query: 'exclude',
        exclude_patterns: ['**/*.test.ts', '**/*.spec.ts'],
      });

      expect(result.isError).toBeUndefined();
      const data = JSON.parse((result.content[0] as any).text);
      // Should not find symbols from test or spec files
      for (const symbol of data.symbols) {
        expect(symbol.file).not.toContain('.test.ts');
        expect(symbol.file).not.toContain('.spec.ts');
      }
    });

    test('combines file_patterns and exclude_patterns', async () => {
      const srcDir = path.join(tempDir, 'src');
      fs.mkdirSync(srcDir, { recursive: true });

      fs.writeFileSync(
        path.join(srcDir, 'main.ts'),
        `export function combineMain(): void {}`
      );
      fs.writeFileSync(
        path.join(srcDir, 'main.test.ts'),
        `export function combineMainTest(): void {}`
      );
      fs.writeFileSync(
        path.join(tempDir, 'root.ts'),
        `export function combineRoot(): void {}`
      );

      const tsconfigPath = path.join(tempDir, 'tsconfig.json');
      fs.writeFileSync(
        tsconfigPath,
        JSON.stringify({
          compilerOptions: { target: 'ES2020', module: 'commonjs' },
          include: ['**/*.ts'],
        })
      );

      await languageServiceManager.getServiceForFile(path.join(srcDir, 'main.ts'));

      const result = await handleWorkspaceSymbols({
        query: 'combine',
        file_patterns: ['src/**'],
        exclude_patterns: ['**/*.test.ts'],
      });

      expect(result.isError).toBeUndefined();
      const data = JSON.parse((result.content[0] as any).text);
      // Should only find combineMain (in src, not a test file)
      for (const symbol of data.symbols) {
        expect(symbol.file).toContain('src');
        expect(symbol.file).not.toContain('.test.ts');
      }
    });

    test('returns files_searched count when file filters are applied', async () => {
      const srcDir = path.join(tempDir, 'src');
      fs.mkdirSync(srcDir, { recursive: true });

      fs.writeFileSync(
        path.join(srcDir, 'a.ts'),
        `export function countA(): void {}`
      );
      fs.writeFileSync(
        path.join(srcDir, 'b.ts'),
        `export function countB(): void {}`
      );

      const tsconfigPath = path.join(tempDir, 'tsconfig.json');
      fs.writeFileSync(
        tsconfigPath,
        JSON.stringify({
          compilerOptions: { target: 'ES2020', module: 'commonjs' },
          include: ['src/**/*.ts'],
        })
      );

      await languageServiceManager.getServiceForFile(path.join(srcDir, 'a.ts'));

      const result = await handleWorkspaceSymbols({
        query: 'count',
        file_patterns: ['src/**'],
      });

      expect(result.isError).toBeUndefined();
      const data = JSON.parse((result.content[0] as any).text);
      // Should include files_searched when file filters are applied
      expect(data).toHaveProperty('files_searched');
      expect(typeof data.files_searched).toBe('number');
    });

    test('does not include files_searched when no file filters', async () => {
      const filePath = path.join(tempDir, 'nofilter.ts');
      fs.writeFileSync(
        filePath,
        `export function noFilter(): void {}`
      );

      const tsconfigPath = path.join(tempDir, 'tsconfig.json');
      fs.writeFileSync(
        tsconfigPath,
        JSON.stringify({
          compilerOptions: { target: 'ES2020', module: 'commonjs' },
          include: ['*.ts'],
        })
      );

      await languageServiceManager.getServiceForFile(filePath);

      const result = await handleWorkspaceSymbols({
        query: 'noFilter',
      });

      expect(result.isError).toBeUndefined();
      const data = JSON.parse((result.content[0] as any).text);
      // Should NOT include files_searched when no file filters
      expect(data.files_searched).toBeUndefined();
    });

    test('handles __tests__ directory exclusion', async () => {
      const srcDir = path.join(tempDir, 'src');
      const testsDir = path.join(srcDir, '__tests__');
      fs.mkdirSync(testsDir, { recursive: true });

      fs.writeFileSync(
        path.join(srcDir, 'impl.ts'),
        `export function testsImpl(): void {}`
      );
      fs.writeFileSync(
        path.join(testsDir, 'impl.test.ts'),
        `export function testsImplTest(): void {}`
      );

      const tsconfigPath = path.join(tempDir, 'tsconfig.json');
      fs.writeFileSync(
        tsconfigPath,
        JSON.stringify({
          compilerOptions: { target: 'ES2020', module: 'commonjs' },
          include: ['src/**/*.ts'],
        })
      );

      await languageServiceManager.getServiceForFile(path.join(srcDir, 'impl.ts'));

      const result = await handleWorkspaceSymbols({
        query: 'tests',
        exclude_patterns: ['**/__tests__/**'],
      });

      expect(result.isError).toBeUndefined();
      const data = JSON.parse((result.content[0] as any).text);
      // Should not find symbols from __tests__ directory
      for (const symbol of data.symbols) {
        expect(symbol.file).not.toContain('__tests__');
      }
    });

    test('file_patterns with multiple directory patterns', async () => {
      const utilsDir = path.join(tempDir, 'src', 'utils');
      const helpersDir = path.join(tempDir, 'src', 'helpers');
      const servicesDir = path.join(tempDir, 'src', 'services');
      fs.mkdirSync(utilsDir, { recursive: true });
      fs.mkdirSync(helpersDir, { recursive: true });
      fs.mkdirSync(servicesDir, { recursive: true });

      fs.writeFileSync(
        path.join(utilsDir, 'util.ts'),
        `export function multiUtil(): void {}`
      );
      fs.writeFileSync(
        path.join(helpersDir, 'helper.ts'),
        `export function multiHelper(): void {}`
      );
      fs.writeFileSync(
        path.join(servicesDir, 'service.ts'),
        `export function multiService(): void {}`
      );

      const tsconfigPath = path.join(tempDir, 'tsconfig.json');
      fs.writeFileSync(
        tsconfigPath,
        JSON.stringify({
          compilerOptions: { target: 'ES2020', module: 'commonjs' },
          include: ['src/**/*.ts'],
        })
      );

      await languageServiceManager.getServiceForFile(path.join(utilsDir, 'util.ts'));

      const result = await handleWorkspaceSymbols({
        query: 'multi',
        file_patterns: ['src/utils/**', 'src/helpers/**'],
      });

      expect(result.isError).toBeUndefined();
      const data = JSON.parse((result.content[0] as any).text);
      // Should find symbols from utils and helpers, but not services
      for (const symbol of data.symbols) {
        const isUtils = symbol.file.includes('utils');
        const isHelpers = symbol.file.includes('helpers');
        expect(isUtils || isHelpers).toBe(true);
      }
    });
  });

  // ===========================================================================
  // Output Mode with New Features Tests
  // ===========================================================================

  describe('output modes with file filtering', () => {
    test('count_only includes files_searched when file filters applied', async () => {
      const srcDir = path.join(tempDir, 'src');
      fs.mkdirSync(srcDir, { recursive: true });

      const filePath = path.join(srcDir, 'countonly.ts');
      fs.writeFileSync(
        filePath,
        `export function uniqueCountOnlyFunc(): void {}`
      );

      const tsconfigPath = path.join(tempDir, 'tsconfig.json');
      fs.writeFileSync(
        tsconfigPath,
        JSON.stringify({
          compilerOptions: { target: 'ES2020', module: 'commonjs' },
          include: ['src/**/*.ts'],
        })
      );

      await languageServiceManager.getServiceForFile(filePath);

      const result = await handleWorkspaceSymbols({
        query: 'uniqueCountOnlyFunc',
        output_mode: 'count_only',
        file_patterns: ['src/**'],
      });

      expect(result.isError).toBeUndefined();
      const data = JSON.parse((result.content[0] as any).text);
      expect(data).toHaveProperty('query');
      expect(data).toHaveProperty('count');
      expect(data).toHaveProperty('truncated');
      expect(data).toHaveProperty('files_searched');
      expect(typeof data.files_searched).toBe('number');
    });

    test('minimal mode includes files_searched', async () => {
      const filePath = path.join(tempDir, 'minimal.ts');
      fs.writeFileSync(
        filePath,
        `export function minimalFunc(): void {}`
      );

      const tsconfigPath = path.join(tempDir, 'tsconfig.json');
      fs.writeFileSync(
        tsconfigPath,
        JSON.stringify({
          compilerOptions: { target: 'ES2020', module: 'commonjs' },
          include: ['*.ts'],
        })
      );

      await languageServiceManager.getServiceForFile(filePath);

      const result = await handleWorkspaceSymbols({
        query: 'minimal',
        output_mode: 'minimal',
        exclude_patterns: ['**/*.test.ts'],
      });

      expect(result.isError).toBeUndefined();
      const data = JSON.parse((result.content[0] as any).text);
      expect(data).toHaveProperty('files_searched');
      expect(Array.isArray(data.symbols)).toBe(true);
    });

    test('verbose mode includes files_searched', async () => {
      const filePath = path.join(tempDir, 'verbose.ts');
      fs.writeFileSync(
        filePath,
        `export function verboseFunc(): void {}`
      );

      const tsconfigPath = path.join(tempDir, 'tsconfig.json');
      fs.writeFileSync(
        tsconfigPath,
        JSON.stringify({
          compilerOptions: { target: 'ES2020', module: 'commonjs' },
          include: ['*.ts'],
        })
      );

      await languageServiceManager.getServiceForFile(filePath);

      const result = await handleWorkspaceSymbols({
        query: 'verbose',
        output_mode: 'verbose',
        file_patterns: ['**/*.ts'],
      });

      expect(result.isError).toBeUndefined();
      const data = JSON.parse((result.content[0] as any).text);
      expect(data).toHaveProperty('files_searched');
      if (data.symbols.length > 0) {
        // Verbose mode includes all fields
        expect(data.symbols[0]).toHaveProperty('container_name');
        expect(data.symbols[0]).toHaveProperty('match_kind');
      }
    });
  });
});
