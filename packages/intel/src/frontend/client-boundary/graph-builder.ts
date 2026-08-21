/**
 * Import graph builder for client boundary analysis, Lane 4.
 *
 * Ported from frontend-engine `core/client-boundary/graph-builder.ts`, rewired to
 * consume host-parsed SourceFiles (§3.3) instead of re-reading + re-parsing each
 * file. Import RESOLUTION still hits the filesystem (`fs.existsSync`), that is
 * path lookup, not parsing.
 *
 * @module frontend/client-boundary/graph-builder
 */

import * as fs from 'fs';
import * as path from 'path';
import ts from 'typescript';
import { makeRelativePath } from '../../host/index.js';
import type { Classification, ComponentClassification, FileDirectiveInfo, ImportGraph } from './types.js';

/** Extract relative import specifiers (import + export-from + require) from a source file. */
function extractImports(sourceFile: ts.SourceFile): string[] {
  const imports: string[] = [];
  ts.forEachChild(sourceFile, (node) => {
    if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
      const spec = node.moduleSpecifier.text;
      if (spec.startsWith('.')) {imports.push(spec);}
    } else if (ts.isExportDeclaration(node) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) {
      const spec = node.moduleSpecifier.text;
      if (spec.startsWith('.')) {imports.push(spec);}
    }
  });
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

/** Resolve a relative import to an actual file on disk (extensions + /index variants). */
function resolveImport(importSpec: string, fromFile: string): string | null {
  const dir = path.dirname(fromFile);
  const base = path.resolve(dir, importSpec);
  const extensions = ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.mts'];
  for (const ext of extensions) {
    const candidate = base + ext;
    if (fs.existsSync(candidate)) {return candidate;}
  }
  for (const ext of extensions) {
    const candidate = path.join(base, `index${ext}`);
    if (fs.existsSync(candidate)) {return candidate;}
  }
  if (fs.existsSync(base)) {return base;}
  return null;
}

/**
 * Build an import graph keyed by base-relative path.
 * @param absFiles - absolute file paths in the scan set
 * @param baseDir - resolved base directory for relative keys
 * @param sourceFiles - host-parsed SourceFiles keyed by absolute path
 */
export function buildImportGraph(
  absFiles: string[],
  baseDir: string,
  sourceFiles: Map<string, ts.SourceFile>,
): ImportGraph {
  const graph: ImportGraph = new Map();
  const knownFiles = new Set(absFiles);

  for (const filePath of absFiles) {
    const relPath = makeRelativePath(filePath, baseDir);
    const sourceFile = sourceFiles.get(filePath);
    if (!sourceFile) {
      graph.set(relPath, []);
      continue;
    }
    const importSpecs = extractImports(sourceFile);
    const resolvedImports: string[] = [];
    for (const spec of importSpecs) {
      const resolved = resolveImport(spec, filePath);
      if (resolved && knownFiles.has(resolved)) {
        resolvedImports.push(makeRelativePath(resolved, baseDir));
      }
    }
    graph.set(relPath, resolvedImports);
  }
  return graph;
}

/** Classify all files using BFS from "use client" boundaries. */
export function classifyComponents(
  graph: ImportGraph,
  directiveMap: Map<string, FileDirectiveInfo>,
): ComponentClassification[] {
  const classifications = new Map<string, Classification>();
  const reasons = new Map<string, string>();

  for (const [file, info] of directiveMap) {
    if (info.directive === '"use client"') {
      classifications.set(file, 'client');
      reasons.set(file, 'Has "use client" directive');
    } else if (info.directive === '"use server"') {
      classifications.set(file, 'server');
      reasons.set(file, 'Has "use server" directive: explicitly server-only');
    }
  }

  const queue: string[] = [];
  for (const [file, cls] of classifications) {
    if (cls === 'client') {queue.push(file);}
  }
  const visited = new Set<string>(queue);

  while (queue.length > 0) {
    const current = queue.shift()!;
    const imports = graph.get(current) || [];
    for (const imported of imports) {
      if (!visited.has(imported)) {
        visited.add(imported);
        if (!classifications.has(imported)) {
          classifications.set(imported, 'client-inherited');
          reasons.set(imported, `Imported by client component (${current})`);
        }
        queue.push(imported);
      }
    }
  }

  const results: ComponentClassification[] = [];
  for (const [file] of graph) {
    const info = directiveMap.get(file);
    const cls = classifications.get(file) ?? 'server';
    const reason =
      reasons.get(file) ?? 'No directive, not imported by client components: server by default';
    results.push({ file, classification: cls, reason, directive: info?.directive ?? undefined });
  }
  return results;
}

/** Build a map of client boundary files to their descendant (child) count. */
export function buildBoundaryMap(
  graph: ImportGraph,
  classifications: ComponentClassification[],
): Map<string, number> {
  const clientBoundaries = classifications
    .filter((c) => c.classification === 'client')
    .map((c) => c.file);

  const boundaryMap = new Map<string, number>();
  for (const boundary of clientBoundaries) {
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
