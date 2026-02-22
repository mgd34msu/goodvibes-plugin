/**
 * Analyze Client Boundary Handler
 *
 * Analyzes Next.js App Router "use client" / "use server" boundaries to:
 * - Classify components as server, client, client-inherited, or ambiguous
 * - Detect unnecessary client directives
 * - Detect missing directives in files using client-only APIs
 * - Identify large client subtrees that bloat the client bundle
 * - Flag server-only imports in client-classified files
 * - Suggest boundary optimization opportunities
 *
 * @module handlers/frontend/client-boundary
 */

import * as fs from 'fs';
import * as path from 'path';
import { getProjectRoot } from '../../config.js';
import { createSuccessResponse, createErrorResponse } from '../response-utils.js';
import { scanForDirectives } from './scanner.js';
import { buildImportGraph, classifyComponents, buildBoundaryMap } from './graph-builder.js';
import { detectIssues } from './issue-detector.js';
import type {
  AnalyzeClientBoundaryArgs,
  ClientBoundaryResult,
  BoundarySummary,
  BoundaryEntry,
  FileDirectiveInfo,
  ToolResponse,
} from './types.js';

// Re-export types
export type {
  AnalyzeClientBoundaryArgs,
  ClientBoundaryResult,
  ComponentClassification,
  ClientBoundaryIssue,
  BoundarySummary,
  BoundaryEntry,
  FileDirectiveInfo,
  ToolResponse,
} from './types.js';

// =============================================================================
// Handler
// =============================================================================

/**
 * Determine the scan path based on args and project root.
 * Tries app/ first (Next.js App Router), then src/, then project root.
 */
function resolveScanPath(
  projectRoot: string,
  providedPath?: string,
  entryFile?: string
): { scanPath: string; description: string } {
  const normalizedRoot = projectRoot.endsWith(path.sep) ? projectRoot : projectRoot + path.sep;

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

  // Auto-detect: try app/, then src/app, then src/
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

/**
 * Handles the analyze_client_boundary MCP tool call.
 *
 * @param args - The analyze_client_boundary tool arguments
 * @returns MCP tool response with client boundary analysis
 */
export async function handleAnalyzeClientBoundary(
  args: AnalyzeClientBoundaryArgs
): Promise<ToolResponse> {
  const projectRoot = getProjectRoot();

  const { scanPath, description } = resolveScanPath(
    projectRoot,
    args.path,
    args.entry
  );

  // Validate scan target exists
  if (!fs.existsSync(scanPath)) {
    return createErrorResponse(
      `Scan path not found: ${description}`,
      { provided: args.path ?? args.entry, resolved: scanPath }
    );
  }

  try {
    // STEP 1: Scan all files for directives and API usage
    const fileInfos = scanForDirectives(projectRoot, scanPath);

    if (fileInfos.length === 0) {
      return createSuccessResponse({
        scanned_path: description,
        message: 'No TypeScript/JavaScript files found in scan path.',
        components: [],
        issues: [],
        summary: { total: 0, server: 0, client: 0, clientInherited: 0, ambiguous: 0 },
        boundaries: [],
      });
    }

    // Check if any "use client" files exist
    const clientFiles = fileInfos.filter(f => f.directive === '"use client"');

    // STEP 2: Build import graph
    // Convert relative paths back to absolute for graph-builder
    const absoluteFiles = fileInfos.map(f =>
      path.resolve(projectRoot, f.file)
    );
    const graph = buildImportGraph(absoluteFiles, projectRoot);

    // STEP 3: Build directive map (keyed by relative path)
    const directiveMap = new Map<string, FileDirectiveInfo>(
      fileInfos.map(info => [info.file, info])
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
      server: classifications.filter(c => c.classification === 'server').length,
      client: classifications.filter(c => c.classification === 'client').length,
      clientInherited: classifications.filter(c => c.classification === 'client-inherited').length,
      ambiguous: classifications.filter(c => c.classification === 'ambiguous').length,
    };

    // STEP 8: Build boundaries list (sorted by childCount desc)
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

    return createSuccessResponse(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error during analysis';
    return createErrorResponse(message, { scanned_path: description });
  }
}
