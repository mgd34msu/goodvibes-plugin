/**
 * AST scanner for error boundary detection
 *
 * Scans React/Next.js files for:
 * - Class components with getDerivedStateFromError / componentDidCatch
 * - Imports from react-error-boundary and common library wrappers
 * - error.tsx / error.js files in Next.js App Router route segments
 *
 * @module core/error-boundaries/scanner
 */

import * as fs from 'fs';
import * as path from 'path';
import ts from 'typescript';
import type { ErrorBoundaryInfo, BoundaryKind, RouteSegment } from './types.js';

// =============================================================================
// Constants
// =============================================================================

export const SCANNABLE_EXTENSIONS = ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.mts', '.cjs'];

/** react-error-boundary exported component names */
const REACT_ERROR_BOUNDARY_COMPONENTS = new Set([
  'ErrorBoundary',
  'ErrorBoundaryPropsWithComponent',
  'withErrorBoundary',
]);

/** Known library error boundary sources */
const LIBRARY_BOUNDARY_SOURCES = new Map<string, string>([
  ['@sentry/react', 'Sentry.ErrorBoundary'],
  ['@sentry/nextjs', 'Sentry.ErrorBoundary'],
  ['react-error-boundary', 'ErrorBoundary'],
  ['@tanstack/react-query', 'QueryErrorResetBoundary'],
  ['@tanstack/react-router', 'CatchBoundary'],
  ['@remix-run/react', 'ErrorBoundary'],
]);

/** Error lifecycle methods that define a class error boundary */
const ERROR_BOUNDARY_METHODS = new Set([
  'getDerivedStateFromError',
  'componentDidCatch',
]);

// =============================================================================
// File utilities
// =============================================================================

/**
 * Parse a file into a TypeScript SourceFile for AST analysis.
 * Uses the appropriate ScriptKind based on file extension.
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
 * Recursively collect all scannable source files under a directory.
 * Skips node_modules and hidden directories.
 */
export function collectFiles(dirPath: string): string[] {
  const results: string[] = [];
  try {
    const entries = fs.readdirSync(dirPath, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name);
      if (entry.isDirectory()) {
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
    // Unreadable directories are silently skipped
  }
  return results;
}

// =============================================================================
// Error boundary detection from AST
// =============================================================================

/**
 * Check if a class declaration has error boundary lifecycle methods.
 * Returns true for getDerivedStateFromError (static) or componentDidCatch.
 */
function hasErrorBoundaryMethods(node: ts.ClassDeclaration): boolean {
  for (const member of node.members) {
    if (ts.isMethodDeclaration(member) || ts.isPropertyDeclaration(member)) {
      const name = member.name && ts.isIdentifier(member.name) ? member.name.text : '';
      if (ERROR_BOUNDARY_METHODS.has(name)) {
        return true;
      }
    }
  }
  return false;
}

/**
 * Check if a class-based error boundary has a fallback UI defined.
 * Looks for render() returning conditional fallback or a fallback prop.
 */
function classHasFallback(node: ts.ClassDeclaration, sourceFile: ts.SourceFile): boolean {
  for (const member of node.members) {
    if (
      ts.isMethodDeclaration(member) &&
      member.name &&
      ts.isIdentifier(member.name) &&
      member.name.text === 'render' &&
      member.body
    ) {
      // Check if render contains a ternary, if/else, or fallback reference
      const renderText = member.body.getText(sourceFile);
      if (
        renderText.includes('this.state.hasError') ||
        renderText.includes('this.state.error') ||
        renderText.includes('fallback') ||
        renderText.includes('FallbackComponent')
      ) {
        return true;
      }
    }
    // Check for fallback prop in constructor or class fields
    if (
      ts.isPropertyDeclaration(member) &&
      member.name &&
      ts.isIdentifier(member.name) &&
      member.name.text === 'fallback'
    ) {
      return true;
    }
  }
  return false;
}

/**
 * Check if a class-based error boundary has reset / retry functionality.
 * Looks for methods named reset, resetError, retry, or handling of resetKeys.
 */
function classHasReset(node: ts.ClassDeclaration, sourceFile: ts.SourceFile): boolean {
  for (const member of node.members) {
    if (
      ts.isMethodDeclaration(member) &&
      member.name &&
      ts.isIdentifier(member.name)
    ) {
      const name = member.name.text.toLowerCase();
      if (name.includes('reset') || name.includes('retry') || name.includes('recover')) {
        return true;
      }
    }
  }
  // Check if componentDidUpdate handles resetKeys pattern
  const classText = node.getText(sourceFile);
  return classText.includes('resetKeys') || classText.includes('onReset');
}

// =============================================================================
// JSX usage detection
// =============================================================================

/**
 * Collect all JSX element names used in a source file.
 * Returns a set of component names used as JSX elements.
 */
function collectJsxElementNames(sourceFile: ts.SourceFile): Set<string> {
  const names = new Set<string>();

  function visit(node: ts.Node): void {
    if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
      const tagName = node.tagName;
      if (ts.isIdentifier(tagName)) {
        names.add(tagName.text);
      } else if (ts.isPropertyAccessExpression(tagName)) {
        // e.g. <Sentry.ErrorBoundary>
        names.add(tagName.getText(sourceFile));
      }
    }
    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return names;
}

/**
 * Check if a JSX element usage of a library boundary has a fallback prop.
 */
function jsxHasFallbackProp(sourceFile: ts.SourceFile, componentName: string): boolean {
  let hasFallback = false;

  function visit(node: ts.Node): void {
    if (hasFallback) return;
    if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
      const tagName = node.tagName.getText(sourceFile);
      if (tagName === componentName || tagName.endsWith('.' + componentName)) {
        for (const attr of node.attributes.properties) {
          if (
            ts.isJsxAttribute(attr) &&
            ts.isIdentifier(attr.name) &&
            (
              attr.name.text === 'fallback' ||
              attr.name.text === 'FallbackComponent' ||
              attr.name.text === 'fallbackRender'
            )
          ) {
            hasFallback = true;
            return;
          }
        }
      }
    }
    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return hasFallback;
}

/**
 * Check if a JSX usage of a library boundary has onReset / resetKeys prop.
 */
function jsxHasResetProp(sourceFile: ts.SourceFile, componentName: string): boolean {
  let hasReset = false;

  function visit(node: ts.Node): void {
    if (hasReset) return;
    if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
      const tagName = node.tagName.getText(sourceFile);
      if (tagName === componentName || tagName.endsWith('.' + componentName)) {
        for (const attr of node.attributes.properties) {
          if (
            ts.isJsxAttribute(attr) &&
            ts.isIdentifier(attr.name) &&
            (
              attr.name.text === 'onReset' ||
              attr.name.text === 'resetKeys' ||
              attr.name.text === 'onError'
            )
          ) {
            hasReset = true;
            return;
          }
        }
      }
    }
    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return hasReset;
}

// =============================================================================
// Import analysis
// =============================================================================

/**
 * Import record with module name and declaration line.
 */
interface ImportRecord {
  moduleName: string;
  line: number;
}

/**
 * Extract all import specifiers from a source file.
 * Returns a map of importedName -> { moduleName, line }.
 * Line is 1-indexed and refers to the import declaration.
 */
function extractImports(sourceFile: ts.SourceFile): Map<string, ImportRecord> {
  const imports = new Map<string, ImportRecord>();

  ts.forEachChild(sourceFile, (node) => {
    if (!ts.isImportDeclaration(node)) return;
    if (!ts.isStringLiteral(node.moduleSpecifier)) return;

    const moduleName = node.moduleSpecifier.text;
    const clause = node.importClause;
    if (!clause) return;

    const line = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1;

    // import ErrorBoundary from 'react-error-boundary'
    if (clause.name) {
      imports.set(clause.name.text, { moduleName, line });
    }

    // import { ErrorBoundary } from 'react-error-boundary'
    if (clause.namedBindings && ts.isNamedImports(clause.namedBindings)) {
      for (const element of clause.namedBindings.elements) {
        imports.set(element.name.text, { moduleName, line });
      }
    }

    // import * as Sentry from '@sentry/react'
    if (clause.namedBindings && ts.isNamespaceImport(clause.namedBindings)) {
      imports.set(clause.namedBindings.name.text + '.*', { moduleName, line });
    }
  });

  return imports;
}

// =============================================================================
// Main scanner functions
// =============================================================================

/**
 * Scan a single file for error boundary definitions.
 *
 * @param filePath - Absolute path to the file
 * @param projectRoot - Absolute project root path
 * @param includeLibraries - Whether to detect library-based error boundaries
 * @returns Array of ErrorBoundaryInfo found in this file
 */
export function scanFileForErrorBoundaries(
  filePath: string,
  projectRoot: string,
  includeLibraries: boolean
): ErrorBoundaryInfo[] {
  const results: ErrorBoundaryInfo[] = [];

  let content: string;
  try {
    content = fs.readFileSync(filePath, 'utf-8');
  } catch {
    return results;
  }

  let sourceFile: ts.SourceFile;
  try {
    sourceFile = parseFile(filePath, content);
  } catch {
    return results;
  }

  const relativeFile = path.relative(projectRoot, filePath).replace(/\\/g, '/');
  const imports = extractImports(sourceFile);
  const jsxNames = collectJsxElementNames(sourceFile);

  // --- 1. Detect class-based error boundaries ---
  ts.forEachChild(sourceFile, (node) => {
    if (!ts.isClassDeclaration(node)) return;
    if (!hasErrorBoundaryMethods(node)) return;

    const name = node.name?.text ?? 'AnonymousErrorBoundary';
    const line = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1;
    const hasFallback = classHasFallback(node, sourceFile);
    const hasReset = classHasReset(node, sourceFile);

    results.push({
      file: relativeFile,
      name,
      kind: 'class_component',
      hasFallback,
      hasReset,
      line,
    });
  });

  // --- 2. Detect library-based error boundaries (if enabled) ---
  if (includeLibraries) {
    for (const [importedName, { moduleName, line: importLine }] of imports) {
      // react-error-boundary
      if (moduleName === 'react-error-boundary') {
        const localName = importedName.replace(/\..+$/, ''); // strip .* suffix
        if (REACT_ERROR_BOUNDARY_COMPONENTS.has(localName) || localName === 'ErrorBoundary') {
          // Only add if actually used as JSX
          if (jsxNames.has(localName)) {
            const hasFallback = jsxHasFallbackProp(sourceFile, localName);
            const hasReset = jsxHasResetProp(sourceFile, localName);
            results.push({
              file: relativeFile,
              name: localName,
              kind: 'react_error_boundary',
              hasFallback,
              hasReset,
              line: importLine,
            });
          }
        }
        continue;
      }

      // Other library wrappers
      if (LIBRARY_BOUNDARY_SOURCES.has(moduleName)) {
        const localName = importedName.replace(/\..+$/, '');
        // Check namespace usage (e.g., Sentry.ErrorBoundary)
        // For namespace imports (`import * as Sentry`), the JSX tag is `Sentry.ErrorBoundary`,
        // not `Sentry` itself. Resolve the actual matched JSX name so that fallback/reset
        // prop detection targets the correct qualified element name.
        let matchedJsxName = localName;
        if (!jsxNames.has(localName)) {
          const nsMatch = Array.from(jsxNames).find(n => n.startsWith(localName + '.'));
          if (nsMatch) {
            matchedJsxName = nsMatch;
          } else {
            continue;
          }
        }

        const hasFallback = jsxHasFallbackProp(sourceFile, matchedJsxName);
        const hasReset = jsxHasResetProp(sourceFile, matchedJsxName);
        results.push({
          file: relativeFile,
          name: LIBRARY_BOUNDARY_SOURCES.get(moduleName) ?? localName,
          kind: 'library_wrapper',
          hasFallback,
          hasReset,
          line: importLine,
        });
      }
    }
  }

  return results;
}

// =============================================================================
// Next.js App Router route segment scanning
// =============================================================================

/**
 * Check if a file has async operations (async server components or data fetching).
 * Used for detecting async operations without boundary protection.
 */
export function fileHasAsyncOperations(filePath: string): boolean {
  let content: string;
  try {
    content = fs.readFileSync(filePath, 'utf-8');
  } catch {
    return false;
  }

  let sourceFile: ts.SourceFile;
  try {
    sourceFile = parseFile(filePath, content);
  } catch {
    return false;
  }

  let hasAsync = false;

  function visit(node: ts.Node): void {
    if (hasAsync) return;

    // async function or arrow function components
    if (
      (ts.isFunctionDeclaration(node) || ts.isFunctionExpression(node) || ts.isArrowFunction(node)) &&
      node.modifiers?.some(m => m.kind === ts.SyntaxKind.AsyncKeyword)
    ) {
      hasAsync = true;
      return;
    }

    // await expressions — data fetching in components
    if (ts.isAwaitExpression(node)) {
      hasAsync = true;
      return;
    }

    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return hasAsync;
}

/**
 * Scan all Next.js App Router route segments for error.tsx / error.js files.
 *
 * @param appDir - Absolute path to the app/ directory
 * @param projectRoot - Absolute project root path
 * @returns Array of RouteSegment results
 */
export function scanNextjsRouteSegments(
  appDir: string,
  projectRoot: string
): RouteSegment[] {
  const segments: RouteSegment[] = [];

  function scanDir(dirPath: string): void {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dirPath, { withFileTypes: true });
    } catch {
      return;
    }

    const fileNames = new Set(entries.filter(e => e.isFile()).map(e => e.name.toLowerCase()));
    const hasLayout = fileNames.has('layout.tsx') || fileNames.has('layout.jsx') ||
                     fileNames.has('layout.ts') || fileNames.has('layout.js');
    const hasPage = fileNames.has('page.tsx') || fileNames.has('page.jsx') ||
                   fileNames.has('page.ts') || fileNames.has('page.js');
    const hasErrorFile = fileNames.has('error.tsx') || fileNames.has('error.jsx') ||
                        fileNames.has('error.ts') || fileNames.has('error.js');

    // Only record segments that have a page or layout (actual route segments)
    if (hasPage || hasLayout) {
      const segmentPath = path.relative(projectRoot, dirPath).replace(/\\/g, '/');
      segments.push({
        segmentPath,
        hasLayout,
        hasPage,
        hasErrorFile,
        isProtected: hasErrorFile, // initial value; may be updated by coverage analysis
      });
    }

    // Recurse into subdirectories
    for (const entry of entries) {
      if (entry.isDirectory() && !entry.name.startsWith('.') && entry.name !== 'node_modules') {
        scanDir(path.join(dirPath, entry.name));
      }
    }
  }

  scanDir(appDir);
  return segments;
}
