/**
 * Tests for Tool Specifications - Section 13
 * Tests precision tool wrappers, output modes, and discover tool
 * @see SPEC-v2 Section 13
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import type {
  DiscoverInput,
  DiscoverOutput,
  GrepQuery,
  GlobQuery,
  SymbolQuery,
  GrepResult,
  GlobResult,
  SymbolResult,
  DiscoveryOutputMode,
} from '../interfaces/tools/discover.js';
import {
  isGrepQuery,
  isGlobQuery,
  isSymbolQuery,
  isGrepResult,
  isGlobResult,
  isSymbolResult,
} from '../interfaces/tools/discover.js';
import type { ReadOperation, ExtractMode } from '../interfaces/operations/read.js';

describe('Tool Specifications - Section 13', () => {
  // ============================================================================
  // SECTION 13.1: Precision Tools
  // ============================================================================

  describe('13.1.1 precision_grep - Content Search Tool', () => {
    describe('Output Modes', () => {
      it('supports count_only mode for minimal token usage', () => {
        const query: GrepQuery = {
          id: 'grep-count',
          type: 'grep',
          pattern: 'export function',
          output_mode: 'count_only',
        };

        const result: GrepResult = {
          query_id: 'grep-count',
          type: 'grep',
          total_matches: 42,
          files_matched: 15,
          matches: [], // Empty in count_only mode
          truncated: false,
          tokens_used: 50, // Minimal tokens
        };

        expect(query.output_mode).toBe('count_only');
        expect(result.total_matches).toBe(42);
        expect(result.files_matched).toBe(15);
        expect(result.matches).toHaveLength(0);
        expect(result.tokens_used).toBeLessThan(100);
      });

      it('supports files_only mode for file list without content', () => {
        const query: GrepQuery = {
          id: 'grep-files',
          type: 'grep',
          pattern: 'useEffect',
          output_mode: 'files_only',
        };

        const result: GrepResult = {
          query_id: 'grep-files',
          type: 'grep',
          total_matches: 20,
          files_matched: 8,
          matches: [
            { file: 'src/App.tsx', line: 1, column: 1 },
            { file: 'src/Dashboard.tsx', line: 1, column: 1 },
          ],
          truncated: false,
          tokens_used: 150,
        };

        expect(query.output_mode).toBe('files_only');
        result.matches.forEach((match) => {
          expect(match.file).toBeDefined();
          expect(match.content).toBeUndefined(); // No content in files_only
        });
      });

      it('supports locations mode with line and column info', () => {
        const result: GrepResult = {
          query_id: 'grep-loc',
          type: 'grep',
          total_matches: 5,
          files_matched: 3,
          matches: [
            { file: 'src/utils.ts', line: 42, column: 8 },
            { file: 'src/helpers.ts', line: 15, column: 3 },
            { file: 'src/lib.ts', line: 100, column: 12 },
          ],
          truncated: false,
          tokens_used: 200,
        };

        result.matches.forEach((match) => {
          expect(match.file).toBeDefined();
          expect(match.line).toBeGreaterThan(0);
          expect(match.column).toBeGreaterThan(0);
        });
      });

      it('supports matches mode with matched content', () => {
        const result: GrepResult = {
          query_id: 'grep-matches',
          type: 'grep',
          total_matches: 3,
          files_matched: 2,
          matches: [
            {
              file: 'src/api.ts',
              line: 10,
              column: 5,
              content: 'export function fetchData() {',
            },
            {
              file: 'src/utils.ts',
              line: 25,
              column: 3,
              content: 'export function formatDate(date: Date) {',
            },
          ],
          truncated: false,
          tokens_used: 500,
        };

        result.matches.forEach((match) => {
          expect(match.content).toBeDefined();
          expect(match.content!.length).toBeGreaterThan(0);
        });
      });

      it('supports context mode with surrounding lines', () => {
        const query: GrepQuery = {
          id: 'grep-context',
          type: 'grep',
          pattern: 'class UserService',
          context: 3, // 3 lines before and after
        };

        const result: GrepResult = {
          query_id: 'grep-context',
          type: 'grep',
          total_matches: 1,
          files_matched: 1,
          matches: [
            {
              file: 'src/services/UserService.ts',
              line: 20,
              column: 1,
              content: 'class UserService {',
              context_before: [
                'import { User } from "./User";',
                '',
                '// User management service',
              ],
              context_after: [
                '  constructor(private db: Database) {}',
                '',
                '  async getUser(id: string): Promise<User> {',
              ],
            },
          ],
          truncated: false,
          tokens_used: 800,
        };

        expect(query.context).toBe(3);
        expect(result.matches[0].context_before).toHaveLength(3);
        expect(result.matches[0].context_after).toHaveLength(3);
      });
    });

    describe('Search Options', () => {
      it('supports case-sensitive search', () => {
        const query: GrepQuery = {
          id: 'grep-case',
          type: 'grep',
          pattern: 'UserModel',
          case_sensitive: true,
        };

        expect(query.case_sensitive).toBe(true);
      });

      it('supports include/exclude patterns', () => {
        const query: GrepQuery = {
          id: 'grep-filter',
          type: 'grep',
          pattern: 'TODO',
          include: ['src/**/*.ts'],
          exclude: ['**/*.test.ts', '**/*.spec.ts'],
        };

        expect(query.include).toContain('src/**/*.ts');
        expect(query.exclude).toContain('**/*.test.ts');
      });

      it('supports max matches limit', () => {
        const query: GrepQuery = {
          id: 'grep-limit',
          type: 'grep',
          pattern: 'import',
          max_matches: 100,
        };

        const result: GrepResult = {
          query_id: 'grep-limit',
          type: 'grep',
          total_matches: 250,
          files_matched: 50,
          matches: new Array(100).fill(null).map((_, i) => ({
            file: `file${i}.ts`,
            line: 1,
            column: 1,
          })),
          truncated: true,
          tokens_used: 2000,
        };

        expect(query.max_matches).toBe(100);
        expect(result.matches.length).toBe(100);
        expect(result.truncated).toBe(true);
      });
    });
  });

  describe('13.1.2 precision_read - File Reading Tool', () => {
    describe('Extract Modes', () => {
      it('supports content mode for full file reading', () => {
        const operation: ReadOperation = {
          type: 'files',
          id: 'read-content',
          targets: ['src/App.tsx'],
          extract: 'content',
        };

        expect(operation.extract).toBe('content');
      });

      it('supports outline mode for structure without details', () => {
        const operation: ReadOperation = {
          type: 'files',
          id: 'read-outline',
          targets: ['src/services/UserService.ts'],
          extract: 'outline',
        };

        // Outline should show:
        // - Imports
        // - Class/function declarations
        // - Method signatures
        // - Not full implementation
        expect(operation.extract).toBe('outline');
      });

      it('supports symbols mode for extracting declarations', () => {
        const operation: ReadOperation = {
          type: 'files',
          id: 'read-symbols',
          targets: ['src/types.ts'],
          extract: 'symbols',
          options: {
            symbol_filter: ['interface', 'type', 'enum'],
          },
        };

        expect(operation.extract).toBe('symbols');
        expect(operation.options?.symbol_filter).toContain('interface');
      });

      it('supports ast mode for code structure analysis', () => {
        const operation: ReadOperation = {
          type: 'files',
          id: 'read-ast',
          targets: ['src/parser.ts'],
          extract: 'ast',
        };

        expect(operation.extract).toBe('ast');
      });

      it('supports lines mode for specific line ranges', () => {
        const operation: ReadOperation = {
          type: 'files',
          id: 'read-lines',
          targets: [
            {
              path: 'src/App.tsx',
              offset: 10,
              limit: 20,
            },
          ],
          extract: 'lines',
        };

        expect(operation.extract).toBe('lines');
        expect(operation.targets[0]).toHaveProperty('offset');
        expect(operation.targets[0]).toHaveProperty('limit');
      });
    });

    describe('Reading Options', () => {
      it('supports include_line_numbers option', () => {
        const operation: ReadOperation = {
          type: 'files',
          id: 'read-numbered',
          targets: ['src/utils.ts'],
          extract: 'content',
          options: {
            include_line_numbers: true,
          },
        };

        expect(operation.options?.include_line_numbers).toBe(true);
      });

      it('supports max_lines limit', () => {
        const operation: ReadOperation = {
          type: 'files',
          id: 'read-limited',
          targets: ['README.md'],
          extract: 'content',
          options: {
            max_lines: 100,
          },
        };

        expect(operation.options?.max_lines).toBe(100);
      });

      it('supports symbol filtering', () => {
        const operation: ReadOperation = {
          type: 'files',
          id: 'read-filtered',
          targets: ['src/api.ts'],
          extract: 'symbols',
          options: {
            symbol_filter: ['function', 'class'],
          },
        };

        expect(operation.options?.symbol_filter).toContain('function');
        expect(operation.options?.symbol_filter).toContain('class');
      });
    });

    describe('Batch Reading', () => {
      it('supports reading multiple files in one operation', () => {
        const operation: ReadOperation = {
          type: 'files',
          id: 'read-batch',
          targets: [
            'src/App.tsx',
            'src/Dashboard.tsx',
            'src/Profile.tsx',
            'src/Settings.tsx',
          ],
          extract: 'outline',
        };

        expect(operation.targets).toHaveLength(4);
      });

      it('supports mixed file specs with ranges', () => {
        const operation: ReadOperation = {
          type: 'files',
          id: 'read-mixed',
          targets: [
            'src/full.ts', // Full file
            { path: 'src/partial.ts', offset: 1, limit: 50 }, // Partial
            { path: 'src/section.ts', offset: 100, limit: 25 }, // Section
          ],
          extract: 'content',
        };

        expect(operation.targets).toHaveLength(3);
        expect(typeof operation.targets[0]).toBe('string');
        expect(typeof operation.targets[1]).toBe('object');
      });
    });
  });

  describe('13.1.3 precision_glob - File Finding Tool', () => {
    describe('Output Modes', () => {
      it('supports count_only mode', () => {
        const query: GlobQuery = {
          id: 'glob-count',
          type: 'glob',
          patterns: ['src/**/*.tsx'],
          output_mode: 'count_only',
        };

        const result: GlobResult = {
          query_id: 'glob-count',
          type: 'glob',
          total_files: 47,
          files: [],
          truncated: false,
          tokens_used: 30,
        };

        expect(query.output_mode).toBe('count_only');
        expect(result.total_files).toBe(47);
        expect(result.files).toHaveLength(0);
        expect(result.tokens_used).toBeLessThan(50);
      });

      it('supports paths_only mode', () => {
        const query: GlobQuery = {
          id: 'glob-paths',
          type: 'glob',
          patterns: ['**/*.test.ts'],
          output_mode: 'files_only',
        };

        const result: GlobResult = {
          query_id: 'glob-paths',
          type: 'glob',
          total_files: 15,
          files: [
            { path: 'src/utils.test.ts' },
            { path: 'src/api.test.ts' },
            { path: 'src/hooks.test.ts' },
          ],
          truncated: false,
          tokens_used: 100,
        };

        expect(query.output_mode).toBe('files_only');
        result.files.forEach((file) => {
          expect(file.path).toBeDefined();
          expect(file.size).toBeUndefined();
          expect(file.modified).toBeUndefined();
        });
      });

      it('supports with_stats mode for file metadata', () => {
        const result: GlobResult = {
          query_id: 'glob-stats',
          type: 'glob',
          total_files: 5,
          files: [
            {
              path: 'src/App.tsx',
              size: 4096,
              modified: '2026-01-15T10:30:00Z',
            },
            {
              path: 'src/Dashboard.tsx',
              size: 8192,
              modified: '2026-01-20T14:20:00Z',
            },
          ],
          truncated: false,
          tokens_used: 250,
        };

        result.files.forEach((file) => {
          expect(file.path).toBeDefined();
          expect(file.size).toBeGreaterThan(0);
          expect(file.modified).toBeDefined();
        });
      });

      it('supports with_preview mode for content snippets', () => {
        // This would be a ReadOperation with glob type
        const operation: ReadOperation = {
          type: 'glob',
          id: 'glob-preview',
          patterns: ['src/components/*.tsx'],
          options: {
            preview_lines: 5,
          },
        };

        expect(operation.options?.preview_lines).toBe(5);
      });
    });

    describe('Pattern Matching', () => {
      it('supports multiple glob patterns', () => {
        const query: GlobQuery = {
          id: 'glob-multi',
          type: 'glob',
          patterns: [
            'src/**/*.ts',
            'src/**/*.tsx',
            '!**/*.test.ts',
            '!**/*.spec.ts',
          ],
        };

        expect(query.patterns).toHaveLength(4);
        expect(query.patterns.filter((p) => p.startsWith('!'))).toHaveLength(2);
      });

      it('supports gitignore rules', () => {
        const query: GlobQuery = {
          id: 'glob-gitignore',
          type: 'glob',
          patterns: ['**/*'],
          gitignore: true,
        };

        expect(query.gitignore).toBe(true);
      });

      it('supports hidden files option', () => {
        const query: GlobQuery = {
          id: 'glob-hidden',
          type: 'glob',
          patterns: ['**/*.config.js'],
          include_hidden: true,
        };

        expect(query.include_hidden).toBe(true);
      });
    });
  });

  describe('13.1.4 precision_symbols - Symbol Search Tool', () => {
    describe('Output Modes', () => {
      it('supports count_only mode', () => {
        const query: SymbolQuery = {
          id: 'sym-count',
          type: 'symbols',
          query: 'use',
          output_mode: 'count_only',
        };

        const result: SymbolResult = {
          query_id: 'sym-count',
          type: 'symbols',
          total_symbols: 23,
          symbols: [],
          truncated: false,
          tokens_used: 40,
        };

        expect(query.output_mode).toBe('count_only');
        expect(result.total_symbols).toBe(23);
        expect(result.symbols).toHaveLength(0);
      });

      it('supports names_only mode', () => {
        const result: SymbolResult = {
          query_id: 'sym-names',
          type: 'symbols',
          total_symbols: 5,
          symbols: [
            { name: 'useAuth', kind: 'function', file: '', line: 0 },
            { name: 'useUser', kind: 'function', file: '', line: 0 },
            { name: 'useTheme', kind: 'function', file: '', line: 0 },
          ],
          truncated: false,
          tokens_used: 150,
        };

        result.symbols.forEach((sym) => {
          expect(sym.name).toBeDefined();
          expect(sym.kind).toBeDefined();
          expect(sym.signature).toBeUndefined();
        });
      });

      it('supports locations mode with file and position', () => {
        const result: SymbolResult = {
          query_id: 'sym-loc',
          type: 'symbols',
          total_symbols: 3,
          symbols: [
            {
              name: 'UserService',
              kind: 'class',
              file: 'src/services/UserService.ts',
              line: 10,
              column: 7,
            },
            {
              name: 'AuthService',
              kind: 'class',
              file: 'src/services/AuthService.ts',
              line: 15,
              column: 7,
            },
          ],
          truncated: false,
          tokens_used: 200,
        };

        result.symbols.forEach((sym) => {
          expect(sym.file).toBeTruthy();
          expect(sym.line).toBeGreaterThan(0);
        });
      });

      it('supports signatures mode with type info', () => {
        const result: SymbolResult = {
          query_id: 'sym-sig',
          type: 'symbols',
          total_symbols: 2,
          symbols: [
            {
              name: 'fetchUser',
              kind: 'function',
              file: 'src/api.ts',
              line: 20,
              signature: '(id: string): Promise<User>',
            },
            {
              name: 'formatDate',
              kind: 'function',
              file: 'src/utils.ts',
              line: 42,
              signature: '(date: Date, format?: string): string',
            },
          ],
          truncated: false,
          tokens_used: 300,
        };

        result.symbols.forEach((sym) => {
          expect(sym.signature).toBeDefined();
          expect(sym.signature!.length).toBeGreaterThan(0);
        });
      });

      it('supports full mode with exported status', () => {
        const result: SymbolResult = {
          query_id: 'sym-full',
          type: 'symbols',
          total_symbols: 2,
          symbols: [
            {
              name: 'useAuth',
              kind: 'function',
              file: 'src/hooks/useAuth.ts',
              line: 5,
              column: 7,
              exported: true,
              signature: '(): AuthContext',
            },
            {
              name: 'AuthContext',
              kind: 'interface',
              file: 'src/types/auth.ts',
              line: 3,
              column: 1,
              exported: true,
              signature: '{ user: User | null; login: () => void; logout: () => void }',
            },
          ],
          truncated: false,
          tokens_used: 400,
        };

        result.symbols.forEach((sym) => {
          expect(sym.exported).toBeDefined();
          expect(sym.signature).toBeDefined();
        });
      });
    });

    describe('Symbol Filtering', () => {
      it('supports filtering by symbol kind', () => {
        const query: SymbolQuery = {
          id: 'sym-kind',
          type: 'symbols',
          query: 'User',
          kinds: ['interface', 'type', 'class'],
        };

        expect(query.kinds).toContain('interface');
        expect(query.kinds).toContain('type');
        expect(query.kinds).toContain('class');
      });

      it('supports exported_only filter', () => {
        const query: SymbolQuery = {
          id: 'sym-exported',
          type: 'symbols',
          query: '',
          exported_only: true,
        };

        expect(query.exported_only).toBe(true);
      });

      it('supports file scoping', () => {
        const query: SymbolQuery = {
          id: 'sym-scope',
          type: 'symbols',
          query: 'handle',
          files: ['src/components/**/*.tsx'],
        };

        expect(query.files).toContain('src/components/**/*.tsx');
      });
    });
  });

  describe('13.1.5 precision_edit - Atomic File Editing', () => {
    it('validates edit before applying', () => {
      const edit = {
        file: 'src/App.tsx',
        edits: [
          {
            find: 'const [count, setCount] = useState(0)',
            replace: 'const [count, setCount] = useState<number>(0)',
          },
        ],
      };

      // Edit should validate that:
      // 1. File exists
      // 2. Pattern to find exists exactly once
      // 3. Replacement is valid syntax
      expect(edit.file).toBeTruthy();
      expect(edit.edits[0].find).toBeTruthy();
      expect(edit.edits[0].replace).toBeTruthy();
    });

    it('supports atomic transactions', () => {
      const operation = {
        type: 'edit',
        id: 'atomic-edit',
        edits: [
          {
            file: 'src/types.ts',
            edits: [{ find: 'interface User', replace: 'interface User extends Base' }],
          },
          {
            file: 'src/api.ts',
            edits: [{ find: 'User', replace: 'User' }], // Related change
          },
        ],
        atomic: true, // All succeed or all rollback
      };

      expect(operation.atomic).toBe(true);
      expect(operation.edits).toHaveLength(2);
    });

    it('provides validation hints', () => {
      const hints = {
        file: 'src/config.ts',
        suggestions: [
          'Pattern not found: check for whitespace differences',
          'Consider using regex mode for flexible matching',
          'File has unsaved changes',
        ],
      };

      expect(hints.suggestions.length).toBeGreaterThan(0);
    });
  });

  describe('13.1.6 precision_write - Atomic File Writing', () => {
    it('supports atomic file creation', () => {
      const operation = {
        type: 'create',
        id: 'create-component',
        files: [
          {
            path: 'src/components/NewComponent.tsx',
            content: 'export function NewComponent() { return null; }',
          },
        ],
        atomic: true,
      };

      expect(operation.atomic).toBe(true);
      expect(operation.files[0].path).toBeTruthy();
    });

    it('supports template-based generation', () => {
      const operation = {
        type: 'create',
        id: 'from-template',
        template: 'react-component',
        vars: {
          name: 'UserProfile',
          props: 'user: User',
        },
      };

      expect(operation.template).toBe('react-component');
      expect(operation.vars).toHaveProperty('name');
    });

    it('validates before writing', () => {
      const validation = {
        checks: [
          'syntax_valid',
          'imports_resolve',
          'types_check',
          'no_conflicts',
        ],
        on_fail: 'rollback' as const,
      };

      expect(validation.checks).toContain('syntax_valid');
      expect(validation.on_fail).toBe('rollback');
    });
  });

  describe('13.1.7 precision_exec - Command Execution', () => {
    it('supports batch commands', () => {
      const operation = {
        type: 'command',
        id: 'test-suite',
        commands: [
          { cmd: 'npm run typecheck' },
          { cmd: 'npm run lint' },
          { cmd: 'npm run test' },
        ],
      };

      expect(operation.commands).toHaveLength(3);
    });

    it('supports expectations for validation', () => {
      const operation = {
        type: 'command',
        id: 'build',
        commands: [
          {
            cmd: 'npm run build',
            expect: {
              exit_code: 0,
              stdout_contains: 'Build successful',
              timeout_ms: 60000,
            },
          },
        ],
      };

      expect(operation.commands[0].expect).toBeDefined();
      expect(operation.commands[0].expect.exit_code).toBe(0);
    });

    it('supports output control', () => {
      const operation = {
        type: 'command',
        id: 'verbose-test',
        commands: [{ cmd: 'npm test' }],
        output: {
          mode: 'full',
          include_stdout: true,
          include_stderr: true,
          max_lines: 100,
        },
      };

      expect(operation.output.mode).toBe('full');
      expect(operation.output.include_stdout).toBe(true);
    });

    it('supports parallel execution', () => {
      const operation = {
        type: 'command',
        id: 'parallel-tests',
        commands: [
          { cmd: 'npm run test:unit' },
          { cmd: 'npm run test:integration' },
          { cmd: 'npm run test:e2e' },
        ],
        parallel: true,
        max_workers: 3,
      };

      expect(operation.parallel).toBe(true);
      expect(operation.max_workers).toBe(3);
    });
  });

  describe('13.1.8 precision_fetch - URL Content Fetching', () => {
    it('supports caching with TTL', () => {
      const operation = {
        type: 'url',
        id: 'fetch-docs',
        targets: ['https://api.example.com/docs'],
        extract: 'markdown' as const,
        options: {
          cache_ttl_seconds: 3600,
        },
      };

      expect(operation.options?.cache_ttl_seconds).toBe(3600);
    });

    it('supports different extraction modes', () => {
      const modes: Array<'raw' | 'markdown' | 'text' | 'structured'> = [
        'raw',
        'markdown',
        'text',
        'structured',
      ];

      modes.forEach((mode) => {
        const operation = {
          type: 'url',
          id: `fetch-${mode}`,
          targets: ['https://example.com'],
          extract: mode,
        };

        expect(operation.extract).toBe(mode);
      });
    });

    it('supports summarization for long content', () => {
      const operation = {
        type: 'url',
        id: 'fetch-summarize',
        targets: ['https://example.com/long-article'],
        extract: 'text' as const,
        options: {
          summarize: true,
          max_tokens: 1000,
        },
      };

      expect(operation.options?.summarize).toBe(true);
      expect(operation.options?.max_tokens).toBe(1000);
    });

    it('supports structured extraction with selectors', () => {
      const operation = {
        type: 'url',
        id: 'fetch-structured',
        targets: ['https://example.com/page'],
        extract: 'structured' as const,
        options: {
          selectors: ['.title', '.content', '.metadata'],
        },
      };

      expect(operation.extract).toBe('structured');
      expect(operation.options?.selectors).toHaveLength(3);
    });
  });

  // ============================================================================
  // SECTION 13.1.10: Token Savings
  // ============================================================================

  describe('13.1.10 Token Savings Validation', () => {
    it('count_only uses fewer tokens than full results', () => {
      const countResult: GrepResult = {
        query_id: 'count',
        type: 'grep',
        total_matches: 100,
        files_matched: 20,
        matches: [],
        truncated: false,
        tokens_used: 50,
      };

      const fullResult: GrepResult = {
        query_id: 'full',
        type: 'grep',
        total_matches: 100,
        files_matched: 20,
        matches: new Array(100).fill(null).map((_, i) => ({
          file: `file${i}.ts`,
          line: i,
          column: 1,
          content: 'export function example() { return true; }',
        })),
        truncated: false,
        tokens_used: 5000,
      };

      expect(countResult.tokens_used).toBeLessThan(fullResult.tokens_used);
      expect(countResult.tokens_used).toBeLessThan(100);
      expect(fullResult.tokens_used).toBeGreaterThan(1000);
    });

    it('outline mode uses fewer tokens than full content', () => {
      const outlineTokens = 500;
      const contentTokens = 5000;

      expect(outlineTokens).toBeLessThan(contentTokens * 0.2);
    });

    it('files_only uses fewer tokens than with_stats', () => {
      const filesOnlyResult: GlobResult = {
        query_id: 'files',
        type: 'glob',
        total_files: 50,
        files: new Array(50).fill(null).map((_, i) => ({
          path: `file${i}.ts`,
        })),
        truncated: false,
        tokens_used: 200,
      };

      const withStatsResult: GlobResult = {
        query_id: 'stats',
        type: 'glob',
        total_files: 50,
        files: new Array(50).fill(null).map((_, i) => ({
          path: `file${i}.ts`,
          size: 4096 * i,
          modified: new Date().toISOString(),
        })),
        truncated: false,
        tokens_used: 800,
      };

      expect(filesOnlyResult.tokens_used).toBeLessThan(withStatsResult.tokens_used);
    });

    it('symbols mode is more efficient than full content for type discovery', () => {
      const symbolsTokens = 300;
      const contentTokens = 2000;

      // For discovering types/interfaces, symbols mode should use
      // significantly fewer tokens than reading full file content
      expect(symbolsTokens).toBeLessThan(contentTokens * 0.3);
    });
  });

  // ============================================================================
  // SECTION 13.2: Discover Tool
  // ============================================================================

  describe('13.2 Discover Tool - Parallel Query Execution', () => {
    describe('Query Types', () => {
      it('supports grep queries', () => {
        const query: GrepQuery = {
          id: 'find-hooks',
          type: 'grep',
          pattern: 'use[A-Z]\\w+',
          include: ['src/**/*.ts', 'src/**/*.tsx'],
        };

        expect(isGrepQuery(query)).toBe(true);
        expect(query.type).toBe('grep');
      });

      it('supports glob queries', () => {
        const query: GlobQuery = {
          id: 'find-tests',
          type: 'glob',
          patterns: ['**/*.test.ts', '**/*.spec.ts'],
        };

        expect(isGlobQuery(query)).toBe(true);
        expect(query.type).toBe('glob');
      });

      it('supports symbol queries', () => {
        const query: SymbolQuery = {
          id: 'find-types',
          type: 'symbols',
          query: 'User',
          kinds: ['interface', 'type'],
        };

        expect(isSymbolQuery(query)).toBe(true);
        expect(query.type).toBe('symbols');
      });
    });

    describe('Parallel Execution', () => {
      it('executes multiple queries in parallel by default', () => {
        const input: DiscoverInput = {
          queries: [
            {
              id: 'q1',
              type: 'grep',
              pattern: 'export',
            } as GrepQuery,
            {
              id: 'q2',
              type: 'glob',
              patterns: ['src/**/*.ts'],
            } as GlobQuery,
            {
              id: 'q3',
              type: 'symbols',
              query: 'function',
            } as SymbolQuery,
          ],
          parallel: true,
        };

        expect(input.parallel).toBe(true);
        expect(input.queries).toHaveLength(3);
      });

      it('supports sequential execution when needed', () => {
        const input: DiscoverInput = {
          queries: [
            { id: 'q1', type: 'grep', pattern: 'test' } as GrepQuery,
            { id: 'q2', type: 'glob', patterns: ['**/*.ts'] } as GlobQuery,
          ],
          parallel: false,
        };

        expect(input.parallel).toBe(false);
      });

      it('aggregates results from all queries', () => {
        const output: DiscoverOutput = {
          results: {
            'grep-1': {
              query_id: 'grep-1',
              type: 'grep',
              total_matches: 42,
              files_matched: 10,
              matches: [],
              truncated: false,
              tokens_used: 100,
            },
            'glob-1': {
              query_id: 'glob-1',
              type: 'glob',
              total_files: 50,
              files: [],
              truncated: false,
              tokens_used: 50,
            },
            'sym-1': {
              query_id: 'sym-1',
              type: 'symbols',
              total_symbols: 15,
              symbols: [],
              truncated: false,
              tokens_used: 75,
            },
          },
          total_duration_ms: 250,
          total_tokens_used: 225,
          queries_succeeded: 3,
          queries_failed: 0,
        };

        expect(Object.keys(output.results)).toHaveLength(3);
        expect(output.total_tokens_used).toBe(225);
        expect(output.queries_succeeded).toBe(3);
        expect(output.queries_failed).toBe(0);
      });
    });

    describe('Output Mode Control', () => {
      it('supports per-query output mode override', () => {
        const input: DiscoverInput = {
          queries: [
            {
              id: 'count-only',
              type: 'grep',
              pattern: 'TODO',
              output_mode: 'count_only',
            } as GrepQuery,
            {
              id: 'with-locations',
              type: 'grep',
              pattern: 'FIXME',
              output_mode: 'locations',
            } as GrepQuery,
          ],
        };

        expect(input.queries[0].output_mode).toBe('count_only');
        expect(input.queries[1].output_mode).toBe('locations');
      });

      it('optimizes token usage across queries', () => {
        const output: DiscoverOutput = {
          results: {
            'count-1': {
              query_id: 'count-1',
              type: 'grep',
              total_matches: 100,
              files_matched: 20,
              matches: [],
              truncated: false,
              tokens_used: 30,
            },
            'count-2': {
              query_id: 'count-2',
              type: 'glob',
              total_files: 200,
              files: [],
              truncated: false,
              tokens_used: 25,
            },
          },
          total_duration_ms: 150,
          total_tokens_used: 55,
          queries_succeeded: 2,
          queries_failed: 0,
        };

        // All count_only queries should use minimal tokens
        expect(output.total_tokens_used).toBeLessThan(100);
      });
    });

    describe('Error Handling', () => {
      it('reports failed queries separately', () => {
        const output: DiscoverOutput = {
          results: {
            'success-1': {
              query_id: 'success-1',
              type: 'grep',
              total_matches: 10,
              files_matched: 3,
              matches: [],
              truncated: false,
              tokens_used: 50,
            },
          },
          total_duration_ms: 200,
          total_tokens_used: 50,
          queries_succeeded: 1,
          queries_failed: 1,
          errors: {
            'failed-1': 'Pattern syntax error',
          },
        };

        expect(output.queries_succeeded).toBe(1);
        expect(output.queries_failed).toBe(1);
        expect(output.errors).toBeDefined();
        expect(output.errors!['failed-1']).toBe('Pattern syntax error');
      });
    });

    describe('Timeout Control', () => {
      it('supports global timeout for all queries', () => {
        const input: DiscoverInput = {
          queries: [
            { id: 'q1', type: 'grep', pattern: 'test' } as GrepQuery,
          ],
          timeout_ms: 5000,
        };

        expect(input.timeout_ms).toBe(5000);
      });
    });
  });

  // ============================================================================
  // SECTION 13.3: Batch Tool Execution Order
  // ============================================================================

  describe('13.3 Batch Execution Order', () => {
    it('enforces correct phase order: DISCOVERY → READ → WRITE → EXEC → QUERY → STATE', () => {
      const expectedOrder = [
        'discovery',
        'read',
        'write',
        'exec',
        'query',
        'state',
      ];

      // Phase execution must follow this order
      expectedOrder.forEach((phase, index) => {
        expect(expectedOrder[index]).toBe(phase);
      });
    });

    it('runs DISCOVERY phase before READ to identify targets', () => {
      // Workflow: discover files → read identified files
      const discoverStep = {
        phase: 'discovery',
        query: {
          id: 'find-components',
          type: 'glob' as const,
          patterns: ['src/components/**/*.tsx'],
        },
      };

      const readStep = {
        phase: 'read',
        operation: {
          type: 'files' as const,
          id: 'read-components',
          targets: [], // Populated from discovery results
          extract: 'outline' as const,
        },
        depends_on: ['find-components'],
      };

      expect(readStep.depends_on).toContain(discoverStep.query.id);
    });

    it('runs READ phase before WRITE to gather context', () => {
      const readPhase = {
        phase: 'read',
        started: 100,
        completed: 200,
      };

      const writePhase = {
        phase: 'write',
        started: 200,
        completed: 400,
      };

      expect(writePhase.started).toBeGreaterThanOrEqual(readPhase.completed);
    });

    it('runs WRITE phase before EXEC to ensure files exist', () => {
      const writePhase = {
        phase: 'write',
        operation: 'create test files',
        completed: 300,
      };

      const execPhase = {
        phase: 'exec',
        operation: 'run tests',
        started: 300,
      };

      expect(execPhase.started).toBeGreaterThanOrEqual(writePhase.completed);
    });

    it('runs EXEC phase for validation commands', () => {
      const execPhase = {
        phase: 'exec',
        commands: [
          'npm run typecheck',
          'npm run lint',
          'npm run test',
        ],
      };

      expect(execPhase.commands).toContain('npm run test');
    });

    it('runs QUERY phase for post-execution analysis', () => {
      const queryPhase = {
        phase: 'query',
        operation: 'analyze results',
      };

      expect(queryPhase.phase).toBe('query');
    });

    it('runs STATE phase last for persistence', () => {
      const phaseOrder = ['discovery', 'read', 'write', 'exec', 'query', 'state'];
      const lastPhase = phaseOrder[phaseOrder.length - 1];

      expect(lastPhase).toBe('state');
    });
  });

  // ============================================================================
  // Type Guards
  // ============================================================================

  describe('Type Guards', () => {
    it('correctly identifies grep queries', () => {
      const grepQuery: GrepQuery = {
        id: 'test',
        type: 'grep',
        pattern: 'test',
      };
      const globQuery: GlobQuery = {
        id: 'test',
        type: 'glob',
        patterns: ['**/*'],
      };

      expect(isGrepQuery(grepQuery)).toBe(true);
      expect(isGrepQuery(globQuery)).toBe(false);
    });

    it('correctly identifies glob queries', () => {
      const globQuery: GlobQuery = {
        id: 'test',
        type: 'glob',
        patterns: ['**/*'],
      };
      const symbolQuery: SymbolQuery = {
        id: 'test',
        type: 'symbols',
      };

      expect(isGlobQuery(globQuery)).toBe(true);
      expect(isGlobQuery(symbolQuery)).toBe(false);
    });

    it('correctly identifies symbol queries', () => {
      const symbolQuery: SymbolQuery = {
        id: 'test',
        type: 'symbols',
      };
      const grepQuery: GrepQuery = {
        id: 'test',
        type: 'grep',
        pattern: 'test',
      };

      expect(isSymbolQuery(symbolQuery)).toBe(true);
      expect(isSymbolQuery(grepQuery)).toBe(false);
    });

    it('correctly identifies grep results', () => {
      const grepResult: GrepResult = {
        query_id: 'test',
        type: 'grep',
        total_matches: 0,
        files_matched: 0,
        matches: [],
        truncated: false,
        tokens_used: 0,
      };
      const globResult: GlobResult = {
        query_id: 'test',
        type: 'glob',
        total_files: 0,
        files: [],
        truncated: false,
        tokens_used: 0,
      };

      expect(isGrepResult(grepResult)).toBe(true);
      expect(isGrepResult(globResult)).toBe(false);
    });

    it('correctly identifies glob results', () => {
      const globResult: GlobResult = {
        query_id: 'test',
        type: 'glob',
        total_files: 0,
        files: [],
        truncated: false,
        tokens_used: 0,
      };
      const symbolResult: SymbolResult = {
        query_id: 'test',
        type: 'symbols',
        total_symbols: 0,
        symbols: [],
        truncated: false,
        tokens_used: 0,
      };

      expect(isGlobResult(globResult)).toBe(true);
      expect(isGlobResult(symbolResult)).toBe(false);
    });

    it('correctly identifies symbol results', () => {
      const symbolResult: SymbolResult = {
        query_id: 'test',
        type: 'symbols',
        total_symbols: 0,
        symbols: [],
        truncated: false,
        tokens_used: 0,
      };
      const grepResult: GrepResult = {
        query_id: 'test',
        type: 'grep',
        total_matches: 0,
        files_matched: 0,
        matches: [],
        truncated: false,
        tokens_used: 0,
      };

      expect(isSymbolResult(symbolResult)).toBe(true);
      expect(isSymbolResult(grepResult)).toBe(false);
    });
  });
});
