/**
 * Unit tests for prisma operations handler
 *
 * Tests cover:
 * - Prisma operation detection (CRUD operations)
 * - N+1 query pattern detection
 * - Model usage tracking
 * - Include/select relation detection
 * - Loop detection for N+1 patterns
 * - Recommendation generation
 * - File filtering
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';

// Mock modules before imports
vi.mock('fs');

import { handleGetPrismaOperations, GetPrismaOperationsArgs } from '../../../handlers/framework/prisma.js';

describe('handleGetPrismaOperations', () => {
  const originalCwd = process.cwd;

  beforeEach(() => {
    vi.clearAllMocks();
    process.cwd = vi.fn(() => '/mock/project/root');
  });

  afterEach(() => {
    vi.resetAllMocks();
    process.cwd = originalCwd;
  });

  describe('file discovery', () => {
    it('should scan source directories for Prisma usage', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readdirSync).mockReturnValue([
        { name: 'user.ts', isDirectory: () => false, isFile: () => true },
      ] as unknown as fs.Dirent[]);
      vi.mocked(fs.readFileSync).mockReturnValue(`
        import { prisma } from './db';
        export async function getUser(id: string) {
          return prisma.user.findUnique({ where: { id } });
        }
      `);

      const args: GetPrismaOperationsArgs = {
        path: 'src',
      };

      const result = await handleGetPrismaOperations(args);
      const data = JSON.parse(result.content[0].text);

      expect(result.isError).toBeUndefined();
      expect(data.operations).toBeDefined();
    });

    it('should skip non-Prisma files', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readdirSync).mockReturnValue([
        { name: 'utils.ts', isDirectory: () => false, isFile: () => true },
      ] as unknown as fs.Dirent[]);
      vi.mocked(fs.readFileSync).mockReturnValue(`
        export function formatDate(date: Date) {
          return date.toISOString();
        }
      `);

      const args: GetPrismaOperationsArgs = {
        path: 'src',
      };

      const result = await handleGetPrismaOperations(args);
      const data = JSON.parse(result.content[0].text);

      expect(result.isError).toBeUndefined();
      expect(data.operations).toHaveLength(0);
    });

    it('should skip node_modules and build directories', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readdirSync).mockImplementation((dir) => {
        const d = String(dir);
        if (d.includes('src') && !d.includes('node_modules')) {
          return [
            { name: 'node_modules', isDirectory: () => true, isFile: () => false },
            { name: 'dist', isDirectory: () => true, isFile: () => false },
            { name: '.prisma', isDirectory: () => true, isFile: () => false },
            { name: 'app.ts', isDirectory: () => false, isFile: () => true },
          ] as unknown as fs.Dirent[];
        }
        return [];
      });
      vi.mocked(fs.readFileSync).mockReturnValue('');

      const args: GetPrismaOperationsArgs = {
        path: 'src',
      };

      const result = await handleGetPrismaOperations(args);

      expect(result.isError).toBeUndefined();
    });

    it('should return empty result for directory with no source files', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readdirSync).mockReturnValue([]);

      const args: GetPrismaOperationsArgs = {
        path: 'src',
      };

      const result = await handleGetPrismaOperations(args);
      const data = JSON.parse(result.content[0].text);

      expect(result.isError).toBeUndefined();
      expect(data.operations).toHaveLength(0);
    });
  });

  describe('operation detection', () => {
    it('should detect findUnique operations', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readdirSync).mockReturnValue([
        { name: 'user.ts', isDirectory: () => false, isFile: () => true },
      ] as unknown as fs.Dirent[]);
      vi.mocked(fs.readFileSync).mockReturnValue(`
        import { prisma } from './db';
        export const getUser = (id: string) => prisma.user.findUnique({ where: { id } });
      `);

      const args: GetPrismaOperationsArgs = { path: 'src' };

      const result = await handleGetPrismaOperations(args);
      const data = JSON.parse(result.content[0].text);

      expect(data.operations.some((o: { operation: string }) => o.operation === 'findUnique')).toBe(true);
    });

    it('should detect findMany operations', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readdirSync).mockReturnValue([
        { name: 'user.ts', isDirectory: () => false, isFile: () => true },
      ] as unknown as fs.Dirent[]);
      vi.mocked(fs.readFileSync).mockReturnValue(`
        import { prisma } from './db';
        export const getUsers = () => prisma.user.findMany();
      `);

      const args: GetPrismaOperationsArgs = { path: 'src' };

      const result = await handleGetPrismaOperations(args);
      const data = JSON.parse(result.content[0].text);

      expect(data.operations.some((o: { operation: string }) => o.operation === 'findMany')).toBe(true);
    });

    it('should detect create operations', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readdirSync).mockReturnValue([
        { name: 'user.ts', isDirectory: () => false, isFile: () => true },
      ] as unknown as fs.Dirent[]);
      vi.mocked(fs.readFileSync).mockReturnValue(`
        import { prisma } from './db';
        export const createUser = (data: UserInput) => prisma.user.create({ data });
      `);

      const args: GetPrismaOperationsArgs = { path: 'src' };

      const result = await handleGetPrismaOperations(args);
      const data = JSON.parse(result.content[0].text);

      expect(data.operations.some((o: { operation: string }) => o.operation === 'create')).toBe(true);
    });

    it('should detect update operations', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readdirSync).mockReturnValue([
        { name: 'user.ts', isDirectory: () => false, isFile: () => true },
      ] as unknown as fs.Dirent[]);
      vi.mocked(fs.readFileSync).mockReturnValue(`
        import { prisma } from './db';
        export const updateUser = (id: string, data: UserInput) =>
          prisma.user.update({ where: { id }, data });
      `);

      const args: GetPrismaOperationsArgs = { path: 'src' };

      const result = await handleGetPrismaOperations(args);
      const data = JSON.parse(result.content[0].text);

      expect(data.operations.some((o: { operation: string }) => o.operation === 'update')).toBe(true);
    });

    it('should detect delete operations', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readdirSync).mockReturnValue([
        { name: 'user.ts', isDirectory: () => false, isFile: () => true },
      ] as unknown as fs.Dirent[]);
      vi.mocked(fs.readFileSync).mockReturnValue(`
        import { prisma } from './db';
        export const deleteUser = (id: string) => prisma.user.delete({ where: { id } });
      `);

      const args: GetPrismaOperationsArgs = { path: 'src' };

      const result = await handleGetPrismaOperations(args);
      const data = JSON.parse(result.content[0].text);

      expect(data.operations.some((o: { operation: string }) => o.operation === 'delete')).toBe(true);
    });

    it('should detect raw query operations', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readdirSync).mockReturnValue([
        { name: 'raw.ts', isDirectory: () => false, isFile: () => true },
      ] as unknown as fs.Dirent[]);
      // Note: The handler detects CallExpression nodes (prisma.model.$queryRaw())
      // Tagged template expressions (prisma.$queryRaw`...`) require different AST handling
      // The handler expects model.$queryRaw() call pattern
      vi.mocked(fs.readFileSync).mockReturnValue(`
        import { prisma } from './db';
        export const rawQuery = () => prisma.user.$queryRaw({ where: {} });
      `);

      const args: GetPrismaOperationsArgs = { path: 'src' };

      const result = await handleGetPrismaOperations(args);
      const data = JSON.parse(result.content[0].text);

      // The handler detects $queryRaw as an operation on a model
      expect(data.operations.some((o: { operation: string }) => o.operation === '$queryRaw')).toBe(true);
    });

    it('should detect various client variable names', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readdirSync).mockReturnValue([
        { name: 'queries.ts', isDirectory: () => false, isFile: () => true },
      ] as unknown as fs.Dirent[]);
      // The handler's fileUsesPrisma checks for @prisma/client, PrismaClient, or prisma.
      // Need to include a Prisma indicator for the file to be analyzed
      vi.mocked(fs.readFileSync).mockReturnValue(`
        import { PrismaClient } from '@prisma/client';
        const db = new PrismaClient();
        const client = new PrismaClient();

        export const query1 = () => db.user.findMany();
        export const query2 = () => client.post.findFirst();
      `);

      const args: GetPrismaOperationsArgs = { path: 'src' };

      const result = await handleGetPrismaOperations(args);
      const data = JSON.parse(result.content[0].text);

      expect(data.operations.length).toBeGreaterThanOrEqual(2);
    });

    it('should detect this.prisma in class methods', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readdirSync).mockReturnValue([
        { name: 'service.ts', isDirectory: () => false, isFile: () => true },
      ] as unknown as fs.Dirent[]);
      vi.mocked(fs.readFileSync).mockReturnValue(`
        import { PrismaClient } from '@prisma/client';

        class UserService {
          constructor(private prisma: PrismaClient) {}

          async getUser(id: string) {
            return this.prisma.user.findUnique({ where: { id } });
          }
        }
      `);

      const args: GetPrismaOperationsArgs = { path: 'src' };

      const result = await handleGetPrismaOperations(args);
      const data = JSON.parse(result.content[0].text);

      expect(data.operations.some((o: { operation: string }) => o.operation === 'findUnique')).toBe(true);
    });
  });

  describe('relation detection', () => {
    it('should detect include relations', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readdirSync).mockReturnValue([
        { name: 'user.ts', isDirectory: () => false, isFile: () => true },
      ] as unknown as fs.Dirent[]);
      vi.mocked(fs.readFileSync).mockReturnValue(`
        import { prisma } from './db';
        export const getUserWithPosts = (id: string) =>
          prisma.user.findUnique({
            where: { id },
            include: { posts: true }
          });
      `);

      const args: GetPrismaOperationsArgs = { path: 'src' };

      const result = await handleGetPrismaOperations(args);
      const data = JSON.parse(result.content[0].text);

      const op = data.operations.find((o: { operation: string }) => o.operation === 'findUnique');
      expect(op.includes_relation).toBe(true);
    });

    it('should detect nested select relations', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readdirSync).mockReturnValue([
        { name: 'user.ts', isDirectory: () => false, isFile: () => true },
      ] as unknown as fs.Dirent[]);
      vi.mocked(fs.readFileSync).mockReturnValue(`
        import { prisma } from './db';
        export const getUserProfile = (id: string) =>
          prisma.user.findUnique({
            where: { id },
            select: {
              name: true,
              posts: { select: { title: true } }
            }
          });
      `);

      const args: GetPrismaOperationsArgs = { path: 'src' };

      const result = await handleGetPrismaOperations(args);
      const data = JSON.parse(result.content[0].text);

      const op = data.operations.find((o: { operation: string }) => o.operation === 'findUnique');
      expect(op.includes_relation).toBe(true);
    });

    it('should not flag queries without include or select as relation', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readdirSync).mockReturnValue([
        { name: 'user.ts', isDirectory: () => false, isFile: () => true },
      ] as unknown as fs.Dirent[]);
      // Note: Handler checks for 'include:' or 'select:' with ': {' to detect relations
      // A simple where-only query won't have any relation indicators
      vi.mocked(fs.readFileSync).mockReturnValue(`
        import { prisma } from './db';
        export const getUserName = (id: string) =>
          prisma.user.findUnique({ where: { id } });
      `);

      const args: GetPrismaOperationsArgs = { path: 'src' };

      const result = await handleGetPrismaOperations(args);
      const data = JSON.parse(result.content[0].text);

      const op = data.operations.find((o: { operation: string }) => o.operation === 'findUnique');
      expect(op.includes_relation).toBe(false);
    });
  });

  describe('N+1 pattern detection', () => {
    it('should detect queries inside for loops', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readdirSync).mockReturnValue([
        { name: 'bad.ts', isDirectory: () => false, isFile: () => true },
      ] as unknown as fs.Dirent[]);
      vi.mocked(fs.readFileSync).mockReturnValue(`
        import { prisma } from './db';
        export async function getUsersWithProfiles(userIds: string[]) {
          const profiles = [];
          for (const id of userIds) {
            const profile = await prisma.profile.findUnique({ where: { userId: id } });
            profiles.push(profile);
          }
          return profiles;
        }
      `);

      const args: GetPrismaOperationsArgs = {
        path: 'src',
        include_n1_detection: true,
      };

      const result = await handleGetPrismaOperations(args);
      const data = JSON.parse(result.content[0].text);

      expect(data.n1_patterns.length).toBeGreaterThan(0);
      expect(data.n1_patterns[0].description).toContain('loop');
    });

    it('should detect queries inside forEach', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readdirSync).mockReturnValue([
        { name: 'bad.ts', isDirectory: () => false, isFile: () => true },
      ] as unknown as fs.Dirent[]);
      vi.mocked(fs.readFileSync).mockReturnValue(`
        import { prisma } from './db';
        export async function processUsers(users: User[]) {
          users.forEach(async (user) => {
            const posts = await prisma.post.findMany({ where: { authorId: user.id } });
            console.log(posts);
          });
        }
      `);

      const args: GetPrismaOperationsArgs = {
        path: 'src',
        include_n1_detection: true,
      };

      const result = await handleGetPrismaOperations(args);
      const data = JSON.parse(result.content[0].text);

      expect(data.n1_patterns.length).toBeGreaterThan(0);
    });

    it('should detect queries inside map', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readdirSync).mockReturnValue([
        { name: 'bad.ts', isDirectory: () => false, isFile: () => true },
      ] as unknown as fs.Dirent[]);
      vi.mocked(fs.readFileSync).mockReturnValue(`
        import { prisma } from './db';
        export async function enrichUsers(userIds: string[]) {
          return userIds.map(async (id) => {
            const user = await prisma.user.findUnique({ where: { id } });
            return user;
          });
        }
      `);

      const args: GetPrismaOperationsArgs = {
        path: 'src',
        include_n1_detection: true,
      };

      const result = await handleGetPrismaOperations(args);
      const data = JSON.parse(result.content[0].text);

      expect(data.n1_patterns.length).toBeGreaterThan(0);
    });

    it('should not flag queries outside loops', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readdirSync).mockReturnValue([
        { name: 'good.ts', isDirectory: () => false, isFile: () => true },
      ] as unknown as fs.Dirent[]);
      vi.mocked(fs.readFileSync).mockReturnValue(`
        import { prisma } from './db';
        export async function getUsersWithProfiles(userIds: string[]) {
          return prisma.user.findMany({
            where: { id: { in: userIds } },
            include: { profile: true }
          });
        }
      `);

      const args: GetPrismaOperationsArgs = {
        path: 'src',
        include_n1_detection: true,
      };

      const result = await handleGetPrismaOperations(args);
      const data = JSON.parse(result.content[0].text);

      expect(data.n1_patterns).toHaveLength(0);
    });

    it('should skip N+1 detection when disabled', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readdirSync).mockReturnValue([
        { name: 'bad.ts', isDirectory: () => false, isFile: () => true },
      ] as unknown as fs.Dirent[]);
      vi.mocked(fs.readFileSync).mockReturnValue(`
        import { prisma } from './db';
        export async function bad(ids: string[]) {
          for (const id of ids) {
            await prisma.user.findUnique({ where: { id } });
          }
        }
      `);

      const args: GetPrismaOperationsArgs = {
        path: 'src',
        include_n1_detection: false,
      };

      const result = await handleGetPrismaOperations(args);
      const data = JSON.parse(result.content[0].text);

      expect(data.n1_patterns).toHaveLength(0);
    });
  });

  describe('model usage tracking', () => {
    it('should track models used with operation counts', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readdirSync).mockReturnValue([
        { name: 'queries.ts', isDirectory: () => false, isFile: () => true },
      ] as unknown as fs.Dirent[]);
      vi.mocked(fs.readFileSync).mockReturnValue(`
        import { prisma } from './db';
        export const getUser = () => prisma.user.findUnique({ where: { id: '1' } });
        export const getUsers = () => prisma.user.findMany();
        export const getPosts = () => prisma.post.findMany();
      `);

      const args: GetPrismaOperationsArgs = { path: 'src' };

      const result = await handleGetPrismaOperations(args);
      const data = JSON.parse(result.content[0].text);

      expect(data.models_used).toBeDefined();
      const userModel = data.models_used.find((m: { name: string }) => m.name === 'user');
      expect(userModel.operations).toBe(2);
    });

    it('should sort models by operation count', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readdirSync).mockReturnValue([
        { name: 'queries.ts', isDirectory: () => false, isFile: () => true },
      ] as unknown as fs.Dirent[]);
      vi.mocked(fs.readFileSync).mockReturnValue(`
        import { prisma } from './db';
        export const q1 = () => prisma.post.findMany();
        export const q2 = () => prisma.post.findUnique({ where: { id: '1' } });
        export const q3 = () => prisma.post.create({ data: {} });
        export const q4 = () => prisma.user.findUnique({ where: { id: '1' } });
      `);

      const args: GetPrismaOperationsArgs = { path: 'src' };

      const result = await handleGetPrismaOperations(args);
      const data = JSON.parse(result.content[0].text);

      // post should be first (3 operations) before user (1 operation)
      expect(data.models_used[0].name).toBe('post');
    });
  });

  describe('recommendation generation', () => {
    it('should recommend include/select for queries without relations', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readdirSync).mockReturnValue([
        { name: 'queries.ts', isDirectory: () => false, isFile: () => true },
      ] as unknown as fs.Dirent[]);
      vi.mocked(fs.readFileSync).mockReturnValue(`
        import { prisma } from './db';
        export const getUsers = () => prisma.user.findMany();
        export const getUser = () => prisma.user.findUnique({ where: { id: '1' } });
        export const getPosts = () => prisma.post.findMany();
      `);

      const args: GetPrismaOperationsArgs = { path: 'src' };

      const result = await handleGetPrismaOperations(args);
      const data = JSON.parse(result.content[0].text);

      expect(data.recommendations.some((r: string) => r.includes('include') || r.includes('select'))).toBe(true);
    });

    it('should warn about raw queries', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readdirSync).mockReturnValue([
        { name: 'queries.ts', isDirectory: () => false, isFile: () => true },
      ] as unknown as fs.Dirent[]);
      // Use function call syntax which the handler can detect via CallExpression AST nodes
      vi.mocked(fs.readFileSync).mockReturnValue(`
        import { prisma } from './db';
        export const rawQuery = () => prisma.user.$queryRaw({ select: '*' });
      `);

      const args: GetPrismaOperationsArgs = { path: 'src' };

      const result = await handleGetPrismaOperations(args);
      const data = JSON.parse(result.content[0].text);

      expect(data.recommendations.some((r: string) => r.includes('raw') || r.includes('SQL'))).toBe(true);
    });

    it('should suggest upsert for create/update patterns', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readdirSync).mockReturnValue([
        { name: 'queries.ts', isDirectory: () => false, isFile: () => true },
      ] as unknown as fs.Dirent[]);
      vi.mocked(fs.readFileSync).mockReturnValue(`
        import { prisma } from './db';
        export const createUser = () => prisma.user.create({ data: {} });
        export const updateUser = () => prisma.user.update({ where: { id: '1' }, data: {} });
      `);

      const args: GetPrismaOperationsArgs = { path: 'src' };

      const result = await handleGetPrismaOperations(args);
      const data = JSON.parse(result.content[0].text);

      expect(data.recommendations.some((r: string) => r.includes('upsert'))).toBe(true);
    });
  });

  describe('response format', () => {
    it('should return structured analysis result', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readdirSync).mockReturnValue([
        { name: 'queries.ts', isDirectory: () => false, isFile: () => true },
      ] as unknown as fs.Dirent[]);
      vi.mocked(fs.readFileSync).mockReturnValue(`
        import { prisma } from './db';
        export const getUser = () => prisma.user.findUnique({ where: { id: '1' } });
      `);

      const args: GetPrismaOperationsArgs = { path: 'src' };

      const result = await handleGetPrismaOperations(args);
      const data = JSON.parse(result.content[0].text);

      expect(data).toHaveProperty('operations');
      expect(data).toHaveProperty('models_used');
      expect(data).toHaveProperty('n1_patterns');
      expect(data).toHaveProperty('recommendations');
    });

    it('should include file and line info for operations', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readdirSync).mockReturnValue([
        { name: 'queries.ts', isDirectory: () => false, isFile: () => true },
      ] as unknown as fs.Dirent[]);
      vi.mocked(fs.readFileSync).mockReturnValue(`
        import { prisma } from './db';
        export const getUser = () => prisma.user.findUnique({ where: { id: '1' } });
      `);

      const args: GetPrismaOperationsArgs = { path: 'src' };

      const result = await handleGetPrismaOperations(args);
      const data = JSON.parse(result.content[0].text);

      const op = data.operations[0];
      expect(op).toHaveProperty('file');
      expect(op).toHaveProperty('line');
      expect(op).toHaveProperty('model');
      expect(op).toHaveProperty('operation');
      expect(op).toHaveProperty('code_snippet');
    });
  });

  describe('error handling', () => {
    it('should handle file read errors gracefully', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readdirSync).mockReturnValue([
        { name: 'protected.ts', isDirectory: () => false, isFile: () => true },
      ] as unknown as fs.Dirent[]);
      vi.mocked(fs.readFileSync).mockImplementation(() => {
        throw new Error('Permission denied');
      });

      const args: GetPrismaOperationsArgs = { path: 'src' };

      const result = await handleGetPrismaOperations(args);

      // The handler's analyzeFile function doesn't have try-catch around readFileSync,
      // so errors propagate to the outer handler which returns an error response
      expect(result.isError).toBe(true);
      const data = JSON.parse(result.content[0].text);
      expect(data.error).toBeDefined();
    });

    it('should handle non-existent file path in analyzeFile', async () => {
      // Line 346: Test when fs.existsSync returns false inside analyzeFile
      vi.mocked(fs.existsSync).mockImplementation((p) => {
        const pathStr = String(p);
        // Return true for directory but false for individual file
        if (pathStr.includes('src') && !pathStr.includes('.ts')) {
          return true;
        }
        return false;
      });
      vi.mocked(fs.readdirSync).mockReturnValue([
        { name: 'missing.ts', isDirectory: () => false, isFile: () => true },
      ] as unknown as fs.Dirent[]);

      const args: GetPrismaOperationsArgs = { path: 'src' };

      const result = await handleGetPrismaOperations(args);
      const data = JSON.parse(result.content[0].text);

      // Should return empty operations since file doesn't exist
      expect(result.isError).toBeUndefined();
      expect(data.operations).toHaveLength(0);
    });
  });

  describe('recursive directory walking', () => {
    it('should recursively walk subdirectories', async () => {
      // Line 176: Test recursive walk call
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readdirSync).mockImplementation((dir) => {
        const d = String(dir);
        if (d.endsWith('src')) {
          return [
            { name: 'subdir', isDirectory: () => true, isFile: () => false },
            { name: 'root.ts', isDirectory: () => false, isFile: () => true },
          ] as unknown as fs.Dirent[];
        }
        if (d.includes('subdir')) {
          return [
            { name: 'nested.ts', isDirectory: () => false, isFile: () => true },
          ] as unknown as fs.Dirent[];
        }
        return [];
      });
      vi.mocked(fs.readFileSync).mockReturnValue(`
        import { prisma } from './db';
        export const getUser = () => prisma.user.findUnique({ where: { id: '1' } });
      `);

      const args: GetPrismaOperationsArgs = { path: 'src' };

      const result = await handleGetPrismaOperations(args);
      const data = JSON.parse(result.content[0].text);

      // Should find operations in both root.ts and nested.ts
      expect(data.operations.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('AST edge cases', () => {
    it('should return null for non-PropertyAccessExpression in extractModelFromPrismaCall', async () => {
      // Line 261: Test when expr is not PropertyAccessExpression (direct function call)
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readdirSync).mockReturnValue([
        { name: 'edge.ts', isDirectory: () => false, isFile: () => true },
      ] as unknown as fs.Dirent[]);
      // Regular function call, not a property access
      vi.mocked(fs.readFileSync).mockReturnValue(`
        import { prisma } from './db';
        // This is a direct function call, not prisma.model.operation pattern
        export const query = () => someFindUnique({ where: { id: '1' } });
        export const query2 = () => findUnique();
      `);

      const args: GetPrismaOperationsArgs = { path: 'src' };

      const result = await handleGetPrismaOperations(args);
      const data = JSON.parse(result.content[0].text);

      // Should not detect any Prisma operations
      expect(data.operations).toHaveLength(0);
    });

    it('should return null when modelAccess is not a PropertyAccessExpression (line 275)', async () => {
      // Line 275: Test when the expression before .operation is not a property access
      // e.g., model.findUnique() where 'model' is a variable (Identifier), not prisma.model
      // This triggers the check at line 274: if (!ts.isPropertyAccessExpression(modelAccess))
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readdirSync).mockReturnValue([
        { name: 'shallow-call.ts', isDirectory: () => false, isFile: () => true },
      ] as unknown as fs.Dirent[]);
      // Use 'model' as variable name and call findUnique on it directly
      // AST structure: model.findUnique({...})
      // - CallExpression.expression = PropertyAccessExpression (model.findUnique)
      // - PropertyAccessExpression.name = findUnique (passes line 267 check)
      // - PropertyAccessExpression.expression = Identifier 'model' (fails line 274 check)
      vi.mocked(fs.readFileSync).mockReturnValue(`
        import { PrismaClient } from '@prisma/client';
        const model = { findUnique: () => null };
        export const query = () => model.findUnique({ where: { id: '1' } });
      `);

      const args: GetPrismaOperationsArgs = { path: 'src' };

      const result = await handleGetPrismaOperations(args);
      const data = JSON.parse(result.content[0].text);

      // Should not detect any Prisma operations since model.findUnique is not
      // the expected prisma.model.findUnique pattern (model is Identifier, not PropertyAccess)
      expect(data.operations).toHaveLength(0);
    });

    it('should return null for invalid client names', async () => {
      // Line 291: Test when client is not a valid Prisma client name
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readdirSync).mockReturnValue([
        { name: 'invalid.ts', isDirectory: () => false, isFile: () => true },
      ] as unknown as fs.Dirent[]);
      // Use a non-standard client name that's not in the validClients list
      vi.mocked(fs.readFileSync).mockReturnValue(`
        import { PrismaClient } from '@prisma/client';
        const unknownClient = new PrismaClient();
        export const query = () => unknownClient.user.findUnique({ where: { id: '1' } });
      `);

      const args: GetPrismaOperationsArgs = { path: 'src' };

      const result = await handleGetPrismaOperations(args);
      const data = JSON.parse(result.content[0].text);

      // unknownClient is not in the validClients list, so no operations detected
      expect(data.operations).toHaveLength(0);
    });
  });

  describe('loop detection - while/do loops', () => {
    it('should detect queries inside while loops', async () => {
      // Lines 312-313: Test while loop detection
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readdirSync).mockReturnValue([
        { name: 'while-loop.ts', isDirectory: () => false, isFile: () => true },
      ] as unknown as fs.Dirent[]);
      vi.mocked(fs.readFileSync).mockReturnValue(`
        import { prisma } from './db';
        export async function processQueue() {
          let hasMore = true;
          while (hasMore) {
            const item = await prisma.queue.findFirst({ where: { processed: false } });
            hasMore = !!item;
          }
        }
      `);

      const args: GetPrismaOperationsArgs = {
        path: 'src',
        include_n1_detection: true,
      };

      const result = await handleGetPrismaOperations(args);
      const data = JSON.parse(result.content[0].text);

      expect(data.n1_patterns.length).toBeGreaterThan(0);
      expect(data.n1_patterns[0].description).toContain('loop');
    });

    it('should detect queries inside do-while loops', async () => {
      // Line 312-313: Test do-while loop detection
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readdirSync).mockReturnValue([
        { name: 'do-while.ts', isDirectory: () => false, isFile: () => true },
      ] as unknown as fs.Dirent[]);
      vi.mocked(fs.readFileSync).mockReturnValue(`
        import { prisma } from './db';
        export async function processBatch() {
          let cursor = 0;
          do {
            const batch = await prisma.item.findMany({ skip: cursor, take: 10 });
            cursor += 10;
          } while (cursor < 100);
        }
      `);

      const args: GetPrismaOperationsArgs = {
        path: 'src',
        include_n1_detection: true,
      };

      const result = await handleGetPrismaOperations(args);
      const data = JSON.parse(result.content[0].text);

      expect(data.n1_patterns.length).toBeGreaterThan(0);
    });
  });

  describe('recommendation generation - additional cases', () => {
    it('should recommend transactions for many findMany operations', async () => {
      // Line 456: Test when findMany count > 5
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readdirSync).mockReturnValue([
        { name: 'many-queries.ts', isDirectory: () => false, isFile: () => true },
      ] as unknown as fs.Dirent[]);
      vi.mocked(fs.readFileSync).mockReturnValue(`
        import { prisma } from './db';
        export const q1 = () => prisma.user.findMany();
        export const q2 = () => prisma.post.findMany();
        export const q3 = () => prisma.comment.findMany();
        export const q4 = () => prisma.tag.findMany();
        export const q5 = () => prisma.category.findMany();
        export const q6 = () => prisma.like.findMany();
      `);

      const args: GetPrismaOperationsArgs = { path: 'src' };

      const result = await handleGetPrismaOperations(args);
      const data = JSON.parse(result.content[0].text);

      expect(data.recommendations.some((r: string) => r.includes('transaction'))).toBe(true);
    });

    it('should recommend connection pooling for high operation count', async () => {
      // Line 494: Test when operations > 20
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readdirSync).mockReturnValue([
        { name: 'high-ops.ts', isDirectory: () => false, isFile: () => true },
      ] as unknown as fs.Dirent[]);
      // Generate 21+ operations
      const operations = Array.from({ length: 21 }, (_, i) =>
        `export const q${i} = () => prisma.user.findUnique({ where: { id: '${i}' } });`
      ).join('\n');
      vi.mocked(fs.readFileSync).mockReturnValue(`
        import { prisma } from './db';
        ${operations}
      `);

      const args: GetPrismaOperationsArgs = { path: 'src' };

      const result = await handleGetPrismaOperations(args);
      const data = JSON.parse(result.content[0].text);

      expect(data.recommendations.some((r: string) => r.includes('pooling') || r.includes('PgBouncer'))).toBe(true);
    });

    it('should show positive message when no issues detected', async () => {
      // Test the "no issues" recommendation path
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readdirSync).mockReturnValue([
        { name: 'clean.ts', isDirectory: () => false, isFile: () => true },
      ] as unknown as fs.Dirent[]);
      // Single operation with include - no issues
      vi.mocked(fs.readFileSync).mockReturnValue(`
        import { prisma } from './db';
        export const getUser = () => prisma.user.findUnique({
          where: { id: '1' },
          include: { posts: true }
        });
      `);

      const args: GetPrismaOperationsArgs = {
        path: 'src',
        include_n1_detection: false,
      };

      const result = await handleGetPrismaOperations(args);
      const data = JSON.parse(result.content[0].text);

      expect(data.recommendations.some((r: string) => r.includes('Good work'))).toBe(true);
    });
  });

  describe('N+1 detection severity', () => {
    it('should assign high severity to queries without include/select in loops', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readdirSync).mockReturnValue([
        { name: 'high-severity.ts', isDirectory: () => false, isFile: () => true },
      ] as unknown as fs.Dirent[]);
      vi.mocked(fs.readFileSync).mockReturnValue(`
        import { prisma } from './db';
        export async function bad(ids: string[]) {
          for (const id of ids) {
            await prisma.user.findUnique({ where: { id } });
          }
        }
      `);

      const args: GetPrismaOperationsArgs = {
        path: 'src',
        include_n1_detection: true,
      };

      const result = await handleGetPrismaOperations(args);
      const data = JSON.parse(result.content[0].text);

      expect(data.n1_patterns.length).toBeGreaterThan(0);
      expect(data.n1_patterns[0].severity).toBe('high');
    });

    it('should assign medium severity to queries with include in loops', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readdirSync).mockReturnValue([
        { name: 'medium-severity.ts', isDirectory: () => false, isFile: () => true },
      ] as unknown as fs.Dirent[]);
      vi.mocked(fs.readFileSync).mockReturnValue(`
        import { prisma } from './db';
        export async function bad(ids: string[]) {
          for (const id of ids) {
            await prisma.user.findUnique({
              where: { id },
              include: { posts: true }
            });
          }
        }
      `);

      const args: GetPrismaOperationsArgs = {
        path: 'src',
        include_n1_detection: true,
      };

      const result = await handleGetPrismaOperations(args);
      const data = JSON.parse(result.content[0].text);

      expect(data.n1_patterns.length).toBeGreaterThan(0);
      expect(data.n1_patterns[0].severity).toBe('medium');
    });
  });
});
