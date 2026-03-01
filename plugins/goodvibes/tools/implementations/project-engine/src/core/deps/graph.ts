/**
 * Import graph construction and cycle detection for the deps domain.
 *
 * Builds a directed file import graph and uses DFS to find circular dependencies.
 *
 * @module core/deps/graph
 */

import type { Cycle } from './types.js';
import { parseImports } from './import-parser.js';

/** Colors for DFS cycle detection */
const enum Color {
  WHITE = 0, // Not visited
  GRAY = 1,  // Currently visiting (in stack)
  BLACK = 2, // Finished visiting
}

/**
 * Builds a directed import graph from source files.
 *
 * Each node represents a file, edges represent import relationships.
 * Parses each file asynchronously for its local imports.
 *
 * @param files - Array of absolute file paths to include in the graph
 * @returns Promise resolving to a Map where keys are normalized file paths
 *          and values are arrays of imported file paths
 */
export async function buildImportGraph(
  files: string[]
): Promise<Map<string, string[]>> {
  const graph = new Map<string, string[]>();
  const fileSet = new Set(files.map((f) => f.replace(/\\/g, '/')));

  // Graph building is intentionally sequential (not parallel) to bound memory usage
  // on large codebases — concurrent parsing of thousands of files would load all ASTs
  // into memory simultaneously, potentially causing OOM on large monorepos.
  for (const file of files) {
    const normalizedFile = file.replace(/\\/g, '/');
    const imports = await parseImports(file, fileSet);
    graph.set(normalizedFile, imports);
  }

  return graph;
}

/**
 * Finds all cycles in the import graph using depth-first search.
 *
 * Uses a three-color algorithm (WHITE, GRAY, BLACK) to detect back edges.
 * Deduplicates cycles using canonical signatures.
 *
 * @param graph - Import graph (file -> imported files)
 * @returns Array of unique cycles found in the graph
 */
export function findCycles(graph: Map<string, string[]>): Cycle[] {
  const cycles: Cycle[] = [];
  const color = new Map<string, Color>();
  const cycleSignatures = new Set<string>();

  // Initialize all nodes as WHITE
  for (const node of graph.keys()) {
    color.set(node, Color.WHITE);
  }

  /**
   * DFS to find cycles - marks back edges and reconstructs cycle paths.
   */
  function dfs(node: string, stack: string[]): void {
    color.set(node, Color.GRAY);
    stack.push(node);

    const neighbors = graph.get(node) || [];
    for (const neighbor of neighbors) {
      // Only consider neighbors that are in our graph
      if (!graph.has(neighbor)) {
        continue;
      }

      const neighborColor = color.get(neighbor);

      if (neighborColor === Color.WHITE) {
        dfs(neighbor, stack);
      } else if (neighborColor === Color.GRAY) {
        // Found a back edge - we have a cycle
        const cycle = extractCycle(stack, neighbor);
        if (cycle) {
          // Create a canonical signature to avoid duplicate cycles
          const signature = createCycleSignature(cycle);
          if (!cycleSignatures.has(signature)) {
            cycleSignatures.add(signature);
            cycles.push({
              path: [...cycle, cycle[0]], // Add first file at end to show complete cycle
              length: cycle.length,
            });
          }
        }
      }
    }

    color.set(node, Color.BLACK);
    stack.pop();
  }

  // Run DFS from each unvisited node
  for (const node of graph.keys()) {
    if (color.get(node) === Color.WHITE) {
      dfs(node, []);
    }
  }

  return cycles;
}

/**
 * Extracts the cycle path from the current DFS stack.
 *
 * @param stack - Current DFS stack of file paths
 * @param cycleStart - The file that completes the cycle (back edge target)
 * @returns Array of files forming the cycle, or null if cycleStart not in stack
 */
export function extractCycle(stack: string[], cycleStart: string): string[] | null {
  const cycleStartIndex = stack.indexOf(cycleStart);
  if (cycleStartIndex === -1) {
    return null;
  }
  return stack.slice(cycleStartIndex);
}

/**
 * Creates a canonical signature for a cycle to detect duplicates.
 *
 * Rotates the cycle to start with the lexicographically smallest element,
 * ensuring the same cycle detected from different starting points produces
 * the same signature.
 *
 * @param cycle - Array of file paths forming the cycle
 * @returns Canonical string signature for deduplication
 */
export function createCycleSignature(cycle: string[]): string {
  if (cycle.length === 0) return '';

  // Find the minimum element
  let minIndex = 0;
  for (let i = 1; i < cycle.length; i++) {
    if (cycle[i] < cycle[minIndex]) {
      minIndex = i;
    }
  }

  // Rotate the cycle to start with the minimum element
  const rotated = [...cycle.slice(minIndex), ...cycle.slice(0, minIndex)];
  return rotated.join(' -> ');
}
