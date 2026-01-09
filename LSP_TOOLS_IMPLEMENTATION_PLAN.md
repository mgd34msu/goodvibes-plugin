# GoodVibes LSP & Intelligence Tools Implementation Plan

> Created: 2025-01-09
> Status: Planning Complete, Ready for Implementation

## Overview

Implement 33 MCP tools to give Claude Code semantic understanding of codebases, replacing text-based grep/glob with proper language intelligence.

**Key Insight:** With `ENABLE_EXPERIMENTAL_MCP_CLI=1`, tools are discovered on-demand via mcp-cli, so there's zero context cost for tool definitions. We can build all 33 tools without compromise.

---

## Tool Inventory

### 1. LSP Tools (15 tools)

Core TypeScript Language Service integration for semantic code understanding.

| Tool | Input | Output | Priority |
|------|-------|--------|----------|
| `find_references` | file, line, column | Array of locations where symbol is used | P0 |
| `go_to_definition` | file, line, column | Location(s) of symbol definition | P0 |
| `rename_symbol` | file, line, column, newName | File edits to apply | P0 |
| `get_code_actions` | file, line, column (or range) | Available quick fixes | P0 |
| `apply_code_action` | file, action_id | File edits to apply | P0 |
| `get_call_hierarchy` | file, line, column, direction | Incoming/outgoing call tree | P1 |
| `get_symbol_info` | file, line, column | Type info, documentation, definition | P1 |
| `get_document_symbols` | file | Structural outline (classes, functions, etc.) | P1 |
| `get_signature_help` | file, line, column | Function parameter info | P1 |
| `analyze_impact` | file, line, column | Affected files, tests, modules | P1 |
| `find_dead_code` | file or directory | Unused exports/functions | P2 |
| `get_api_surface` | file or directory | Public vs internal API | P2 |
| `detect_breaking_changes` | before_ref, after_ref | Breaking API changes | P2 |
| `semantic_diff` | before_ref, after_ref | Type-aware diff | P2 |
| `get_diagnostics` | files (optional) | All errors with fixes | P1 |

### 2. Test Intelligence (3 tools)

Understanding test coverage and suggesting test cases.

| Tool | Input | Output | Priority |
|------|-------|--------|----------|
| `find_tests_for_file` | file | Test files that cover this file | P1 |
| `get_test_coverage` | file, function (optional) | Coverage percentage, uncovered lines | P2 |
| `suggest_test_cases` | file, function | Edge cases to test | P2 |

### 3. Dependency Intelligence (2 tools)

Package and import analysis.

| Tool | Input | Output | Priority |
|------|-------|--------|----------|
| `analyze_dependencies` | - | Used/unused/outdated/vulnerable packages | P1 |
| `find_circular_deps` | - | Import cycles with paths | P1 |

### 4. Schema Intelligence (3 tools)

Database, API, and GraphQL schema understanding.

| Tool | Input | Output | Priority |
|------|-------|--------|----------|
| `get_database_schema` | - | Tables, columns, relations (Prisma, Drizzle, SQL) | P1 |
| `get_api_routes` | - | REST endpoints (Express, Next.js, Fastify) | P1 |
| `get_graphql_schema` | - | Types, queries, mutations, subscriptions | P2 |

### 5. Project Intelligence (2 tools)

Convention and configuration discovery.

| Tool | Input | Output | Priority |
|------|-------|--------|----------|
| `get_conventions` | - | Naming, imports, patterns used in codebase | P2 |
| `get_env_config` | - | Required/optional env vars with usage | P1 |

### 6. Error Intelligence (2 tools)

Error parsing and explanation.

| Tool | Input | Output | Priority |
|------|-------|--------|----------|
| `parse_error_stack` | error_text | Root cause, call stack, suggestions | P1 |
| `explain_type_error` | error_code, error_message | Human explanation with fixes | P1 |

### 7. Build Intelligence (1 tool)

Bundle analysis.

| Tool | Input | Output | Priority |
|------|-------|--------|----------|
| `analyze_bundle` | - | Size breakdown, duplicates, tree-shaking issues | P2 |

### 8. Security Intelligence (2 tools)

Security scanning.

| Tool | Input | Output | Priority |
|------|-------|--------|----------|
| `scan_for_secrets` | files (optional) | Leaked credentials with locations | P1 |
| `check_permissions` | file | File/network/system access analysis | P2 |

### 9. Framework-Specific (3 tools)

Framework-aware analysis.

| Tool | Input | Output | Priority |
|------|-------|--------|----------|
| `get_react_component_tree` | file (optional) | Component hierarchy with props | P2 |
| `get_nextjs_routes` | - | Pages, API routes, middleware, layouts | P2 |
| `get_prisma_operations` | - | DB queries, N+1 detection, missing indexes | P2 |

---

## Architecture

### Directory Structure

```
plugins/goodvibes/tools/
├── definitions/
│   ├── lsp/
│   │   ├── find-references.yaml
│   │   ├── go-to-definition.yaml
│   │   ├── rename-symbol.yaml
│   │   ├── get-code-actions.yaml
│   │   ├── apply-code-action.yaml
│   │   ├── get-call-hierarchy.yaml
│   │   ├── get-symbol-info.yaml
│   │   ├── get-document-symbols.yaml
│   │   ├── get-signature-help.yaml
│   │   ├── analyze-impact.yaml
│   │   ├── find-dead-code.yaml
│   │   ├── get-api-surface.yaml
│   │   ├── detect-breaking-changes.yaml
│   │   ├── semantic-diff.yaml
│   │   └── get-diagnostics.yaml
│   ├── test/
│   │   ├── find-tests-for-file.yaml
│   │   ├── get-test-coverage.yaml
│   │   └── suggest-test-cases.yaml
│   ├── deps/
│   │   ├── analyze-dependencies.yaml
│   │   └── find-circular-deps.yaml
│   ├── schema/
│   │   ├── get-database-schema.yaml
│   │   ├── get-api-routes.yaml
│   │   └── get-graphql-schema.yaml
│   ├── project/
│   │   ├── get-conventions.yaml
│   │   └── get-env-config.yaml
│   ├── errors/
│   │   ├── parse-error-stack.yaml
│   │   └── explain-type-error.yaml
│   ├── build/
│   │   └── analyze-bundle.yaml
│   ├── security/
│   │   ├── scan-for-secrets.yaml
│   │   └── check-permissions.yaml
│   └── framework/
│       ├── get-react-component-tree.yaml
│       ├── get-nextjs-routes.yaml
│       └── get-prisma-operations.yaml
│
└── implementations/tool-search-server/src/
    ├── handlers/
    │   ├── lsp/
    │   │   ├── index.ts              # Exports all LSP handlers
    │   │   ├── language-service.ts   # Shared TS Language Service manager
    │   │   ├── find-references.ts
    │   │   ├── go-to-definition.ts
    │   │   ├── rename-symbol.ts
    │   │   ├── code-actions.ts
    │   │   ├── call-hierarchy.ts
    │   │   ├── symbol-info.ts
    │   │   ├── document-symbols.ts
    │   │   ├── signature-help.ts
    │   │   ├── impact-analysis.ts
    │   │   ├── dead-code.ts
    │   │   ├── api-surface.ts
    │   │   ├── breaking-changes.ts
    │   │   ├── semantic-diff.ts
    │   │   └── diagnostics.ts
    │   ├── test/
    │   │   ├── index.ts
    │   │   ├── find-tests.ts
    │   │   ├── coverage.ts
    │   │   └── suggest-cases.ts
    │   ├── deps/
    │   │   ├── index.ts
    │   │   ├── analyze.ts
    │   │   └── circular.ts
    │   ├── schema/
    │   │   ├── index.ts
    │   │   ├── database.ts
    │   │   ├── api-routes.ts
    │   │   └── graphql.ts
    │   ├── project/
    │   │   ├── index.ts
    │   │   ├── conventions.ts
    │   │   └── env-config.ts
    │   ├── errors/
    │   │   ├── index.ts
    │   │   ├── stack-parser.ts
    │   │   └── type-explainer.ts
    │   ├── build/
    │   │   ├── index.ts
    │   │   └── bundle-analyzer.ts
    │   ├── security/
    │   │   ├── index.ts
    │   │   ├── secrets-scanner.ts
    │   │   └── permissions.ts
    │   └── framework/
    │       ├── index.ts
    │       ├── react.ts
    │       ├── nextjs.ts
    │       └── prisma.ts
    └── index.ts                      # Register all handlers
```

### Core: TypeScript Language Service Manager

The foundation for all LSP tools. Manages Language Service instances per project.

```typescript
// language-service.ts

import ts from 'typescript';
import * as fs from 'fs';
import * as path from 'path';

interface ProjectService {
  service: ts.LanguageService;
  program: ts.Program;
  configPath: string;
  lastAccess: number;
}

class LanguageServiceManager {
  private projects: Map<string, ProjectService> = new Map();
  private maxCacheAge = 5 * 60 * 1000; // 5 minutes

  /**
   * Get or create a Language Service for a project.
   * Finds tsconfig.json and creates a service with proper settings.
   */
  async getServiceForFile(filePath: string): Promise<{
    service: ts.LanguageService;
    program: ts.Program;
    configPath: string | null;
  }> {
    const configPath = this.findTsConfig(filePath);
    const cacheKey = configPath || path.dirname(filePath);

    // Check cache
    const cached = this.projects.get(cacheKey);
    if (cached && Date.now() - cached.lastAccess < this.maxCacheAge) {
      cached.lastAccess = Date.now();
      return cached;
    }

    // Create new service
    const { service, program } = this.createLanguageService(configPath, filePath);

    const projectService: ProjectService = {
      service,
      program,
      configPath: configPath || '',
      lastAccess: Date.now(),
    };

    this.projects.set(cacheKey, projectService);
    return projectService;
  }

  private findTsConfig(startPath: string): string | null {
    let dir = path.dirname(startPath);
    const root = path.parse(dir).root;

    while (dir !== root) {
      const configPath = path.join(dir, 'tsconfig.json');
      if (fs.existsSync(configPath)) {
        return configPath;
      }
      dir = path.dirname(dir);
    }
    return null;
  }

  private createLanguageService(
    configPath: string | null,
    fallbackFile: string
  ): { service: ts.LanguageService; program: ts.Program } {
    let compilerOptions: ts.CompilerOptions = {
      allowJs: true,
      checkJs: true,
      noEmit: true,
      target: ts.ScriptTarget.ESNext,
      module: ts.ModuleKind.ESNext,
      moduleResolution: ts.ModuleResolutionKind.Bundler,
      esModuleInterop: true,
      jsx: ts.JsxEmit.ReactJSX,
    };

    let rootFiles: string[] = [];
    let projectDir = path.dirname(fallbackFile);

    if (configPath) {
      const configFile = ts.readConfigFile(configPath, ts.sys.readFile);
      const parsed = ts.parseJsonConfigFileContent(
        configFile.config,
        ts.sys,
        path.dirname(configPath)
      );
      compilerOptions = parsed.options;
      rootFiles = parsed.fileNames;
      projectDir = path.dirname(configPath);
    }

    const files: Map<string, { version: number; content: string }> = new Map();

    const host: ts.LanguageServiceHost = {
      getScriptFileNames: () => rootFiles.length > 0 ? rootFiles : [fallbackFile],
      getScriptVersion: (fileName) => {
        const file = files.get(fileName);
        return file ? String(file.version) : '0';
      },
      getScriptSnapshot: (fileName) => {
        let content = files.get(fileName)?.content;
        if (!content) {
          try {
            content = fs.readFileSync(fileName, 'utf-8');
            files.set(fileName, { version: 0, content });
          } catch {
            return undefined;
          }
        }
        return ts.ScriptSnapshot.fromString(content);
      },
      getCurrentDirectory: () => projectDir,
      getCompilationSettings: () => compilerOptions,
      getDefaultLibFileName: ts.getDefaultLibFilePath,
      fileExists: ts.sys.fileExists,
      readFile: ts.sys.readFile,
      readDirectory: ts.sys.readDirectory,
      directoryExists: ts.sys.directoryExists,
      getDirectories: ts.sys.getDirectories,
    };

    const service = ts.createLanguageService(host, ts.createDocumentRegistry());
    const program = service.getProgram()!;

    return { service, program };
  }

  /**
   * Convert a file position (line, column) to a TypeScript offset.
   */
  getPositionOffset(
    service: ts.LanguageService,
    fileName: string,
    line: number,
    column: number
  ): number {
    const sourceFile = service.getProgram()?.getSourceFile(fileName);
    if (!sourceFile) throw new Error(`File not found: ${fileName}`);
    return sourceFile.getPositionOfLineAndCharacter(line - 1, column - 1);
  }

  /**
   * Convert a TypeScript offset to line/column.
   */
  getLineAndColumn(
    service: ts.LanguageService,
    fileName: string,
    offset: number
  ): { line: number; column: number } {
    const sourceFile = service.getProgram()?.getSourceFile(fileName);
    if (!sourceFile) throw new Error(`File not found: ${fileName}`);
    const { line, character } = sourceFile.getLineAndCharacterOfPosition(offset);
    return { line: line + 1, column: character + 1 };
  }

  /**
   * Clear old cached services to free memory.
   */
  cleanup(): void {
    const now = Date.now();
    for (const [key, project] of this.projects) {
      if (now - project.lastAccess > this.maxCacheAge) {
        this.projects.delete(key);
      }
    }
  }
}

// Singleton instance
export const languageServiceManager = new LanguageServiceManager();
```

---

## Implementation Phases

### Phase 0: Foundation (Current)
- [x] `check_types` - Basic type checking with tsconfig detection
- [x] Auto-detect tsconfig.json from file directory
- [x] Use CLAUDE_PROJECT_DIR for PROJECT_ROOT

### Phase 1: Core LSP (Week 1)
Priority: P0 tools that enable safe refactoring

1. **`find_references`**
   - Use `service.getReferencesAtPosition()`
   - Return file, line, column, preview for each reference

2. **`go_to_definition`**
   - Use `service.getDefinitionAtPosition()`
   - Handle multiple definitions (overloads)

3. **`rename_symbol`**
   - Use `service.findRenameLocations()`
   - Return file edits, let caller apply them

4. **`get_code_actions`** + **`apply_code_action`**
   - Use `service.getCodeFixesAtPosition()`
   - Focus on auto-import first (most common need)

5. **`get_diagnostics`**
   - Use `service.getSemanticDiagnostics()` + `service.getSyntacticDiagnostics()`
   - Include fixes from `getCodeFixesAtPosition()`

### Phase 2: Analysis (Week 2)
Priority: P1 tools for understanding impact

6. **`get_symbol_info`**
   - Use `service.getQuickInfoAtPosition()`
   - Return type, documentation, definition location

7. **`get_document_symbols`**
   - Use `service.getNavigationTree()`
   - Return structured outline

8. **`get_call_hierarchy`**
   - Use `service.prepareCallHierarchy()` + `provideCallHierarchyIncomingCalls/OutgoingCalls`

9. **`analyze_impact`**
   - Combine find_references + call_hierarchy
   - Map to test files

10. **`get_signature_help`**
    - Use `service.getSignatureHelpItems()`

### Phase 3: Intelligence (Week 3)
Priority: P1 tools for project understanding

11. **`find_tests_for_file`**
    - Analyze import graph from test files
    - Pattern match test file names

12. **`analyze_dependencies`**
    - Parse package.json
    - Trace actual imports
    - Check npm registry for updates

13. **`find_circular_deps`**
    - Build import graph
    - Detect cycles with DFS

14. **`get_database_schema`**
    - Parse Prisma schema
    - Parse Drizzle config
    - Analyze SQL files

15. **`get_api_routes`**
    - Scan for Express/Fastify route definitions
    - Parse Next.js app/pages directories

16. **`get_env_config`**
    - Find all process.env usages
    - Parse .env.example

17. **`parse_error_stack`**
    - Regex parse stack traces
    - Map to source files
    - Suggest fixes

18. **`explain_type_error`**
    - Pattern match TS error codes
    - Provide human explanations

19. **`scan_for_secrets`**
    - Regex patterns for common secrets
    - Check staged files

### Phase 4: Advanced (Week 4)
Priority: P2 tools for advanced analysis

20. **`find_dead_code`**
    - Find all exports
    - Check if each is referenced

21. **`get_api_surface`**
    - Analyze exports vs internal

22. **`detect_breaking_changes`**
    - Compare type signatures before/after

23. **`semantic_diff`**
    - Type-aware diff

24. **`get_test_coverage`**
    - Parse coverage JSON
    - Map to functions

25. **`suggest_test_cases`**
    - Analyze function signature
    - Suggest edge cases

26. **`analyze_bundle`**
    - Run webpack-bundle-analyzer or source-map-explorer

27. **`check_permissions`**
    - Static analysis of fs/net/child_process usage

28. **`get_conventions`**
    - Analyze existing code patterns

29. **`get_graphql_schema`**
    - Parse .graphql files
    - Parse schema-first definitions

30. **`get_react_component_tree`**
    - Parse JSX
    - Build component hierarchy

31. **`get_nextjs_routes`**
    - Parse app/ and pages/ directories

32. **`get_prisma_operations`**
    - Find all prisma client usages
    - Detect N+1 patterns

---

## Example Tool Implementations

### find_references.ts

```typescript
import { languageServiceManager } from './language-service.js';
import { PROJECT_ROOT } from '../../config.js';
import * as path from 'path';

interface FindReferencesArgs {
  file: string;
  line: number;
  column: number;
  include_definition?: boolean;
}

interface Reference {
  file: string;
  line: number;
  column: number;
  preview: string;
  is_definition: boolean;
  is_write: boolean;
}

export async function handleFindReferences(args: FindReferencesArgs) {
  const filePath = path.resolve(PROJECT_ROOT, args.file);
  const { service } = await languageServiceManager.getServiceForFile(filePath);

  const position = languageServiceManager.getPositionOffset(
    service,
    filePath,
    args.line,
    args.column
  );

  const references = service.getReferencesAtPosition(filePath, position);

  if (!references) {
    return {
      content: [{
        type: 'text',
        text: JSON.stringify({ references: [], count: 0 }, null, 2),
      }],
    };
  }

  const results: Reference[] = references
    .filter(ref => args.include_definition || !ref.isDefinition)
    .map(ref => {
      const { line, column } = languageServiceManager.getLineAndColumn(
        service,
        ref.fileName,
        ref.textSpan.start
      );

      // Get preview line
      const sourceFile = service.getProgram()?.getSourceFile(ref.fileName);
      const lineStart = sourceFile?.getPositionOfLineAndCharacter(line - 1, 0) ?? 0;
      const lineEnd = sourceFile?.getPositionOfLineAndCharacter(line, 0) ?? 0;
      const preview = sourceFile?.text.slice(lineStart, lineEnd).trim() ?? '';

      return {
        file: path.relative(PROJECT_ROOT, ref.fileName),
        line,
        column,
        preview,
        is_definition: ref.isDefinition ?? false,
        is_write: ref.isWriteAccess ?? false,
      };
    });

  return {
    content: [{
      type: 'text',
      text: JSON.stringify({
        references: results,
        count: results.length,
      }, null, 2),
    }],
  };
}
```

### get_code_actions.ts (auto-import focus)

```typescript
import ts from 'typescript';
import { languageServiceManager } from './language-service.js';
import { PROJECT_ROOT } from '../../config.js';
import * as path from 'path';

interface GetCodeActionsArgs {
  file: string;
  line: number;
  column: number;
  end_line?: number;
  end_column?: number;
  only?: string[]; // Filter to specific action kinds
}

interface CodeAction {
  title: string;
  kind: string;
  is_preferred: boolean;
  edits: Array<{
    file: string;
    range: { start: { line: number; column: number }; end: { line: number; column: number } };
    new_text: string;
  }>;
}

export async function handleGetCodeActions(args: GetCodeActionsArgs) {
  const filePath = path.resolve(PROJECT_ROOT, args.file);
  const { service } = await languageServiceManager.getServiceForFile(filePath);

  const startPos = languageServiceManager.getPositionOffset(
    service,
    filePath,
    args.line,
    args.column
  );

  const endPos = args.end_line && args.end_column
    ? languageServiceManager.getPositionOffset(service, filePath, args.end_line, args.end_column)
    : startPos;

  // Get diagnostics at position first
  const diagnostics = [
    ...service.getSemanticDiagnostics(filePath),
    ...service.getSyntacticDiagnostics(filePath),
  ].filter(d => d.start !== undefined && d.start <= endPos && (d.start + (d.length ?? 0)) >= startPos);

  // Get code fixes
  const fixes = service.getCodeFixesAtPosition(
    filePath,
    startPos,
    endPos,
    diagnostics.map(d => d.code),
    {},
    {}
  );

  const actions: CodeAction[] = fixes.map(fix => ({
    title: fix.description,
    kind: fix.fixName,
    is_preferred: fix.fixAllDescription !== undefined,
    edits: fix.changes.flatMap(change =>
      change.textChanges.map(tc => {
        const start = languageServiceManager.getLineAndColumn(service, change.fileName, tc.span.start);
        const end = languageServiceManager.getLineAndColumn(service, change.fileName, tc.span.start + tc.span.length);
        return {
          file: path.relative(PROJECT_ROOT, change.fileName),
          range: { start, end },
          new_text: tc.newText,
        };
      })
    ),
  }));

  // Filter if requested
  const filtered = args.only
    ? actions.filter(a => args.only!.some(kind => a.kind.includes(kind)))
    : actions;

  return {
    content: [{
      type: 'text',
      text: JSON.stringify({
        actions: filtered,
        count: filtered.length,
      }, null, 2),
    }],
  };
}
```

---

## Testing Strategy

Each tool should have tests covering:

1. **Basic functionality** - Does it return expected results?
2. **Missing file** - Graceful error handling
3. **No tsconfig** - Falls back to sensible defaults
4. **Monorepo** - Finds correct tsconfig for nested projects
5. **JavaScript files** - Works without TypeScript
6. **Large files** - Performance is acceptable

Test files location:
```
plugins/goodvibes/tools/implementations/tool-search-server/src/__tests__/
├── lsp/
│   ├── find-references.test.ts
│   ├── go-to-definition.test.ts
│   └── ...
├── test/
├── deps/
└── ...
```

---

## Success Metrics

1. **Accuracy** - Zero false positives for find_references, go_to_definition
2. **Performance** - <500ms for single-file operations, <5s for project-wide
3. **Coverage** - Works with 90%+ of TypeScript projects
4. **Reliability** - Graceful degradation when tsconfig is missing

---

## Open Questions

1. **Memory management** - How long to cache Language Services?
2. **Multi-root workspaces** - Handle multiple tsconfig.json files?
3. **Watch mode** - Should services auto-reload when files change?
4. **JavaScript support** - Full support or TypeScript-focused?

---

## References

- [TypeScript Language Service API](https://github.com/microsoft/TypeScript/wiki/Using-the-Language-Service-API)
- [TypeScript Compiler API](https://github.com/microsoft/TypeScript/wiki/Using-the-Compiler-API)
- [LSP Specification](https://microsoft.github.io/language-server-protocol/specifications/lsp/3.17/specification/)
