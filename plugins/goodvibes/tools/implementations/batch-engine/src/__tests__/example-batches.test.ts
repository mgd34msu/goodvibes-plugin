/**
 * Unit tests for Appendix B: Example Batches
 * Tests real-world batch scenarios to validate SPEC-v2 structure
 * @see SPEC-v2 Appendix B
 */

import { describe, it, expect } from 'vitest';
import type { Batch, BatchConfig } from '../interfaces/batch.js';
import type { ReadOperation } from '../interfaces/operations/read.js';
import type { WriteOperation } from '../interfaces/operations/write.js';
import type { ExecOperation, QueryOperation } from '../interfaces/operations/exec.js';

describe('Appendix B: Example Batches - SPEC-v2', () => {
  describe('B.1 Feature Implementation Example', () => {
    it('creates auth feature batch with READ, WRITE, EXEC, and validation phases', () => {
      const batch: Batch = {
        id: 'feature-auth-001',
        operations: {
          // Phase 1: READ - Analyze existing auth patterns
          read: [
            {
              type: 'files',
              id: 'read-existing-auth',
              targets: [
                'src/auth/**/*.ts',
                'src/middleware/auth.ts',
                'src/types/user.ts',
              ],
              extract: 'symbols',
              options: {
                symbol_filter: ['function', 'interface', 'type'],
              },
            },
            {
              type: 'search',
              id: 'find-auth-usage',
              pattern: 'useAuth|getSession|withAuth',
              mode: 'regex',
              glob: 'src/**/*.{ts,tsx}',
              options: {
                case_sensitive: true,
              },
            },
            {
              type: 'analyze',
              id: 'analyze-dependencies',
              kind: 'dependencies',
              target: 'src/auth',
            },
          ],

          // Phase 2: WRITE - Create auth components
          write: [
            {
              type: 'create',
              id: 'create-auth-provider',
              files: [
                {
                  path: 'src/auth/AuthProvider.tsx',
                  content: `import { createContext, useContext, useState, ReactNode } from 'react';

export interface AuthContextType {
  user: User | null;
  login: (credentials: Credentials) => Promise<void>;
  logout: () => Promise<void>;
  isAuthenticated: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);

  const login = async (credentials: Credentials) => {
    // Implementation
  };

  const logout = async () => {
    // Implementation
  };

  return (
    <AuthContext.Provider value={{ user, login, logout, isAuthenticated: !!user }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
}`,
                },
                {
                  path: 'src/auth/types.ts',
                  content: `export interface User {
  id: string;
  email: string;
  name: string;
  role: 'admin' | 'user';
}

export interface Credentials {
  email: string;
  password: string;
}`,
                },
              ],
              options: {
                create_dirs: true,
                overwrite: false,
              },
              depends_on: ['read-existing-auth'],
            },
            {
              type: 'create',
              id: 'create-auth-tests',
              files: [
                {
                  path: 'src/auth/__tests__/AuthProvider.test.tsx',
                  content: `import { describe, it, expect } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AuthProvider, useAuth } from '../AuthProvider';

describe('AuthProvider', () => {
  it('provides auth context', () => {
    function TestComponent() {
      const { isAuthenticated } = useAuth();
      return <div>{isAuthenticated ? 'Authenticated' : 'Not authenticated'}</div>;
    }

    render(
      <AuthProvider>
        <TestComponent />
      </AuthProvider>
    );

    expect(screen.getByText('Not authenticated')).toBeInTheDocument();
  });

  it('handles login flow', async () => {
    // Test implementation
  });

  it('handles logout flow', async () => {
    // Test implementation
  });
});`,
                },
              ],
              options: {
                create_dirs: true,
              },
              depends_on: ['create-auth-provider'],
            },
            {
              type: 'edit',
              id: 'update-app-root',
              edits: [
                {
                  file: 'src/App.tsx',
                  edits: [
                    {
                      find: 'export default function App() {',
                      replace: `import { AuthProvider } from './auth/AuthProvider';

export default function App() {`,
                      occurrence: 'first',
                    },
                    {
                      find: 'return (',
                      replace: `return (
    <AuthProvider>`,
                      occurrence: 'first',
                    },
                    {
                      find: '  );',
                      replace: `    </AuthProvider>
  );`,
                      occurrence: 'last',
                    },
                  ],
                },
              ],
              options: {
                match_mode: 'exact',
                create_if_missing: false,
              },
              depends_on: ['create-auth-provider'],
            },
          ],

          // Phase 3: EXEC - Run tests
          exec: [
            {
              type: 'command',
              id: 'run-auth-tests',
              commands: [
                {
                  cmd: 'npm test -- src/auth --run',
                  timeout_ms: 60000,
                  expect: {
                    exit_code: 0,
                    stdout_contains: 'PASS',
                  },
                },
              ],
              depends_on: ['create-auth-tests'],
            },
          ],

          // Phase 4: QUERY - Validate typecheck and lint
          query: [
            {
              type: 'validate',
              id: 'validate-auth-implementation',
              validations: [
                {
                  checks: [
                    { kind: 'typecheck' },
                    { kind: 'lint' },
                  ],
                  options: {
                    paths: ['src/auth/**/*'],
                  },
                },
              ],
              depends_on: ['create-auth-provider', 'create-auth-tests', 'update-app-root'],
            },
          ],
        },
        config: {
          transaction: {
            mode: 'atomic',
            isolation: 'strict',
            timeout_ms: 300000,
          },
          execution: {
            mode: 'sequential',
            max_workers: 1,
            fail_fast: true,
            retry: {
              attempts: 2,
              backoff: 'exponential',
              delay_ms: 1000,
            },
          },
          preview: {
            dry_run: false,
            diff: true,
            impact: true,
          },
          validation: {
            before: ['typecheck'],
            after: ['typecheck', 'lint', 'test'],
            on_fail: 'rollback',
          },
          recovery: {
            checkpoint: true,
            rollback_on_fail: true,
            cleanup_on_success: false,
          },
        },
        lifecycle: {},
        output: {
          mode: 'full',
          include: ['results', 'validation', 'execution_graph'],
          exclude: ['debug'],
        },
      };

      // Validate batch structure
      expect(batch.id).toBe('feature-auth-001');
      expect(batch.operations.read).toHaveLength(3);
      expect(batch.operations.write).toHaveLength(3);
      expect(batch.operations.exec).toHaveLength(1);
      expect(batch.operations.query).toHaveLength(1);

      // Validate READ operations
      const readOps = batch.operations.read!;
      expect(readOps[0].type).toBe('files');
      expect(readOps[0].id).toBe('read-existing-auth');
      expect(readOps[1].type).toBe('search');
      expect(readOps[2].type).toBe('analyze');

      // Validate WRITE operations
      const writeOps = batch.operations.write!;
      expect(writeOps[0].type).toBe('create');
      expect(writeOps[0].id).toBe('create-auth-provider');
      expect(writeOps[0].files).toHaveLength(2);
      expect(writeOps[1].type).toBe('create');
      expect(writeOps[1].id).toBe('create-auth-tests');
      expect(writeOps[2].type).toBe('edit');
      expect(writeOps[2].id).toBe('update-app-root');

      // Validate EXEC operations
      const execOps = batch.operations.exec!;
      expect(execOps[0].type).toBe('command');
      expect(execOps[0].commands[0].cmd).toContain('npm test');

      // Validate QUERY operations
      const queryOps = batch.operations.query!;
      expect(queryOps[0].type).toBe('validate');
      expect(queryOps[0].validations[0].checks).toHaveLength(2);
      expect(queryOps[0].validations[0].checks[0].kind).toBe('typecheck');
      expect(queryOps[0].validations[0].checks[1].kind).toBe('lint');

      // Validate dependencies
      expect(writeOps[0].depends_on).toEqual(['read-existing-auth']);
      expect(writeOps[1].depends_on).toEqual(['create-auth-provider']);
      expect(writeOps[2].depends_on).toEqual(['create-auth-provider']);
      expect(execOps[0].depends_on).toEqual(['create-auth-tests']);
      expect(queryOps[0].depends_on).toEqual([
        'create-auth-provider',
        'create-auth-tests',
        'update-app-root',
      ]);

      // Validate configuration
      expect(batch.config.transaction.mode).toBe('atomic');
      expect(batch.config.validation.before).toContain('typecheck');
      expect(batch.config.validation.after).toContain('test');
      expect(batch.config.recovery.rollback_on_fail).toBe(true);
    });

    it('validates execution order with dependency graph', () => {
      const batch: Batch = {
        id: 'auth-feature',
        operations: {
          read: [
            { type: 'files', id: 'r1', targets: ['src/auth'], extract: 'content' } as ReadOperation,
          ],
          write: [
            {
              type: 'create',
              id: 'w1',
              files: [{ path: 'new.ts', content: '' }],
              depends_on: ['r1'],
            } as WriteOperation,
          ],
          exec: [
            {
              type: 'command',
              id: 'e1',
              commands: [{ cmd: 'npm test' }],
              depends_on: ['w1'],
            } as ExecOperation,
          ],
        },
        config: createDefaultBatchConfig(),
        lifecycle: {},
        output: { mode: 'minimal', include: [], exclude: [] },
      };

      // Verify dependency chain: r1 -> w1 -> e1
      expect(batch.operations.write![0].depends_on).toContain('r1');
      expect(batch.operations.exec![0].depends_on).toContain('w1');
    });
  });

  describe('B.2 Codebase Refactor Example', () => {
    it('creates repository pattern refactor batch with READ, WRITE, and validation', () => {
      const batch: Batch = {
        id: 'refactor-repository-pattern-001',
        operations: {
          // Phase 1: READ - Find affected files
          read: [
            {
              type: 'glob',
              id: 'find-data-access-files',
              patterns: ['src/data/**/*.ts', 'src/services/**/*.ts'],
              exclude: ['**/*.test.ts', '**/*.spec.ts'],
              options: {
                respect_gitignore: true,
              },
            },
            {
              type: 'search',
              id: 'find-direct-db-access',
              pattern: 'prisma\\.|db\\.|database\\.',
              mode: 'regex',
              glob: 'src/**/*.ts',
              options: {
                case_sensitive: false,
              },
            },
            {
              type: 'symbols',
              id: 'find-repository-interfaces',
              query: 'Repository',
              kinds: ['interface', 'class'],
              scope: 'src/**/*.ts',
            },
          ],

          // Phase 2: WRITE - Apply refactoring edits
          write: [
            {
              type: 'create',
              id: 'create-base-repository',
              files: [
                {
                  path: 'src/repositories/BaseRepository.ts',
                  content: `export interface BaseRepository<T> {
  findById(id: string): Promise<T | null>;
  findAll(): Promise<T[]>;
  create(data: Partial<T>): Promise<T>;
  update(id: string, data: Partial<T>): Promise<T>;
  delete(id: string): Promise<boolean>;
}

export abstract class AbstractRepository<T> implements BaseRepository<T> {
  abstract findById(id: string): Promise<T | null>;
  abstract findAll(): Promise<T[]>;
  abstract create(data: Partial<T>): Promise<T>;
  abstract update(id: string, data: Partial<T>): Promise<T>;
  abstract delete(id: string): Promise<boolean>;
}`,
                },
                {
                  path: 'src/repositories/UserRepository.ts',
                  content: `import { AbstractRepository } from './BaseRepository';
import { User } from '../types/user';
import { prisma } from '../lib/prisma';

export class UserRepository extends AbstractRepository<User> {
  async findById(id: string): Promise<User | null> {
    return prisma.user.findUnique({ where: { id } });
  }

  async findAll(): Promise<User[]> {
    return prisma.user.findMany();
  }

  async create(data: Partial<User>): Promise<User> {
    return prisma.user.create({ data });
  }

  async update(id: string, data: Partial<User>): Promise<User> {
    return prisma.user.update({ where: { id }, data });
  }

  async delete(id: string): Promise<boolean> {
    await prisma.user.delete({ where: { id } });
    return true;
  }

  async findByEmail(email: string): Promise<User | null> {
    return prisma.user.findUnique({ where: { email } });
  }
}`,
                },
              ],
              options: {
                create_dirs: true,
              },
              depends_on: ['find-data-access-files'],
            },
            {
              type: 'edit',
              id: 'refactor-user-service',
              edits: [
                {
                  file: 'src/services/UserService.ts',
                  edits: [
                    {
                      find: 'import { prisma } from \'../lib/prisma\';',
                      replace: 'import { UserRepository } from \'../repositories/UserRepository\';',
                      occurrence: 'first',
                    },
                    {
                      find: 'export class UserService {',
                      replace: `export class UserService {
  private repository = new UserRepository();`,
                      occurrence: 'first',
                    },
                    {
                      find: 'prisma.user.findUnique',
                      replace: 'this.repository.findById',
                      occurrence: 'all',
                    },
                    {
                      find: 'prisma.user.findMany',
                      replace: 'this.repository.findAll',
                      occurrence: 'all',
                    },
                    {
                      find: 'prisma.user.create',
                      replace: 'this.repository.create',
                      occurrence: 'all',
                    },
                  ],
                },
              ],
              options: {
                match_mode: 'exact',
              },
              depends_on: ['create-base-repository', 'find-direct-db-access'],
            },
          ],

          // Phase 3: QUERY - Validate no breaking changes
          query: [
            {
              type: 'validate',
              id: 'validate-refactoring',
              validations: [
                {
                  checks: [
                    { kind: 'typecheck' },
                    { kind: 'lint' },
                    { kind: 'test' },
                  ],
                  options: {
                    paths: ['src/repositories', 'src/services'],
                  },
                },
              ],
              depends_on: ['create-base-repository', 'refactor-user-service'],
            },
            {
              type: 'diagnose',
              id: 'check-breaking-changes',
              diagnoses: [
                {
                  kind: 'error_stack',
                  subject: 'Refactoring validation',
                  context: {
                    scope: 'src/services',
                  },
                },
              ],
              depends_on: ['validate-refactoring'],
            },
          ],
        },
        config: {
          transaction: {
            mode: 'atomic',
            isolation: 'strict',
            timeout_ms: 180000,
          },
          execution: {
            mode: 'sequential',
            max_workers: 1,
            fail_fast: true,
            retry: {
              attempts: 1,
              backoff: 'fixed',
              delay_ms: 500,
            },
          },
          preview: {
            dry_run: false,
            diff: true,
            impact: true,
          },
          validation: {
            before: ['typecheck'],
            after: ['typecheck', 'lint', 'test'],
            on_fail: 'rollback',
          },
          recovery: {
            checkpoint: true,
            rollback_on_fail: true,
            cleanup_on_success: false,
          },
        },
        lifecycle: {},
        output: {
          mode: 'summary',
          include: ['results', 'validation'],
          exclude: ['debug', 'stack_traces'],
        },
      };

      // Validate batch structure
      expect(batch.id).toBe('refactor-repository-pattern-001');
      expect(batch.operations.read).toHaveLength(3);
      expect(batch.operations.write).toHaveLength(2);
      expect(batch.operations.query).toHaveLength(2);

      // Validate READ operations
      const readOps = batch.operations.read!;
      expect(readOps[0].type).toBe('glob');
      expect(readOps[1].type).toBe('search');
      expect(readOps[2].type).toBe('symbols');

      // Validate WRITE operations
      const writeOps = batch.operations.write!;
      expect(writeOps[0].type).toBe('create');
      expect(writeOps[0].files).toHaveLength(2);
      expect(writeOps[1].type).toBe('edit');
      expect(writeOps[1].edits[0].edits).toHaveLength(5);

      // Validate QUERY operations for breaking changes
      const queryOps = batch.operations.query!;
      expect(queryOps[0].type).toBe('validate');
      expect(queryOps[1].type).toBe('diagnose');

      // Validate dependencies
      expect(writeOps[0].depends_on).toEqual(['find-data-access-files']);
      expect(writeOps[1].depends_on).toEqual(['create-base-repository', 'find-direct-db-access']);
      expect(queryOps[0].depends_on).toEqual(['create-base-repository', 'refactor-user-service']);
      expect(queryOps[1].depends_on).toEqual(['validate-refactoring']);

      // Validate rollback configuration
      expect(batch.config.recovery.rollback_on_fail).toBe(true);
      expect(batch.config.validation.on_fail).toBe('rollback');
    });

    it('validates no breaking changes through validation', () => {
      const batch: Batch = {
        id: 'refactor-check',
        operations: {
          write: [
            {
              type: 'edit',
              id: 'refactor',
              edits: [{ file: 'src/file.ts', edits: [] }],
            } as WriteOperation,
          ],
          query: [
            {
              type: 'validate',
              id: 'check',
              validations: [
                {
                  checks: [{ kind: 'typecheck' }, { kind: 'test' }],
                },
              ],
              depends_on: ['refactor'],
            } as QueryOperation,
          ],
        },
        config: createDefaultBatchConfig(),
        lifecycle: {},
        output: { mode: 'minimal', include: [], exclude: [] },
      };

      expect(batch.operations.query![0].validations[0].checks).toHaveLength(2);
      expect(batch.operations.query![0].validations[0].checks[0].kind).toBe('typecheck');
      expect(batch.operations.query![0].validations[0].checks[1].kind).toBe('test');
    });
  });

  describe('B.3 Quick Multi-Edit Example', () => {
    it('creates rename batch with READ, WRITE, and validation', () => {
      const batch: Batch = {
        id: 'rename-get-cwd-001',
        operations: {
          // Phase 1: READ - Find all occurrences
          read: [
            {
              type: 'search',
              id: 'find-getcwd-usage',
              pattern: 'getCwd',
              mode: 'regex',
              glob: 'src/**/*.{ts,tsx}',
              context: {
                before: 2,
                after: 2,
              },
              options: {
                case_sensitive: true,
                whole_word: true,
              },
            },
            {
              type: 'symbols',
              id: 'find-getcwd-definition',
              query: 'getCwd',
              kinds: ['function'],
              scope: 'src/**/*.ts',
            },
          ],

          // Phase 2: WRITE - Apply rename edits
          write: [
            {
              type: 'edit',
              id: 'rename-function-definition',
              edits: [
                {
                  file: 'src/utils/path.ts',
                  edits: [
                    {
                      find: 'export function getCwd',
                      replace: 'export function getCurrentWorkingDirectory',
                      occurrence: 'all',
                    },
                    {
                      find: 'function getCwd',
                      replace: 'function getCurrentWorkingDirectory',
                      occurrence: 'all',
                    },
                  ],
                },
              ],
              options: {
                match_mode: 'exact',
              },
              depends_on: ['find-getcwd-definition'],
            },
            {
              type: 'edit',
              id: 'rename-imports',
              edits: [
                {
                  file: 'src/services/FileService.ts',
                  edits: [
                    {
                      find: 'import { getCwd }',
                      replace: 'import { getCurrentWorkingDirectory }',
                      occurrence: 'all',
                    },
                    {
                      find: 'getCwd()',
                      replace: 'getCurrentWorkingDirectory()',
                      occurrence: 'all',
                    },
                  ],
                },
                {
                  file: 'src/commands/init.ts',
                  edits: [
                    {
                      find: 'import { getCwd }',
                      replace: 'import { getCurrentWorkingDirectory }',
                      occurrence: 'all',
                    },
                    {
                      find: 'getCwd()',
                      replace: 'getCurrentWorkingDirectory()',
                      occurrence: 'all',
                    },
                  ],
                },
                {
                  file: 'src/lib/workspace.ts',
                  edits: [
                    {
                      find: 'getCwd()',
                      replace: 'getCurrentWorkingDirectory()',
                      occurrence: 'all',
                    },
                  ],
                },
              ],
              options: {
                match_mode: 'exact',
              },
              depends_on: ['find-getcwd-usage'],
            },
            {
              type: 'edit',
              id: 'update-tests',
              edits: [
                {
                  file: 'src/utils/__tests__/path.test.ts',
                  edits: [
                    {
                      find: 'import { getCwd }',
                      replace: 'import { getCurrentWorkingDirectory }',
                      occurrence: 'all',
                    },
                    {
                      find: 'getCwd()',
                      replace: 'getCurrentWorkingDirectory()',
                      occurrence: 'all',
                    },
                    {
                      find: "describe('getCwd'",
                      replace: "describe('getCurrentWorkingDirectory'",
                      occurrence: 'all',
                    },
                  ],
                },
              ],
              options: {
                match_mode: 'exact',
              },
              depends_on: ['find-getcwd-usage'],
            },
          ],

          // Phase 3: QUERY - Validate references updated
          query: [
            {
              type: 'validate',
              id: 'validate-rename',
              validations: [
                {
                  checks: [
                    { kind: 'typecheck' },
                    { kind: 'lint' },
                  ],
                },
              ],
              depends_on: ['rename-function-definition', 'rename-imports', 'update-tests'],
            },
          ],
        },
        config: {
          transaction: {
            mode: 'atomic',
            isolation: 'strict',
            timeout_ms: 60000,
          },
          execution: {
            mode: 'parallel',
            max_workers: 3,
            fail_fast: true,
            retry: {
              attempts: 0,
              backoff: 'fixed',
              delay_ms: 0,
            },
          },
          preview: {
            dry_run: false,
            diff: true,
            impact: false,
          },
          validation: {
            before: [],
            after: ['typecheck', 'lint'],
            on_fail: 'rollback',
          },
          recovery: {
            checkpoint: true,
            rollback_on_fail: true,
            cleanup_on_success: true,
          },
        },
        lifecycle: {},
        output: {
          mode: 'summary',
          include: ['results'],
          exclude: ['debug', 'stack_traces'],
        },
      };

      // Validate batch structure
      expect(batch.id).toBe('rename-get-cwd-001');
      expect(batch.operations.read).toHaveLength(2);
      expect(batch.operations.write).toHaveLength(3);
      expect(batch.operations.query).toHaveLength(1);

      // Validate READ operations
      const readOps = batch.operations.read!;
      expect(readOps[0].type).toBe('search');
      expect(readOps[0].pattern).toBe('getCwd');
      expect(readOps[0].options?.whole_word).toBe(true);
      expect(readOps[1].type).toBe('symbols');
      expect(readOps[1].query).toBe('getCwd');

      // Validate WRITE operations
      const writeOps = batch.operations.write!;
      expect(writeOps[0].type).toBe('edit');
      expect(writeOps[0].id).toBe('rename-function-definition');
      expect(writeOps[1].type).toBe('edit');
      expect(writeOps[1].id).toBe('rename-imports');
      expect(writeOps[1].edits).toHaveLength(3); // Multiple files
      expect(writeOps[2].type).toBe('edit');
      expect(writeOps[2].id).toBe('update-tests');

      // Validate all edits use 'all' occurrence for complete rename
      writeOps[0].edits.forEach((editSpec) => {
        editSpec.edits.forEach((edit) => {
          expect(edit.occurrence).toBe('all');
        });
      });

      writeOps[1].edits.forEach((editSpec) => {
        editSpec.edits.forEach((edit) => {
          expect(edit.occurrence).toBe('all');
        });
      });

      // Validate QUERY operations
      const queryOps = batch.operations.query!;
      expect(queryOps[0].type).toBe('validate');
      expect(queryOps[0].validations[0].checks).toHaveLength(2);

      // Validate dependencies
      expect(writeOps[0].depends_on).toEqual(['find-getcwd-definition']);
      expect(writeOps[1].depends_on).toEqual(['find-getcwd-usage']);
      expect(writeOps[2].depends_on).toEqual(['find-getcwd-usage']);
      expect(queryOps[0].depends_on).toEqual([
        'rename-function-definition',
        'rename-imports',
        'update-tests',
      ]);

      // Validate parallel execution for performance
      expect(batch.config.execution.mode).toBe('parallel');
      expect(batch.config.execution.max_workers).toBe(3);

      // Validate rollback on failure
      expect(batch.config.recovery.rollback_on_fail).toBe(true);
      expect(batch.config.recovery.cleanup_on_success).toBe(true);
    });

    it('validates all references are updated after rename', () => {
      const batch: Batch = {
        id: 'rename-validation',
        operations: {
          read: [
            {
              type: 'search',
              id: 'find-old-name',
              pattern: 'oldFunction',
              mode: 'regex',
              glob: 'src/**/*.ts',
            } as ReadOperation,
          ],
          write: [
            {
              type: 'edit',
              id: 'rename',
              edits: [
                {
                  file: 'src/file.ts',
                  edits: [
                    { find: 'oldFunction', replace: 'newFunction', occurrence: 'all' },
                  ],
                },
              ],
              depends_on: ['find-old-name'],
            } as WriteOperation,
          ],
          query: [
            {
              type: 'validate',
              id: 'verify',
              validations: [{ checks: [{ kind: 'typecheck' }] }],
              depends_on: ['rename'],
            } as QueryOperation,
          ],
        },
        config: createDefaultBatchConfig(),
        lifecycle: {},
        output: { mode: 'minimal', include: [], exclude: [] },
      };

      // Verify that validation runs after all renames
      expect(batch.operations.query![0].depends_on).toEqual(['rename']);

      // Verify edit uses 'all' occurrence to catch all references
      const edit = batch.operations.write![0].edits[0].edits[0];
      expect(edit.occurrence).toBe('all');
    });
  });

  describe('SPEC-v2 Conformance', () => {
    it('validates all example batches follow SPEC-v2 structure', () => {
      const batches: Batch[] = [
        createAuthFeatureBatch(),
        createRefactorBatch(),
        createRenameBatch(),
      ];

      batches.forEach((batch) => {
        // Must have id
        expect(batch.id).toBeDefined();
        expect(typeof batch.id).toBe('string');

        // Must have operations object
        expect(batch.operations).toBeDefined();
        expect(typeof batch.operations).toBe('object');

        // Must have config
        expect(batch.config).toBeDefined();
        expect(batch.config.transaction).toBeDefined();
        expect(batch.config.execution).toBeDefined();
        expect(batch.config.preview).toBeDefined();
        expect(batch.config.validation).toBeDefined();
        expect(batch.config.recovery).toBeDefined();

        // Must have lifecycle
        expect(batch.lifecycle).toBeDefined();

        // Must have output
        expect(batch.output).toBeDefined();
        expect(batch.output.mode).toBeDefined();
        expect(['minimal', 'summary', 'full', 'verbose']).toContain(batch.output.mode);
      });
    });

    it('validates operations have proper dependencies', () => {
      const batch = createAuthFeatureBatch();

      // Collect all operation IDs
      const allIds = new Set<string>();
      Object.values(batch.operations).forEach((ops) => {
        ops?.forEach((op: any) => {
          allIds.add(op.id);
        });
      });

      // Validate all dependencies exist
      Object.values(batch.operations).forEach((ops) => {
        ops?.forEach((op: any) => {
          if (op.depends_on) {
            op.depends_on.forEach((depId: string) => {
              expect(allIds.has(depId)).toBe(true);
            });
          }
        });
      });
    });

    it('validates transaction modes are valid', () => {
      const batches = [createAuthFeatureBatch(), createRefactorBatch(), createRenameBatch()];

      batches.forEach((batch) => {
        expect(['atomic', 'partial', 'none']).toContain(batch.config.transaction.mode);
        expect(['strict', 'relaxed']).toContain(batch.config.transaction.isolation);
      });
    });

    it('validates validation steps are recognized', () => {
      const validSteps: string[] = [
        'typecheck',
        'lint',
        'test',
        'build',
        'env',
        'api_contract',
        'secrets',
        'permissions',
      ];

      const batches = [createAuthFeatureBatch(), createRefactorBatch(), createRenameBatch()];

      batches.forEach((batch) => {
        batch.config.validation.before.forEach((step) => {
          expect(validSteps).toContain(step);
        });

        batch.config.validation.after.forEach((step) => {
          expect(validSteps).toContain(step);
        });
      });
    });
  });
});

// ============================================================================
// Helper Functions
// ============================================================================

function createDefaultBatchConfig(): BatchConfig {
  return {
    transaction: {
      mode: 'atomic',
      isolation: 'strict',
      timeout_ms: 30000,
    },
    execution: {
      mode: 'sequential',
      max_workers: 1,
      fail_fast: true,
      retry: {
        attempts: 0,
        backoff: 'fixed',
        delay_ms: 100,
      },
    },
    preview: {
      dry_run: false,
      diff: false,
      impact: false,
    },
    validation: {
      before: [],
      after: [],
      on_fail: 'rollback',
    },
    recovery: {
      checkpoint: false,
      rollback_on_fail: false,
      cleanup_on_success: false,
    },
  };
}

function createAuthFeatureBatch(): Batch {
  return {
    id: 'auth-feature',
    operations: {
      read: [
        { type: 'files', id: 'r1', targets: ['src/auth'], extract: 'symbols' } as ReadOperation,
      ],
      write: [
        {
          type: 'create',
          id: 'w1',
          files: [{ path: 'auth.ts', content: '' }],
          depends_on: ['r1'],
        } as WriteOperation,
      ],
      exec: [
        {
          type: 'command',
          id: 'e1',
          commands: [{ cmd: 'npm test' }],
          depends_on: ['w1'],
        } as ExecOperation,
      ],
      query: [
        {
          type: 'validate',
          id: 'q1',
          validations: [{ checks: [{ kind: 'typecheck' }, { kind: 'lint' }] }],
          depends_on: ['w1'],
        } as QueryOperation,
      ],
    },
    config: createDefaultBatchConfig(),
    lifecycle: {},
    output: { mode: 'full', include: [], exclude: [] },
  };
}

function createRefactorBatch(): Batch {
  return {
    id: 'refactor',
    operations: {
      read: [
        { type: 'search', id: 'r1', pattern: 'pattern', mode: 'regex' } as ReadOperation,
      ],
      write: [
        {
          type: 'edit',
          id: 'w1',
          edits: [{ file: 'file.ts', edits: [] }],
          depends_on: ['r1'],
        } as WriteOperation,
      ],
      query: [
        {
          type: 'validate',
          id: 'q1',
          validations: [{ checks: [{ kind: 'typecheck' }] }],
          depends_on: ['w1'],
        } as QueryOperation,
      ],
    },
    config: createDefaultBatchConfig(),
    lifecycle: {},
    output: { mode: 'summary', include: [], exclude: [] },
  };
}

function createRenameBatch(): Batch {
  return {
    id: 'rename',
    operations: {
      read: [
        { type: 'search', id: 'r1', pattern: 'oldName', mode: 'regex' } as ReadOperation,
      ],
      write: [
        {
          type: 'edit',
          id: 'w1',
          edits: [
            {
              file: 'file.ts',
              edits: [{ find: 'oldName', replace: 'newName', occurrence: 'all' }],
            },
          ],
          depends_on: ['r1'],
        } as WriteOperation,
      ],
      query: [
        {
          type: 'validate',
          id: 'q1',
          validations: [{ checks: [{ kind: 'typecheck' }, { kind: 'lint' }] }],
          depends_on: ['w1'],
        } as QueryOperation,
      ],
    },
    config: {
      ...createDefaultBatchConfig(),
      execution: {
        mode: 'parallel',
        max_workers: 3,
        fail_fast: true,
        retry: { attempts: 0, backoff: 'fixed', delay_ms: 0 },
      },
    },
    lifecycle: {},
    output: { mode: 'summary', include: [], exclude: [] },
  };
}
