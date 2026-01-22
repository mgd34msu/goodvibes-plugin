# Operation Types Quick Reference

## Import Statement

```typescript
import type {
  // READ operations
  ReadOperation,
  FileReadResult,
  SearchResult,
  GlobResult,
  SymbolResult,
  UrlResult,
  AnalyzeResult,

  // WRITE operations
  WriteOperation,
  CreateResult,
  EditResult,
  DeleteResult,
  MoveResult,
  CopyResult,

  // EXEC operations
  ExecOperation,
  CommandResult,
  AgentResult,
  ScriptResult,

  // QUERY operations
  QueryOperation,
  LspResult,
  ValidateResult,
  DiagnoseResult,

  // STATE operations
  StateOperation,
  GetResult,
  SetResult,
  TrackResult,
  MemoryQueryResult,
} from '@goodvibes/batch-engine';
```

---

## READ Operations

### File Read
```typescript
{
  type: 'files',
  id: 'read-config',
  targets: ['src/config.ts'],
  extract: 'content',  // 'content' | 'outline' | 'symbols' | 'ast' | 'lines'
  options: {
    include_line_numbers: true,
    max_lines: 1000
  }
}
```

### Search
```typescript
{
  type: 'search',
  id: 'find-todos',
  pattern: 'TODO:',
  mode: 'regex',  // 'regex' | 'semantic' | 'fuzzy'
  glob: 'src/**/*.ts',
  context: {
    before: 2,
    after: 2
  }
}
```

### Glob
```typescript
{
  type: 'glob',
  id: 'find-tests',
  patterns: ['**/*.test.ts', '**/*.spec.ts'],
  exclude: ['node_modules/**'],
  filters: {
    modified_after: '2024-01-01'
  }
}
```

### Symbols
```typescript
{
  type: 'symbols',
  id: 'find-functions',
  query: 'handle',
  kinds: ['function', 'method'],
  scope: 'src/handlers/**/*.ts'
}
```

### URL Fetch
```typescript
{
  type: 'url',
  id: 'fetch-docs',
  targets: ['https://example.com/api/docs'],
  extract: 'markdown',  // 'raw' | 'markdown' | 'text' | 'structured'
  options: {
    cache_ttl_seconds: 3600
  }
}
```

### Analyze
```typescript
{
  type: 'analyze',
  id: 'check-deps',
  kind: 'dependencies',  // 'dependencies' | 'dead_code' | 'circular_deps' | etc.
  target: 'src/',
  options: {}
}
```

---

## WRITE Operations

### Create Files
```typescript
{
  type: 'create',
  id: 'create-component',
  files: [
    {
      path: 'src/components/Button.tsx',
      content: 'export function Button() { ... }'
    }
  ],
  options: {
    overwrite: false,
    create_dirs: true
  }
}
```

### Edit Files
```typescript
{
  type: 'edit',
  id: 'update-config',
  edits: [
    {
      file: 'src/config.ts',
      edits: [
        {
          find: 'const API_URL = "localhost"',
          replace: 'const API_URL = process.env.API_URL',
          occurrence: 'first'
        }
      ]
    }
  ],
  options: {
    match_mode: 'exact',  // 'exact' | 'regex' | 'ast' | 'fuzzy'
    conflict_strategy: 'fail'  // 'fail' | 'merge' | 'force'
  }
}
```

### Delete Files
```typescript
{
  type: 'delete',
  id: 'cleanup',
  files: ['src/old-component.tsx'],
  options: {
    max_files: 10,
    blocked_paths: ['src/core/**']
  }
}
```

### Move Files
```typescript
{
  type: 'move',
  id: 'reorganize',
  moves: [
    {
      from: 'src/utils/helper.ts',
      to: 'src/lib/helper.ts'
    }
  ],
  options: {
    overwrite: false,
    update_imports: true
  }
}
```

### Copy Files
```typescript
{
  type: 'copy',
  id: 'duplicate-template',
  copies: [
    {
      from: 'templates/component.tsx',
      to: 'src/components/NewComponent.tsx'
    }
  ]
}
```

### Atomic Transaction
```typescript
{
  type: 'atomic',
  id: 'atomic-update',
  operations: [
    { type: 'create', ... },
    { type: 'edit', ... }
  ],
  options: {
    rollback_on_failure: true
  }
}
```

---

## EXEC Operations

### Command Execution
```typescript
{
  type: 'command',
  id: 'run-tests',
  commands: [
    {
      cmd: 'npm test',
      timeout_ms: 60000,
      expect: {
        exit_code: 0,
        stderr_empty: true
      }
    }
  ],
  options: {
    working_dir: './src',
    env: { NODE_ENV: 'test' },
    safe_mode: true
  }
}
```

### Agent Spawning
```typescript
{
  type: 'agent',
  id: 'spawn-reviewer',
  agents: [
    {
      id: 'reviewer-1',
      agent: 'code-reviewer',
      task: 'Review the authentication module',
      budget: {
        max_tokens: 10000,
        max_turns: 5,
        timeout_ms: 300000
      },
      model: 'sonnet',  // 'sonnet' | 'opus' | 'haiku'
      inject: {
        context: ['codebase-standards'],
        files: ['src/auth/**/*.ts']
      },
      chain_on_complete: {
        agent: 'implementer',
        task: 'Fix identified issues',
        condition: 'failures > 0'
      }
    }
  ]
}
```

### Script Execution
```typescript
{
  type: 'script',
  id: 'run-migration',
  scripts: [
    {
      language: 'node',  // 'bash' | 'python' | 'node' | 'deno' | 'bun'
      code: 'console.log("Running migration...")',
      args: ['--env', 'production']
    }
  ]
}
```

---

## QUERY Operations

### LSP Queries
```typescript
{
  type: 'lsp',
  id: 'find-definition',
  queries: [
    {
      operation: 'definition',  // 'definition' | 'references' | 'implementations' | etc.
      file: 'src/index.ts',
      position: { line: 10, character: 5 }
    }
  ]
}
```

### Validation
```typescript
{
  type: 'validate',
  id: 'check-code',
  validations: [
    {
      checks: [
        { kind: 'typecheck' },
        { kind: 'lint' },
        { kind: 'test' }
      ],
      options: {
        fix: true,
        paths: ['src/']
      }
    }
  ]
}
```

### Diagnosis
```typescript
{
  type: 'diagnose',
  id: 'debug-error',
  diagnoses: [
    {
      kind: 'error_stack',  // 'error_stack' | 'type_error' | 'runtime_error' | etc.
      subject: 'TypeError: Cannot read property...',
      context: {
        file: 'src/app.ts',
        line: 42
      }
    }
  ]
}
```

---

## STATE Operations

### Get State
```typescript
{
  type: 'get',
  id: 'get-session',
  keys: ['session.mode', 'session.id', 'agents.active']
}
```

### Set State
```typescript
{
  type: 'set',
  id: 'update-state',
  entries: [
    { key: 'session.mode', value: 'vibecoding' },
    { key: 'custom.setting', value: { enabled: true } }
  ],
  options: {
    merge: true,
    persist: true
  }
}
```

### Track Entry
```typescript
{
  type: 'track',
  id: 'track-decision',
  entries: [
    {
      kind: 'decision',  // 'decision' | 'pattern' | 'failure' | 'task' | 'metric'
      data: {
        what: 'Use React Query for data fetching',
        why: 'Better caching and invalidation',
        category: 'library',
        confidence: 'high'
      }
    }
  ]
}
```

### Memory Query
```typescript
{
  type: 'query',
  id: 'search-memory',
  filters: {
    kinds: ['decision', 'pattern'],
    since: '2024-01-01',
    keywords: ['authentication', 'security'],
    limit: 10
  }
}
```

---

## Result Type Checking

```typescript
import { isFileReadResult, isCommandResult, isValidateResult } from '@goodvibes/batch-engine';

function handleResult(result: OperationResult) {
  if (isFileReadResult(result)) {
    // result.data.files is now typed correctly
    result.data.files.forEach(file => {
      console.log(file.path, file.content);
    });
  }

  if (isCommandResult(result)) {
    // result.data.commands is now typed correctly
    result.data.commands.forEach(cmd => {
      console.log(cmd.cmd, cmd.exit_code);
    });
  }

  if (isValidateResult(result)) {
    // result.data.validations is now typed correctly
    const failed = result.data.validations.filter(v => !v.passed);
    console.log(`${failed.length} validations failed`);
  }
}
```

---

## Batch Example

```typescript
const batch: Batch = {
  id: 'feature-implementation',
  operations: {
    read: [
      {
        type: 'files',
        id: 'read-existing',
        targets: ['src/auth/**/*.ts'],
        extract: 'outline'
      },
      {
        type: 'search',
        id: 'find-patterns',
        pattern: 'export (function|const|class)',
        mode: 'regex',
        glob: 'src/**/*.ts'
      }
    ],
    write: [
      {
        type: 'create',
        id: 'create-feature',
        files: [
          { path: 'src/features/new-feature.ts', content: '...' }
        ]
      },
      {
        type: 'edit',
        id: 'update-exports',
        edits: [
          {
            file: 'src/index.ts',
            edits: [
              { find: '// exports', replace: "export * from './features/new-feature';\n// exports" }
            ]
          }
        ]
      }
    ],
    exec: [
      {
        type: 'command',
        id: 'validate',
        commands: [
          { cmd: 'npm run typecheck', expect: { exit_code: 0 } },
          { cmd: 'npm run lint', expect: { exit_code: 0 } }
        ]
      }
    ],
    state: [
      {
        type: 'track',
        id: 'track-feature',
        entries: [
          {
            kind: 'task',
            data: {
              name: 'Implement new feature',
              status: 'completed',
              files: ['src/features/new-feature.ts']
            }
          }
        ]
      }
    ]
  },
  config: { /* ... */ },
  lifecycle: { /* ... */ },
  output: { mode: 'standard', include: [], exclude: [] }
};
```

---

## Common Patterns

### Read → Process → Write
```typescript
{
  operations: {
    read: [
      { type: 'files', id: 'read-source', targets: ['src/old.ts'], extract: 'content' }
    ],
    write: [
      {
        type: 'edit',
        id: 'update',
        edits: [{ file: 'src/old.ts', edits: [{ find: 'old', replace: 'new' }] }],
        depends_on: ['read-source']
      }
    ]
  }
}
```

### Analyze → Fix → Validate
```typescript
{
  operations: {
    read: [
      { type: 'analyze', id: 'analyze', kind: 'dead_code' }
    ],
    write: [
      {
        type: 'delete',
        id: 'cleanup',
        files: ['{{analyze.findings.unused_files}}'],
        depends_on: ['analyze']
      }
    ],
    exec: [
      {
        type: 'command',
        id: 'verify',
        commands: [{ cmd: 'npm run build', expect: { exit_code: 0 } }],
        depends_on: ['cleanup']
      }
    ]
  }
}
```

### Parallel Agent Processing
```typescript
{
  operations: {
    exec: [
      {
        type: 'agent',
        id: 'parallel-review',
        agents: [
          { id: 'reviewer-1', agent: 'reviewer', task: 'Review auth module' },
          { id: 'reviewer-2', agent: 'reviewer', task: 'Review API module' },
          { id: 'reviewer-3', agent: 'reviewer', task: 'Review UI module' }
        ]
      }
    ],
    state: [
      {
        type: 'track',
        id: 'consolidate',
        entries: [
          { kind: 'decision', data: { reviews: '{{parallel-review.agents}}' } }
        ],
        depends_on: ['parallel-review']
      }
    ]
  }
}
```
