/**
 * File scanner for client boundary analysis
 *
 * Scans files for "use client"/"use server" directives and client-only APIs.
 *
 * @module handlers/frontend/client-boundary/scanner
 */

import * as fs from 'fs';
import * as path from 'path';
import ts from 'typescript';
import type { FileDirectiveInfo } from './types.js';

// =============================================================================
// Client-only API detection lists
// =============================================================================

const CLIENT_HOOKS = new Set([
  'useState', 'useEffect', 'useLayoutEffect', 'useRef', 'useCallback',
  'useMemo', 'useReducer', 'useContext', 'useId', 'useSyncExternalStore',
  'useTransition', 'useDeferredValue', 'useInsertionEffect', 'useImperativeHandle',
  // React 19 / Next.js hooks
  'useActionState', 'useFormStatus', 'useFormState', 'useOptimistic',
]);

const CLIENT_EVENT_HANDLERS = new Set([
  'onClick', 'onChange', 'onSubmit', 'onFocus', 'onBlur',
  'onKeyDown', 'onKeyUp', 'onKeyPress', 'onMouseEnter', 'onMouseLeave',
  'onScroll', 'onDrag', 'onDrop', 'onTouchStart', 'onTouchEnd',
]);

const BROWSER_APIS = new Set([
  'window', 'document', 'localStorage', 'sessionStorage', 'navigator',
  'location', 'history', 'alert', 'confirm', 'prompt', 'XMLHttpRequest',
  'IntersectionObserver', 'MutationObserver', 'ResizeObserver', 'addEventListener',
]);

const SERVER_ONLY_PACKAGES = new Set([
  'fs', 'path', 'crypto', 'child_process', 'os', 'stream', 'buffer',
  'server-only', 'next/headers', 'next/cookies', 'next/cache',
]);

const SERVER_ONLY_DB_PACKAGES = new Set([
  'prisma', '@prisma/client', 'drizzle-orm', 'mongoose', 'pg', 'mysql2',
  'better-sqlite3', 'sqlite3', 'knex', 'typeorm', 'sequelize',
]);

// =============================================================================
// Directive detection
// =============================================================================

/**
 * Read the first meaningful statement of a file to detect use client/use server.
 * Returns null if no directive found.
 */
function detectDirective(content: string): '"use client"' | '"use server"' | null {
  // Strip BOM if present
  const stripped = content.replace(/^\uFEFF/, '');
  // Trim leading whitespace and comments
  const lines = stripped.split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('//') || trimmed.startsWith('/*') || trimmed.startsWith('*')) {
      continue;
    }
    // Strip trailing semicolons (Prettier and many formatters add them)
    const normalized = trimmed.replace(/;+$/, '');
    if (normalized === '"use client"' || normalized === "'use client'") {
      return '"use client"';
    }
    if (normalized === '"use server"' || normalized === "'use server'") {
      return '"use server"';
    }
    // First non-comment, non-empty line is not a directive
    break;
  }
  return null;
}

// =============================================================================
// Client-only API detection
// =============================================================================

/**
 * Check whether a source file uses client-only APIs (hooks, event handlers, browser APIs).
 */
export function findClientOnlyAPIs(sourceFile: ts.SourceFile): boolean {
  let found = false;

  function visit(node: ts.Node): void {
    if (found) return;

    // Check call expressions for hooks and browser API calls
    if (ts.isCallExpression(node)) {
      const expr = node.expression;
      if (ts.isIdentifier(expr)) {
        const name = expr.text;
        if (CLIENT_HOOKS.has(name) || BROWSER_APIS.has(name)) {
          found = true;
          return;
        }
      }
      // e.g. window.addEventListener, document.getElementById
      if (ts.isPropertyAccessExpression(expr)) {
        if (ts.isIdentifier(expr.expression)) {
          if (BROWSER_APIS.has(expr.expression.text)) {
            found = true;
            return;
          }
        }
      }
    }

    // Check JSX attributes for event handlers (onClick, onChange, etc.)
    if (ts.isJsxAttribute(node)) {
      if (ts.isIdentifier(node.name)) {
        if (CLIENT_EVENT_HANDLERS.has(node.name.text)) {
          found = true;
          return;
        }
      }
    }

    // Check identifier references to browser globals
    if (ts.isIdentifier(node)) {
      if (BROWSER_APIS.has(node.text)) {
        const parent = node.parent;
        // Only flag if it's not a property access from the right side (e.g. foo.window)
        if (
          !ts.isPropertyAccessExpression(parent) ||
          (parent as ts.PropertyAccessExpression).name !== node
        ) {
          found = true;
          return;
        }
      }
    }

    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return found;
}

// =============================================================================
// Server-only import detection
// =============================================================================

/**
 * Check whether a source file imports server-only packages.
 */
export function findServerOnlyImports(sourceFile: ts.SourceFile): boolean {
  let found = false;

  ts.forEachChild(sourceFile, (node) => {
    if (found) return;

    let moduleSpecifier: string | undefined;

    if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
      moduleSpecifier = node.moduleSpecifier.text;
    } else if (
      ts.isVariableStatement(node)
    ) {
      // const x = require('...')
      const decls = node.declarationList.declarations;
      for (const decl of decls) {
        if (
          decl.initializer &&
          ts.isCallExpression(decl.initializer) &&
          ts.isIdentifier(decl.initializer.expression) &&
          decl.initializer.expression.text === 'require' &&
          decl.initializer.arguments.length > 0 &&
          ts.isStringLiteral(decl.initializer.arguments[0])
        ) {
          moduleSpecifier = (decl.initializer.arguments[0] as ts.StringLiteral).text;
        }
      }
    }

    if (moduleSpecifier) {
      // Exact match for server-only packages
      if (SERVER_ONLY_PACKAGES.has(moduleSpecifier)) {
        found = true;
        return;
      }
      // Check DB packages (could be @scope/package)
      for (const pkg of SERVER_ONLY_DB_PACKAGES) {
        if (moduleSpecifier === pkg || moduleSpecifier.startsWith(pkg + '/')) {
          found = true;
          return;
        }
      }
      // Node built-in modules
      if (moduleSpecifier.startsWith('node:')) {
        found = true;
        return;
      }
    }
  });

  return found;
}

// =============================================================================
// File scanner
// =============================================================================

const SCANNABLE_EXTENSIONS = ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.mts'];

/**
 * Recursively collect all scannable files under a directory.
 */
function collectFiles(dirPath: string): string[] {
  const results: string[] = [];
  try {
    const entries = fs.readdirSync(dirPath, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name);
      if (entry.isDirectory()) {
        // Skip node_modules and hidden directories
        if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
        results.push(...collectFiles(fullPath));
      } else if (entry.isFile()) {
        const ext = path.extname(entry.name).toLowerCase();
        if (SCANNABLE_EXTENSIONS.includes(ext)) {
          results.push(fullPath);
        }
      }
    }
  } catch {
    // Intentionally swallowed: unreadable directories (permission denied, broken symlinks)
    // are skipped silently to allow partial scans of projects with restricted directories.
  }
  return results;
}

/**
 * Parse a file into a TypeScript SourceFile for AST analysis.
 */
function parseFile(filePath: string, content: string): ts.SourceFile {
  const ext = path.extname(filePath).toLowerCase();
  const scriptKind =
    ext === '.tsx' || ext === '.jsx' ? ts.ScriptKind.TSX
    : ext === '.js' || ext === '.mjs' || ext === '.cjs' ? ts.ScriptKind.JS
    : ts.ScriptKind.TS;
  return ts.createSourceFile(filePath, content, ts.ScriptTarget.Latest, true, scriptKind);
}

/**
 * Scan all files in scanPath for directives and client/server API usage.
 *
 * @param projectRoot - Absolute project root path
 * @param scanPath - Absolute path to directory (or file) to scan
 * @returns Array of FileDirectiveInfo for each scanned file
 */
export function scanForDirectives(
  projectRoot: string,
  scanPath: string
): FileDirectiveInfo[] {
  let filePaths: string[];

  const stat = fs.statSync(scanPath, { throwIfNoEntry: false });
  if (!stat) return [];

  if (stat.isFile()) {
    filePaths = [scanPath];
  } else {
    filePaths = collectFiles(scanPath);
  }

  const results: FileDirectiveInfo[] = [];

  for (const filePath of filePaths) {
    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      const directive = detectDirective(content);
      const sourceFile = parseFile(filePath, content);
      const hasClientAPIs = findClientOnlyAPIs(sourceFile);
      const hasServerOnlyImports = findServerOnlyImports(sourceFile);

      results.push({
        file: path.relative(projectRoot, filePath).replace(/\\/g, '/'),
        directive,
        hasClientAPIs,
        hasServerOnlyImports,
      });
    } catch {
      // Intentionally swallowed: individual unreadable files (permission denied, binary files
      // with unexpected encoding) are skipped so the rest of the scan can proceed.
    }
  }

  return results;
}
