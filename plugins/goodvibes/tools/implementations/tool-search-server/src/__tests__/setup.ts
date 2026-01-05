/**
 * Test setup file
 *
 * This file contains shared test fixtures, mocks, and setup logic
 * used across all test files.
 */

import { vi, beforeEach, afterEach } from 'vitest';

/** Test constant for password values in fixtures to avoid hardcoding secrets */
export const TEST_PASSWORD = 'test-password-placeholder';
import * as fs from 'fs';
import * as path from 'path';

// Store original implementations
const originalFs = { ...fs };
const originalPath = { ...path };

/**
 * Mock file system data for testing
 */
export const mockFileSystem: Map<string, string | Buffer> = new Map();

/**
 * Mock directory structure (path -> list of entries)
 */
export const mockDirectories: Map<string, string[]> = new Map();

/**
 * Reset all mocks between tests
 */
export function resetMocks(): void {
  mockFileSystem.clear();
  mockDirectories.clear();
  vi.clearAllMocks();
}

/**
 * Add a mock file to the file system
 */
export function mockFile(filePath: string, content: string): void {
  mockFileSystem.set(path.normalize(filePath), content);
}

/**
 * Add a mock directory with entries
 */
export function mockDirectory(dirPath: string, entries: string[]): void {
  mockDirectories.set(path.normalize(dirPath), entries);
}

/**
 * Create a mock fs module for testing
 */
export function createMockFs() {
  return {
    existsSync: vi.fn((p: string) => {
      const normalized = path.normalize(p);
      return mockFileSystem.has(normalized) || mockDirectories.has(normalized);
    }),
    readFileSync: vi.fn((p: string, encoding?: string) => {
      const normalized = path.normalize(p);
      const content = mockFileSystem.get(normalized);
      if (content === undefined) {
        throw new Error(`ENOENT: no such file or directory, open '${p}'`);
      }
      return content;
    }),
    writeFileSync: vi.fn((p: string, content: string) => {
      mockFileSystem.set(path.normalize(p), content);
    }),
    readdirSync: vi.fn((p: string, options?: { withFileTypes?: boolean }) => {
      const normalized = path.normalize(p);
      const entries = mockDirectories.get(normalized);
      if (!entries) {
        throw new Error(`ENOENT: no such file or directory, scandir '${p}'`);
      }
      if (options?.withFileTypes) {
        return entries.map(name => ({
          name,
          isDirectory: () => mockDirectories.has(path.join(normalized, name)),
          isFile: () => mockFileSystem.has(path.join(normalized, name)),
        }));
      }
      return entries;
    }),
    mkdirSync: vi.fn((p: string, options?: { recursive?: boolean }) => {
      mockDirectories.set(path.normalize(p), []);
    }),
    statSync: vi.fn((p: string) => {
      const normalized = path.normalize(p);
      if (mockFileSystem.has(normalized)) {
        return { isDirectory: () => false, isFile: () => true };
      }
      if (mockDirectories.has(normalized)) {
        return { isDirectory: () => true, isFile: () => false };
      }
      throw new Error(`ENOENT: no such file or directory, stat '${p}'`);
    }),
  };
}

/**
 * Sample registry data for testing
 */
export const sampleSkillsRegistry = {
  version: '1.0.0',
  search_index: [
    {
      name: 'React Testing',
      path: 'testing/react-testing',
      description: 'Testing React components with vitest and testing-library',
      keywords: ['react', 'testing', 'vitest', 'testing-library'],
      category: 'testing',
    },
    {
      name: 'Prisma ORM',
      path: 'databases/prisma',
      description: 'Database access with Prisma ORM',
      keywords: ['prisma', 'database', 'orm', 'sql'],
      category: 'databases',
    },
    {
      name: 'Next.js App Router',
      path: 'frameworks/nextjs-app-router',
      description: 'Building apps with Next.js App Router',
      keywords: ['nextjs', 'react', 'ssr', 'app-router'],
      category: 'frameworks',
    },
    {
      name: 'Tailwind CSS',
      path: 'styling/tailwind',
      description: 'Utility-first CSS with Tailwind',
      keywords: ['tailwind', 'css', 'styling'],
      category: 'styling',
    },
    {
      name: 'Zustand State',
      path: 'state/zustand',
      description: 'State management with Zustand',
      keywords: ['zustand', 'state', 'react'],
      category: 'state',
    },
  ],
};

export const sampleAgentsRegistry = {
  version: '1.0.0',
  search_index: [
    {
      name: 'Code Reviewer',
      path: 'code-reviewer',
      description: 'Reviews code for best practices',
      keywords: ['review', 'code', 'best-practices'],
    },
    {
      name: 'Test Engineer',
      path: 'test-engineer',
      description: 'Writes comprehensive tests',
      keywords: ['testing', 'quality', 'coverage'],
    },
  ],
};

export const sampleToolsRegistry = {
  version: '1.0.0',
  search_index: [
    {
      name: 'search_skills',
      path: 'search/skills',
      description: 'Search for skills in the registry',
      keywords: ['search', 'skills', 'find'],
    },
    {
      name: 'detect_stack',
      path: 'context/detect-stack',
      description: 'Detect technology stack',
      keywords: ['stack', 'detect', 'technologies'],
    },
  ],
};

/**
 * Sample package.json for testing
 */
export const samplePackageJson = {
  name: 'test-project',
  version: '1.0.0',
  dependencies: {
    next: '^14.0.0',
    react: '^18.2.0',
    'react-dom': '^18.2.0',
    '@prisma/client': '^5.0.0',
    tailwindcss: '^3.3.0',
    zustand: '^4.4.0',
  },
  devDependencies: {
    typescript: '^5.0.0',
    vitest: '^1.0.0',
    '@types/react': '^18.2.0',
    '@types/node': '^20.0.0',
  },
};

/**
 * Sample Prisma schema for testing
 */
export const samplePrismaSchema = `
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

model User {
  id        String   @id @default(cuid())
  email     String   @unique
  name      String?
  posts     Post[]
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@index([email])
}

model Post {
  id        String   @id @default(cuid())
  title     String
  content   String?
  published Boolean  @default(false)
  author    User     @relation(fields: [authorId], references: [id])
  authorId  String
  createdAt DateTime @default(now())

  @@index([authorId])
}
`;

/**
 * Sample TypeScript file with issues for validation testing
 */
export const sampleTypeScriptWithIssues = `
import React from 'react';

// TODO: Fix this later
const password = "${TEST_PASSWORD}";

export function MyComponent() {
  const data: any = {};

  // @ts-ignore
  const value = data.something;

  if (Math.random() > 0.5) {
    const result = useEffect(() => {}, []);
  }

  async function fetchData() {
    const response = await fetch('/api/data');
    return response.json();
  }

  return <div dangerouslySetInnerHTML={{ __html: data.html }} />;
}

export function processQuery(input: string) {
  const result = query(\`SELECT * FROM users WHERE id = \${input}\`);
  return result;
}

const SCREAMING_CONSTANT = new Date();
`;

/**
 * Sample clean TypeScript file for validation testing
 */
export const sampleCleanTypeScript = `
import React, { useState, useEffect } from 'react';

interface User {
  id: string;
  name: string;
  email: string;
}

export function UserList(): React.ReactElement {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    async function loadUsers(): Promise<void> {
      try {
        const response = await fetch('/api/users');
        if (!response.ok) {
          throw new Error('Failed to fetch users');
        }
        const data = await response.json();
        setUsers(data);
      } catch (err) {
        setError(err instanceof Error ? err : new Error('Unknown error'));
      } finally {
        setLoading(false);
      }
    }

    loadUsers();
  }, []);

  if (loading) {
    return <div>Loading...</div>;
  }

  if (error) {
    return <div>Error: {error.message}</div>;
  }

  return (
    <ul>
      {users.map(user => (
        <li key={user.id}>{user.name}</li>
      ))}
    </ul>
  );
}
`;

/**
 * Sample SQL schema for testing
 */
export const sampleSqlSchema = `
CREATE TABLE users (
  id INTEGER PRIMARY KEY AUTO_INCREMENT,
  email VARCHAR(255) NOT NULL UNIQUE,
  name VARCHAR(100),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(email)
);

CREATE TABLE posts (
  id INTEGER PRIMARY KEY AUTO_INCREMENT,
  title VARCHAR(255) NOT NULL,
  content TEXT,
  published BOOLEAN DEFAULT FALSE,
  author_id INTEGER NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (author_id) REFERENCES users(id)
);
`;

/**
 * Sample Drizzle schema for testing
 */
export const sampleDrizzleSchema = `
import { pgTable, varchar, text, boolean, timestamp, serial } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';

export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  email: varchar('email', { length: 255 }).notNull().unique(),
  name: varchar('name', { length: 100 }),
  createdAt: timestamp('created_at').defaultNow(),
});

export const posts = pgTable('posts', {
  id: serial('id').primaryKey(),
  title: varchar('title', { length: 255 }).notNull(),
  content: text('content'),
  published: boolean('published').default(false),
  authorId: integer('author_id').references(() => users.id),
});

export const usersRelations = relations(users, ({ many }) => ({
  posts: many(posts),
}));

export const postsRelations = relations(posts, ({ one }) => ({
  author: one(users, {
    fields: [posts.authorId],
    references: [users.id],
  }),
}));
`;

/**
 * Sample skill content for testing
 */
export const sampleSkillContent = `---
name: React Testing
category: testing
technologies:
  - react
  - vitest
  - testing-library
requires:
  - react-basics
complements:
  - jest-advanced
  - cypress-e2e
difficulty: intermediate
---

# React Testing

Learn how to test React components effectively.

## Prerequisites

- Basic React knowledge
- Understanding of JavaScript testing

## Required imports:

- @testing-library/react
- vitest

## Examples

\`\`\`typescript
import { render, screen } from '@testing-library/react';
import { expect, test } from 'vitest';

test('renders component', () => {
  render(<MyComponent />);
  expect(screen.getByText('Hello')).toBeInTheDocument();
});
\`\`\`

## Avoid:

- Testing implementation details
- Snapshot overuse
`;

/**
 * Sample hooks.json for testing
 */
export const sampleHooksJson = {
  hooks: {
    SessionStart: { script: 'session-start.js' },
    PreToolUse: { script: 'pre-tool-use.js' },
    PostToolUse: { script: 'post-tool-use.js' },
  },
};

/**
 * Sample plugin manifest for testing
 */
export const samplePluginManifest = {
  name: 'goodvibes',
  version: '1.0.0',
  description: 'GoodVibes Plugin',
  author: 'Test Author',
};

/**
 * Sample template registry for testing
 */
export const sampleTemplateRegistry = {
  templates: [
    {
      name: 'next-app',
      path: 'minimal/next-app',
      description: 'Minimal Next.js application',
      category: 'minimal',
      stack: ['next', 'react', 'typescript'],
      complexity: 'beginner',
    },
    {
      name: 'next-saas',
      path: 'full/next-saas',
      description: 'Full-featured SaaS template',
      category: 'full',
      stack: ['next', 'prisma', 'tailwind', 'auth'],
      complexity: 'advanced',
    },
  ],
};

/**
 * Sample template config for testing
 */
export const sampleTemplateConfig = {
  name: 'next-app',
  required_skills: ['nextjs-basics', 'react-fundamentals'],
  variables: [
    { name: 'projectName', default: 'my-app' },
    { name: 'author', default: 'Developer' },
  ],
  post_create: [
    { command: 'npm install', description: 'Install dependencies' },
  ],
};
