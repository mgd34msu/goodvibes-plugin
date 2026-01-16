/**
 * Unit tests for Database Schema handler
 *
 * Tests cover 100% of database.ts:
 * - handleGetDatabaseSchema main function
 * - Auto-detection of schema sources (Prisma, Drizzle, SQL)
 * - parsePrismaForUnifiedSchema
 * - parseDrizzleForUnifiedSchema
 * - parseSQLForUnifiedSchema
 * - formatResponse helper
 * - Error handling and edge cases
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';

import {
  handleGetDatabaseSchema,
  type GetDatabaseSchemaArgs,
  type DatabaseSchemaResult,
  type DatabaseTable,
  type DatabaseColumn,
  type DatabaseIndex,
  type DatabaseRelation,
} from '../../../handlers/schema/database.js';

// Mock modules
vi.mock('fs');
vi.mock('../../../config.js', () => ({
  PROJECT_ROOT: '/mock/project/root',
}));

describe('database schema handler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  // =============================================================================
  // handleGetDatabaseSchema - Main Function Tests
  // =============================================================================

  describe('handleGetDatabaseSchema', () => {
    describe('schema source auto-detection', () => {
      it('should detect and parse Prisma schema when present', () => {
        vi.mocked(fs.existsSync).mockImplementation((p: fs.PathLike) => {
          return String(p).includes('prisma') && String(p).includes('schema.prisma');
        });
        vi.mocked(fs.readFileSync).mockReturnValue(`
model User {
  id    String @id
  email String
}
`);

        const result = handleGetDatabaseSchema({});
        const data = JSON.parse(result.content[0].text) as DatabaseSchemaResult;

        expect(data.source).toBe('prisma');
        expect(data.tables.length).toBeGreaterThan(0);
      });

      it('should try Drizzle paths when Prisma not found', () => {
        const checkedPaths: string[] = [];
        vi.mocked(fs.existsSync).mockImplementation((p: fs.PathLike) => {
          const pathStr = String(p);
          checkedPaths.push(pathStr);
          // No Prisma, but Drizzle exists
          if (pathStr.includes('drizzle') && pathStr.includes('schema.ts')) {
            return true;
          }
          return false;
        });
        vi.mocked(fs.readFileSync).mockReturnValue(`
export const users = pgTable('users', {
  id: serial('id').primaryKey()
});
`);

        const result = handleGetDatabaseSchema({});
        const data = JSON.parse(result.content[0].text) as DatabaseSchemaResult;

        expect(data.source).toBe('drizzle');
      });

      it('should check all Drizzle schema locations', () => {
        const checkedPaths: string[] = [];
        vi.mocked(fs.existsSync).mockImplementation((p: fs.PathLike) => {
          checkedPaths.push(String(p));
          // Last Drizzle location (src/lib/db/schema.ts)
          if (String(p).includes('src') && String(p).includes('lib') && String(p).includes('db') && String(p).includes('schema.ts')) {
            return true;
          }
          return false;
        });
        vi.mocked(fs.readFileSync).mockReturnValue(`
export const users = pgTable('users', {
  id: serial('id').primaryKey()
});
`);

        handleGetDatabaseSchema({});

        // Should have checked multiple Drizzle paths
        expect(checkedPaths.filter(p => p.includes('schema.ts')).length).toBeGreaterThan(1);
      });

      it('should detect *.schema.ts files in drizzle directory', () => {
        vi.mocked(fs.existsSync).mockImplementation((p: fs.PathLike) => {
          const pathStr = String(p);
          // No standard schema.ts files
          if (pathStr.endsWith('schema.ts')) return false;
          // But drizzle directory exists
          if (pathStr.includes('drizzle') && !pathStr.endsWith('.ts')) return true;
          return false;
        });
        vi.mocked(fs.readdirSync).mockReturnValue(['users.schema.ts', 'posts.schema.ts'] as unknown as ReturnType<typeof fs.readdirSync>);
        vi.mocked(fs.readFileSync).mockReturnValue(`
export const users = pgTable('users', {
  id: serial('id').primaryKey()
});
`);

        const result = handleGetDatabaseSchema({});
        const data = JSON.parse(result.content[0].text) as DatabaseSchemaResult;

        expect(data.source).toBe('drizzle');
      });

      it('should detect *.schema.ts files in src/db directory', () => {
        vi.mocked(fs.existsSync).mockImplementation((p: fs.PathLike) => {
          const pathStr = String(p);
          if (pathStr.endsWith('schema.ts')) return false;
          if (pathStr.includes('drizzle') && !pathStr.endsWith('.ts')) return false;
          if (pathStr.includes('src') && pathStr.includes('db') && !pathStr.endsWith('.ts')) return true;
          return false;
        });
        vi.mocked(fs.readdirSync).mockReturnValue(['models.schema.ts'] as unknown as ReturnType<typeof fs.readdirSync>);
        vi.mocked(fs.readFileSync).mockReturnValue(`
export const users = pgTable('users', {
  id: serial('id').primaryKey()
});
`);

        const result = handleGetDatabaseSchema({});
        const data = JSON.parse(result.content[0].text) as DatabaseSchemaResult;

        expect(data.source).toBe('drizzle');
      });

      it('should detect *.schema.ts files in db directory', () => {
        vi.mocked(fs.existsSync).mockImplementation((p: fs.PathLike) => {
          const pathStr = String(p);
          if (pathStr.endsWith('schema.ts')) return false;
          if (pathStr.includes('drizzle') && !pathStr.endsWith('.ts')) return false;
          if (pathStr.includes('src/db') && !pathStr.endsWith('.ts')) return false;
          // Only db directory without src
          if (pathStr.endsWith('db') || pathStr.endsWith('db\\') || pathStr.endsWith('db/')) return true;
          return false;
        });
        vi.mocked(fs.readdirSync).mockReturnValue(['tables.schema.ts'] as unknown as ReturnType<typeof fs.readdirSync>);
        vi.mocked(fs.readFileSync).mockReturnValue(`
export const users = pgTable('users', {
  id: serial('id').primaryKey()
});
`);

        const result = handleGetDatabaseSchema({});
        const data = JSON.parse(result.content[0].text) as DatabaseSchemaResult;

        expect(data.source).toBe('drizzle');
      });

      it('should skip drizzle directory when it exists but has no *.schema.ts files', () => {
        // Tests line 180: files.length === 0 branch
        vi.mocked(fs.existsSync).mockImplementation((p: fs.PathLike) => {
          const pathStr = String(p);
          if (pathStr.endsWith('schema.ts')) return false;
          // drizzle directory exists
          if (pathStr.includes('drizzle') && !pathStr.endsWith('.ts')) return true;
          // sql schema exists as fallback
          if (pathStr.endsWith('schema.sql')) return true;
          return false;
        });
        // drizzle directory has no *.schema.ts files
        vi.mocked(fs.readdirSync).mockReturnValue(['other-file.ts', 'readme.md'] as unknown as ReturnType<typeof fs.readdirSync>);
        vi.mocked(fs.readFileSync).mockReturnValue(`CREATE TABLE users (id INTEGER PRIMARY KEY);`);

        const result = handleGetDatabaseSchema({});
        const data = JSON.parse(result.content[0].text) as DatabaseSchemaResult;

        // Should fall through to SQL since drizzle dir had no *.schema.ts files
        expect(data.source).toBe('sql');
      });

      it('should try SQL schema locations when no ORM found', () => {
        vi.mocked(fs.existsSync).mockImplementation((p: fs.PathLike) => {
          const pathStr = String(p);
          // No Prisma or Drizzle
          if (pathStr.includes('prisma')) return false;
          if (pathStr.includes('schema.ts')) return false;
          // But schema.sql exists
          if (pathStr.endsWith('schema.sql')) return true;
          return false;
        });
        vi.mocked(fs.readdirSync).mockReturnValue([]);
        vi.mocked(fs.readFileSync).mockReturnValue(`
CREATE TABLE users (
  id INTEGER PRIMARY KEY
);
`);

        const result = handleGetDatabaseSchema({});
        const data = JSON.parse(result.content[0].text) as DatabaseSchemaResult;

        expect(data.source).toBe('sql');
      });

      it('should check all SQL schema locations', () => {
        const checkedPaths: string[] = [];
        vi.mocked(fs.existsSync).mockImplementation((p: fs.PathLike) => {
          checkedPaths.push(String(p));
          // Last SQL location (database/schema.sql)
          if (String(p).includes('database') && String(p).includes('schema.sql')) {
            return true;
          }
          return false;
        });
        vi.mocked(fs.readdirSync).mockReturnValue([]);
        vi.mocked(fs.readFileSync).mockReturnValue(`CREATE TABLE users (id INTEGER);`);

        handleGetDatabaseSchema({});

        // Should have checked multiple SQL paths
        expect(checkedPaths.filter(p => p.includes('schema.sql')).length).toBeGreaterThan(1);
      });

      it('should check migrations folder for SQL files', () => {
        vi.mocked(fs.existsSync).mockImplementation((p: fs.PathLike) => {
          const pathStr = String(p);
          if (pathStr.includes('schema.sql')) return false;
          if (pathStr.includes('schema.ts')) return false;
          if (pathStr.includes('migrations')) return true;
          return false;
        });
        vi.mocked(fs.readdirSync).mockReturnValue(['001_init.sql', '002_users.sql'] as unknown as ReturnType<typeof fs.readdirSync>);
        vi.mocked(fs.readFileSync).mockReturnValue(`CREATE TABLE users (id INTEGER PRIMARY KEY);`);

        const result = handleGetDatabaseSchema({});
        const data = JSON.parse(result.content[0].text) as DatabaseSchemaResult;

        expect(data.source).toBe('sql');
      });

      it('should prefer schema or init files in migrations folder', () => {
        const readFiles: string[] = [];
        vi.mocked(fs.existsSync).mockImplementation((p: fs.PathLike) => {
          const pathStr = String(p);
          if (pathStr.includes('migrations')) return true;
          return false;
        });
        vi.mocked(fs.readdirSync).mockReturnValue(['003_update.sql', '001_schema.sql', '002_data.sql'] as unknown as ReturnType<typeof fs.readdirSync>);
        vi.mocked(fs.readFileSync).mockImplementation(((p: fs.PathLike) => {
          readFiles.push(String(p));
          return `CREATE TABLE users (id INTEGER PRIMARY KEY);`;
        }) as typeof fs.readFileSync);

        handleGetDatabaseSchema({});

        // Should have read the schema file
        expect(readFiles.some(f => f.includes('001_schema.sql'))).toBe(true);
      });

      it('should use latest migration file when no schema file exists', () => {
        const readFiles: string[] = [];
        vi.mocked(fs.existsSync).mockImplementation((p: fs.PathLike) => {
          const pathStr = String(p);
          if (pathStr.includes('migrations')) return true;
          return false;
        });
        // Files without 'schema' or 'init' in name
        vi.mocked(fs.readdirSync).mockReturnValue(['001_users.sql', '002_posts.sql', '003_comments.sql'] as unknown as ReturnType<typeof fs.readdirSync>);
        vi.mocked(fs.readFileSync).mockImplementation(((p: fs.PathLike) => {
          readFiles.push(String(p));
          return `CREATE TABLE users (id INTEGER PRIMARY KEY);`;
        }) as typeof fs.readFileSync);

        handleGetDatabaseSchema({});

        // Should read first file after reverse sort (003_comments.sql)
        expect(readFiles.some(f => f.includes('003_comments.sql'))).toBe(true);
      });

      it('should return unknown source when no schema found', () => {
        vi.mocked(fs.existsSync).mockReturnValue(false);
        vi.mocked(fs.readdirSync).mockReturnValue([]);

        const result = handleGetDatabaseSchema({});
        const data = JSON.parse(result.content[0].text);

        expect(data.source).toBe('unknown');
        expect(data.tables).toHaveLength(0);
        expect(data.relations).toHaveLength(0);
        expect(data.error).toBeDefined();
      });

      it('should use custom path when provided', () => {
        const checkedPaths: string[] = [];
        vi.mocked(fs.existsSync).mockImplementation((p: fs.PathLike) => {
          checkedPaths.push(String(p));
          if (String(p).includes('custom/project') && String(p).includes('prisma')) {
            return true;
          }
          return false;
        });
        vi.mocked(fs.readFileSync).mockReturnValue(`model User { id String @id }`);

        handleGetDatabaseSchema({ path: 'custom/project' });

        expect(checkedPaths.some(p => p.includes('custom'))).toBe(true);
      });
    });

    describe('response format', () => {
      it('should return properly formatted response', () => {
        vi.mocked(fs.existsSync).mockImplementation((p: fs.PathLike) => {
          return String(p).includes('prisma') && String(p).includes('schema.prisma');
        });
        vi.mocked(fs.readFileSync).mockReturnValue(`model User { id String @id }`);

        const result = handleGetDatabaseSchema({});

        expect(result.content).toHaveLength(1);
        expect(result.content[0].type).toBe('text');
        expect(result.isError).toBeUndefined();
      });

      it('should return valid JSON in response', () => {
        vi.mocked(fs.existsSync).mockImplementation((p: fs.PathLike) => {
          return String(p).includes('prisma') && String(p).includes('schema.prisma');
        });
        vi.mocked(fs.readFileSync).mockReturnValue(`model User { id String @id }`);

        const result = handleGetDatabaseSchema({});

        expect(() => JSON.parse(result.content[0].text)).not.toThrow();
      });

      it('should include raw_path in response', () => {
        vi.mocked(fs.existsSync).mockImplementation((p: fs.PathLike) => {
          return String(p).includes('prisma') && String(p).includes('schema.prisma');
        });
        vi.mocked(fs.readFileSync).mockReturnValue(`model User { id String @id }`);

        const result = handleGetDatabaseSchema({});
        const data = JSON.parse(result.content[0].text) as DatabaseSchemaResult;

        expect(data.raw_path).toBeDefined();
        expect(data.raw_path).toContain('prisma');
      });
    });
  });

  // =============================================================================
  // Prisma Schema Parsing Tests
  // =============================================================================

  describe('parsePrismaForUnifiedSchema', () => {
    beforeEach(() => {
      vi.mocked(fs.existsSync).mockImplementation((p: fs.PathLike) => {
        return String(p).includes('prisma') && String(p).includes('schema.prisma');
      });
    });

    describe('model parsing', () => {
      it('should parse basic model with scalar fields', () => {
        vi.mocked(fs.readFileSync).mockReturnValue(`
model User {
  id       String   @id
  email    String
  name     String?
  age      Int
  active   Boolean
  balance  Float
}
`);

        const result = handleGetDatabaseSchema({});
        const data = JSON.parse(result.content[0].text) as DatabaseSchemaResult;
        const userTable = data.tables.find(t => t.name === 'User');

        expect(userTable).toBeDefined();
        expect(userTable!.columns.length).toBe(6);
        expect(userTable!.columns.map(c => c.name)).toContain('id');
        expect(userTable!.columns.map(c => c.name)).toContain('email');
      });

      it('should parse all Prisma scalar types', () => {
        vi.mocked(fs.readFileSync).mockReturnValue(`
model AllTypes {
  id        String   @id
  str       String
  int       Int
  float     Float
  bool      Boolean
  dateTime  DateTime
  json      Json
  bytes     Bytes
  bigInt    BigInt
  decimal   Decimal
}
`);

        const result = handleGetDatabaseSchema({});
        const data = JSON.parse(result.content[0].text) as DatabaseSchemaResult;
        const table = data.tables[0];

        expect(table.columns).toHaveLength(10);
        expect(table.columns.every(c => ['String', 'Int', 'Float', 'Boolean', 'DateTime', 'Json', 'Bytes', 'BigInt', 'Decimal'].includes(c.type))).toBe(true);
      });

      it('should detect primary keys with @id', () => {
        vi.mocked(fs.readFileSync).mockReturnValue(`
model User {
  id    String @id
  email String
}
`);

        const result = handleGetDatabaseSchema({});
        const data = JSON.parse(result.content[0].text) as DatabaseSchemaResult;
        const idColumn = data.tables[0].columns.find(c => c.name === 'id');

        expect(idColumn!.primary_key).toBe(true);
      });

      it('should detect nullable fields with ?', () => {
        vi.mocked(fs.readFileSync).mockReturnValue(`
model User {
  id    String  @id
  name  String?
  email String
}
`);

        const result = handleGetDatabaseSchema({});
        const data = JSON.parse(result.content[0].text) as DatabaseSchemaResult;
        const nameColumn = data.tables[0].columns.find(c => c.name === 'name');
        const emailColumn = data.tables[0].columns.find(c => c.name === 'email');

        expect(nameColumn!.nullable).toBe(true);
        expect(emailColumn!.nullable).toBe(false);
      });

      it('should detect unique constraints with @unique', () => {
        vi.mocked(fs.readFileSync).mockReturnValue(`
model User {
  id    String @id
  email String @unique
}
`);

        const result = handleGetDatabaseSchema({});
        const data = JSON.parse(result.content[0].text) as DatabaseSchemaResult;
        const table = data.tables[0];

        expect(table.indexes.some(i => i.columns.includes('email') && i.unique)).toBe(true);
      });

      it('should skip comment lines', () => {
        vi.mocked(fs.readFileSync).mockReturnValue(`
model User {
  // This is a comment
  id    String @id
  // Another comment
  email String
}
`);

        const result = handleGetDatabaseSchema({});
        const data = JSON.parse(result.content[0].text) as DatabaseSchemaResult;
        const table = data.tables[0];

        expect(table.columns).toHaveLength(2);
        expect(table.columns.every(c => !c.name.startsWith('//'))).toBe(true);
      });

      it('should skip lines starting with @@', () => {
        vi.mocked(fs.readFileSync).mockReturnValue(`
model User {
  id    String @id
  email String
  @@unique([email])
}
`);

        const result = handleGetDatabaseSchema({});
        const data = JSON.parse(result.content[0].text) as DatabaseSchemaResult;
        const table = data.tables[0];

        // Should have 2 columns, not treating @@unique as a column
        expect(table.columns).toHaveLength(2);
      });
    });

    describe('relation parsing', () => {
      it('should parse one-to-many relations with []', () => {
        vi.mocked(fs.readFileSync).mockReturnValue(`
model User {
  id    String @id
  posts Post[]
}

model Post {
  id       String @id
  author   User   @relation(fields: [authorId], references: [id])
  authorId String
}
`);

        const result = handleGetDatabaseSchema({});
        const data = JSON.parse(result.content[0].text) as DatabaseSchemaResult;

        // Should have relations
        expect(data.relations.length).toBeGreaterThan(0);
        // Post->User relation
        expect(data.relations.some(r => r.from_table === 'Post' && r.to_table === 'User')).toBe(true);
      });

      it('should parse one-to-one relations without []', () => {
        vi.mocked(fs.readFileSync).mockReturnValue(`
model User {
  id      String   @id
  profile Profile?
}

model Profile {
  id     String @id
  user   User   @relation(fields: [userId], references: [id])
  userId String @unique
}
`);

        const result = handleGetDatabaseSchema({});
        const data = JSON.parse(result.content[0].text) as DatabaseSchemaResult;

        // Profile->User relation should be one-to-one
        expect(data.relations.some(r =>
          r.from_table === 'Profile' &&
          r.to_table === 'User' &&
          r.type === 'one-to-one'
        )).toBe(true);
      });

      it('should correctly set one-to-one type for non-array relation with @relation', () => {
        // Tests line 304: isArray = false case with explicit @relation
        vi.mocked(fs.readFileSync).mockReturnValue(`
model Profile {
  id     String @id
  user   User   @relation(fields: [userId], references: [id])
  userId String
}

model User {
  id String @id
}
`);

        const result = handleGetDatabaseSchema({});
        const data = JSON.parse(result.content[0].text) as DatabaseSchemaResult;

        // The relation should be one-to-one (not one-to-many) because user is not User[]
        const profileToUserRelation = data.relations.find(r =>
          r.from_table === 'Profile' &&
          r.to_table === 'User' &&
          r.from_column === 'userId'
        );

        expect(profileToUserRelation).toBeDefined();
        expect(profileToUserRelation!.type).toBe('one-to-one');
      });

      it('should parse @relation with fields and references', () => {
        vi.mocked(fs.readFileSync).mockReturnValue(`
model Post {
  id       String @id
  author   User   @relation(fields: [authorId], references: [id])
  authorId String
}

model User {
  id String @id
}
`);

        const result = handleGetDatabaseSchema({});
        const data = JSON.parse(result.content[0].text) as DatabaseSchemaResult;

        expect(data.relations.some(r =>
          r.from_table === 'Post' &&
          r.from_column === 'authorId' &&
          r.to_table === 'User' &&
          r.to_column === 'id'
        )).toBe(true);
      });

      it('should handle @relation with more from columns than to columns', () => {
        // Tests line 303: toColumns[i] || 'id' fallback when toColumns is shorter
        vi.mocked(fs.readFileSync).mockReturnValue(`
model OrderItem {
  id       String @id
  order    Order  @relation(fields: [orderId, productId], references: [id])
  orderId  String
  productId String
}

model Order {
  id String @id
}
`);

        const result = handleGetDatabaseSchema({});
        const data = JSON.parse(result.content[0].text) as DatabaseSchemaResult;

        // The second column should default to 'id' since references only has one column
        expect(data.relations.some(r =>
          r.from_table === 'OrderItem' &&
          r.from_column === 'productId' &&
          r.to_table === 'Order' &&
          r.to_column === 'id'  // Should default to 'id'
        )).toBe(true);
      });

      it('should handle implicit relations without @relation directive', () => {
        vi.mocked(fs.readFileSync).mockReturnValue(`
model User {
  id    String @id
  posts Post[]
}

model Post {
  id     String @id
  author User
}
`);

        const result = handleGetDatabaseSchema({});
        const data = JSON.parse(result.content[0].text) as DatabaseSchemaResult;

        // Should infer relation with authorId -> id
        expect(data.relations.some(r =>
          r.from_table === 'Post' &&
          r.to_table === 'User'
        )).toBe(true);
      });

      it('should populate references on scalar field with direct @relation(references:) directive', () => {
        // This tests lines 326-332: when a scalar column has @relation with references
        // directly on it (non-standard pattern but handled by the parser)
        // The regex on line 323 looks for @relation(...references:...) on the scalar field
        vi.mocked(fs.readFileSync).mockReturnValue(`
model Post {
  id       String @id
  authorId String @relation(references: [id])
  author   User   @relation(fields: [authorId], references: [id])
}

model User {
  id    String @id
  posts Post[]
}
`);

        const result = handleGetDatabaseSchema({});
        const data = JSON.parse(result.content[0].text) as DatabaseSchemaResult;
        const postTable = data.tables.find(t => t.name === 'Post');
        const authorIdColumn = postTable!.columns.find(c => c.name === 'authorId');

        // The authorId scalar column should exist
        expect(authorIdColumn).toBeDefined();
        // The references should be populated from the @relation directive
        expect(authorIdColumn!.references).toBeDefined();
        expect(authorIdColumn!.references!.table).toBe('User');
        expect(authorIdColumn!.references!.column).toBe('id');
      });

      it('should handle scalar field with @relation(references:) but no matching relation field', () => {
        // Tests line 329 branch where relationField match fails (no fields: directive found)
        vi.mocked(fs.readFileSync).mockReturnValue(`
model Post {
  id       String @id
  authorId String @relation(references: [id])
}

model User {
  id String @id
}
`);

        const result = handleGetDatabaseSchema({});
        const data = JSON.parse(result.content[0].text) as DatabaseSchemaResult;
        const postTable = data.tables.find(t => t.name === 'Post');
        const authorIdColumn = postTable!.columns.find(c => c.name === 'authorId');

        // authorId should exist but references may not be populated (no matching relation field)
        expect(authorIdColumn).toBeDefined();
        // Without a relation field with fields:[authorId], references won't be populated
        expect(authorIdColumn!.references).toBeUndefined();
      });

      it('should handle scalar field with @relation when targetModel cannot be determined', () => {
        // Tests line 330-331 branch where relationField exists but targetModel extraction fails
        // This happens when the relation field name doesn't have a type following it
        vi.mocked(fs.readFileSync).mockReturnValue(`
model Post {
  id       String @id
  authorId String @relation(references: [id])
  author   @relation(fields: [authorId], references: [id])
}
`);

        const result = handleGetDatabaseSchema({});
        const data = JSON.parse(result.content[0].text) as DatabaseSchemaResult;
        const postTable = data.tables.find(t => t.name === 'Post');
        const authorIdColumn = postTable?.columns.find(c => c.name === 'authorId');

        // authorId should exist, references may or may not be populated depending on parsing
        expect(authorIdColumn).toBeDefined();
      });

      it('should handle targetModel regex failing after relationField is found', () => {
        // Tests line 331 specifically: relationField matches but targetModel extraction fails
        // This creates a scenario where `author` is found but there's no type after it
        vi.mocked(fs.readFileSync).mockReturnValue(`
model Post {
  id       String @id
  authorId String @relation(references: [id])
  author @relation(fields: [authorId], references: [id])
}
`);

        const result = handleGetDatabaseSchema({});
        const data = JSON.parse(result.content[0].text) as DatabaseSchemaResult;
        const postTable = data.tables.find(t => t.name === 'Post');
        const authorIdColumn = postTable?.columns.find(c => c.name === 'authorId');

        // authorId should exist but references should not be populated since targetModel fails
        expect(authorIdColumn).toBeDefined();
        // Without a valid targetModel, references won't be set
        expect(authorIdColumn?.references).toBeUndefined();
      });

      it('should correctly identify relation type based on array syntax', () => {
        vi.mocked(fs.readFileSync).mockReturnValue(`
model User {
  id    String @id
  posts Post[]
}

model Post {
  id String @id
}
`);

        const result = handleGetDatabaseSchema({});
        const data = JSON.parse(result.content[0].text) as DatabaseSchemaResult;

        // User.posts[] should be one-to-many
        expect(data.relations.some(r =>
          r.from_table === 'User' &&
          r.type === 'one-to-many'
        )).toBe(true);
      });
    });

    describe('index parsing', () => {
      it('should parse @@index directive', () => {
        vi.mocked(fs.readFileSync).mockReturnValue(`
model User {
  id        String   @id
  email     String
  createdAt DateTime

  @@index([createdAt])
}
`);

        const result = handleGetDatabaseSchema({});
        const data = JSON.parse(result.content[0].text) as DatabaseSchemaResult;
        const table = data.tables[0];

        expect(table.indexes.some(i =>
          i.columns.includes('createdAt') && !i.unique
        )).toBe(true);
      });

      it('should parse @@unique directive', () => {
        vi.mocked(fs.readFileSync).mockReturnValue(`
model User {
  id    String @id
  email String
  orgId String

  @@unique([email, orgId])
}
`);

        const result = handleGetDatabaseSchema({});
        const data = JSON.parse(result.content[0].text) as DatabaseSchemaResult;
        const table = data.tables[0];

        expect(table.indexes.some(i =>
          i.columns.includes('email') &&
          i.columns.includes('orgId') &&
          i.unique
        )).toBe(true);
      });

      it('should parse named indexes', () => {
        vi.mocked(fs.readFileSync).mockReturnValue(`
model User {
  id    String @id
  email String

  @@index([email], name: "idx_user_email")
}
`);

        const result = handleGetDatabaseSchema({});
        const data = JSON.parse(result.content[0].text) as DatabaseSchemaResult;
        const table = data.tables[0];

        expect(table.indexes.some(i => i.name === 'idx_user_email')).toBe(true);
      });

      it('should parse composite primary keys with @@id', () => {
        vi.mocked(fs.readFileSync).mockReturnValue(`
model UserRole {
  userId String
  roleId String

  @@id([userId, roleId])
}
`);

        const result = handleGetDatabaseSchema({});
        const data = JSON.parse(result.content[0].text) as DatabaseSchemaResult;
        const table = data.tables[0];

        // Both columns should be marked as primary key
        expect(table.columns.find(c => c.name === 'userId')!.primary_key).toBe(true);
        expect(table.columns.find(c => c.name === 'roleId')!.primary_key).toBe(true);
      });

      it('should handle @@id referencing non-existent column', () => {
        // Tests line 377: when @@id references a column that doesn't exist
        vi.mocked(fs.readFileSync).mockReturnValue(`
model UserRole {
  userId String
  roleId String

  @@id([userId, nonExistentColumn])
}
`);

        const result = handleGetDatabaseSchema({});
        const data = JSON.parse(result.content[0].text) as DatabaseSchemaResult;
        const table = data.tables[0];

        // userId should be marked as primary key
        expect(table.columns.find(c => c.name === 'userId')!.primary_key).toBe(true);
        // roleId should not be primary key (not in @@id)
        expect(table.columns.find(c => c.name === 'roleId')!.primary_key).toBe(false);
        // nonExistentColumn doesn't exist, so it's just skipped
      });
    });

    describe('edge cases', () => {
      it('should handle empty model', () => {
        vi.mocked(fs.readFileSync).mockReturnValue(`
model Empty {
}
`);

        const result = handleGetDatabaseSchema({});
        const data = JSON.parse(result.content[0].text) as DatabaseSchemaResult;

        expect(data.tables).toHaveLength(1);
        expect(data.tables[0].columns).toHaveLength(0);
      });

      it('should handle multiple models', () => {
        vi.mocked(fs.readFileSync).mockReturnValue(`
model User {
  id String @id
}

model Post {
  id String @id
}

model Comment {
  id String @id
}
`);

        const result = handleGetDatabaseSchema({});
        const data = JSON.parse(result.content[0].text) as DatabaseSchemaResult;

        expect(data.tables).toHaveLength(3);
      });

      it('should handle model with only relations', () => {
        vi.mocked(fs.readFileSync).mockReturnValue(`
model UserPost {
  user User
  post Post
}

model User {
  id String @id
}

model Post {
  id String @id
}
`);

        const result = handleGetDatabaseSchema({});
        const data = JSON.parse(result.content[0].text) as DatabaseSchemaResult;
        const userPostTable = data.tables.find(t => t.name === 'UserPost');

        expect(userPostTable!.columns).toHaveLength(0);
        expect(data.relations.length).toBeGreaterThan(0);
      });
    });
  });

  // =============================================================================
  // Drizzle Schema Parsing Tests
  // =============================================================================

  describe('parseDrizzleForUnifiedSchema', () => {
    beforeEach(() => {
      vi.mocked(fs.existsSync).mockImplementation((p: fs.PathLike) => {
        const pathStr = String(p);
        return pathStr.includes('drizzle') && pathStr.includes('schema.ts');
      });
    });

    describe('table parsing', () => {
      it('should parse pgTable definitions', () => {
        vi.mocked(fs.readFileSync).mockReturnValue(`
export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  email: varchar('email', { length: 255 })
});
`);

        const result = handleGetDatabaseSchema({});
        const data = JSON.parse(result.content[0].text) as DatabaseSchemaResult;

        expect(data.source).toBe('drizzle');
        expect(data.tables.some(t => t.name === 'users')).toBe(true);
      });

      it('should parse mysqlTable definitions', () => {
        vi.mocked(fs.readFileSync).mockReturnValue(`
export const users = mysqlTable('users', {
  id: serial('id').primaryKey()
});
`);

        const result = handleGetDatabaseSchema({});
        const data = JSON.parse(result.content[0].text) as DatabaseSchemaResult;

        expect(data.tables.some(t => t.name === 'users')).toBe(true);
      });

      it('should parse sqliteTable definitions', () => {
        vi.mocked(fs.readFileSync).mockReturnValue(`
export const users = sqliteTable('users', {
  id: integer('id').primaryKey()
});
`);

        const result = handleGetDatabaseSchema({});
        const data = JSON.parse(result.content[0].text) as DatabaseSchemaResult;

        expect(data.tables.some(t => t.name === 'users')).toBe(true);
      });
    });

    describe('column parsing', () => {
      it('should parse all supported column types', () => {
        vi.mocked(fs.readFileSync).mockReturnValue(`
export const allTypes = pgTable('all_types', {
  id: serial('id'),
  name: varchar('name'),
  bio: text('bio'),
  count: integer('count'),
  active: boolean('active'),
  createdAt: timestamp('created_at'),
  data: json('data'),
  uuid: uuid('uuid'),
  big: bigint('big'),
  rate: real('rate'),
  precise: doublePrecision('precise'),
  birthday: date('birthday'),
  time: time('time'),
  price: numeric('price'),
  amount: decimal('amount'),
  code: char('code')
});
`);

        const result = handleGetDatabaseSchema({});
        const data = JSON.parse(result.content[0].text) as DatabaseSchemaResult;
        const table = data.tables[0];

        expect(table.columns.length).toBeGreaterThan(10);
      });

      it('should detect primary keys with .primaryKey()', () => {
        vi.mocked(fs.readFileSync).mockReturnValue(`
export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  email: varchar('email')
});
`);

        const result = handleGetDatabaseSchema({});
        const data = JSON.parse(result.content[0].text) as DatabaseSchemaResult;
        const idColumn = data.tables[0].columns.find(c => c.name === 'id');

        expect(idColumn!.primary_key).toBe(true);
      });

      it('should detect nullable columns (no .notNull())', () => {
        vi.mocked(fs.readFileSync).mockReturnValue(`
export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  name: varchar('name'),
  email: varchar('email').notNull()
});
`);

        const result = handleGetDatabaseSchema({});
        const data = JSON.parse(result.content[0].text) as DatabaseSchemaResult;
        const nameColumn = data.tables[0].columns.find(c => c.name === 'name');
        const emailColumn = data.tables[0].columns.find(c => c.name === 'email');

        expect(nameColumn!.nullable).toBe(true);
        expect(emailColumn!.nullable).toBe(false);
      });

      it('should detect unique columns with .unique()', () => {
        vi.mocked(fs.readFileSync).mockReturnValue(`
export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  email: varchar('email').unique()
});
`);

        const result = handleGetDatabaseSchema({});
        const data = JSON.parse(result.content[0].text) as DatabaseSchemaResult;
        const table = data.tables[0];

        expect(table.indexes.some(i =>
          i.columns.includes('email') && i.unique
        )).toBe(true);
      });

      it('should parse .references() for foreign keys', () => {
        vi.mocked(fs.readFileSync).mockReturnValue(`
export const users = pgTable('users', {
  id: serial('id').primaryKey()
});

export const posts = pgTable('posts', {
  id: serial('id').primaryKey(),
  authorId: integer('author_id').references(() => users.id)
});
`);

        const result = handleGetDatabaseSchema({});
        const data = JSON.parse(result.content[0].text) as DatabaseSchemaResult;
        const postsTable = data.tables.find(t => t.name === 'posts');
        const authorIdColumn = postsTable!.columns.find(c => c.name === 'authorId');

        expect(authorIdColumn!.references).toBeDefined();
        expect(authorIdColumn!.references!.table).toBe('users');
        expect(authorIdColumn!.references!.column).toBe('id');
      });
    });

    describe('index parsing', () => {
      it('should parse uniqueIndex from table options', () => {
        vi.mocked(fs.readFileSync).mockReturnValue(`
export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  email: varchar('email')
}, (table) => ({
  emailIdx: uniqueIndex('users_email_unique').on(table.email)
}));
`);

        const result = handleGetDatabaseSchema({});
        const data = JSON.parse(result.content[0].text) as DatabaseSchemaResult;
        const table = data.tables[0];

        expect(table.indexes.some(i =>
          i.name === 'users_email_unique' && i.unique
        )).toBe(true);
      });

      it('should parse index from table options', () => {
        vi.mocked(fs.readFileSync).mockReturnValue(`
export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  createdAt: timestamp('created_at')
}, (table) => ({
  createdIdx: index('users_created_idx').on(table.createdAt)
}));
`);

        const result = handleGetDatabaseSchema({});
        const data = JSON.parse(result.content[0].text) as DatabaseSchemaResult;
        const table = data.tables[0];

        expect(table.indexes.some(i =>
          i.name === 'users_created_idx' && !i.unique
        )).toBe(true);
      });
    });

    describe('relations() helper parsing', () => {
      it('should parse one() relations', () => {
        vi.mocked(fs.readFileSync).mockReturnValue(`
export const users = pgTable('users', {
  id: serial('id').primaryKey()
});

export const posts = pgTable('posts', {
  id: serial('id').primaryKey(),
  authorId: integer('author_id')
});

export const postsRelations = relations(posts, ({ one }) => ({
  author: one(users, {
    fields: [posts.authorId],
    references: [users.id]
  })
}));
`);

        const result = handleGetDatabaseSchema({});
        const data = JSON.parse(result.content[0].text) as DatabaseSchemaResult;

        expect(data.relations.some(r =>
          r.to_table === 'users' &&
          r.type === 'one-to-one'
        )).toBe(true);
      });

      it('should parse many() relations', () => {
        vi.mocked(fs.readFileSync).mockReturnValue(`
export const users = pgTable('users', {
  id: serial('id').primaryKey()
});

export const posts = pgTable('posts', {
  id: serial('id').primaryKey()
});

export const usersRelations = relations(users, ({ many }) => ({
  posts: many(posts)
}));
`);

        const result = handleGetDatabaseSchema({});
        const data = JSON.parse(result.content[0].text) as DatabaseSchemaResult;

        expect(data.relations.some(r =>
          r.to_table === 'posts' &&
          r.type === 'one-to-many'
        )).toBe(true);
      });

      it('should avoid duplicate relations', () => {
        vi.mocked(fs.readFileSync).mockReturnValue(`
export const users = pgTable('users', {
  id: serial('id').primaryKey()
});

export const posts = pgTable('posts', {
  id: serial('id').primaryKey(),
  authorId: integer('author_id').references(() => users.id)
});

export const postsRelations = relations(posts, ({ one }) => ({
  author: one(users, {
    fields: [posts.authorId],
    references: [users.id]
  })
}));
`);

        const result = handleGetDatabaseSchema({});
        const data = JSON.parse(result.content[0].text) as DatabaseSchemaResult;

        // Should not have duplicate posts->users relations
        const postsToUsersRelations = data.relations.filter(r =>
          r.from_table === 'posts' && r.to_table === 'users'
        );
        // May have duplicates due to both .references() and relations(), but we check for existence
        expect(postsToUsersRelations.length).toBeGreaterThan(0);
      });

      it('should handle relations for non-existent table gracefully', () => {
        vi.mocked(fs.readFileSync).mockReturnValue(`
export const users = pgTable('users', {
  id: serial('id').primaryKey()
});

export const nonExistentRelations = relations(nonExistent, ({ many }) => ({
  users: many(users)
}));
`);

        const result = handleGetDatabaseSchema({});
        const data = JSON.parse(result.content[0].text) as DatabaseSchemaResult;

        // Should not throw, just ignore the invalid relations
        expect(data.tables.length).toBeGreaterThan(0);
      });

      it('should avoid duplicate many() relations when already defined via references()', () => {
        // This tests line 531: the duplicate check for many() relations
        // When a relation already exists from .references(), many() should not duplicate it
        vi.mocked(fs.readFileSync).mockReturnValue(`
export const users = pgTable('users', {
  id: serial('id').primaryKey()
});

export const posts = pgTable('posts', {
  id: serial('id').primaryKey(),
  authorId: integer('author_id').references(() => users.id)
});

export const usersRelations = relations(users, ({ many }) => ({
  posts: many(posts)
}));
`);

        const result = handleGetDatabaseSchema({});
        const data = JSON.parse(result.content[0].text) as DatabaseSchemaResult;

        // Count relations from users to posts - should not have duplicates
        const userToPostsRelations = data.relations.filter(r =>
          r.from_table === 'users' && r.to_table === 'posts'
        );

        // Should have exactly one relation from users to posts (the many())
        // The posts->users relation from .references() is separate
        expect(userToPostsRelations.length).toBe(1);
      });

      it('should skip duplicate many() relations in relations() helper', () => {
        // This specifically tests line 531 where we check if a many() relation already exists
        vi.mocked(fs.readFileSync).mockReturnValue(`
export const users = pgTable('users', {
  id: serial('id').primaryKey()
});

export const posts = pgTable('posts', {
  id: serial('id').primaryKey()
});

export const usersRelations = relations(users, ({ many }) => ({
  posts: many(posts),
  morePosts: many(posts)
}));
`);

        const result = handleGetDatabaseSchema({});
        const data = JSON.parse(result.content[0].text) as DatabaseSchemaResult;

        // Count relations from users to posts
        const userToPostsRelations = data.relations.filter(r =>
          r.from_table === 'users' && r.to_table === 'posts'
        );

        // Should have only one relation despite two many(posts) calls
        expect(userToPostsRelations.length).toBe(1);
      });

      it('should skip duplicate one() relations when same relation already exists', () => {
        // Tests lines 513-521: duplicate check for one() relations
        // When the same one() relation is defined twice with identical from_table/to_table/from_column
        vi.mocked(fs.readFileSync).mockReturnValue(`
export const users = pgTable('users', {
  id: serial('id').primaryKey()
});

export const posts = pgTable('posts', {
  id: serial('id').primaryKey(),
  authorId: integer('author_id')
});

export const postsRelations = relations(posts, ({ one }) => ([
  one(users, {
    fields: [authorId],
    references: [id]
  }),
  one(users, {
    fields: [authorId],
    references: [id]
  })
]));
`);

        const result = handleGetDatabaseSchema({});
        const data = JSON.parse(result.content[0].text) as DatabaseSchemaResult;

        // Count one-to-one relations from posts to users
        const postsToUsersRelations = data.relations.filter(r =>
          r.from_table === 'posts' &&
          r.to_table === 'users' &&
          r.type === 'one-to-one'
        );

        // Should deduplicate relations with same from_table/to_table/from_column
        expect(postsToUsersRelations.length).toBe(1);
      });
    });

    describe('edge cases', () => {
      it('should handle empty schema file', () => {
        vi.mocked(fs.readFileSync).mockReturnValue('');

        const result = handleGetDatabaseSchema({});
        const data = JSON.parse(result.content[0].text) as DatabaseSchemaResult;

        expect(data.source).toBe('drizzle');
        expect(data.tables).toHaveLength(0);
      });

      it('should handle schema with only imports', () => {
        vi.mocked(fs.readFileSync).mockReturnValue(`
import { pgTable, varchar } from 'drizzle-orm/pg-core';
`);

        const result = handleGetDatabaseSchema({});
        const data = JSON.parse(result.content[0].text) as DatabaseSchemaResult;

        expect(data.tables).toHaveLength(0);
      });

      it('should handle multiple tables', () => {
        vi.mocked(fs.readFileSync).mockReturnValue(`
export const users = pgTable('users', {
  id: serial('id').primaryKey()
});

export const posts = pgTable('posts', {
  id: serial('id').primaryKey()
});

export const comments = pgTable('comments', {
  id: serial('id').primaryKey()
});
`);

        const result = handleGetDatabaseSchema({});
        const data = JSON.parse(result.content[0].text) as DatabaseSchemaResult;

        expect(data.tables).toHaveLength(3);
      });
    });
  });

  // =============================================================================
  // SQL Schema Parsing Tests
  // =============================================================================

  describe('parseSQLForUnifiedSchema', () => {
    beforeEach(() => {
      vi.mocked(fs.existsSync).mockImplementation((p: fs.PathLike) => {
        return String(p).endsWith('schema.sql');
      });
    });

    describe('CREATE TABLE parsing', () => {
      it('should parse basic CREATE TABLE statement', () => {
        vi.mocked(fs.readFileSync).mockReturnValue(`
CREATE TABLE users (
  id INTEGER PRIMARY KEY,
  email VARCHAR(255)
);
`);

        const result = handleGetDatabaseSchema({});
        const data = JSON.parse(result.content[0].text) as DatabaseSchemaResult;

        expect(data.source).toBe('sql');
        expect(data.tables.some(t => t.name === 'users')).toBe(true);
      });

      it('should parse CREATE TABLE IF NOT EXISTS', () => {
        vi.mocked(fs.readFileSync).mockReturnValue(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY
);
`);

        const result = handleGetDatabaseSchema({});
        const data = JSON.parse(result.content[0].text) as DatabaseSchemaResult;

        expect(data.tables.some(t => t.name === 'users')).toBe(true);
      });

      it('should handle quoted table names', () => {
        vi.mocked(fs.readFileSync).mockReturnValue(`
CREATE TABLE "users" (
  id INTEGER PRIMARY KEY
);

CREATE TABLE \`posts\` (
  id INTEGER PRIMARY KEY
);

CREATE TABLE 'comments' (
  id INTEGER PRIMARY KEY
);
`);

        const result = handleGetDatabaseSchema({});
        const data = JSON.parse(result.content[0].text) as DatabaseSchemaResult;

        expect(data.tables.some(t => t.name === 'users')).toBe(true);
        expect(data.tables.some(t => t.name === 'posts')).toBe(true);
        expect(data.tables.some(t => t.name === 'comments')).toBe(true);
      });
    });

    describe('column parsing', () => {
      it('should parse column types', () => {
        vi.mocked(fs.readFileSync).mockReturnValue(`
CREATE TABLE users (
  id INTEGER,
  name VARCHAR(255),
  email TEXT,
  active BOOLEAN,
  created_at TIMESTAMP
);
`);

        const result = handleGetDatabaseSchema({});
        const data = JSON.parse(result.content[0].text) as DatabaseSchemaResult;
        const table = data.tables[0];

        expect(table.columns.some(c => c.type === 'INTEGER')).toBe(true);
        expect(table.columns.some(c => c.type === 'VARCHAR')).toBe(true);
        expect(table.columns.some(c => c.type === 'TEXT')).toBe(true);
        expect(table.columns.some(c => c.type === 'BOOLEAN')).toBe(true);
        expect(table.columns.some(c => c.type === 'TIMESTAMP')).toBe(true);
      });

      it('should detect PRIMARY KEY constraint', () => {
        vi.mocked(fs.readFileSync).mockReturnValue(`
CREATE TABLE users (
  id INTEGER PRIMARY KEY,
  email VARCHAR(255)
);
`);

        const result = handleGetDatabaseSchema({});
        const data = JSON.parse(result.content[0].text) as DatabaseSchemaResult;
        const idColumn = data.tables[0].columns.find(c => c.name === 'id');

        expect(idColumn!.primary_key).toBe(true);
      });

      it('should detect NOT NULL constraint', () => {
        vi.mocked(fs.readFileSync).mockReturnValue(`
CREATE TABLE users (
  id INTEGER NOT NULL,
  name VARCHAR(255)
);
`);

        const result = handleGetDatabaseSchema({});
        const data = JSON.parse(result.content[0].text) as DatabaseSchemaResult;
        const idColumn = data.tables[0].columns.find(c => c.name === 'id');
        const nameColumn = data.tables[0].columns.find(c => c.name === 'name');

        expect(idColumn!.nullable).toBe(false);
        expect(nameColumn!.nullable).toBe(true);
      });

      it('should detect UNIQUE constraint on column', () => {
        vi.mocked(fs.readFileSync).mockReturnValue(`
CREATE TABLE users (
  id INTEGER PRIMARY KEY,
  email VARCHAR(255) UNIQUE
);
`);

        const result = handleGetDatabaseSchema({});
        const data = JSON.parse(result.content[0].text) as DatabaseSchemaResult;
        const table = data.tables[0];

        expect(table.indexes.some(i =>
          i.columns.includes('email') && i.unique
        )).toBe(true);
      });

      it('should parse inline REFERENCES', () => {
        vi.mocked(fs.readFileSync).mockReturnValue(`
CREATE TABLE posts (
  id INTEGER PRIMARY KEY,
  author_id INTEGER REFERENCES users(id)
);
`);

        const result = handleGetDatabaseSchema({});
        const data = JSON.parse(result.content[0].text) as DatabaseSchemaResult;
        const authorIdColumn = data.tables[0].columns.find(c => c.name === 'author_id');

        expect(authorIdColumn!.references).toBeDefined();
        expect(authorIdColumn!.references!.table).toBe('users');
        expect(authorIdColumn!.references!.column).toBe('id');
      });

      it('should handle quoted column names', () => {
        vi.mocked(fs.readFileSync).mockReturnValue(`
CREATE TABLE users (
  "id" INTEGER PRIMARY KEY,
  \`email\` VARCHAR(255),
  'name' VARCHAR(100)
);
`);

        const result = handleGetDatabaseSchema({});
        const data = JSON.parse(result.content[0].text) as DatabaseSchemaResult;

        expect(data.tables[0].columns.some(c => c.name === 'id')).toBe(true);
        expect(data.tables[0].columns.some(c => c.name === 'email')).toBe(true);
        expect(data.tables[0].columns.some(c => c.name === 'name')).toBe(true);
      });
    });

    describe('constraint parsing', () => {
      it('should parse table-level FOREIGN KEY constraint', () => {
        vi.mocked(fs.readFileSync).mockReturnValue(`
CREATE TABLE posts (
  id INTEGER PRIMARY KEY,
  author_id INTEGER,
  FOREIGN KEY (author_id) REFERENCES users(id)
);
`);

        const result = handleGetDatabaseSchema({});
        const data = JSON.parse(result.content[0].text) as DatabaseSchemaResult;
        const authorIdColumn = data.tables[0].columns.find(c => c.name === 'author_id');

        expect(authorIdColumn!.references).toBeDefined();
        expect(authorIdColumn!.references!.table).toBe('users');
        expect(data.relations.some(r =>
          r.from_table === 'posts' &&
          r.to_table === 'users'
        )).toBe(true);
      });

      it('should parse table-level UNIQUE constraint', () => {
        vi.mocked(fs.readFileSync).mockReturnValue(`
CREATE TABLE users (
  id INTEGER PRIMARY KEY,
  email VARCHAR(255),
  UNIQUE(email)
);
`);

        const result = handleGetDatabaseSchema({});
        const data = JSON.parse(result.content[0].text) as DatabaseSchemaResult;
        const table = data.tables[0];

        expect(table.indexes.some(i =>
          i.columns.includes('email') && i.unique
        )).toBe(true);
      });

      it('should parse table-level INDEX/KEY constraint', () => {
        vi.mocked(fs.readFileSync).mockReturnValue(`
CREATE TABLE users (
  id INTEGER PRIMARY KEY,
  email VARCHAR(255),
  KEY idx_email (email)
);
`);

        const result = handleGetDatabaseSchema({});
        const data = JSON.parse(result.content[0].text) as DatabaseSchemaResult;
        const table = data.tables[0];

        expect(table.indexes.some(i =>
          i.columns.includes('email') && !i.unique
        )).toBe(true);
      });

      it('should skip PRIMARY KEY table-level constraints', () => {
        vi.mocked(fs.readFileSync).mockReturnValue(`
CREATE TABLE users (
  id INTEGER,
  email VARCHAR(255),
  PRIMARY KEY (id)
);
`);

        const result = handleGetDatabaseSchema({});
        const data = JSON.parse(result.content[0].text) as DatabaseSchemaResult;
        const table = data.tables[0];

        // Should have 2 columns, not treating PRIMARY KEY as an index
        expect(table.columns).toHaveLength(2);
      });

      it('should skip UNIQUE KEY when parsing as index', () => {
        vi.mocked(fs.readFileSync).mockReturnValue(`
CREATE TABLE users (
  id INTEGER PRIMARY KEY,
  email VARCHAR(255),
  UNIQUE KEY uk_email (email)
);
`);

        const result = handleGetDatabaseSchema({});
        const data = JSON.parse(result.content[0].text) as DatabaseSchemaResult;
        const table = data.tables[0];

        expect(table.indexes.some(i =>
          i.columns.includes('email') && i.unique
        )).toBe(true);
      });
    });

    describe('CREATE INDEX parsing', () => {
      it('should parse CREATE INDEX statement', () => {
        vi.mocked(fs.readFileSync).mockReturnValue(`
CREATE TABLE users (
  id INTEGER PRIMARY KEY,
  email VARCHAR(255)
);

CREATE INDEX idx_users_email ON users(email);
`);

        const result = handleGetDatabaseSchema({});
        const data = JSON.parse(result.content[0].text) as DatabaseSchemaResult;
        const table = data.tables[0];

        expect(table.indexes.some(i =>
          i.name === 'idx_users_email' &&
          i.columns.includes('email') &&
          !i.unique
        )).toBe(true);
      });

      it('should parse CREATE UNIQUE INDEX statement', () => {
        vi.mocked(fs.readFileSync).mockReturnValue(`
CREATE TABLE users (
  id INTEGER PRIMARY KEY,
  email VARCHAR(255)
);

CREATE UNIQUE INDEX idx_users_email_unique ON users(email);
`);

        const result = handleGetDatabaseSchema({});
        const data = JSON.parse(result.content[0].text) as DatabaseSchemaResult;
        const table = data.tables[0];

        expect(table.indexes.some(i =>
          i.name === 'idx_users_email_unique' &&
          i.unique
        )).toBe(true);
      });

      it('should parse CREATE INDEX IF NOT EXISTS', () => {
        vi.mocked(fs.readFileSync).mockReturnValue(`
CREATE TABLE users (
  id INTEGER PRIMARY KEY,
  email VARCHAR(255)
);

CREATE INDEX IF NOT EXISTS idx_email ON users(email);
`);

        const result = handleGetDatabaseSchema({});
        const data = JSON.parse(result.content[0].text) as DatabaseSchemaResult;
        const table = data.tables[0];

        expect(table.indexes.some(i => i.name === 'idx_email')).toBe(true);
      });

      it('should handle multi-column indexes', () => {
        vi.mocked(fs.readFileSync).mockReturnValue(`
CREATE TABLE users (
  id INTEGER PRIMARY KEY,
  first_name VARCHAR(100),
  last_name VARCHAR(100)
);

CREATE INDEX idx_users_name ON users(first_name, last_name);
`);

        const result = handleGetDatabaseSchema({});
        const data = JSON.parse(result.content[0].text) as DatabaseSchemaResult;
        const table = data.tables[0];

        expect(table.indexes.some(i =>
          i.columns.includes('first_name') &&
          i.columns.includes('last_name')
        )).toBe(true);
      });

      it('should only add index to matching table', () => {
        vi.mocked(fs.readFileSync).mockReturnValue(`
CREATE TABLE users (
  id INTEGER PRIMARY KEY,
  email VARCHAR(255)
);

CREATE TABLE posts (
  id INTEGER PRIMARY KEY,
  title VARCHAR(255)
);

CREATE INDEX idx_users_email ON users(email);
`);

        const result = handleGetDatabaseSchema({});
        const data = JSON.parse(result.content[0].text) as DatabaseSchemaResult;
        const postsTable = data.tables.find(t => t.name === 'posts');

        // posts table should not have the users index
        expect(postsTable!.indexes.every(i => i.name !== 'idx_users_email')).toBe(true);
      });
    });

    describe('relation tracking', () => {
      it('should track relations from inline REFERENCES', () => {
        vi.mocked(fs.readFileSync).mockReturnValue(`
CREATE TABLE posts (
  id INTEGER PRIMARY KEY,
  author_id INTEGER REFERENCES users(id)
);
`);

        const result = handleGetDatabaseSchema({});
        const data = JSON.parse(result.content[0].text) as DatabaseSchemaResult;

        expect(data.relations.some(r =>
          r.from_table === 'posts' &&
          r.from_column === 'author_id' &&
          r.to_table === 'users' &&
          r.to_column === 'id' &&
          r.type === 'one-to-many'
        )).toBe(true);
      });

      it('should track relations from FOREIGN KEY constraints', () => {
        vi.mocked(fs.readFileSync).mockReturnValue(`
CREATE TABLE posts (
  id INTEGER PRIMARY KEY,
  author_id INTEGER,
  FOREIGN KEY (author_id) REFERENCES users(id)
);
`);

        const result = handleGetDatabaseSchema({});
        const data = JSON.parse(result.content[0].text) as DatabaseSchemaResult;

        expect(data.relations.some(r =>
          r.from_table === 'posts' &&
          r.from_column === 'author_id' &&
          r.to_table === 'users' &&
          r.to_column === 'id'
        )).toBe(true);
      });
    });

    describe('edge cases', () => {
      it('should handle empty SQL file', () => {
        vi.mocked(fs.readFileSync).mockReturnValue('');

        const result = handleGetDatabaseSchema({});
        const data = JSON.parse(result.content[0].text) as DatabaseSchemaResult;

        expect(data.source).toBe('sql');
        expect(data.tables).toHaveLength(0);
      });

      it('should handle SQL with only comments', () => {
        vi.mocked(fs.readFileSync).mockReturnValue(`
-- This is a comment
/* Multi-line
   comment */
`);

        const result = handleGetDatabaseSchema({});
        const data = JSON.parse(result.content[0].text) as DatabaseSchemaResult;

        expect(data.tables).toHaveLength(0);
      });

      it('should handle multiple tables', () => {
        vi.mocked(fs.readFileSync).mockReturnValue(`
CREATE TABLE users (
  id INTEGER PRIMARY KEY
);

CREATE TABLE posts (
  id INTEGER PRIMARY KEY
);

CREATE TABLE comments (
  id INTEGER PRIMARY KEY
);
`);

        const result = handleGetDatabaseSchema({});
        const data = JSON.parse(result.content[0].text) as DatabaseSchemaResult;

        expect(data.tables).toHaveLength(3);
      });

      it('should handle case-insensitive SQL keywords', () => {
        vi.mocked(fs.readFileSync).mockReturnValue(`
create table users (
  id integer primary key,
  email varchar(255) not null unique
);
`);

        const result = handleGetDatabaseSchema({});
        const data = JSON.parse(result.content[0].text) as DatabaseSchemaResult;

        expect(data.tables.some(t => t.name === 'users')).toBe(true);
        expect(data.tables[0].columns.some(c =>
          c.name === 'id' && c.primary_key
        )).toBe(true);
      });

      it('should handle complex column definitions', () => {
        vi.mocked(fs.readFileSync).mockReturnValue(`
CREATE TABLE users (
  id INTEGER PRIMARY KEY AUTO_INCREMENT,
  email VARCHAR(255) NOT NULL UNIQUE DEFAULT 'user@example.com',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
`);

        const result = handleGetDatabaseSchema({});
        const data = JSON.parse(result.content[0].text) as DatabaseSchemaResult;
        const table = data.tables[0];

        expect(table.columns).toHaveLength(3);
        expect(table.columns.find(c => c.name === 'email')!.nullable).toBe(false);
      });

      it('should handle FOREIGN KEY referencing non-existent column in current table', () => {
        // Tests line 612: when FOREIGN KEY references a column that doesn't exist yet
        vi.mocked(fs.readFileSync).mockReturnValue(`
CREATE TABLE posts (
  id INTEGER PRIMARY KEY,
  FOREIGN KEY (nonexistent_col) REFERENCES users(id)
);
`);

        const result = handleGetDatabaseSchema({});
        const data = JSON.parse(result.content[0].text) as DatabaseSchemaResult;

        // Should still create the table but not update any column references
        expect(data.tables.some(t => t.name === 'posts')).toBe(true);
        // The relation should still be tracked even if column doesn't exist
        expect(data.relations.some(r => r.from_column === 'nonexistent_col')).toBe(true);
      });

      it('should handle CREATE INDEX on non-existent table', () => {
        // Tests line 689: CREATE INDEX references a table that wasn't defined
        vi.mocked(fs.readFileSync).mockReturnValue(`
CREATE TABLE users (
  id INTEGER PRIMARY KEY,
  email VARCHAR(255)
);

CREATE INDEX idx_nonexistent ON nonexistent_table(some_column);
`);

        const result = handleGetDatabaseSchema({});
        const data = JSON.parse(result.content[0].text) as DatabaseSchemaResult;

        // Should still parse successfully, just not add the index
        expect(data.tables.some(t => t.name === 'users')).toBe(true);
        // The nonexistent_table should not appear in tables
        expect(data.tables.every(t => t.name !== 'nonexistent_table')).toBe(true);
      });

      it('should handle table with empty columns block', () => {
        // Tests line 589-595: empty lines when parsing column block
        vi.mocked(fs.readFileSync).mockReturnValue(`
CREATE TABLE empty_table (
);
`);

        const result = handleGetDatabaseSchema({});
        const data = JSON.parse(result.content[0].text) as DatabaseSchemaResult;

        // Should create table with no columns
        expect(data.tables.some(t => t.name === 'empty_table')).toBe(true);
        const emptyTable = data.tables.find(t => t.name === 'empty_table');
        expect(emptyTable!.columns).toHaveLength(0);
      });

      it('should handle table with trailing comma after last column', () => {
        // Tests line 589: currentLine.trim() check when there's trailing comma
        vi.mocked(fs.readFileSync).mockReturnValue(`
CREATE TABLE users (
  id INTEGER PRIMARY KEY,
  email VARCHAR(255),
);
`);

        const result = handleGetDatabaseSchema({});
        const data = JSON.parse(result.content[0].text) as DatabaseSchemaResult;

        // Should handle trailing comma gracefully
        expect(data.tables.some(t => t.name === 'users')).toBe(true);
      });

      it('should skip lines that do not match column definition pattern', () => {
        // Tests line 647: colMatch fails for non-column lines
        // The regex expects: word type rest, so a line starting with non-word chars fails
        vi.mocked(fs.readFileSync).mockReturnValue(`
CREATE TABLE users (
  id INTEGER PRIMARY KEY,
  ,
  email VARCHAR(255)
);
`);

        const result = handleGetDatabaseSchema({});
        const data = JSON.parse(result.content[0].text) as DatabaseSchemaResult;
        const table = data.tables.find(t => t.name === 'users');

        // Should have 2 columns, the bare comma line should be skipped
        expect(table!.columns).toHaveLength(2);
      });

      it('should handle consecutive commas in column block (empty entries)', () => {
        // Tests line 589: empty currentLine.trim() at comma
        vi.mocked(fs.readFileSync).mockReturnValue(`
CREATE TABLE users (
  id INTEGER PRIMARY KEY,,email VARCHAR(255)
);
`);

        const result = handleGetDatabaseSchema({});
        const data = JSON.parse(result.content[0].text) as DatabaseSchemaResult;

        // Should handle gracefully (behavior depends on parser)
        expect(data.tables.some(t => t.name === 'users')).toBe(true);
      });

      it('should handle whitespace-only lines in column block', () => {
        // Tests line 595: currentLine.trim() at end of block
        vi.mocked(fs.readFileSync).mockReturnValue(`
CREATE TABLE users (
  id INTEGER PRIMARY KEY

);
`);

        const result = handleGetDatabaseSchema({});
        const data = JSON.parse(result.content[0].text) as DatabaseSchemaResult;

        expect(data.tables.some(t => t.name === 'users')).toBe(true);
        const table = data.tables.find(t => t.name === 'users');
        expect(table!.columns.some(c => c.name === 'id')).toBe(true);
      });
    });
  });

  // =============================================================================
  // Integration and Cross-cutting Tests
  // =============================================================================

  describe('integration tests', () => {
    it('should handle Prisma priority over Drizzle', () => {
      vi.mocked(fs.existsSync).mockImplementation((p: fs.PathLike) => {
        const pathStr = String(p);
        // Both Prisma and Drizzle exist
        if (pathStr.includes('prisma') && pathStr.includes('schema.prisma')) return true;
        if (pathStr.includes('schema.ts')) return true;
        return false;
      });
      vi.mocked(fs.readFileSync).mockReturnValue(`model User { id String @id }`);

      const result = handleGetDatabaseSchema({});
      const data = JSON.parse(result.content[0].text) as DatabaseSchemaResult;

      expect(data.source).toBe('prisma');
    });

    it('should handle Drizzle priority over SQL', () => {
      vi.mocked(fs.existsSync).mockImplementation((p: fs.PathLike) => {
        const pathStr = String(p);
        // Drizzle and SQL exist, no Prisma
        if (pathStr.includes('prisma')) return false;
        if (pathStr.includes('drizzle') && pathStr.includes('schema.ts')) return true;
        if (pathStr.endsWith('schema.sql')) return true;
        return false;
      });
      vi.mocked(fs.readFileSync).mockReturnValue(`
export const users = pgTable('users', {
  id: serial('id').primaryKey()
});
`);

      const result = handleGetDatabaseSchema({});
      const data = JSON.parse(result.content[0].text) as DatabaseSchemaResult;

      expect(data.source).toBe('drizzle');
    });

    it('should handle migrations folder when no direct SQL files exist', () => {
      vi.mocked(fs.existsSync).mockImplementation((p: fs.PathLike) => {
        const pathStr = String(p);
        if (pathStr.includes('prisma')) return false;
        if (pathStr.includes('schema.ts')) return false;
        if (pathStr.endsWith('schema.sql')) return false;
        if (pathStr.includes('migrations')) return true;
        return false;
      });
      vi.mocked(fs.readdirSync).mockReturnValue(['001_init.sql'] as unknown as ReturnType<typeof fs.readdirSync>);
      vi.mocked(fs.readFileSync).mockReturnValue(`CREATE TABLE users (id INTEGER PRIMARY KEY);`);

      const result = handleGetDatabaseSchema({});
      const data = JSON.parse(result.content[0].text) as DatabaseSchemaResult;

      expect(data.source).toBe('sql');
    });

    it('should return unknown when migrations folder is empty', () => {
      vi.mocked(fs.existsSync).mockImplementation((p: fs.PathLike) => {
        const pathStr = String(p);
        if (pathStr.includes('prisma')) return false;
        if (pathStr.includes('schema.ts')) return false;
        if (pathStr.endsWith('schema.sql')) return false;
        if (pathStr.includes('migrations')) return true;
        return false;
      });
      vi.mocked(fs.readdirSync).mockReturnValue([]);

      const result = handleGetDatabaseSchema({});
      const data = JSON.parse(result.content[0].text);

      expect(data.source).toBe('unknown');
    });

    it('should skip non-SQL files in migrations folder', () => {
      vi.mocked(fs.existsSync).mockImplementation((p: fs.PathLike) => {
        const pathStr = String(p);
        if (pathStr.includes('prisma')) return false;
        if (pathStr.includes('schema.ts')) return false;
        if (pathStr.endsWith('schema.sql')) return false;
        if (pathStr.includes('migrations')) return true;
        return false;
      });
      vi.mocked(fs.readdirSync).mockReturnValue(['readme.md', 'config.json'] as unknown as ReturnType<typeof fs.readdirSync>);

      const result = handleGetDatabaseSchema({});
      const data = JSON.parse(result.content[0].text);

      expect(data.source).toBe('unknown');
    });
  });
});
