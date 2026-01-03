/**
 * Unit tests for schema handler
 *
 * Tests cover:
 * - handleGetSchema
 * - Prisma schema parsing
 * - Drizzle schema parsing
 * - TypeORM schema parsing
 * - SQL schema parsing
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';

import { handleGetSchema } from '../../handlers/schema.js';
import {
  samplePrismaSchema,
  sampleDrizzleSchema,
  sampleSqlSchema,
} from '../setup.js';

// Mock modules
vi.mock('fs');
vi.mock('../../config.js', () => ({
  PROJECT_ROOT: '/mock/project/root',
}));

describe('schema handler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('handleGetSchema', () => {
    describe('Prisma schema parsing', () => {
      it('should parse Prisma schema with models', () => {
        vi.mocked(fs.existsSync).mockReturnValue(true);
        vi.mocked(fs.readFileSync).mockReturnValue(samplePrismaSchema);

        const result = handleGetSchema({ source: 'prisma' });
        const data = JSON.parse(result.content[0].text);

        expect(data.source).toBe('prisma');
        expect(data.tables.length).toBeGreaterThan(0);
        expect(data.tables.some((t: any) => t.name === 'User')).toBe(true);
        expect(data.tables.some((t: any) => t.name === 'Post')).toBe(true);
      });

      it('should parse Prisma columns with types', () => {
        vi.mocked(fs.existsSync).mockReturnValue(true);
        vi.mocked(fs.readFileSync).mockReturnValue(samplePrismaSchema);

        const result = handleGetSchema({ source: 'prisma' });
        const data = JSON.parse(result.content[0].text);
        const userTable = data.tables.find((t: any) => t.name === 'User');

        expect(userTable.columns.some((c: any) => c.name === 'id' && c.type === 'String')).toBe(true);
        expect(userTable.columns.some((c: any) => c.name === 'email' && c.type === 'String')).toBe(true);
      });

      it('should detect primary keys', () => {
        vi.mocked(fs.existsSync).mockReturnValue(true);
        vi.mocked(fs.readFileSync).mockReturnValue(samplePrismaSchema);

        const result = handleGetSchema({ source: 'prisma' });
        const data = JSON.parse(result.content[0].text);
        const userTable = data.tables.find((t: any) => t.name === 'User');
        const idColumn = userTable.columns.find((c: any) => c.name === 'id');

        expect(idColumn.primary).toBe(true);
      });

      it('should detect unique constraints', () => {
        vi.mocked(fs.existsSync).mockReturnValue(true);
        vi.mocked(fs.readFileSync).mockReturnValue(samplePrismaSchema);

        const result = handleGetSchema({ source: 'prisma' });
        const data = JSON.parse(result.content[0].text);
        const userTable = data.tables.find((t: any) => t.name === 'User');
        const emailColumn = userTable.columns.find((c: any) => c.name === 'email');

        expect(emailColumn.unique).toBe(true);
      });

      it('should detect nullable fields', () => {
        vi.mocked(fs.existsSync).mockReturnValue(true);
        vi.mocked(fs.readFileSync).mockReturnValue(samplePrismaSchema);

        const result = handleGetSchema({ source: 'prisma' });
        const data = JSON.parse(result.content[0].text);
        const userTable = data.tables.find((t: any) => t.name === 'User');
        const nameColumn = userTable.columns.find((c: any) => c.name === 'name');

        expect(nameColumn.nullable).toBe(true);
      });

      it('should parse relations', () => {
        vi.mocked(fs.existsSync).mockReturnValue(true);
        vi.mocked(fs.readFileSync).mockReturnValue(samplePrismaSchema);

        const result = handleGetSchema({ source: 'prisma' });
        const data = JSON.parse(result.content[0].text);
        const userTable = data.tables.find((t: any) => t.name === 'User');

        expect(userTable.relations.some((r: any) => r.target === 'Post')).toBe(true);
      });

      it('should parse indexes', () => {
        vi.mocked(fs.existsSync).mockReturnValue(true);
        vi.mocked(fs.readFileSync).mockReturnValue(samplePrismaSchema);

        const result = handleGetSchema({ source: 'prisma' });
        const data = JSON.parse(result.content[0].text);
        const userTable = data.tables.find((t: any) => t.name === 'User');

        expect(userTable.indexes.length).toBeGreaterThan(0);
      });

      it('should filter tables when specified', () => {
        vi.mocked(fs.existsSync).mockReturnValue(true);
        vi.mocked(fs.readFileSync).mockReturnValue(samplePrismaSchema);

        const result = handleGetSchema({ source: 'prisma', tables: ['User'] });
        const data = JSON.parse(result.content[0].text);

        expect(data.tables.length).toBe(1);
        expect(data.tables[0].name).toBe('User');
      });

      it('should throw error when schema not found', () => {
        vi.mocked(fs.existsSync).mockReturnValue(false);

        expect(() => {
          handleGetSchema({ source: 'prisma' });
        }).toThrow('Prisma schema not found at prisma/schema.prisma');
      });

      it('should include raw path in response', () => {
        vi.mocked(fs.existsSync).mockReturnValue(true);
        vi.mocked(fs.readFileSync).mockReturnValue(samplePrismaSchema);

        const result = handleGetSchema({ source: 'prisma' });
        const data = JSON.parse(result.content[0].text);

        expect(data.raw_path).toBe('prisma/schema.prisma');
      });
    });

    describe('Drizzle schema parsing', () => {
      it('should parse Drizzle schema with tables', () => {
        vi.mocked(fs.existsSync).mockImplementation((p: fs.PathLike) => {
          return String(p).includes('schema.ts');
        });
        vi.mocked(fs.readFileSync).mockReturnValue(sampleDrizzleSchema);

        const result = handleGetSchema({ source: 'drizzle' });
        const data = JSON.parse(result.content[0].text);

        expect(data.source).toBe('drizzle');
        expect(data.tables.length).toBeGreaterThan(0);
      });

      it('should parse table columns', () => {
        vi.mocked(fs.existsSync).mockImplementation((p: fs.PathLike) => {
          return String(p).includes('schema.ts');
        });
        vi.mocked(fs.readFileSync).mockReturnValue(sampleDrizzleSchema);

        const result = handleGetSchema({ source: 'drizzle' });
        const data = JSON.parse(result.content[0].text);
        const usersTable = data.tables.find((t: any) => t.name === 'users');

        expect(usersTable.columns.some((c: any) => c.name === 'id')).toBe(true);
        expect(usersTable.columns.some((c: any) => c.name === 'email')).toBe(true);
      });

      it('should try multiple schema locations', () => {
        const checkedPaths: string[] = [];
        // Return true for src/db/schema.ts to allow parsing to proceed
        vi.mocked(fs.existsSync).mockImplementation((p: fs.PathLike) => {
          checkedPaths.push(String(p));
          return String(p).endsWith('src\\db\\schema.ts') || String(p).endsWith('src/db/schema.ts');
        });
        vi.mocked(fs.readFileSync).mockReturnValue(sampleDrizzleSchema);

        handleGetSchema({ source: 'drizzle' });

        // Verify that multiple paths were tried
        expect(checkedPaths.length).toBeGreaterThan(1);
      });

      it('should throw error when schema not found', () => {
        vi.mocked(fs.existsSync).mockReturnValue(false);

        expect(() => {
          handleGetSchema({ source: 'drizzle' });
        }).toThrow('Drizzle schema not found');
      });
    });

    describe('TypeORM schema parsing', () => {
      const sampleTypeORMEntity = `
import { Entity, Column, PrimaryGeneratedColumn, ManyToOne } from 'typeorm';

@Entity('users')
class User {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ unique: true })
  email: string;

  @Column({ nullable: true })
  name: string;
}
`;

      it('should parse TypeORM entity files', () => {
        vi.mocked(fs.existsSync).mockImplementation((p: fs.PathLike) => {
          return String(p).includes('entities') || String(p).includes('entity');
        });
        vi.mocked(fs.readdirSync).mockReturnValue(['user.ts'] as any);
        vi.mocked(fs.readFileSync).mockReturnValue(sampleTypeORMEntity);

        const result = handleGetSchema({ source: 'typeorm' });
        const data = JSON.parse(result.content[0].text);

        expect(data.source).toBe('typeorm');
        expect(data.tables.length).toBeGreaterThan(0);
      });

      it('should parse columns from decorators', () => {
        vi.mocked(fs.existsSync).mockReturnValue(true);
        vi.mocked(fs.readdirSync).mockReturnValue(['user.ts'] as any);
        vi.mocked(fs.readFileSync).mockReturnValue(sampleTypeORMEntity);

        const result = handleGetSchema({ source: 'typeorm' });
        const data = JSON.parse(result.content[0].text);

        expect(data.tables[0].columns.length).toBeGreaterThan(0);
      });

      it('should throw error when entities not found', () => {
        vi.mocked(fs.existsSync).mockReturnValue(false);

        expect(() => {
          handleGetSchema({ source: 'typeorm' });
        }).toThrow('TypeORM entities not found');
      });
    });

    describe('SQL schema parsing', () => {
      it('should parse SQL CREATE TABLE statements', () => {
        vi.mocked(fs.existsSync).mockImplementation((p: fs.PathLike) => {
          return String(p).includes('schema.sql');
        });
        vi.mocked(fs.readFileSync).mockReturnValue(sampleSqlSchema);

        const result = handleGetSchema({ source: 'sql' });
        const data = JSON.parse(result.content[0].text);

        expect(data.source).toBe('sql');
        expect(data.tables.some((t: any) => t.name === 'users')).toBe(true);
        expect(data.tables.some((t: any) => t.name === 'posts')).toBe(true);
      });

      it('should parse column types', () => {
        vi.mocked(fs.existsSync).mockReturnValue(true);
        vi.mocked(fs.readFileSync).mockReturnValue(sampleSqlSchema);

        const result = handleGetSchema({ source: 'sql' });
        const data = JSON.parse(result.content[0].text);
        const usersTable = data.tables.find((t: any) => t.name === 'users');

        expect(usersTable.columns.some((c: any) => c.type === 'INTEGER')).toBe(true);
        expect(usersTable.columns.some((c: any) => c.type === 'VARCHAR')).toBe(true);
      });

      it('should detect primary keys', () => {
        vi.mocked(fs.existsSync).mockReturnValue(true);
        vi.mocked(fs.readFileSync).mockReturnValue(sampleSqlSchema);

        const result = handleGetSchema({ source: 'sql' });
        const data = JSON.parse(result.content[0].text);
        const usersTable = data.tables.find((t: any) => t.name === 'users');
        const idColumn = usersTable.columns.find((c: any) => c.name === 'id');

        expect(idColumn.primary).toBe(true);
      });

      it('should detect foreign keys as relations', () => {
        vi.mocked(fs.existsSync).mockReturnValue(true);
        vi.mocked(fs.readFileSync).mockReturnValue(sampleSqlSchema);

        const result = handleGetSchema({ source: 'sql' });
        const data = JSON.parse(result.content[0].text);
        const postsTable = data.tables.find((t: any) => t.name === 'posts');

        expect(postsTable.relations.some((r: any) => r.target === 'users')).toBe(true);
      });

      it('should detect auto increment columns', () => {
        vi.mocked(fs.existsSync).mockReturnValue(true);
        vi.mocked(fs.readFileSync).mockReturnValue(sampleSqlSchema);

        const result = handleGetSchema({ source: 'sql' });
        const data = JSON.parse(result.content[0].text);
        const usersTable = data.tables.find((t: any) => t.name === 'users');
        const idColumn = usersTable.columns.find((c: any) => c.name === 'id');

        expect(idColumn.auto_increment).toBe(true);
      });

      it('should detect default values', () => {
        vi.mocked(fs.existsSync).mockReturnValue(true);
        vi.mocked(fs.readFileSync).mockReturnValue(sampleSqlSchema);

        const result = handleGetSchema({ source: 'sql' });
        const data = JSON.parse(result.content[0].text);
        const postsTable = data.tables.find((t: any) => t.name === 'posts');
        const publishedColumn = postsTable.columns.find((c: any) => c.name === 'published');

        expect(publishedColumn.default).toBe('FALSE');
      });

      it('should throw error when SQL schema not found', () => {
        vi.mocked(fs.existsSync).mockReturnValue(false);
        vi.mocked(fs.readdirSync).mockReturnValue([]);

        expect(() => {
          handleGetSchema({ source: 'sql' });
        }).toThrow('SQL schema not found');
      });
    });

    describe('error handling', () => {
      it('should throw error for unknown source', () => {
        expect(() => {
          handleGetSchema({ source: 'unknown' });
        }).toThrow('Unknown schema source: unknown');
      });

      it('should include supported sources in error message', () => {
        try {
          handleGetSchema({ source: 'mongodb' });
        } catch (e: any) {
          expect(e.message).toContain('prisma');
          expect(e.message).toContain('drizzle');
          expect(e.message).toContain('typeorm');
          expect(e.message).toContain('sql');
        }
      });
    });

    describe('path handling', () => {
      it('should use custom path when provided', () => {
        const checkedPaths: string[] = [];
        vi.mocked(fs.existsSync).mockImplementation((p: fs.PathLike) => {
          checkedPaths.push(String(p));
          // Return true if path includes custom/path AND prisma/schema.prisma pattern
          return String(p).includes('custom') && String(p).includes('schema.prisma');
        });
        vi.mocked(fs.readFileSync).mockReturnValue(samplePrismaSchema);

        handleGetSchema({ source: 'prisma', path: 'custom/path' });

        expect(checkedPaths.some(p => p.includes('custom'))).toBe(true);
      });
    });

    describe('response format', () => {
      it('should return properly formatted response', () => {
        vi.mocked(fs.existsSync).mockReturnValue(true);
        vi.mocked(fs.readFileSync).mockReturnValue(samplePrismaSchema);

        const result = handleGetSchema({ source: 'prisma' });

        expect(result).toHaveProperty('content');
        expect(result.content).toHaveLength(1);
        expect(result.content[0]).toHaveProperty('type', 'text');
      });

      it('should return valid JSON', () => {
        vi.mocked(fs.existsSync).mockReturnValue(true);
        vi.mocked(fs.readFileSync).mockReturnValue(samplePrismaSchema);

        const result = handleGetSchema({ source: 'prisma' });

        expect(() => JSON.parse(result.content[0].text)).not.toThrow();
      });
    });
  });
});
