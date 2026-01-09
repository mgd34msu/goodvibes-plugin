# GoodVibes LSP & Intelligence Tools Implementation Plan

> Created: 2025-01-09
> Status: Planning Complete, Ready for Implementation

## Overview

Implement 33 MCP tools to give Claude Code semantic understanding of codebases, replacing text-based grep/glob with proper language intelligence.

**Key Insight:** With `ENABLE_EXPERIMENTAL_MCP_CLI=1`, tools are discovered on-demand via mcp-cli, so there's zero context cost for tool definitions. We can build all 33 tools without compromise.

---

## Implementation Types

Tools fall into three categories:

### 🔧 Static Analysis (TypeScript API)
Uses the TypeScript Language Service API directly. These are the same APIs VS Code uses - rock solid, well-documented, deterministic results.

### 🔧 Static Analysis (Custom)
Pattern matching, AST parsing, file system analysis. Standard programming techniques.

### 🤖 LLM-Powered
Spawns a headless Claude session with gathered context. The MCP tool becomes an orchestration layer that:
1. Gathers relevant context (code, types, related files)
2. Spawns Claude with a focused prompt
3. Returns structured output

This approach turns "hard" static analysis problems into "context gathering + reasoning" - leveraging the fact that we're already running on top of an LLM.

---

## Tool Inventory

### 1. LSP Tools (15 tools)

Core TypeScript Language Service integration for semantic code understanding.

| Tool | Type | Input | Output | Priority |
|------|------|-------|--------|----------|
| `find_references` | 🔧 TS API | file, line, column | Array of locations where symbol is used | P0 |
| `go_to_definition` | 🔧 TS API | file, line, column | Location(s) of symbol definition | P0 |
| `rename_symbol` | 🔧 TS API | file, line, column, newName | File edits to apply | P0 |
| `get_code_actions` | 🔧 TS API | file, line, column (or range) | Available quick fixes | P0 |
| `apply_code_action` | 🔧 TS API | file, action_id | File edits to apply | P0 |
| `get_call_hierarchy` | 🔧 TS API | file, line, column, direction | Incoming/outgoing call tree | P1 |
| `get_symbol_info` | 🔧 TS API | file, line, column | Type info, documentation, definition | P1 |
| `get_document_symbols` | 🔧 TS API | file | Structural outline (classes, functions, etc.) | P1 |
| `get_signature_help` | 🔧 TS API | file, line, column | Function parameter info | P1 |
| `analyze_impact` | 🤖 LLM | file, line, column | Affected files, tests, modules + reasoning | P1 |
| `find_dead_code` | 🔧 TS API | file or directory | Unused exports/functions | P2 |
| `get_api_surface` | 🔧 TS API | file or directory | Public vs internal API | P2 |
| `detect_breaking_changes` | 🤖 LLM | before_ref, after_ref | Breaking API changes + migration advice | P2 |
| `semantic_diff` | 🤖 LLM | before_ref, after_ref | Type-aware diff + impact explanation | P2 |
| `get_diagnostics` | 🔧 TS API | files (optional) | All errors with fixes | P1 |

### 2. Test Intelligence (3 tools)

Understanding test coverage and suggesting test cases.

| Tool | Type | Input | Output | Priority |
|------|------|-------|--------|----------|
| `find_tests_for_file` | 🔧 Custom | file | Test files that cover this file | P1 |
| `get_test_coverage` | 🔧 Custom | file, function (optional) | Coverage percentage, uncovered lines | P2 |
| `suggest_test_cases` | 🤖 LLM | file, function | Edge cases to test with rationale | P2 |

### 3. Dependency Intelligence (2 tools)

Package and import analysis.

| Tool | Type | Input | Output | Priority |
|------|------|-------|--------|----------|
| `analyze_dependencies` | 🔧 Custom | - | Used/unused/outdated/vulnerable packages | P1 |
| `find_circular_deps` | 🔧 Custom | - | Import cycles with paths | P1 |

### 4. Schema Intelligence (3 tools)

Database, API, and GraphQL schema understanding.

| Tool | Type | Input | Output | Priority |
|------|------|-------|--------|----------|
| `get_database_schema` | 🔧 Custom | - | Tables, columns, relations (Prisma, Drizzle, SQL) | P1 |
| `get_api_routes` | 🔧 Custom | - | REST endpoints (Express, Next.js, Fastify) | P1 |
| `get_graphql_schema` | 🔧 Custom | - | Types, queries, mutations, subscriptions | P2 |

### 5. Project Intelligence (2 tools)

Convention and configuration discovery.

| Tool | Type | Input | Output | Priority |
|------|------|-------|--------|----------|
| `get_conventions` | 🤖 LLM | - | Naming, imports, patterns + why they're used | P2 |
| `get_env_config` | 🔧 Custom | - | Required/optional env vars with usage | P1 |

### 6. Error Intelligence (2 tools)

Error parsing and explanation.

| Tool | Type | Input | Output | Priority |
|------|------|-------|--------|----------|
| `parse_error_stack` | 🤖 LLM | error_text | Root cause analysis, call stack, fix suggestions | P1 |
| `explain_type_error` | 🤖 LLM | error_code, error_message, context | Human explanation with contextual fixes | P1 |

### 7. Build Intelligence (1 tool)

Bundle analysis.

| Tool | Type | Input | Output | Priority |
|------|------|-------|--------|----------|
| `analyze_bundle` | 🔧 Custom | - | Size breakdown, duplicates, tree-shaking issues | P2 |

### 8. Security Intelligence (2 tools)

Security scanning.

| Tool | Type | Input | Output | Priority |
|------|------|-------|--------|----------|
| `scan_for_secrets` | 🔧 Custom | files (optional) | Leaked credentials with locations | P1 |
| `check_permissions` | 🤖 LLM | file | File/network/system access analysis + risks | P2 |

### 9. Framework-Specific (3 tools)

Framework-aware analysis.

| Tool | Type | Input | Output | Priority |
|------|------|-------|--------|----------|
| `get_react_component_tree` | 🔧 Custom | file (optional) | Component hierarchy with props | P2 |
| `get_nextjs_routes` | 🔧 Custom | - | Pages, API routes, middleware, layouts | P2 |
| `get_prisma_operations` | 🤖 LLM | - | DB queries, N+1 detection + optimization advice | P2 |

### Summary by Implementation Type

| Type | Count | Tools |
|------|-------|-------|
| 🔧 TS API | 12 | find_references, go_to_definition, rename_symbol, get_code_actions, apply_code_action, get_call_hierarchy, get_symbol_info, get_document_symbols, get_signature_help, find_dead_code, get_api_surface, get_diagnostics |
| 🔧 Custom | 12 | find_tests_for_file, get_test_coverage, analyze_dependencies, find_circular_deps, get_database_schema, get_api_routes, get_graphql_schema, get_env_config, analyze_bundle, scan_for_secrets, get_react_component_tree, get_nextjs_routes |
| 🤖 LLM | 9 | analyze_impact, detect_breaking_changes, semantic_diff, suggest_test_cases, get_conventions, parse_error_stack, explain_type_error, check_permissions, get_prisma_operations |

**Total: 33 tools** (12 TS API + 12 Custom + 9 LLM-powered)

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

### suggest_test_cases.ts (LLM-powered)

```typescript
import { spawnHeadlessClaude } from '../llm/spawn-claude.js';
import { languageServiceManager } from './language-service.js';
import { PROJECT_ROOT } from '../../config.js';
import * as fs from 'fs/promises';
import * as path from 'path';

interface SuggestTestCasesArgs {
  file: string;
  function: string;
}

interface TestCase {
  name: string;
  description: string;
  input: unknown;
  expected: unknown;
  rationale: string;
  category: 'happy_path' | 'edge_case' | 'error_case' | 'boundary';
}

export async function handleSuggestTestCases(args: SuggestTestCasesArgs) {
  const filePath = path.resolve(PROJECT_ROOT, args.file);

  // 1. Gather context
  const fileContent = await fs.readFile(filePath, 'utf-8');
  const { service } = await languageServiceManager.getServiceForFile(filePath);

  // Extract the function and its types
  const functionMatch = extractFunction(fileContent, args.function);
  if (!functionMatch) {
    return {
      content: [{
        type: 'text',
        text: JSON.stringify({ error: `Function '${args.function}' not found` }, null, 2),
      }],
    };
  }

  // Get type information
  const typeInfo = await getRelatedTypes(service, filePath, args.function);

  // Find existing tests for context
  const existingTests = await findExistingTests(filePath, args.function);

  // 2. Spawn headless Claude with focused prompt
  const result = await spawnHeadlessClaude({
    prompt: `You are analyzing a TypeScript function to suggest comprehensive test cases.

## Function to Test
\`\`\`typescript
${functionMatch.code}
\`\`\`

## Related Types
\`\`\`typescript
${typeInfo}
\`\`\`

## Existing Tests (for reference, don't duplicate)
${existingTests.length > 0 ? existingTests.map(t => `- ${t}`).join('\n') : 'None found'}

## Task
Suggest test cases that cover:
1. **Happy path** - Normal expected usage
2. **Edge cases** - Empty strings, null, undefined, empty arrays, zero, negative numbers
3. **Boundary conditions** - Max values, min values, length limits
4. **Error cases** - Invalid inputs that should throw or return errors

For each test case, provide:
- A descriptive name
- The input values
- The expected output/behavior
- Why this case is important (rationale)

Return ONLY valid JSON in this exact format:
{
  "test_cases": [
    {
      "name": "should handle empty string input",
      "description": "Tests behavior when input is empty",
      "input": { "param1": "" },
      "expected": { "result": null },
      "rationale": "Empty strings are common edge cases that often cause bugs",
      "category": "edge_case"
    }
  ]
}`,
    outputFormat: 'json',
    maxTokens: 4000,
  });

  // 3. Parse and validate response
  let testCases: TestCase[];
  try {
    const parsed = JSON.parse(result);
    testCases = parsed.test_cases;
  } catch {
    return {
      content: [{
        type: 'text',
        text: JSON.stringify({ error: 'Failed to parse LLM response', raw: result }, null, 2),
      }],
    };
  }

  return {
    content: [{
      type: 'text',
      text: JSON.stringify({
        function: args.function,
        file: args.file,
        test_cases: testCases,
        count: testCases.length,
        by_category: {
          happy_path: testCases.filter(t => t.category === 'happy_path').length,
          edge_case: testCases.filter(t => t.category === 'edge_case').length,
          error_case: testCases.filter(t => t.category === 'error_case').length,
          boundary: testCases.filter(t => t.category === 'boundary').length,
        },
      }, null, 2),
    }],
  };
}

// Helper functions
function extractFunction(content: string, functionName: string): { code: string } | null {
  // Simple regex for function extraction - could be enhanced with AST
  const patterns = [
    new RegExp(`(export\\s+)?(async\\s+)?function\\s+${functionName}\\s*\\([^)]*\\)[^{]*\\{[^}]*\\}`, 's'),
    new RegExp(`(export\\s+)?const\\s+${functionName}\\s*=\\s*(async\\s+)?\\([^)]*\\)[^=]*=>\\s*\\{[^}]*\\}`, 's'),
    new RegExp(`(export\\s+)?const\\s+${functionName}\\s*=\\s*(async\\s+)?\\([^)]*\\)[^=]*=>[^;]+`, 's'),
  ];

  for (const pattern of patterns) {
    const match = content.match(pattern);
    if (match) {
      return { code: match[0] };
    }
  }
  return null;
}

async function getRelatedTypes(
  service: ts.LanguageService,
  filePath: string,
  functionName: string
): Promise<string> {
  // Get type information for the function's parameters and return type
  // This would use the TS API to extract relevant type definitions
  // Simplified for example
  return '// Types would be extracted here';
}

async function findExistingTests(filePath: string, functionName: string): Promise<string[]> {
  // Look for test files that might already test this function
  const testPatterns = [
    filePath.replace('.ts', '.test.ts'),
    filePath.replace('.ts', '.spec.ts'),
    filePath.replace('/src/', '/tests/').replace('.ts', '.test.ts'),
  ];

  const existingTests: string[] = [];
  for (const testPath of testPatterns) {
    try {
      const content = await fs.readFile(testPath, 'utf-8');
      // Find test names that mention the function
      const testMatches = content.matchAll(/it\(['"]([^'"]*${functionName}[^'"]*)['"]/g);
      for (const match of testMatches) {
        existingTests.push(match[1]);
      }
    } catch {
      // Test file doesn't exist
    }
  }
  return existingTests;
}
```

### LLM Spawning Infrastructure

```typescript
// llm/spawn-claude.ts

import { spawn } from 'child_process';

interface SpawnClaudeOptions {
  prompt: string;
  outputFormat?: 'json' | 'text';
  maxTokens?: number;
  timeout?: number;
}

/**
 * Spawns a headless Claude Code session and returns the result.
 * Uses the Claude CLI in non-interactive mode.
 */
export async function spawnHeadlessClaude(options: SpawnClaudeOptions): Promise<string> {
  const { prompt, outputFormat = 'text', maxTokens = 4000, timeout = 60000 } = options;

  return new Promise((resolve, reject) => {
    const args = [
      '--print',           // Non-interactive, print result
      '--output-format', outputFormat === 'json' ? 'json' : 'text',
      '--max-tokens', String(maxTokens),
      '-p', prompt,        // Prompt
    ];

    const proc = spawn('claude', args, {
      timeout,
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    proc.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    proc.on('close', (code) => {
      if (code === 0) {
        resolve(stdout.trim());
      } else {
        reject(new Error(`Claude exited with code ${code}: ${stderr}`));
      }
    });

    proc.on('error', (err) => {
      reject(err);
    });
  });
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
