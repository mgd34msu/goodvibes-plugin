/**
 * Unit tests for individual schema parsers
 *
 * Tests cover:
 * - sql-parser.ts: findSql fallback logic (lines 36-42)
 * - typeorm-parser.ts: relation type conversion (lines 77-78)
 * - drizzle-parser.ts: references parsing (line 70)
 * - prisma-parser.ts: branch coverage (line 39 isArray check)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

import { parseSQLSchema } from '../../handlers/schema/sql-parser.js';
import { parseTypeORMSchema } from '../../handlers/schema/typeorm-parser.js';
import { parseDrizzleSchema } from '../../handlers/schema/drizzle-parser.js';
import { parsePrismaSchema } from '../../handlers/schema/prisma-parser.js';

// Mock modules
vi.mock('fs');

describe('schema parsers - uncovered lines', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('sql-parser.ts', () => {
    describe('findSql fallback logic (lines 34-45)', () => {
      it('should find .sql file in project root when schema.sql not found', () => {
        // First, return false for all standard schema.sql paths
        // Then return true for projectPath directory and find a custom.sql file
        const checkedPaths: string[] = [];
        vi.mocked(fs.existsSync).mockImplementation((p: fs.PathLike) => {
          const pathStr = String(p);
          checkedPaths.push(pathStr);
          // Return false for standard schema.sql paths
          if (pathStr.includes('schema.sql')) {
            return false;
          }
          // Return true for the project directory itself (for readdirSync)
          if (pathStr === '/test/project' || pathStr === '\\test\\project') {
            return true;
          }
          return false;
        });

        // Return a .sql file in the directory
        vi.mocked(fs.readdirSync).mockReturnValue(['custom.sql', 'readme.md'] as unknown as ReturnType<typeof fs.readdirSync>);
        vi.mocked(fs.readFileSync).mockReturnValue(`
          CREATE TABLE users (
            id INTEGER PRIMARY KEY
          );
        `);

        const result = parseSQLSchema('/test/project');
        const data = JSON.parse(result.content[0].text);

        expect(data.source).toBe('sql');
        expect(data.tables.some((t: { name: string }) => t.name === 'users')).toBe(true);
        // The raw_path should include the found custom.sql file
        expect(data.raw_path).toContain('custom.sql');
      });

      it('should find .sql file in db subdirectory when not in root', () => {
        const existsCalls: string[] = [];
        vi.mocked(fs.existsSync).mockImplementation((p: fs.PathLike) => {
          const pathStr = String(p);
          existsCalls.push(pathStr);
          // Return false for standard schema.sql paths
          if (pathStr.includes('schema.sql')) {
            return false;
          }
          // Return false for root directory
          if (pathStr === '/test/project' || pathStr === '\\test\\project') {
            return false;
          }
          // Return true for db subdirectory
          if (pathStr.includes('db') && !pathStr.includes('schema.sql')) {
            return true;
          }
          return false;
        });

        vi.mocked(fs.readdirSync).mockImplementation((p: fs.PathLike) => {
          const pathStr = String(p);
          if (pathStr.includes('db')) {
            return ['database.sql', 'seed.sql'] as unknown as ReturnType<typeof fs.readdirSync>;
          }
          throw new Error('ENOENT');
        });

        vi.mocked(fs.readFileSync).mockReturnValue(`
          CREATE TABLE posts (
            id INTEGER PRIMARY KEY,
            title VARCHAR(255)
          );
        `);

        const result = parseSQLSchema('/test/project');
        const data = JSON.parse(result.content[0].text);

        expect(data.source).toBe('sql');
        expect(data.tables.some((t: { name: string }) => t.name === 'posts')).toBe(true);
      });

      it('should find .sql file in sql subdirectory as last resort', () => {
        vi.mocked(fs.existsSync).mockImplementation((p: fs.PathLike) => {
          const pathStr = String(p);
          // Return false for standard schema.sql paths
          if (pathStr.includes('schema.sql')) {
            return false;
          }
          // Return false for root and db directories
          if (pathStr === '/test/project' || pathStr === '\\test\\project') {
            return false;
          }
          if (pathStr.includes('db') && !pathStr.includes('sql')) {
            return false;
          }
          // Return true only for sql subdirectory
          if (pathStr.endsWith('sql') || pathStr.endsWith('sql\\') || pathStr.endsWith('sql/')) {
            return true;
          }
          return false;
        });

        vi.mocked(fs.readdirSync).mockImplementation((p: fs.PathLike) => {
          const pathStr = String(p);
          if (pathStr.includes(path.join('', 'sql'))) {
            return ['init.sql'] as unknown as ReturnType<typeof fs.readdirSync>;
          }
          throw new Error('ENOENT');
        });

        vi.mocked(fs.readFileSync).mockReturnValue(`
          CREATE TABLE categories (
            id INTEGER PRIMARY KEY
          );
        `);

        const result = parseSQLSchema('/test/project');
        const data = JSON.parse(result.content[0].text);

        expect(data.source).toBe('sql');
      });

      it('should skip migration files when searching for sql files', () => {
        vi.mocked(fs.existsSync).mockImplementation((p: fs.PathLike) => {
          const pathStr = String(p);
          if (pathStr.includes('schema.sql')) {
            return false;
          }
          // Project root exists
          if (pathStr === '/test/project' || pathStr === '\\test\\project') {
            return true;
          }
          return false;
        });

        // Return migration file and regular sql file
        vi.mocked(fs.readdirSync).mockReturnValue([
          '001_migration.sql',
          'migration_002.sql',
          'schema_v1.sql',
        ] as unknown as ReturnType<typeof fs.readdirSync>);

        vi.mocked(fs.readFileSync).mockReturnValue(`
          CREATE TABLE items (
            id INTEGER PRIMARY KEY
          );
        `);

        const result = parseSQLSchema('/test/project');
        const data = JSON.parse(result.content[0].text);

        // Should find schema_v1.sql (not migration files)
        expect(data.raw_path).toContain('schema_v1.sql');
      });

      it('should return null from findSql when directory does not exist', () => {
        vi.mocked(fs.existsSync).mockReturnValue(false);
        vi.mocked(fs.readdirSync).mockReturnValue([]);

        expect(() => {
          parseSQLSchema('/nonexistent/project');
        }).toThrow('SQL schema not found');
      });

      it('should return null from findSql when directory exists but has no sql files (line 42)', () => {
        // This covers line 42: return null when no .sql files in directory
        vi.mocked(fs.existsSync).mockImplementation((p: fs.PathLike) => {
          const pathStr = String(p);
          // schema.sql paths don't exist
          if (pathStr.includes('schema.sql')) return false;
          // But project directories exist
          return true;
        });
        // Directories exist but contain no .sql files
        vi.mocked(fs.readdirSync).mockReturnValue(['readme.md', 'config.json'] as unknown as ReturnType<typeof fs.readdirSync>);

        // All findSql calls return null (line 42), so error is thrown
        expect(() => {
          parseSQLSchema('/test/project');
        }).toThrow('SQL schema not found');
      });
    });

    describe('UNIQUE constraint parsing (line 83-89)', () => {
      it('should parse UNIQUE constraints as indexes', () => {
        vi.mocked(fs.existsSync).mockReturnValue(true);
        // The columnsBlock is split by comma, so UNIQUE with multiple columns gets broken up
        // Use single-column UNIQUE constraint which won't be split
        vi.mocked(fs.readFileSync).mockReturnValue(`CREATE TABLE users (id INTEGER PRIMARY KEY, email VARCHAR(255), UNIQUE(email));`);

        const result = parseSQLSchema('/test/project');
        const data = JSON.parse(result.content[0].text);
        const usersTable = data.tables.find((t: { name: string }) => t.name === 'users');

        expect(usersTable.indexes).toHaveLength(1);
        expect(usersTable.indexes[0].type).toBe('unique');
        expect(usersTable.indexes[0].columns).toContain('email');
      });
    });

    describe('filterTables branch (line 62)', () => {
      it('should skip tables not in filterTables array', () => {
        vi.mocked(fs.existsSync).mockReturnValue(true);
        vi.mocked(fs.readFileSync).mockReturnValue(`CREATE TABLE users (id INTEGER PRIMARY KEY);
CREATE TABLE posts (id INTEGER PRIMARY KEY);
CREATE TABLE comments (id INTEGER PRIMARY KEY);`);

        const result = parseSQLSchema('/test/project', ['posts']);
        const data = JSON.parse(result.content[0].text);

        expect(data.tables).toHaveLength(1);
        expect(data.tables[0].name).toBe('posts');
      });
    });

    describe('column regex non-match (line 95 else branch)', () => {
      it('should skip lines that do not match column regex', () => {
        vi.mocked(fs.existsSync).mockReturnValue(true);
        // Include a line that won't match the column regex (empty or malformed)
        vi.mocked(fs.readFileSync).mockReturnValue(`CREATE TABLE users (id INTEGER PRIMARY KEY, , email VARCHAR(255));`);

        const result = parseSQLSchema('/test/project');
        const data = JSON.parse(result.content[0].text);
        const usersTable = data.tables.find((t: { name: string }) => t.name === 'users');

        // Should have parsed id and email, skipped the empty line
        expect(usersTable.columns).toHaveLength(2);
      });
    });
  });

  describe('typeorm-parser.ts', () => {
    describe('relation type conversion (lines 77-81)', () => {
      it('should convert OneToOne relation type', () => {
        vi.mocked(fs.existsSync).mockReturnValue(true);
        vi.mocked(fs.readdirSync).mockReturnValue(['profile.ts'] as unknown as ReturnType<typeof fs.readdirSync>);
        vi.mocked(fs.readFileSync).mockReturnValue(`
import { Entity, Column, PrimaryGeneratedColumn, OneToOne } from 'typeorm';

@Entity('profiles')
class Profile {
  @PrimaryGeneratedColumn()
  id: number;

  @OneToOne(() => User)
  user: User;
}
`);

        const result = parseTypeORMSchema('/test/project');
        const data = JSON.parse(result.content[0].text);
        const profileTable = data.tables.find((t: { name: string }) => t.name === 'profiles');

        expect(profileTable.relations).toHaveLength(1);
        expect(profileTable.relations[0].type).toBe('one-to-one');
        expect(profileTable.relations[0].target).toBe('User');
      });

      it('should convert OneToMany relation type', () => {
        vi.mocked(fs.existsSync).mockReturnValue(true);
        vi.mocked(fs.readdirSync).mockReturnValue(['user.ts'] as unknown as ReturnType<typeof fs.readdirSync>);
        vi.mocked(fs.readFileSync).mockReturnValue(`
import { Entity, Column, PrimaryGeneratedColumn, OneToMany } from 'typeorm';

@Entity('users')
class User {
  @PrimaryGeneratedColumn()
  id: number;

  @OneToMany(() => Post)
  posts: Post[];
}
`);

        const result = parseTypeORMSchema('/test/project');
        const data = JSON.parse(result.content[0].text);
        const userTable = data.tables.find((t: { name: string }) => t.name === 'users');

        expect(userTable.relations).toHaveLength(1);
        expect(userTable.relations[0].type).toBe('one-to-many');
        expect(userTable.relations[0].target).toBe('Post');
      });

      it('should convert ManyToOne relation type', () => {
        vi.mocked(fs.existsSync).mockReturnValue(true);
        vi.mocked(fs.readdirSync).mockReturnValue(['post.ts'] as unknown as ReturnType<typeof fs.readdirSync>);
        vi.mocked(fs.readFileSync).mockReturnValue(`
import { Entity, Column, PrimaryGeneratedColumn, ManyToOne } from 'typeorm';

@Entity('posts')
class Post {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => User)
  author: User;
}
`);

        const result = parseTypeORMSchema('/test/project');
        const data = JSON.parse(result.content[0].text);
        const postTable = data.tables.find((t: { name: string }) => t.name === 'posts');

        expect(postTable.relations).toHaveLength(1);
        expect(postTable.relations[0].type).toBe('many-to-one');
        expect(postTable.relations[0].target).toBe('User');
      });

      it('should convert ManyToMany relation type', () => {
        vi.mocked(fs.existsSync).mockReturnValue(true);
        vi.mocked(fs.readdirSync).mockReturnValue(['tag.ts'] as unknown as ReturnType<typeof fs.readdirSync>);
        vi.mocked(fs.readFileSync).mockReturnValue(`
import { Entity, Column, PrimaryGeneratedColumn, ManyToMany } from 'typeorm';

@Entity('tags')
class Tag {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToMany(() => Post)
  posts: Post[];
}
`);

        const result = parseTypeORMSchema('/test/project');
        const data = JSON.parse(result.content[0].text);
        const tagTable = data.tables.find((t: { name: string }) => t.name === 'tags');

        expect(tagTable.relations).toHaveLength(1);
        expect(tagTable.relations[0].type).toBe('many-to-many');
        expect(tagTable.relations[0].target).toBe('Post');
      });

      it('should handle entity without explicit table name', () => {
        vi.mocked(fs.existsSync).mockReturnValue(true);
        vi.mocked(fs.readdirSync).mockReturnValue(['category.ts'] as unknown as ReturnType<typeof fs.readdirSync>);
        vi.mocked(fs.readFileSync).mockReturnValue(`
import { Entity, Column, PrimaryGeneratedColumn } from 'typeorm';

@Entity()
class Category {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  name: string;
}
`);

        const result = parseTypeORMSchema('/test/project');
        const data = JSON.parse(result.content[0].text);

        // When no table name in @Entity(), should use lowercase class name
        expect(data.tables[0].name).toBe('category');
        expect(data.tables[0].entity).toBe('Category');
      });

      it('should filter tables by class name as well as table name', () => {
        vi.mocked(fs.existsSync).mockReturnValue(true);
        vi.mocked(fs.readdirSync).mockReturnValue(['user.ts', 'post.ts'] as unknown as ReturnType<typeof fs.readdirSync>);
        vi.mocked(fs.readFileSync).mockImplementation(((p: fs.PathLike) => {
          const pathStr = String(p);
          if (pathStr.includes('user')) {
            return `
@Entity('users')
class User {
  @PrimaryGeneratedColumn()
  id: number;
}
`;
          }
          return `
@Entity('posts')
class Post {
  @PrimaryGeneratedColumn()
  id: number;
}
`;
        }) as typeof fs.readFileSync);

        // Filter by class name "User" instead of table name "users"
        const result = parseTypeORMSchema('/test/project', ['User']);
        const data = JSON.parse(result.content[0].text);

        expect(data.tables).toHaveLength(1);
        expect(data.tables[0].entity).toBe('User');
      });

      it('should skip files without @Entity decorator', () => {
        vi.mocked(fs.existsSync).mockReturnValue(true);
        vi.mocked(fs.readdirSync).mockReturnValue(['utils.ts', 'user.ts'] as unknown as ReturnType<typeof fs.readdirSync>);
        vi.mocked(fs.readFileSync).mockImplementation(((p: fs.PathLike) => {
          const pathStr = String(p);
          if (pathStr.includes('utils')) {
            return `
// Utility functions
export function helper() {}
`;
          }
          return `
@Entity('users')
class User {
  @PrimaryGeneratedColumn()
  id: number;
}
`;
        }) as typeof fs.readFileSync);

        const result = parseTypeORMSchema('/test/project');
        const data = JSON.parse(result.content[0].text);

        expect(data.tables).toHaveLength(1);
        expect(data.tables[0].name).toBe('users');
      });

      it('should include file name in table metadata', () => {
        vi.mocked(fs.existsSync).mockReturnValue(true);
        vi.mocked(fs.readdirSync).mockReturnValue(['user.entity.ts'] as unknown as ReturnType<typeof fs.readdirSync>);
        vi.mocked(fs.readFileSync).mockReturnValue(`
@Entity('users')
class User {
  @PrimaryGeneratedColumn()
  id: number;
}
`);

        const result = parseTypeORMSchema('/test/project');
        const data = JSON.parse(result.content[0].text);

        expect(data.tables[0].file).toBe('user.entity.ts');
      });

      it('should parse multiple relations in single entity', () => {
        vi.mocked(fs.existsSync).mockReturnValue(true);
        vi.mocked(fs.readdirSync).mockReturnValue(['post.ts'] as unknown as ReturnType<typeof fs.readdirSync>);
        vi.mocked(fs.readFileSync).mockReturnValue(`
@Entity('posts')
class Post {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => User)
  author: User;

  @ManyToOne(() => Category)
  category: Category;

  @ManyToMany(() => Tag)
  tags: Tag[];
}
`);

        const result = parseTypeORMSchema('/test/project');
        const data = JSON.parse(result.content[0].text);
        const postTable = data.tables[0];

        expect(postTable.relations).toHaveLength(3);
        expect(postTable.relations.map((r: { target: string }) => r.target)).toContain('User');
        expect(postTable.relations.map((r: { target: string }) => r.target)).toContain('Category');
        expect(postTable.relations.map((r: { target: string }) => r.target)).toContain('Tag');
      });

      it('should parse .js entity files (line 36 || branch)', () => {
        vi.mocked(fs.existsSync).mockReturnValue(true);
        vi.mocked(fs.readdirSync).mockReturnValue(['user.js', 'readme.md'] as unknown as ReturnType<typeof fs.readdirSync>);
        vi.mocked(fs.readFileSync).mockReturnValue(`
@Entity('users')
class User {
  @PrimaryGeneratedColumn()
  id: number;
}
`);

        const result = parseTypeORMSchema('/test/project');
        const data = JSON.parse(result.content[0].text);

        expect(data.tables).toHaveLength(1);
        expect(data.tables[0].name).toBe('users');
      });

      it('should skip file with @Entity but no class (line 47 continue)', () => {
        vi.mocked(fs.existsSync).mockReturnValue(true);
        vi.mocked(fs.readdirSync).mockReturnValue(['broken.ts', 'user.ts'] as unknown as ReturnType<typeof fs.readdirSync>);
        vi.mocked(fs.readFileSync).mockImplementation(((p: fs.PathLike) => {
          const pathStr = String(p);
          if (pathStr.includes('broken')) {
            // Has @Entity decorator but absolutely no "class" keyword
            return '@Entity("broken")\nexport const x = 1;';
          }
          return `
@Entity('users')
class User {
  @PrimaryGeneratedColumn()
  id: number;
}
`;
        }) as typeof fs.readFileSync);

        const result = parseTypeORMSchema('/test/project');
        const data = JSON.parse(result.content[0].text);

        // Only user.ts should be parsed (broken.ts has no class)
        expect(data.tables).toHaveLength(1);
        expect(data.tables[0].name).toBe('users');
      });
    });
  });

  describe('drizzle-parser.ts', () => {
    describe('references parsing (line 67-75)', () => {
      it('should parse column references to other tables', () => {
        vi.mocked(fs.existsSync).mockImplementation((p: fs.PathLike) => {
          return String(p).includes('schema.ts');
        });
        // The table regex uses ([^}]+) which stops at first }
        // So we must avoid nested braces like { length: 100 }
        // The references regex: /\.references\(\s*\(\)\s*=>\s*(\w+)\.(\w+)/g
        vi.mocked(fs.readFileSync).mockReturnValue(`import { pgTable, integer, serial } from 'drizzle-orm/pg-core';

export const users = pgTable('users', {
  id: serial('id').primaryKey()
});

export const posts = pgTable('posts', {
  id: serial('id').primaryKey(),
  authorId: integer('author_id').references(() => users.id)
});`);

        const result = parseDrizzleSchema('/test/project');
        const data = JSON.parse(result.content[0].text);
        const postsTable = data.tables.find((t: { name: string }) => t.name === 'posts');

        expect(postsTable.relations).toHaveLength(1);
        expect(postsTable.relations[0].target).toBe('users');
        expect(postsTable.relations[0].targetColumn).toBe('id');
        expect(postsTable.relations[0].type).toBe('many-to-one');
      });

      it('should parse multiple references in same table', () => {
        vi.mocked(fs.existsSync).mockImplementation((p: fs.PathLike) => {
          return String(p).includes('schema.ts');
        });
        // Avoid nested braces - the table regex uses ([^}]+) which stops at first }
        vi.mocked(fs.readFileSync).mockReturnValue(`import { pgTable, integer, serial } from 'drizzle-orm/pg-core';

export const users = pgTable('users', {
  id: serial('id').primaryKey()
});

export const categories = pgTable('categories', {
  id: serial('id').primaryKey()
});

export const posts = pgTable('posts', {
  id: serial('id').primaryKey(),
  authorId: integer('author_id').references(() => users.id),
  categoryId: integer('category_id').references(() => categories.id)
});`);

        const result = parseDrizzleSchema('/test/project');
        const data = JSON.parse(result.content[0].text);
        const postsTable = data.tables.find((t: { name: string }) => t.name === 'posts');

        expect(postsTable.relations).toHaveLength(2);
        expect(postsTable.relations.some((r: { target: string }) => r.target === 'users')).toBe(true);
        expect(postsTable.relations.some((r: { target: string }) => r.target === 'categories')).toBe(true);
      });
    });

    describe('relations() definitions (lines 87-101)', () => {
      it('should parse one() relations from relations() helper', () => {
        vi.mocked(fs.existsSync).mockImplementation((p: fs.PathLike) => {
          return String(p).includes('schema.ts');
        });
        vi.mocked(fs.readFileSync).mockReturnValue(`
import { pgTable, varchar, integer, serial } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';

export const users = pgTable('users', {
  id: serial('id').primaryKey(),
});

export const posts = pgTable('posts', {
  id: serial('id').primaryKey(),
  authorId: integer('author_id'),
});

export const postsRelations = relations(posts, ({ one }) => ({
  author: one(users, {
    fields: [posts.authorId],
    references: [users.id],
  }),
}));
`);

        const result = parseDrizzleSchema('/test/project');
        const data = JSON.parse(result.content[0].text);
        const postsTable = data.tables.find((t: { name: string }) => t.name === 'posts');

        expect(postsTable.relations.some((r: { target: string; type: string }) =>
          r.target === 'users' && r.type === 'many-to-one'
        )).toBe(true);
      });

      it('should parse many() relations from relations() helper', () => {
        vi.mocked(fs.existsSync).mockImplementation((p: fs.PathLike) => {
          return String(p).includes('schema.ts');
        });
        vi.mocked(fs.readFileSync).mockReturnValue(`
import { pgTable, varchar, serial } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';

export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  name: varchar('name', { length: 100 }),
});

export const posts = pgTable('posts', {
  id: serial('id').primaryKey(),
});

export const usersRelations = relations(users, ({ many }) => ({
  posts: many(posts),
}));
`);

        const result = parseDrizzleSchema('/test/project');
        const data = JSON.parse(result.content[0].text);
        const usersTable = data.tables.find((t: { name: string }) => t.name === 'users');

        expect(usersTable.relations.some((r: { target: string; type: string }) =>
          r.target === 'posts' && r.type === 'one-to-many'
        )).toBe(true);
      });

      it('should handle relations for table with variable name different from table name', () => {
        vi.mocked(fs.existsSync).mockImplementation((p: fs.PathLike) => {
          return String(p).includes('schema.ts');
        });
        // Avoid nested braces in table definition
        vi.mocked(fs.readFileSync).mockReturnValue(`import { pgTable, serial } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';

export const userTable = pgTable('users', {
  id: serial('id').primaryKey()
});

export const postTable = pgTable('posts', {
  id: serial('id').primaryKey()
});

export const userTableRelations = relations(userTable, ({ many }) => (
  many(postTable)
));`);

        const result = parseDrizzleSchema('/test/project');
        const data = JSON.parse(result.content[0].text);
        const usersTable = data.tables.find((t: { variable: string }) => t.variable === 'userTable');

        expect(usersTable.relations.some((r: { target: string }) => r.target === 'postTable')).toBe(true);
      });

      it('should skip relations for non-existent table (line 91 else branch)', () => {
        vi.mocked(fs.existsSync).mockImplementation((p: fs.PathLike) => {
          return String(p).includes('schema.ts');
        });
        // relations() references a table that wasn't parsed (nonExistentTable)
        vi.mocked(fs.readFileSync).mockReturnValue(`import { pgTable, serial } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';

export const users = pgTable('users', {
  id: serial('id').primaryKey()
});

export const nonExistentTableRelations = relations(nonExistentTable, ({ many }) => (
  many(users)
));`);

        const result = parseDrizzleSchema('/test/project');
        const data = JSON.parse(result.content[0].text);

        // Only users table should exist, relations for nonExistentTable are ignored
        expect(data.tables).toHaveLength(1);
        expect(data.tables[0].name).toBe('users');
        // users table shouldn't have relations added from the ignored relations() call
        expect(data.tables[0].relations).toHaveLength(0);
      });

      it('should filter tables by variable name', () => {
        vi.mocked(fs.existsSync).mockImplementation((p: fs.PathLike) => {
          return String(p).includes('schema.ts');
        });
        vi.mocked(fs.readFileSync).mockReturnValue(`
import { pgTable, serial } from 'drizzle-orm/pg-core';

export const usersTable = pgTable('users', {
  id: serial('id').primaryKey(),
});

export const postsTable = pgTable('posts', {
  id: serial('id').primaryKey(),
});
`);

        // Filter by variable name
        const result = parseDrizzleSchema('/test/project', ['usersTable']);
        const data = JSON.parse(result.content[0].text);

        expect(data.tables).toHaveLength(1);
        expect(data.tables[0].variable).toBe('usersTable');
      });
    });

    describe('column type parsing', () => {
      it('should parse all supported column types', () => {
        vi.mocked(fs.existsSync).mockImplementation((p: fs.PathLike) => {
          return String(p).includes('schema.ts');
        });
        // The table regex captures content between { and first }
        // Column regex pattern: /(\w+)\s*:\s*(type)(?:\([^)]*\))?/g
        // Each column needs to be on format: colName: type('dbname') or colName: type(...)
        vi.mocked(fs.readFileSync).mockReturnValue(`import { pgTable } from 'drizzle-orm/pg-core';

export const allTypes = pgTable('all_types', {
  id: serial('id'),
  name: varchar('name'),
  bio: text('bio'),
  count: integer('count'),
  active: boolean('active'),
  createdAt: timestamp('created_at'),
  metadata: json('metadata'),
  externalId: uuid('external_id'),
  bigNumber: bigint('big_number'),
  rating: real('rating'),
  precise: doublePrecision('precise'),
  birthday: date('birthday'),
  startTime: time('start_time'),
  price: numeric('price')
});`);

        const result = parseDrizzleSchema('/test/project');
        const data = JSON.parse(result.content[0].text);
        const table = data.tables[0];

        const columnTypes = table.columns.map((c: { type: string }) => c.type);
        expect(columnTypes).toContain('serial');
        expect(columnTypes).toContain('varchar');
        expect(columnTypes).toContain('text');
        expect(columnTypes).toContain('integer');
        expect(columnTypes).toContain('boolean');
        expect(columnTypes).toContain('timestamp');
        expect(columnTypes).toContain('json');
        expect(columnTypes).toContain('uuid');
        expect(columnTypes).toContain('bigint');
        expect(columnTypes).toContain('real');
        expect(columnTypes).toContain('doublePrecision');
        expect(columnTypes).toContain('date');
        expect(columnTypes).toContain('time');
        expect(columnTypes).toContain('numeric');
      });
    });
  });

  describe('prisma-parser.ts', () => {
    describe('isArray branch coverage (line 39)', () => {
      it('should detect one-to-many relation with array syntax', () => {
        vi.mocked(fs.existsSync).mockReturnValue(true);
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

        const result = parsePrismaSchema('/test/project');
        const data = JSON.parse(result.content[0].text);
        const userTable = data.tables.find((t: { name: string }) => t.name === 'User');
        const postTable = data.tables.find((t: { name: string }) => t.name === 'Post');

        // User.posts should be one-to-many (has [])
        expect(userTable.relations.some((r: { field: string; type: string }) =>
          r.field === 'posts' && r.type === 'one-to-many'
        )).toBe(true);

        // Post.author should be many-to-one (no [])
        expect(postTable.relations.some((r: { field: string; type: string }) =>
          r.field === 'author' && r.type === 'many-to-one'
        )).toBe(true);
      });

      it('should handle optional relation without array', () => {
        vi.mocked(fs.existsSync).mockReturnValue(true);
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

        const result = parsePrismaSchema('/test/project');
        const data = JSON.parse(result.content[0].text);
        const userTable = data.tables.find((t: { name: string }) => t.name === 'User');

        // User.profile should be many-to-one (optional but not array)
        expect(userTable.relations.some((r: { field: string; type: string }) =>
          r.field === 'profile' && r.type === 'many-to-one'
        )).toBe(true);
      });

      it('should correctly identify all Prisma scalar types', () => {
        vi.mocked(fs.existsSync).mockReturnValue(true);
        vi.mocked(fs.readFileSync).mockReturnValue(`
model AllScalars {
  id        String   @id
  str       String
  int       Int
  float     Float
  bool      Boolean
  dateTime  DateTime
  jsonData  Json
  bytesData Bytes
  bigInt    BigInt
  decimal   Decimal
}
`);

        const result = parsePrismaSchema('/test/project');
        const data = JSON.parse(result.content[0].text);
        const table = data.tables[0];

        // All should be columns, not relations
        expect(table.columns).toHaveLength(10);
        expect(table.relations).toHaveLength(0);

        const columnTypes = table.columns.map((c: { type: string }) => c.type);
        expect(columnTypes).toContain('String');
        expect(columnTypes).toContain('Int');
        expect(columnTypes).toContain('Float');
        expect(columnTypes).toContain('Boolean');
        expect(columnTypes).toContain('DateTime');
        expect(columnTypes).toContain('Json');
        expect(columnTypes).toContain('Bytes');
        expect(columnTypes).toContain('BigInt');
        expect(columnTypes).toContain('Decimal');
      });

      it('should skip comment lines', () => {
        vi.mocked(fs.existsSync).mockReturnValue(true);
        vi.mocked(fs.readFileSync).mockReturnValue(`
model User {
  // This is a comment
  id   String @id
  // Another comment
  name String
}
`);

        const result = parsePrismaSchema('/test/project');
        const data = JSON.parse(result.content[0].text);
        const table = data.tables[0];

        expect(table.columns).toHaveLength(2);
        expect(table.columns.every((c: { name: string }) => !c.name.startsWith('//'))).toBe(true);
      });

      it('should skip @@unique and @@index directives in field parsing', () => {
        vi.mocked(fs.existsSync).mockReturnValue(true);
        vi.mocked(fs.readFileSync).mockReturnValue(`
model User {
  id        String @id
  email     String
  username  String

  @@unique([email])
  @@index([username])
}
`);

        const result = parsePrismaSchema('/test/project');
        const data = JSON.parse(result.content[0].text);
        const table = data.tables[0];

        // Should only have 3 columns, not treat @@ lines as fields
        expect(table.columns).toHaveLength(3);
        // Should have indexes parsed
        expect(table.indexes.length).toBeGreaterThan(0);
      });

      it('should skip lines that do not match field regex (line 39 else branch)', () => {
        vi.mocked(fs.existsSync).mockReturnValue(true);
        // Include lines that won't match the field regex: empty lines,
        // lines with just spaces, relation directives without proper format
        vi.mocked(fs.readFileSync).mockReturnValue(`
model User {
  id    String @id

  email String
  @relation(fields: [authorId], references: [id])
  name  String?
}
`);

        const result = parsePrismaSchema('/test/project');
        const data = JSON.parse(result.content[0].text);
        const table = data.tables[0];

        // Should have parsed id, email, and name, skipping empty and @relation lines
        expect(table.columns).toHaveLength(3);
        expect(table.columns.map((c: { name: string }) => c.name)).toEqual(['id', 'email', 'name']);
      });

      it('should parse default values correctly', () => {
        vi.mocked(fs.existsSync).mockReturnValue(true);
        // The regex @default\(([^)]+)\) captures until first )
        // So @default(cuid()) captures "cuid(" and @default(now()) captures "now("
        // Simple defaults like false, 0, "string" work correctly
        vi.mocked(fs.readFileSync).mockReturnValue(`
model Post {
  id        String   @id @default(uuid)
  published Boolean  @default(false)
  views     Int      @default(0)
  title     String   @default("untitled")
}
`);

        const result = parsePrismaSchema('/test/project');
        const data = JSON.parse(result.content[0].text);
        const table = data.tables[0];

        const idCol = table.columns.find((c: { name: string }) => c.name === 'id');
        const publishedCol = table.columns.find((c: { name: string }) => c.name === 'published');
        const viewsCol = table.columns.find((c: { name: string }) => c.name === 'views');
        const titleCol = table.columns.find((c: { name: string }) => c.name === 'title');

        expect(idCol.default).toBe('uuid');
        expect(publishedCol.default).toBe('false');
        expect(viewsCol.default).toBe('0');
        expect(titleCol.default).toBe('"untitled"');
      });
    });

    describe('edge cases', () => {
      it('should handle empty model body', () => {
        vi.mocked(fs.existsSync).mockReturnValue(true);
        vi.mocked(fs.readFileSync).mockReturnValue(`
model Empty {
}
`);

        const result = parsePrismaSchema('/test/project');
        const data = JSON.parse(result.content[0].text);

        expect(data.tables).toHaveLength(1);
        expect(data.tables[0].columns).toHaveLength(0);
        expect(data.tables[0].relations).toHaveLength(0);
      });

      it('should handle model with only relations', () => {
        vi.mocked(fs.existsSync).mockReturnValue(true);
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

        const result = parsePrismaSchema('/test/project');
        const data = JSON.parse(result.content[0].text);
        const userPostTable = data.tables.find((t: { name: string }) => t.name === 'UserPost');

        expect(userPostTable.columns).toHaveLength(0);
        expect(userPostTable.relations).toHaveLength(2);
      });
    });
  });
});
