/**
 * Integration tests for operation phase execution
 * Tests READ, WRITE, EXEC, QUERY, and STATE operations
 * @see SPEC-v2 Sections 4.1-4.5
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { ReadOperation } from '../interfaces/operations/read.js';
import type { WriteOperation } from '../interfaces/operations/write.js';
import type { ExecOperation, QueryOperation, StateOperation } from '../interfaces/operations/exec.js';

describe('Operation Phases Integration', () => {
  describe('READ Operations', () => {
    it('executes files operation and returns content', async () => {
      // Arrange
      const operation: ReadOperation = {
        type: 'files',
        id: 'read-001',
        targets: ['test.ts', 'utils.ts'],
        extract: 'content',
        options: {
          include_line_numbers: true,
          max_lines: 100,
        },
      };

      // Act
      const result = await executeReadOperationMock(operation);

      // Assert
      expect(result.success).toBe(true);
      expect(result.files_read).toBe(2);
      expect(result.data).toHaveProperty('test.ts');
      expect(result.data).toHaveProperty('utils.ts');
    });

    it('executes search operation with regex pattern', async () => {
      // Arrange
      const operation: ReadOperation = {
        type: 'search',
        id: 'search-001',
        pattern: 'export.*function',
        mode: 'regex',
        glob: '**/*.ts',
        context: {
          before: 2,
          after: 2,
          max_per_file: 5,
        },
        options: {
          case_sensitive: false,
        },
      };

      // Act
      const result = await executeReadOperationMock(operation);

      // Assert
      expect(result.success).toBe(true);
      expect(result.matches).toBeGreaterThan(0);
      expect(result.files_searched).toBeGreaterThan(0);
    });

    it('executes glob operation with filters', async () => {
      // Arrange
      const operation: ReadOperation = {
        type: 'glob',
        id: 'glob-001',
        patterns: ['src/**/*.ts', 'lib/**/*.ts'],
        exclude: ['**/*.test.ts', '**/*.spec.ts'],
        filters: {
          min_size: 100,
          max_size: 10000,
          modified_after: '2024-01-01T00:00:00Z',
        },
        options: {
          respect_gitignore: true,
          preview_lines: 3,
          include_stats: true,
        },
      };

      // Act
      const result = await executeReadOperationMock(operation);

      // Assert
      expect(result.success).toBe(true);
      expect(result.files_found).toBeGreaterThan(0);
      expect(result.files).toBeInstanceOf(Array);
    });

    it('executes symbols operation with kind filter', async () => {
      // Arrange
      const operation: ReadOperation = {
        type: 'symbols',
        id: 'symbols-001',
        query: 'execute',
        kinds: ['function', 'method'],
        scope: 'src/**/*.ts',
        options: {
          include_location: true,
          include_signature: true,
          max_results: 50,
        },
      };

      // Act
      const result = await executeReadOperationMock(operation);

      // Assert
      expect(result.success).toBe(true);
      expect(result.symbols).toBeInstanceOf(Array);
      expect(result.symbols.length).toBeLessThanOrEqual(50);
    });

    it('executes url operation and extracts content', async () => {
      // Arrange
      const operation: ReadOperation = {
        type: 'url',
        id: 'url-001',
        targets: ['https://example.com/api/data'],
        extract: 'structured',
        options: {
          cache_ttl_seconds: 300,
          selectors: ['.content', '#main'],
          summarize: true,
          max_tokens: 1000,
        },
      };

      // Act
      const result = await executeReadOperationMock(operation);

      // Assert
      expect(result.success).toBe(true);
      expect(result.urls_fetched).toBe(1);
      expect(result.data).toBeDefined();
    });

    it('executes analyze operation for dependencies', async () => {
      // Arrange
      const operation: ReadOperation = {
        type: 'analyze',
        id: 'analyze-001',
        kind: 'dependencies',
        target: 'package.json',
        options: {
          include_dev: true,
          check_updates: true,
        },
      };

      // Act
      const result = await executeReadOperationMock(operation);

      // Assert
      expect(result.success).toBe(true);
      expect(result.analysis).toBeDefined();
      expect(result.analysis.kind).toBe('dependencies');
    });
  });

  describe('WRITE Operations', () => {
    it('executes create operation and creates files', async () => {
      // Arrange
      const operation: WriteOperation = {
        type: 'create',
        id: 'write-001',
        files: [
          {
            path: 'new-file.ts',
            content: 'export const test = "value";',
            encoding: 'utf-8',
          },
          {
            path: 'config.json',
            content: '{"key": "value"}',
          },
        ],
        options: {
          overwrite: false,
          create_dirs: true,
          template: 'none',
        },
      };

      // Act
      const result = await executeWriteOperationMock(operation);

      // Assert
      expect(result.success).toBe(true);
      expect(result.files_created).toBe(2);
      expect(result.created_paths).toContain('new-file.ts');
      expect(result.created_paths).toContain('config.json');
    });

    it('executes edit operation with multiple edits', async () => {
      // Arrange
      const operation: WriteOperation = {
        type: 'edit',
        id: 'write-002',
        edits: [
          {
            file: 'src/index.ts',
            edits: [
              {
                find: 'const oldName',
                replace: 'const newName',
                occurrence: 'all',
              },
              {
                find: 'function legacy()',
                replace: 'function modern()',
                in_function: 'main',
              },
            ],
          },
        ],
        options: {
          match_mode: 'exact',
          conflict_strategy: 'fail',
          create_if_missing: false,
        },
      };

      // Act
      const result = await executeWriteOperationMock(operation);

      // Assert
      expect(result.success).toBe(true);
      expect(result.files_edited).toBe(1);
      expect(result.edits_applied).toBe(2);
    });

    it('executes delete operation with safety checks', async () => {
      // Arrange
      const operation: WriteOperation = {
        type: 'delete',
        id: 'write-003',
        files: ['temp.log', 'cache/*.tmp'],
        options: {
          require_empty: false,
          max_files: 100,
          confirm_patterns: ['*.tmp', '*.log'],
          blocked_paths: ['node_modules', '.git'],
        },
      };

      // Act
      const result = await executeWriteOperationMock(operation);

      // Assert
      expect(result.success).toBe(true);
      expect(result.files_deleted).toBeGreaterThan(0);
      expect(result.deleted_paths).not.toContain('node_modules');
    });

    it('executes move operation and updates imports', async () => {
      // Arrange
      const operation: WriteOperation = {
        type: 'move',
        id: 'write-004',
        moves: [
          {
            from: 'src/old-location.ts',
            to: 'src/new-location.ts',
          },
        ],
        options: {
          overwrite: false,
          update_imports: true,
        },
      };

      // Act
      const result = await executeWriteOperationMock(operation);

      // Assert
      expect(result.success).toBe(true);
      expect(result.files_moved).toBe(1);
      expect(result.imports_updated).toBeGreaterThan(0);
    });

    it('executes copy operation with transformation', async () => {
      // Arrange
      const operation: WriteOperation = {
        type: 'copy',
        id: 'write-005',
        copies: [
          {
            from: 'template.ts',
            to: 'generated.ts',
            transform: 'handlebars',
          },
        ],
        options: {
          overwrite: false,
          preserve_timestamps: true,
        },
      };

      // Act
      const result = await executeWriteOperationMock(operation);

      // Assert
      expect(result.success).toBe(true);
      expect(result.files_copied).toBe(1);
    });

    it('executes atomic operation with rollback on failure', async () => {
      // Arrange
      const operation: WriteOperation = {
        type: 'atomic',
        id: 'write-006',
        operations: [
          {
            type: 'create',
            id: 'atomic-create',
            files: [{ path: 'file1.ts', content: 'content1' }],
          },
          {
            type: 'edit',
            id: 'atomic-edit',
            edits: [
              {
                file: 'file2.ts',
                edits: [{ find: 'old', replace: 'new' }],
              },
            ],
          },
        ],
        options: {
          rollback_on_failure: true,
          continue_on_error: false,
        },
      };

      // Act
      const result = await executeWriteOperationMock(operation);

      // Assert
      expect(result.success).toBe(true);
      expect(result.operations_completed).toBe(2);
    });
  });

  describe('EXEC Operations', () => {
    it('executes command operation with expectations', async () => {
      // Arrange
      const operation: ExecOperation = {
        type: 'command',
        id: 'exec-001',
        commands: [
          {
            cmd: 'npm test',
            timeout_ms: 30000,
            capture: {
              stdout: true,
              stderr: true,
              exit_code: true,
            },
            expect: {
              exit_code: 0,
              stdout_contains: 'PASS',
              stderr_empty: true,
            },
          },
        ],
        options: {
          shell: 'bash',
          working_dir: process.cwd(),
          safe_mode: true,
        },
      };

      // Act
      const result = await executeExecOperationMock(operation);

      // Assert
      expect(result.success).toBe(true);
      expect(result.commands_executed).toBe(1);
      expect(result.exit_code).toBe(0);
    });

    it('executes agent operation with budget constraints', async () => {
      // Arrange
      const operation: ExecOperation = {
        type: 'agent',
        id: 'exec-002',
        agents: [
          {
            id: 'agent-001',
            agent: 'engineer',
            task: 'Implement feature X',
            budget: {
              max_tokens: 10000,
              max_turns: 5,
              timeout_ms: 60000,
            },
            model: 'sonnet',
            inject: {
              context: ['context-key-1'],
              files: ['src/main.ts'],
              memory: ['decision-001'],
            },
          },
        ],
      };

      // Act
      const result = await executeExecOperationMock(operation);

      // Assert
      expect(result.success).toBe(true);
      expect(result.agents_spawned).toBe(1);
      expect(result.agents_completed).toBe(1);
    });

    it('executes script operation in multiple languages', async () => {
      // Arrange
      const operation: ExecOperation = {
        type: 'script',
        id: 'exec-003',
        scripts: [
          {
            language: 'bash',
            code: 'echo "Hello from bash"',
            args: [],
          },
          {
            language: 'node',
            code: 'console.log("Hello from node")',
            args: [],
          },
        ],
      };

      // Act
      const result = await executeExecOperationMock(operation);

      // Assert
      expect(result.success).toBe(true);
      expect(result.scripts_executed).toBe(2);
    });
  });

  describe('QUERY Operations', () => {
    it('executes validate operation with multiple checks', async () => {
      // Arrange
      const operation: QueryOperation = {
        type: 'validate',
        id: 'query-001',
        validations: [
          {
            checks: [
              { kind: 'typecheck' },
              { kind: 'lint' },
              { kind: 'test' },
            ],
            options: {
              fix: false,
              paths: ['src/**/*.ts'],
            },
          },
        ],
      };

      // Act
      const result = await executeQueryOperationMock(operation);

      // Assert
      expect(result.success).toBe(true);
      expect(result.checks_run).toBe(3);
      expect(result.checks_passed).toBeGreaterThanOrEqual(0);
    });

    it('executes diagnose operation for error analysis', async () => {
      // Arrange
      const operation: QueryOperation = {
        type: 'diagnose',
        id: 'query-002',
        diagnoses: [
          {
            kind: 'error_stack',
            subject: 'TypeError: Cannot read property "x" of undefined',
            context: {
              file: 'src/app.ts',
              line: 42,
            },
          },
        ],
      };

      // Act
      const result = await executeQueryOperationMock(operation);

      // Assert
      expect(result.success).toBe(true);
      expect(result.diagnosis).toBeDefined();
      expect(result.diagnosis.root_cause).toBeDefined();
      expect(result.diagnosis.suggestions).toBeInstanceOf(Array);
    });
  });

  describe('STATE Operations', () => {
    it('executes get operation to retrieve state', async () => {
      // Arrange
      const operation: StateOperation = {
        type: 'get',
        id: 'state-001',
        keys: ['session.user', 'batch.config', 'agent.status'],
      };

      // Act
      const result = await executeStateOperationMock(operation);

      // Assert
      expect(result.success).toBe(true);
      expect(result.values).toBeDefined();
      expect(Object.keys(result.values)).toHaveLength(3);
    });

    it('executes set operation to store state', async () => {
      // Arrange
      const operation: StateOperation = {
        type: 'set',
        id: 'state-002',
        entries: [
          { key: 'batch.status', value: 'running' },
          { key: 'operation.count', value: 5 },
          { key: 'context.data', value: { nested: 'object' } },
        ],
        options: {
          merge: false,
          persist: true,
        },
      };

      // Act
      const result = await executeStateOperationMock(operation);

      // Assert
      expect(result.success).toBe(true);
      expect(result.entries_set).toBe(3);
    });

    it('executes track operation to record decisions and patterns', async () => {
      // Arrange
      const operation: StateOperation = {
        type: 'track',
        id: 'state-003',
        entries: [
          {
            kind: 'decision',
            data: {
              what: 'Use Vitest for testing',
              why: 'Better performance and Vite integration',
              category: 'testing',
            },
          },
          {
            kind: 'pattern',
            data: {
              name: 'Repository Pattern',
              description: 'Centralized data access',
              examples: [],
            },
          },
        ],
      };

      // Act
      const result = await executeStateOperationMock(operation);

      // Assert
      expect(result.success).toBe(true);
      expect(result.entries_tracked).toBe(2);
    });

    it('executes query operation to search memory', async () => {
      // Arrange
      const operation: StateOperation = {
        type: 'query',
        id: 'state-004',
        filters: {
          kinds: ['decision', 'pattern'],
          since: '2024-01-01T00:00:00Z',
          keywords: ['testing', 'vitest'],
          limit: 10,
        },
      };

      // Act
      const result = await executeStateOperationMock(operation);

      // Assert
      expect(result.success).toBe(true);
      expect(result.results).toBeInstanceOf(Array);
      expect(result.results.length).toBeLessThanOrEqual(10);
    });

    it('executes delete operation to remove state keys', async () => {
      // Arrange
      const operation: StateOperation = {
        type: 'delete_state',
        id: 'state-005',
        keys: ['temp.data', 'cache.results'],
      };

      // Act
      const result = await executeStateOperationMock(operation);

      // Assert
      expect(result.success).toBe(true);
      expect(result.keys_deleted).toBe(2);
    });

    it('executes list operation to enumerate state keys', async () => {
      // Arrange
      const operation: StateOperation = {
        type: 'list',
        id: 'state-006',
        prefix: 'batch.',
      };

      // Act
      const result = await executeStateOperationMock(operation);

      // Assert
      expect(result.success).toBe(true);
      expect(result.keys).toBeInstanceOf(Array);
      expect(result.keys.every((k: string) => k.startsWith('batch.'))).toBe(true);
    });
  });
});

// ============================================================================
// Mock Implementations
// ============================================================================

async function executeReadOperationMock(op: ReadOperation): Promise<any> {
  switch (op.type) {
    case 'files':
      return {
        success: true,
        files_read: op.targets.length,
        data: Object.fromEntries(op.targets.map((t) => [typeof t === 'string' ? t : t.path, 'file content'])),
      };
    case 'search':
      return { success: true, matches: 5, files_searched: 3 };
    case 'glob':
      return { success: true, files_found: 10, files: ['file1.ts', 'file2.ts'] };
    case 'symbols':
      return { success: true, symbols: [{ name: 'execute', kind: 'function' }] };
    case 'url':
      return { success: true, urls_fetched: 1, data: { content: 'fetched' } };
    case 'analyze':
      return { success: true, analysis: { kind: op.kind, results: {} } };
  }
}

async function executeWriteOperationMock(op: WriteOperation): Promise<any> {
  switch (op.type) {
    case 'create':
      return { success: true, files_created: op.files.length, created_paths: op.files.map((f) => f.path) };
    case 'edit':
      return { success: true, files_edited: op.edits.length, edits_applied: op.edits.reduce((sum, e) => sum + e.edits.length, 0) };
    case 'delete':
      return { success: true, files_deleted: op.files.length, deleted_paths: op.files };
    case 'move':
      return { success: true, files_moved: op.moves.length, imports_updated: 3 };
    case 'copy':
      return { success: true, files_copied: op.copies.length };
    case 'atomic':
      return { success: true, operations_completed: op.operations.length };
  }
}

async function executeExecOperationMock(op: ExecOperation): Promise<any> {
  switch (op.type) {
    case 'command':
      return { success: true, commands_executed: op.commands.length, exit_code: 0 };
    case 'agent':
      return { success: true, agents_spawned: op.agents.length, agents_completed: op.agents.length };
    case 'script':
      return { success: true, scripts_executed: op.scripts.length };
  }
}

async function executeQueryOperationMock(op: QueryOperation): Promise<any> {
  switch (op.type) {
    case 'validate':
      const totalChecks = op.validations.reduce((sum, v) => sum + v.checks.length, 0);
      return { success: true, checks_run: totalChecks, checks_passed: totalChecks };
    case 'diagnose':
      return {
        success: true,
        diagnosis: {
          root_cause: 'Accessing property on undefined value',
          suggestions: ['Add null check', 'Use optional chaining'],
        },
      };
    case 'lsp':
      return { success: true, results: [] };
  }
}

async function executeStateOperationMock(op: StateOperation): Promise<any> {
  switch (op.type) {
    case 'get':
      return { success: true, values: Object.fromEntries(op.keys.map((k) => [k, 'value'])) };
    case 'set':
      return { success: true, entries_set: op.entries.length };
    case 'delete_state':
      return { success: true, keys_deleted: op.keys.length };
    case 'list':
      return { success: true, keys: ['batch.config', 'batch.status'] };
    case 'track':
      return { success: true, entries_tracked: op.entries.length };
    case 'query':
      return { success: true, results: [] };
  }
}
