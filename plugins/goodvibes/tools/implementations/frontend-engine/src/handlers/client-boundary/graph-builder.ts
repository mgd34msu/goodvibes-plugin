/**
 * Import graph builder for client boundary analysis
 *
 * Builds an adjacency list of imports between files and classifies
 * components using BFS from "use client" boundaries.
 *
 * @module handlers/frontend/client-boundary/graph-builder
 */

import * as fs from 'fs';
import * as path from 'path';
import ts from 'typescript';
import type { Classification, ComponentClassification, FileDirectiveInfo, ImportGraph } from './types.js';

// =============================================================================
// Import extraction
// =============================================================================

/**
 * Extract all import paths from a source file.
 * Returns only relative imports (./foo, ../bar) to stay within the project.
 */
function extractImports(sourceFile: ts.SourceFile): string[] {
  const imports: string[] = [];

  ts.forEachChild(sourceFile, (node) => {
    if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
      const spec = node.moduleSpecifier.text;
      if (spec.startsWith('.')) {
        imports.push(spec);
      }
    } else if (ts.isExportDeclaration(node) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) {
      const spec = node.moduleSpecifier.text;
      if (spec.startsWith('.')) {
        imports.push(spec);
      }
    }
  });

  // Also find require() calls with relative paths (CommonJS interop)
  ts.forEachChild(sourceFile, function visitForRequire(node) {
    if (
      ts.isCallExpression(node) &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === 'require' &&
      node.arguments.length > 0
    ) {
      const arg = node.arguments[0];
      if (ts.isStringLiteral(arg) && (arg.text.startsWith('./') || arg.text.startsWith('../'))) {
        imports.push(arg.text);
      }
    }
    ts.forEachChild(node, visitForRequire);
  });

  return imports;
}

/**
 * Attempt to resolve a relative import to an actual file on disk.
 * Tries adding known extensions and /index variants.
 */
function resolveImport(importSpec: string, fromFile: string): string | null {
  const dir = path.dirname(fromFile);
  const base = path.resolve(dir, importSpec);

  const extensions = ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.mts'];

  // Try direct match with each extension
  for (const ext of extensions) {
    const candidate = base + ext;
    if (fs.existsSync(candidate)) return candidate;
  }

  // Try as directory with index file
  for (const ext of extensions) {
    const candidate = path.join(base, `index${ext}`);
    if (fs.existsSync(candidate)) return candidate;
  }

  // Already has extension
  if (fs.existsSync(base)) return base;

  return null;
}

// =============================================================================
// Graph building
// =============================================================================

/**
 * Build an import graph from the given files.
 *
 * @param files - Absolute file paths to include in the graph
 * @param projectRoot - Project root for relative path keys
 * @returns ImportGraph keyed by relative path
 */
export function buildImportGraph(files: string[], projectRoot: string): ImportGraph {
  const graph: ImportGraph = new Map();

  // Build a set of known absolute paths for fast lookup
  const knownFiles = new Set(files);

  for (const filePath of files) {
    const relPath = path.relative(projectRoot, filePath).replace(/\\/g, '/');

    let content: string;
    try {
      content = fs.readFileSync(filePath, 'utf-8');
    } catch {
      graph.set(relPath, []);
      continue;
    }

    const ext = path.extname(filePath).toLowerCase();
    const scriptKind = ext === '.tsx' || ext === '.jsx' ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
    const sourceFile = ts.createSourceFile(
      filePath,
      content,
      ts.ScriptTarget.Latest,
      true,
      scriptKind
    );

    const importSpecs = extractImports(sourceFile);
    const resolvedImports: string[] = [];

    for (const spec of importSpecs) {
      const resolved = resolveImport(spec, filePath);
      if (resolved && knownFiles.has(resolved)) {
        const relImport = path.relative(projectRoot, resolved).replace(/\\/g, '/');
        resolvedImports.push(relImport);
      }
    }

    graph.set(relPath, resolvedImports);
  }

  return graph;
}

// =============================================================================
// Component classification
// =============================================================================

/**
 * Classify all files using BFS from "use client" boundaries.
 *
 * Files with "use client" are classified as 'client'.
 * Files imported (directly or transitively) by a client file are 'client-inherited'.
 * Files with "use server" are classified as 'server'.
 * Remaining files default to 'server'.
 *
 * @param graph - Import adjacency list (file -> imports)
 * @param directiveMap - Map from relative file path to its FileDirectiveInfo
 * @returns Array of ComponentClassification
 */
export function classifyComponents(
  graph: ImportGraph,
  directiveMap: Map<string, FileDirectiveInfo>
): ComponentClassification[] {
  const classifications = new Map<string, Classification>();
  const reasons = new Map<string, string>();
  const directives = new Map<string, FileDirectiveInfo['directive']>();

  // Build a reverse graph: file -> files that import it
  const reverseGraph = new Map<string, string[]>();
  for (const [file, imports] of graph) {
    if (!reverseGraph.has(file)) reverseGraph.set(file, []);
    for (const imp of imports) {
      if (!reverseGraph.has(imp)) reverseGraph.set(imp, []);
      reverseGraph.get(imp)!.push(file);
    }
  }

  // First pass: mark explicit directives
  for (const [file, info] of directiveMap) {
    directives.set(file, info.directive);
    if (info.directive === '"use client"') {
      classifications.set(file, 'client');
      reasons.set(file, 'Has "use client" directive');
    } else if (info.directive === '"use server"') {
      classifications.set(file, 'server');
      reasons.set(file, 'Has "use server" directive — explicitly server-only');
    }
  }

  // BFS from all client boundaries to mark client-inherited
  // We propagate to files IMPORTED BY client files (they run in client bundle)
  const queue: string[] = [];
  for (const [file, cls] of classifications) {
    if (cls === 'client') queue.push(file);
  }

  const visited = new Set<string>(queue);

  while (queue.length > 0) {
    const current = queue.shift()!;
    const imports = graph.get(current) || [];
    for (const imported of imports) {
      if (!visited.has(imported)) {
        visited.add(imported);
        // Only mark as client-inherited if not already classified with explicit directive
        if (!classifications.has(imported)) {
          classifications.set(imported, 'client-inherited');
          reasons.set(
            imported,
            `Imported by client component (${current})`
          );
        }
        queue.push(imported);
      }
    }
  }

  // Build final classification array
  const results: ComponentClassification[] = [];

  for (const [file] of graph) {
    const info = directiveMap.get(file);
    const cls = classifications.get(file) ?? 'server';
    const reason = reasons.get(file) ?? 'No directive, not imported by client components — server by default';
    const directive = info?.directive ?? undefined;

    results.push({
      file,
      classification: cls,
      reason,
      directive,
    });
  }

  return results;
}

/**
 * Build a map of client boundary files to their descendant (child) count.
 *
 * @param graph - Import adjacency list
 * @param classifications - Classified components
 * @returns Map from client boundary file to child count
 */
export function buildBoundaryMap(
  graph: ImportGraph,
  classifications: ComponentClassification[]
): Map<string, number> {
  const clientBoundaries = classifications
    .filter(c => c.classification === 'client')
    .map(c => c.file);

  const boundaryMap = new Map<string, number>();

  for (const boundary of clientBoundaries) {
    // BFS to count all descendants
    const visited = new Set<string>([boundary]);
    const queue = [boundary];
    let childCount = 0;

    while (queue.length > 0) {
      const current = queue.shift()!;
      const imports = graph.get(current) || [];
      for (const imp of imports) {
        if (!visited.has(imp)) {
          visited.add(imp);
          childCount++;
          queue.push(imp);
        }
      }
    }

    boundaryMap.set(boundary, childCount);
  }

  return boundaryMap;
}
