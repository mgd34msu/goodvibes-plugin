/**
 * File scanner for client boundary analysis, Lane 4.
 *
 * Ported from frontend-engine `core/client-boundary/scanner.ts`, rewired off the
 * v1 per-file `ts.createSourceFile` onto the shared compiler host (§3.3): the
 * caller hands in pre-parsed SourceFiles, and directive detection reads the
 * SourceFile text rather than a second `fs.readFileSync`.
 *
 * @module frontend/client-boundary/scanner
 */

import * as fs from 'fs';
import * as path from 'path';
import ts from 'typescript';
import { makeRelativePath } from '../../host/index.js';
import type { FileDirectiveInfo } from './types.js';

const CLIENT_HOOKS = new Set([
  'useState', 'useEffect', 'useLayoutEffect', 'useRef', 'useCallback',
  'useMemo', 'useReducer', 'useContext', 'useId', 'useSyncExternalStore',
  'useTransition', 'useDeferredValue', 'useInsertionEffect', 'useImperativeHandle',
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

const SCANNABLE_EXTENSIONS = ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.mts'];

/** Detect a `"use client"` / `"use server"` directive from raw file text. */
function detectDirective(content: string): '"use client"' | '"use server"' | null {
  const stripped = content.replace(/^\uFEFF/, '');
  const lines = stripped.split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('//') || trimmed.startsWith('/*') || trimmed.startsWith('*')) {
      continue;
    }
    const normalized = trimmed.replace(/;+$/, '');
    if (normalized === '"use client"' || normalized === "'use client'") {return '"use client"';}
    if (normalized === '"use server"' || normalized === "'use server'") {return '"use server"';}
    break;
  }
  return null;
}

/** Whether a source file uses client-only APIs (hooks, event handlers, browser APIs). */
export function findClientOnlyAPIs(sourceFile: ts.SourceFile): boolean {
  let found = false;
  function visit(node: ts.Node): void {
    if (found) {return;}
    if (ts.isCallExpression(node)) {
      const expr = node.expression;
      if (ts.isIdentifier(expr)) {
        const name = expr.text;
        if (CLIENT_HOOKS.has(name) || BROWSER_APIS.has(name)) {
          found = true;
          return;
        }
      }
      if (ts.isPropertyAccessExpression(expr) && ts.isIdentifier(expr.expression)) {
        if (BROWSER_APIS.has(expr.expression.text)) {
          found = true;
          return;
        }
      }
    }
    if (ts.isJsxAttribute(node) && ts.isIdentifier(node.name)) {
      if (CLIENT_EVENT_HANDLERS.has(node.name.text)) {
        found = true;
        return;
      }
    }
    if (ts.isIdentifier(node) && BROWSER_APIS.has(node.text)) {
      const parent = node.parent;
      if (
        !ts.isPropertyAccessExpression(parent) ||
        (parent as ts.PropertyAccessExpression).name !== node
      ) {
        found = true;
        return;
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(sourceFile);
  return found;
}

/** Whether a source file imports server-only packages. */
export function findServerOnlyImports(sourceFile: ts.SourceFile): boolean {
  let found = false;
  ts.forEachChild(sourceFile, (node) => {
    if (found) {return;}
    let moduleSpecifier: string | undefined;
    if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
      moduleSpecifier = node.moduleSpecifier.text;
    } else if (ts.isVariableStatement(node)) {
      for (const decl of node.declarationList.declarations) {
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
      if (SERVER_ONLY_PACKAGES.has(moduleSpecifier)) {
        found = true;
        return;
      }
      for (const pkg of SERVER_ONLY_DB_PACKAGES) {
        if (moduleSpecifier === pkg || moduleSpecifier.startsWith(pkg + '/')) {
          found = true;
          return;
        }
      }
      if (moduleSpecifier.startsWith('node:')) {
        found = true;
        return;
      }
    }
  });
  return found;
}

/** Recursively collect scannable files under a directory (or return the single file). */
export function collectScannableFiles(scanPath: string): string[] {
  const stat = fs.statSync(scanPath, { throwIfNoEntry: false });
  if (!stat) {return [];}
  if (stat.isFile()) {return [scanPath];}

  const results: string[] = [];
  function walk(dir: string): void {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === 'node_modules' || entry.name.startsWith('.')) {continue;}
        walk(fullPath);
      } else if (entry.isFile()) {
        const ext = path.extname(entry.name).toLowerCase();
        if (SCANNABLE_EXTENSIONS.includes(ext)) {results.push(fullPath);}
      }
    }
  }
  walk(scanPath);
  return results;
}

/**
 * Scan the given absolute files for directives + client/server API usage, using
 * SourceFiles already parsed by the shared host.
 * @param baseDir - resolved base directory for relative-path keys
 * @param absPaths - absolute file paths to scan
 * @param sourceFiles - host-parsed SourceFiles keyed by absolute path
 */
export function scanForDirectives(
  baseDir: string,
  absPaths: string[],
  sourceFiles: Map<string, ts.SourceFile>,
): FileDirectiveInfo[] {
  const results: FileDirectiveInfo[] = [];
  for (const absPath of absPaths) {
    const sourceFile = sourceFiles.get(absPath);
    if (!sourceFile) {continue;}
    const directive = detectDirective(sourceFile.getFullText());
    results.push({
      file: makeRelativePath(absPath, baseDir),
      directive,
      hasClientAPIs: findClientOnlyAPIs(sourceFile),
      hasServerOnlyImports: findServerOnlyImports(sourceFile),
    });
  }
  return results;
}
