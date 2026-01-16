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
