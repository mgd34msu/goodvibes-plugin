/**
 * Component Tree Extension
 *
 * L2 orchestrator that composes L1 core react primitives into the
 * get_react_component_tree MCP tool handler. Validates arguments,
 * delegates to core analysis functions, and formats results.
 *
 * @module extensions/component-tree
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

import { ok, fail, failFromException } from '../shared/response.js';
import type { McpResponse } from '../shared/types.js';
import type {
  GetReactComponentTreeArgs,
  ComponentInfo,
  ComponentTreeNode,
  ComponentTreeResult,
} from '../core/react/types.js';
import { analyzeFile, findComponentFiles } from '../core/react/component-analyzer.js';
import { getProjectRoot } from '../shared/config.js';
import {
  buildUsedByRelationships,
  buildTree,
  findRootComponent,
} from '../core/react/relationship-builder.js';

// =============================================================================
// Handler
// =============================================================================

/**
 * Analyze a React component tree.
 *
 * Parses JSX/TSX files to build a component hierarchy tree with:
 * - Component definitions and their props
 * - Parent-child relationships
 * - Component usage tracking
 *
 * @param args - The get_react_component_tree tool arguments
 * @returns MCP tool response with component tree
 */
export async function analyzeComponentTree(args: unknown): Promise<McpResponse> {
  if (!args || typeof args !== 'object') {
    return fail('Invalid arguments: expected an object');
  }
  const typedArgs = args as GetReactComponentTreeArgs;
  const projectRoot = getProjectRoot();
  const searchPath = typedArgs.path ?? 'src';
  const maxDepth = typedArgs.depth ?? 5;

  try {
    let allComponents: ComponentInfo[] = [];

    if (typedArgs.file) {
      // Analyze a specific file
      const filePath = path.isAbsolute(typedArgs.file)
        ? typedArgs.file
        : path.resolve(projectRoot, typedArgs.file);

      if (!fs.existsSync(filePath)) {
        return fail(`File not found: ${typedArgs.file}`, { provided_path: typedArgs.file });
      }

      allComponents = analyzeFile(filePath, projectRoot);
    } else {
      // Find and analyze all component files in search path
      const files = findComponentFiles(searchPath, projectRoot);

      if (files.length === 0) {
        return ok({
          tree: null,
          components: [] as ComponentInfo[],
          count: 0,
          message: `No React component files found in ${searchPath}`,
        });
      }

      for (const file of files) {
        const fileComponents = analyzeFile(file, projectRoot);
        allComponents.push(...fileComponents);
      }
    }

    // Build used_by relationships
    buildUsedByRelationships(allComponents);

    // Determine root component
    const rootName = typedArgs.root_component ?? findRootComponent(allComponents);

    // Build tree from root
    let tree: ComponentTreeNode | null = null;
    if (rootName) {
      tree = buildTree(rootName, allComponents, maxDepth);
    }

    const result: ComponentTreeResult = {
      tree,
      components: allComponents,
      count: allComponents.length,
    };

    return ok(result);
  } catch (error) {
    /* v8 ignore next */
    return failFromException(error, 'Analysis failed');
  }
}

// =============================================================================
// Deprecated Alias
// =============================================================================

/** @deprecated Use analyzeComponentTree */
export const handleGetReactComponentTree = analyzeComponentTree;
