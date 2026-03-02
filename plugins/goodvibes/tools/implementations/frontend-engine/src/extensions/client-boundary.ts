/**
 * Analyze Client Boundary Extension
 *
 * L2 orchestrator that composes L1 core primitives to analyze Next.js App
 * Router "use client" / "use server" boundaries. Detects misclassified
 * components, unnecessary client directives, and optimization opportunities.
 *
 * @module extensions/frontend/client-boundary
 */

import * as fs from 'fs';
import * as path from 'path';

import { getProjectRoot } from '../shared/config.js';
import { ok, fail, failFromException } from '../shared/response.js';
import type { McpResponse } from '../shared/types.js';
import { scanForDirectives } from '../core/client-boundary/scanner.js';
import {
  buildImportGraph,
  classifyComponents,
  buildBoundaryMap,
} from '../core/client-boundary/graph-builder.js';
import { detectIssues } from '../core/client-boundary/issue-detector.js';
import type {
  AnalyzeClientBoundaryArgs,
  ClientBoundaryResult,
  BoundarySummary,
  BoundaryEntry,
  FileDirectiveInfo,
} from '../core/client-boundary/types.js';

// =============================================================================
// Path resolution
// =============================================================================

/**
 * Determine the scan path based on args and project root.
 * Tries app/ first (Next.js App Router), then src/app, then src/, then root.
 */
function resolveScanPath(
  projectRoot: string,
  providedPath?: string,
  entryFile?: string
): { scanPath: string; description: string; error?: string } {
  const normalizedRoot = projectRoot.endsWith(path.sep)
    ? projectRoot
    : projectRoot + path.sep;

  if (entryFile) {
    const entryAbs = path.isAbsolute(entryFile)
      ? entryFile
      : path.resolve(projectRoot, entryFile);
    if (!entryAbs.startsWith(normalizedRoot) && entryAbs !== projectRoot) {
      return { scanPath: '', description: '', error: 'Path is outside project root' };
    }
    return { scanPath: entryAbs, description: entryFile };
  }

  if (providedPath) {
    const provided = path.isAbsolute(providedPath)
      ? providedPath
      : path.resolve(projectRoot, providedPath);
    if (!provided.startsWith(normalizedRoot) && provided !== projectRoot) {
      return { scanPath: '', description: '', error: 'Path is outside project root' };
    }
    return { scanPath: provided, description: providedPath };
  }

  // Auto-detect: try app/, then src/app, then src/, then root
  const candidates = [
    path.join(projectRoot, 'app'),
    path.join(projectRoot, 'src', 'app'),
    path.join(projectRoot, 'src'),
    projectRoot,
  ];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      const rel = path.relative(projectRoot, candidate) || '.';
      return { scanPath: candidate, description: rel };
    }
  }

  return { scanPath: projectRoot, description: '.' };
}

// =============================================================================
// Handler
// =============================================================================

/**
 * Analyze Next.js App Router client/server boundary classification.
 *
 * Orchestrates: resolve path -> scan directives -> build import graph
 * -> classify components -> detect issues -> ok(result)
 *
 * @param args - The analyze_client_boundary tool arguments (unknown, validated at runtime)
 * @returns MCP tool response with client boundary analysis
 */
export async function analyzeClientBoundary(args: unknown): Promise<McpResponse> {
  if (!args || typeof args !== 'object') {
    return fail('Invalid arguments: expected an object');
  }
  const typedArgs = args as AnalyzeClientBoundaryArgs;
  const projectRoot = getProjectRoot();

  const { scanPath, description, error: pathError } = resolveScanPath(
    projectRoot,
    typedArgs.path,
    typedArgs.entry
  );

  if (pathError) {
    return fail(pathError, { provided: typedArgs.path ?? typedArgs.entry });
  }

  if (!fs.existsSync(scanPath)) {
    return fail(`Scan path not found: ${description}`, {
      provided: typedArgs.path ?? typedArgs.entry,
      resolved: scanPath,
    });
  }

  try {
    // STEP 1: Scan all files for directives and API usage
    const fileInfos = scanForDirectives(projectRoot, scanPath);

    if (fileInfos.length === 0) {
      return ok({
        scanned_path: description,
        message: 'No TypeScript/JavaScript files found in scan path.',
        components: [],
        issues: [],
        summary: { total: 0, server: 0, client: 0, clientInherited: 0, ambiguous: 0 },
        boundaries: [],
      });
    }

    // Check if any "use client" files exist
    const clientFiles = fileInfos.filter((f) => f.directive === '"use client"');

    // STEP 2: Build import graph (absolute paths required)
    const absoluteFiles = fileInfos.map((f) => path.resolve(projectRoot, f.file));
    const graph = buildImportGraph(absoluteFiles, projectRoot);

    // STEP 3: Build directive map (keyed by relative path)
    const directiveMap = new Map<string, FileDirectiveInfo>(
      fileInfos.map((info) => [info.file, info])
    );

    // STEP 4: Classify components
    const classifications = classifyComponents(graph, directiveMap);

    // STEP 5: Build boundary map
    const boundaryMap = buildBoundaryMap(graph, classifications);

    // STEP 6: Detect issues
    const issues = detectIssues(classifications, directiveMap, graph, boundaryMap);

    // STEP 7: Build summary
    const summary: BoundarySummary = {
      total: classifications.length,
      server: classifications.filter((c) => c.classification === 'server').length,
      client: classifications.filter((c) => c.classification === 'client').length,
      clientInherited: classifications.filter((c) => c.classification === 'client-inherited').length,
      ambiguous: classifications.filter((c) => c.classification === 'ambiguous').length,
      ...(clientFiles.length === 0 && !typedArgs.entry
        ? {
            note: 'No "use client" directives found in the scanned directory — all files are treated as server components.',
          }
        : {}),
    };

    // STEP 8: Build boundaries list (sorted by childCount descending)
    const boundaries: BoundaryEntry[] = Array.from(boundaryMap.entries())
      .map(([file, childCount]) => ({ file, childCount }))
      .sort((a, b) => b.childCount - a.childCount);

    const result: ClientBoundaryResult = {
      scanned_path: description,
      components: classifications,
      issues,
      summary,
      boundaries,
    };

    return ok(result);
  } catch (error) {
    return failFromException(error, 'Client boundary analysis failed');
  }
}

// =============================================================================
// Deprecated alias
// =============================================================================

/** @deprecated Use analyzeClientBoundary */
export const handleAnalyzeClientBoundary = analyzeClientBoundary;
