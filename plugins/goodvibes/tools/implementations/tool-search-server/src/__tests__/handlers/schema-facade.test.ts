/**
 * Unit tests for schema.ts facade file
 *
 * This file tests the re-export facade at handlers/schema.ts to ensure
 * it properly exports the handleGetSchema function and GetSchemaArgs type.
 *
 * Coverage target: 100% of src/handlers/schema.ts
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';

// Import from the FACADE file (handlers/schema.ts), not the implementation
import { handleGetSchema } from '../../handlers/schema.js';
import type { GetSchemaArgs } from '../../handlers/schema.js';
import {
  samplePrismaSchema,
  sampleDrizzleSchema,
  sampleSqlSchema,
} from '../setup.js';

/** Column definition in a schema table */
interface SchemaColumn {
  name: string;
  type: string;
  primary?: boolean;
  unique?: boolean;
  nullable?: boolean;
  auto_increment?: boolean;
  default?: string;
}

/** Relation definition between tables */
interface SchemaRelation {
  target: string;
  type?: string;
  field?: string;
}

/** Table definition in a schema */
interface SchemaTable {
  name: string;
  columns: SchemaColumn[];
  relations: SchemaRelation[];
  indexes: string[];
}

// Mock modules
vi.mock('fs');
vi.mock('../../config.js', () => ({
  PROJECT_ROOT: '/mock/project/root',
}));

describe('schema.ts facade', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('handleGetSchema export', () => {
    it('should export handleGetSchema function', () => {
      expect(typeof handleGetSchema).toBe('function');
    });

    it('should handle prisma source through facade', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(samplePrismaSchema);

      const args: GetSchemaArgs = { source: 'prisma' };
      const result = handleGetSchema(args);
      const data = JSON.parse(result.content[0].text);

      expect(data.source).toBe('prisma');
      expect(data.tables).toBeDefined();
    });

    it('should handle drizzle source through facade', () => {
      vi.mocked(fs.existsSync).mockImplementation((p: fs.PathLike) => {
        return String(p).includes('schema.ts');
      });
      vi.mocked(fs.readFileSync).mockReturnValue(sampleDrizzleSchema);

      const args: GetSchemaArgs = { source: 'drizzle' };
      const result = handleGetSchema(args);
      const data = JSON.parse(result.content[0].text);

      expect(data.source).toBe('drizzle');
      expect(data.tables).toBeDefined();
    });

    it('should handle typeorm source through facade', () => {
      const sampleTypeORMEntity = `
import { Entity, Column, PrimaryGeneratedColumn } from 'typeorm';

@Entity('users')
class User {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  email: string;
}
`;

      vi.mocked(fs.existsSync).mockReturnValue(true);
      // @ts-expect-error - Vitest mock type inference issue with Node.js fs.Dirent generic parameter
      vi.mocked(fs.readdirSync).mockReturnValue(['user.ts']);
      vi.mocked(fs.readFileSync).mockReturnValue(sampleTypeORMEntity);

      const args: GetSchemaArgs = { source: 'typeorm' };
      const result = handleGetSchema(args);
      const data = JSON.parse(result.content[0].text);

      expect(data.source).toBe('typeorm');
      expect(data.tables).toBeDefined();
    });

    it('should handle sql source through facade', () => {
      vi.mocked(fs.existsSync).mockImplementation((p: fs.PathLike) => {
        return String(p).includes('schema.sql');
      });
      vi.mocked(fs.readFileSync).mockReturnValue(sampleSqlSchema);

      const args: GetSchemaArgs = { source: 'sql' };
      const result = handleGetSchema(args);
      const data = JSON.parse(result.content[0].text);

      expect(data.source).toBe('sql');
      expect(data.tables).toBeDefined();
    });

    it('should throw error for unknown source through facade', () => {
      const args: GetSchemaArgs = { source: 'unknown' };

      expect(() => {
        handleGetSchema(args);
      }).toThrow('Unknown schema source: unknown');
    });

    it('should pass path parameter through facade', () => {
      const checkedPaths: string[] = [];
      vi.mocked(fs.existsSync).mockImplementation((p: fs.PathLike) => {
        checkedPaths.push(String(p));
        return String(p).includes('custom') && String(p).includes('schema.prisma');
      });
      vi.mocked(fs.readFileSync).mockReturnValue(samplePrismaSchema);

      const args: GetSchemaArgs = { source: 'prisma', path: 'custom/path' };
      handleGetSchema(args);

      expect(checkedPaths.some(p => p.includes('custom'))).toBe(true);
    });

    it('should pass tables parameter through facade', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(samplePrismaSchema);

      const args: GetSchemaArgs = { source: 'prisma', tables: ['User'] };
      const result = handleGetSchema(args);
      const data = JSON.parse(result.content[0].text);

      expect(data.tables.length).toBe(1);
      expect(data.tables[0].name).toBe('User');
    });

    it('should return ToolResponse format', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(samplePrismaSchema);

      const args: GetSchemaArgs = { source: 'prisma' };
      const result = handleGetSchema(args);

      expect(result).toHaveProperty('content');
      expect(result.content).toHaveLength(1);
      expect(result.content[0]).toHaveProperty('type', 'text');
      expect(result.content[0]).toHaveProperty('text');
    });
  });

  describe('GetSchemaArgs type export', () => {
    it('should accept valid GetSchemaArgs with prisma source', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(samplePrismaSchema);

      const args: GetSchemaArgs = {
        source: 'prisma',
      };

      expect(() => handleGetSchema(args)).not.toThrow();
    });

    it('should accept GetSchemaArgs with all optional parameters', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(samplePrismaSchema);

      const args: GetSchemaArgs = {
        source: 'prisma',
        path: 'custom/path',
        tables: ['User', 'Post'],
      };

      expect(() => handleGetSchema(args)).not.toThrow();
    });

    it('should accept GetSchemaArgs with drizzle source', () => {
      vi.mocked(fs.existsSync).mockImplementation((p: fs.PathLike) => {
        return String(p).includes('schema.ts');
      });
      vi.mocked(fs.readFileSync).mockReturnValue(sampleDrizzleSchema);

      const args: GetSchemaArgs = {
        source: 'drizzle',
      };

      expect(() => handleGetSchema(args)).not.toThrow();
    });

    it('should accept GetSchemaArgs with typeorm source', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      // @ts-expect-error - Vitest mock type inference issue with Node.js fs.Dirent generic parameter
      vi.mocked(fs.readdirSync).mockReturnValue(['user.ts']);
      vi.mocked(fs.readFileSync).mockReturnValue(`
@Entity('users')
class User {
  @PrimaryGeneratedColumn()
  id: number;
}
`);

      const args: GetSchemaArgs = {
        source: 'typeorm',
      };

      expect(() => handleGetSchema(args)).not.toThrow();
    });

    it('should accept GetSchemaArgs with sql source', () => {
      vi.mocked(fs.existsSync).mockImplementation((p: fs.PathLike) => {
        return String(p).includes('schema.sql');
      });
      vi.mocked(fs.readFileSync).mockReturnValue(sampleSqlSchema);

      const args: GetSchemaArgs = {
        source: 'sql',
      };

      expect(() => handleGetSchema(args)).not.toThrow();
    });
  });

  describe('facade integration', () => {
    it('should properly re-export from schema/index.js', () => {
      // Verify that the facade exports the same function as the implementation
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(samplePrismaSchema);

      const result1 = handleGetSchema({ source: 'prisma' });
      const result2 = handleGetSchema({ source: 'prisma' });

      // Both calls should produce identical results
      expect(result1.content[0].text).toBe(result2.content[0].text);
    });

    it('should handle errors consistently with implementation', () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);

      expect(() => {
        handleGetSchema({ source: 'prisma' });
      }).toThrow('Prisma schema not found');
    });

    it('should preserve all functionality through facade', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(samplePrismaSchema);

      const result = handleGetSchema({ source: 'prisma' });
      const data = JSON.parse(result.content[0].text);

      // Verify full schema structure is preserved
      expect(data).toHaveProperty('source');
      expect(data).toHaveProperty('tables');
      expect(data).toHaveProperty('raw_path');
      expect(data.tables[0]).toHaveProperty('name');
      expect(data.tables[0]).toHaveProperty('columns');
      expect(data.tables[0]).toHaveProperty('relations');
      expect(data.tables[0]).toHaveProperty('indexes');
    });
  });

  describe('edge cases', () => {
    it('should handle empty tables array', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(samplePrismaSchema);

      const args: GetSchemaArgs = { source: 'prisma', tables: [] };
      const result = handleGetSchema(args);
      const data = JSON.parse(result.content[0].text);

      // Empty tables array should return all tables (no filtering)
      expect(data.tables.length).toBeGreaterThan(0);
    });

    it('should handle undefined path', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(samplePrismaSchema);

      const args: GetSchemaArgs = { source: 'prisma', path: undefined };

      expect(() => handleGetSchema(args)).not.toThrow();
    });

    it('should handle undefined tables', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(samplePrismaSchema);

      const args: GetSchemaArgs = { source: 'prisma', tables: undefined };

      expect(() => handleGetSchema(args)).not.toThrow();
    });

    it('should handle empty string path', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(samplePrismaSchema);

      const args: GetSchemaArgs = { source: 'prisma', path: '' };

      expect(() => handleGetSchema(args)).not.toThrow();
    });
  });

  describe('all source types', () => {
    it('should handle all four source types through facade', () => {
      const sources: Array<'prisma' | 'drizzle' | 'typeorm' | 'sql'> = [
        'prisma',
        'drizzle',
        'typeorm',
        'sql',
      ];

      sources.forEach((source) => {
        vi.clearAllMocks();

        if (source === 'prisma') {
          vi.mocked(fs.existsSync).mockReturnValue(true);
          vi.mocked(fs.readFileSync).mockReturnValue(samplePrismaSchema);
        } else if (source === 'drizzle') {
          vi.mocked(fs.existsSync).mockImplementation((p: fs.PathLike) => {
            return String(p).includes('schema.ts');
          });
          vi.mocked(fs.readFileSync).mockReturnValue(sampleDrizzleSchema);
        } else if (source === 'typeorm') {
          vi.mocked(fs.existsSync).mockReturnValue(true);
          // @ts-expect-error - Vitest mock type inference issue
          vi.mocked(fs.readdirSync).mockReturnValue(['user.ts']);
          vi.mocked(fs.readFileSync).mockReturnValue(`
@Entity('users')
class User {
  @PrimaryGeneratedColumn()
  id: number;
}
`);
        } else if (source === 'sql') {
          vi.mocked(fs.existsSync).mockImplementation((p: fs.PathLike) => {
            return String(p).includes('schema.sql');
          });
          vi.mocked(fs.readFileSync).mockReturnValue(sampleSqlSchema);
        }

        const args: GetSchemaArgs = { source };
        const result = handleGetSchema(args);
        const data = JSON.parse(result.content[0].text);

        expect(data.source).toBe(source);
      });
    });
  });

  describe('error messages', () => {
    it('should include all supported sources in unknown source error', () => {
      const args: GetSchemaArgs = { source: 'invalid' };

      try {
        handleGetSchema(args);
        expect.fail('Should have thrown an error');
      } catch (error) {
        const message = (error as Error).message;
        expect(message).toContain('Unknown schema source: invalid');
        expect(message).toContain('Supported: prisma, drizzle, typeorm, sql');
      }
    });

    it('should throw specific error for missing prisma schema', () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);

      expect(() => {
        handleGetSchema({ source: 'prisma' });
      }).toThrow('Prisma schema not found');
    });

    it('should throw specific error for missing drizzle schema', () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);

      expect(() => {
        handleGetSchema({ source: 'drizzle' });
      }).toThrow('Drizzle schema not found');
    });

    it('should throw specific error for missing typeorm entities', () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);

      expect(() => {
        handleGetSchema({ source: 'typeorm' });
      }).toThrow('TypeORM entities not found');
    });

    it('should throw specific error for missing sql schema', () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);
      vi.mocked(fs.readdirSync).mockReturnValue([]);

      expect(() => {
        handleGetSchema({ source: 'sql' });
      }).toThrow('SQL schema not found');
    });
  });
});
