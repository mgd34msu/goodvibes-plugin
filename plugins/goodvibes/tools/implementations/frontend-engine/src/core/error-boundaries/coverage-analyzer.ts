/**
 * Coverage analyzer for error boundary protection
 *
 * Determines which component subtrees are protected by error boundaries
 * by walking the component import graph and propagating protection status.
 *
 * @module core/error-boundaries/coverage-analyzer
 */

import * as fs from 'fs';
import * as path from 'path';
import ts from 'typescript';
import type { ErrorBoundaryInfo, CoverageResult, RouteSegment } from './types.js';
import { SCANNABLE_EXTENSIONS } from './scanner.js';

// =============================================================================
// Import graph construction
// =============================================================================

/**
 * Parse a file and extract its import paths (resolved to absolute paths).
 * Returns an empty array if the file cannot be parsed.
 */
function extractImportPaths(filePath: string, projectRoot: string): string[] {
  let content: string;
  try {
    content = fs.readFileSync(filePath, 'utf-8');
  } catch {
    return [];
  }

  const ext = path.extname(filePath).toLowerCase();
  const scriptKind =
    ext === '.tsx' || ext === '.jsx' ? ts.ScriptKind.TSX
    : ext === '.js' || ext === '.mjs' || ext === '.cjs' ? ts.ScriptKind.JS
    : ts.ScriptKind.TS;

  let sourceFile: ts.SourceFile;
  try {
    sourceFile = ts.createSourceFile(filePath, content, ts.ScriptTarget.Latest, true, scriptKind);
  } catch {
    return [];
  }

  const imports: string[] = [];

  ts.forEachChild(sourceFile, (node) => {
    let moduleSpecifier: string | undefined;

    if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
      moduleSpecifier = node.moduleSpecifier.text;
    } else if (
      ts.isExportDeclaration(node) &&
      node.moduleSpecifier &&
      ts.isStringLiteral(node.moduleSpecifier)
    ) {
      moduleSpecifier = node.moduleSpecifier.text;
    }

    if (!moduleSpecifier || !moduleSpecifier.startsWith('.')) return;

    const dir = path.dirname(filePath);
    let resolved: string | undefined;

    // Try resolving with each extension
    const base = path.resolve(dir, moduleSpecifier);
    for (const ext of SCANNABLE_EXTENSIONS) {
      const candidate = base + ext;
      if (fs.existsSync(candidate)) {
        resolved = candidate;
        break;
      }
    }

    // Try as a directory with index file
    if (!resolved) {
      for (const ext of SCANNABLE_EXTENSIONS) {
        const candidate = path.join(base, 'index' + ext);
        if (fs.existsSync(candidate)) {
          resolved = candidate;
          break;
        }
      }
    }

    if (resolved) {
      // Validate it stays within project root (trailing sep pattern)
      const normalizedRoot = projectRoot.endsWith(path.sep) ? projectRoot : projectRoot + path.sep;
      if (resolved.startsWith(normalizedRoot) || resolved === projectRoot) {
        imports.push(resolved);
      }
    }
  });

  return imports;
}

/**
 * Build a forward import graph: for each file, which files does it import?
 *
 * @param allFiles - All absolute file paths in the project
 * @param projectRoot - Absolute project root
 * @returns Map of absolutePath -> array of files it imports
 */
export function buildForwardImportGraph(
  allFiles: string[],
  projectRoot: string
): Map<string, string[]> {
  const graph = new Map<string, string[]>();

  for (const filePath of allFiles) {
    const imports = extractImportPaths(filePath, projectRoot);
    graph.set(filePath, imports);
  }

  return graph;
}

// =============================================================================
// Coverage propagation
// =============================================================================

/**
 * For each error boundary file, collect all files it transitively imports.
 * These form the "protected subtree" of that boundary.
 *
 * Uses DFS with a visited set to prevent infinite loops from circular imports.
 */
function collectSubtree(
  boundaryFile: string,
  forwardGraph: Map<string, string[]>,
  visited: Set<string> = new Set()
): Set<string> {
  const subtree = new Set<string>();
  const stack = [boundaryFile];

  while (stack.length > 0) {
    const current = stack.pop()!;
    if (visited.has(current)) continue;
    visited.add(current);
    // Include the boundary file itself in DFS traversal so its imports are
    // discovered, but note: the boundary file is later excluded from the
    // "protected" set (line in analyzeCoverage) because the boundary is the
    // protector, not the protected. Children it imports are the protected subtree.
    subtree.add(current);

    const children = forwardGraph.get(current) ?? [];
    for (const child of children) {
      if (!visited.has(child)) {
        stack.push(child);
      }
    }
  }

  return subtree;
}

/**
 * Analyze error boundary coverage across all scanned files.
 *
 * For each boundary, determine the set of files it protects by collecting
 * the transitive import subtree. Then, for each file, determine if it falls
 * within any boundary's subtree.
 *
 * @param boundaries - Detected error boundary components
 * @param allFiles - All absolute file paths to analyze
 * @param forwardGraph - Forward import graph (file -> imports)
 * @param projectRoot - Absolute project root path
 * @returns Coverage result for each file
 */
export function analyzeCoverage(
  boundaries: ErrorBoundaryInfo[],
  allFiles: string[],
  forwardGraph: Map<string, string[]>,
  projectRoot: string
): CoverageResult[] {
  // Build a map from relative file path -> absolute path
  const relToAbs = new Map<string, string>();
  for (const f of allFiles) {
    const rel = path.relative(projectRoot, f).replace(/\\/g, '/');
    relToAbs.set(rel, f);
  }

  // Collect protected subtrees for each boundary
  const boundaryProtectedSets = new Map<string, Set<string>>();
  for (const boundary of boundaries) {
    const absPath = relToAbs.get(boundary.file);
    if (!absPath) continue;

    const subtree = collectSubtree(absPath, forwardGraph);
    boundaryProtectedSets.set(boundary.file, subtree);
  }

  // Determine coverage for each file
  const coverage: CoverageResult[] = [];
  for (const absPath of allFiles) {
    const relPath = path.relative(projectRoot, absPath).replace(/\\/g, '/');
    let isProtected = false;
    let protectedBy: string | undefined;

    for (const [boundaryFile, subtree] of boundaryProtectedSets) {
      if (subtree.has(absPath) && absPath !== (relToAbs.get(boundaryFile) ?? '')) {
        isProtected = true;
        protectedBy = boundaryFile;
        break;
      }
    }

    coverage.push({ file: relPath, isProtected, protectedBy });
  }

  return coverage;
}

/**
 * Update route segments with protection status derived from coverage analysis
 * and parent segment error file inheritance.
 *
 * A segment is protected if:
 * 1. It has an error.tsx file directly, OR
 * 2. A parent segment has an error.tsx (Next.js error boundaries cascade up)
 *
 * @param segments - Route segments to update
 * @returns Updated segments with isProtected field set
 */
export function updateSegmentProtection(segments: RouteSegment[]): RouteSegment[] {
  // Sort segments by path depth (shallowest first) so parents are processed first
  const sorted = [...segments].sort(
    (a, b) => a.segmentPath.split('/').length - b.segmentPath.split('/').length
  );

  const updatedMap = new Map<string, RouteSegment>();
  for (const seg of sorted) {
    updatedMap.set(seg.segmentPath, { ...seg });
  }

  for (const seg of sorted) {
    if (seg.hasErrorFile) continue; // already protected

    // Check if any parent segment has an error file
    const parts = seg.segmentPath.split('/');
    let parentProtected = false;
    for (let depth = 1; depth < parts.length; depth++) {
      const parentPath = parts.slice(0, depth).join('/');
      const parent = updatedMap.get(parentPath);
      if (parent?.hasErrorFile) {
        parentProtected = true;
        break;
      }
    }

    if (parentProtected) {
      const updated = updatedMap.get(seg.segmentPath)!;
      updated.isProtected = true;
      updatedMap.set(seg.segmentPath, updated);
    }
  }

  return Array.from(updatedMap.values());
}
