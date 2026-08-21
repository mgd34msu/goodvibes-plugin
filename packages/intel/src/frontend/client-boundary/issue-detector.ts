/**
 * Issue detector for client boundary analysis, Lane 4.
 * Ported verbatim from frontend-engine `core/client-boundary/issue-detector.ts`.
 *
 * @module frontend/client-boundary/issue-detector
 */

import type {
  ClientBoundaryIssue,
  ComponentClassification,
  FileDirectiveInfo,
  ImportGraph,
} from './types.js';

const LARGE_CLIENT_SUBTREE_THRESHOLD = 5;

function detectUnnecessaryClient(
  classifications: ComponentClassification[],
  directiveMap: Map<string, FileDirectiveInfo>,
): ClientBoundaryIssue[] {
  const issues: ClientBoundaryIssue[] = [];
  for (const comp of classifications) {
    if (comp.classification !== 'client') {continue;}
    const info = directiveMap.get(comp.file);
    if (!info) {continue;}
    if (!info.hasClientAPIs && !info.hasServerOnlyImports) {
      issues.push({
        type: 'unnecessary_client',
        severity: 'info',
        file: comp.file,
        message: `"use client" directive found but no client-only APIs detected (no hooks, event handlers, or browser APIs).`,
        suggestion:
          'Remove the "use client" directive unless this component receives client-side props or is intentionally used as a client boundary.',
      });
    }
  }
  return issues;
}

function detectMissingDirective(
  classifications: ComponentClassification[],
  directiveMap: Map<string, FileDirectiveInfo>,
): ClientBoundaryIssue[] {
  const issues: ClientBoundaryIssue[] = [];
  for (const comp of classifications) {
    if (comp.classification !== 'server') {continue;}
    const info = directiveMap.get(comp.file);
    if (!info) {continue;}
    if (info.hasClientAPIs) {
      issues.push({
        type: 'missing_directive',
        severity: 'error',
        file: comp.file,
        message: `File uses client-only APIs (hooks/event handlers/browser APIs) but has no "use client" directive and is not imported by a client component.`,
        suggestion:
          'Add "use client" at the top of this file, or move client-side logic into a child component with "use client".',
      });
    }
  }
  return issues;
}

function detectLargeClientSubtrees(
  _classifications: ComponentClassification[],
  boundaryMap: Map<string, number>,
): ClientBoundaryIssue[] {
  const issues: ClientBoundaryIssue[] = [];
  for (const [file, childCount] of boundaryMap) {
    if (childCount >= LARGE_CLIENT_SUBTREE_THRESHOLD) {
      issues.push({
        type: 'large_client_subtree',
        severity: 'warning',
        file,
        message: `Client boundary at "${file}" forces ${childCount} imported file(s) into the client bundle.`,
        suggestion:
          'Consider moving "use client" to leaf components that actually need interactivity, keeping parent components as server components.',
      });
    }
  }
  return issues;
}

function detectServerOnlyInClient(
  classifications: ComponentClassification[],
  directiveMap: Map<string, FileDirectiveInfo>,
): ClientBoundaryIssue[] {
  const issues: ClientBoundaryIssue[] = [];
  for (const comp of classifications) {
    if (comp.classification !== 'client' && comp.classification !== 'client-inherited') {continue;}
    const info = directiveMap.get(comp.file);
    if (!info) {continue;}
    if (info.hasServerOnlyImports) {
      issues.push({
        type: 'server_only_in_client',
        severity: 'error',
        file: comp.file,
        message: `File is classified as ${comp.classification} but imports server-only packages (fs, database clients, server-only, etc.).`,
        suggestion:
          'Move server-only logic to a Server Component or a server action. Use API routes or server actions to fetch data for client components.',
      });
    }
  }
  return issues;
}

function detectBoundaryOptimizations(
  _classifications: ComponentClassification[],
  directiveMap: Map<string, FileDirectiveInfo>,
  graph: ImportGraph,
  boundaryMap: Map<string, number>,
): ClientBoundaryIssue[] {
  const issues: ClientBoundaryIssue[] = [];
  for (const [boundaryFile, childCount] of boundaryMap) {
    if (childCount < 3) {continue;}
    const directImports = graph.get(boundaryFile) || [];
    const serverableChildren = directImports.filter((imp) => {
      const info = directiveMap.get(imp);
      return info && !info.hasClientAPIs && !info.directive;
    });
    if (serverableChildren.length > 0) {
      issues.push({
        type: 'boundary_optimization',
        severity: 'info',
        file: boundaryFile,
        message: `${serverableChildren.length} direct import(s) of this client boundary don't require client APIs and could remain as Server Components.`,
        suggestion: `Move "use client" to only the components that need interactivity: ${serverableChildren.slice(0, 3).join(', ')}${serverableChildren.length > 3 ? ` (and ${serverableChildren.length - 3} more)` : ''}.`,
      });
    }
  }
  return issues;
}

/** Run all issue detection rules and return combined issues. */
export function detectIssues(
  classifications: ComponentClassification[],
  directiveMap: Map<string, FileDirectiveInfo>,
  graph: ImportGraph,
  boundaryMap: Map<string, number>,
): ClientBoundaryIssue[] {
  return [
    ...detectUnnecessaryClient(classifications, directiveMap),
    ...detectMissingDirective(classifications, directiveMap),
    ...detectLargeClientSubtrees(classifications, boundaryMap),
    ...detectServerOnlyInClient(classifications, directiveMap),
    ...detectBoundaryOptimizations(classifications, directiveMap, graph, boundaryMap),
  ];
}
