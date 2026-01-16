/**
 * Analyze Stacking Context Handler
 *
 * Analyzes z-index and stacking contexts in React/Vue/Svelte components
 * using Tailwind CSS class analysis. Detects potential z-index conflicts,
 * context isolation issues, and portal destinations.
 *
 * @module handlers/frontend/stacking-context
 */

import * as fs from 'fs';
import * as path from 'path';
import ts from 'typescript';

// Re-export types
export type {
  AnalyzeStackingContextArgs,
  AnalyzeStackingContextResult,
  StackingContext,
  StackingContextEntry,
  ContextCreator,
  ZIndexInfo,
  StackingIssue,
  PortalInfo,
  ToolResponse,
  ElementInfo,
} from './types.js';

// Import from modules
import type {
  AnalyzeStackingContextArgs,
  AnalyzeStackingContextResult,
  ContextCreator,
  StackingContextEntry,
  ToolResponse,
} from './types.js';
import { createSuccessResponse, createErrorResponse } from './utils.js';
import { analyzeJsxFile } from './jsx-analyzer.js';
import { buildStackingTree, collectZIndexValues } from './tree-builder.js';
import { detectStackingIssues } from './issue-detector.js';
import { detectPortals } from './portal-detector.js';

// =============================================================================
// Handler
// =============================================================================

/**
 * Handles the analyze_stacking_context MCP tool call.
 *
 * Analyzes z-index and stacking contexts in a component file,
 * detecting potential issues and building a stacking context tree.
 *
 * @param args - The analyze_stacking_context tool arguments
 * @returns MCP tool response with stacking analysis
 */
export async function handleAnalyzeStackingContext(
  args: AnalyzeStackingContextArgs
): Promise<ToolResponse> {
  const projectRoot = process.cwd();
  const includePortals = args.include_portals ?? true;

  try {
    // Validate file argument
    if (!args.file) {
      return createErrorResponse('file argument is required');
    }

    // Resolve file path
    const filePath = path.isAbsolute(args.file)
      ? args.file
      : path.resolve(projectRoot, args.file);

    // Check file exists
    if (!fs.existsSync(filePath)) {
      return createErrorResponse(`File not found: ${args.file}`, {
        provided_path: args.file,
        resolved_path: filePath,
      });
    }

    // Check file extension - support .tsx, .jsx, .ts, .js, .vue, .svelte
    const ext = path.extname(filePath).toLowerCase();
    if (!['.tsx', '.jsx', '.ts', '.js', '.vue', '.svelte'].includes(ext)) {
      return createErrorResponse(
        `Unsupported file type: ${ext}. Supported: .tsx, .jsx, .ts, .js, .vue, .svelte`,
        { file: args.file }
      );
    }

    // Read file content
    const content = fs.readFileSync(filePath, 'utf-8');

    // For Vue/Svelte, extract template section
    let templateContent = content;
    if (ext === '.vue') {
      const templateMatch = content.match(/<template[^>]*>([\s\S]*?)<\/template>/);
      templateContent = templateMatch ? templateMatch[1] : content;
    } else if (ext === '.svelte') {
      // Svelte template is the whole file minus script/style tags
      templateContent = content
        .replace(/<script[^>]*>[\s\S]*?<\/script>/g, '')
        .replace(/<style[^>]*>[\s\S]*?<\/style>/g, '');
    }

    // Create TypeScript source file for parsing
    const scriptKind =
      ext === '.tsx' ? ts.ScriptKind.TSX
      : ext === '.jsx' ? ts.ScriptKind.JSX
      : ext === '.ts' ? ts.ScriptKind.TS
      : ts.ScriptKind.JS;

    const sourceFile = ts.createSourceFile(
      filePath,
      content,
      ts.ScriptTarget.Latest,
      true,
      scriptKind
    );

    // Analyze elements
    let elements = analyzeJsxFile(filePath, content, sourceFile);

    // Filter by element name if specified
    if (args.element) {
      const filterName = args.element.toLowerCase();
      elements = elements.filter((elem) => {
        const elemName = elem.element.split(':')[0].toLowerCase();
        return elemName.includes(filterName);
      });
    }

    if (elements.length === 0) {
      return createSuccessResponse({
        file: path.relative(projectRoot, filePath).replace(/\\/g, '/'),
        stacking_tree: {
          element: 'root',
          z_index: 'auto',
          creates_context: true,
          context_reason: 'document root',
          children: [],
        },
        stacking_contexts: [],
        context_creators: [],
        z_index_values: [],
        potential_issues: [],
        issues: [],
        summary: 'No stacking contexts detected',
        message: 'No JSX elements with stacking-relevant classes found',
      });
    }

    // Build stacking tree
    const stackingTree = buildStackingTree(elements);

    // Collect context creators
    const contextCreators: ContextCreator[] = elements
      .filter((elem) => elem.creates_context)
      .map((elem) => ({
        element: elem.element,
        reason: elem.context_reason || 'unknown',
        z_index: elem.z_index,
        classes: elem.classes,
      }));

    // Build flat stacking_contexts list (for backward compatibility)
    const stackingContexts: StackingContextEntry[] = elements
      .filter((elem) => elem.creates_context || elem.z_index !== 'auto')
      .map((elem) => ({
        element: elem.element,
        position: elem.position,
        z_index: elem.z_index,
        creates_context: elem.creates_context,
        creates_context_reason: elem.context_reason,
        classes: elem.classes,
        line: elem.line,
      }));

    // Collect z-index values
    const zIndexValues = collectZIndexValues(elements);

    // Detect issues
    const potentialIssues = detectStackingIssues(elements, zIndexValues);

    // Generate summary
    const zIndexNumbers = zIndexValues.map((z) => z.z_index).filter((z) => typeof z === 'number');
    const minZ = zIndexNumbers.length > 0 ? Math.min(...zIndexNumbers) : 0;
    const maxZ = zIndexNumbers.length > 0 ? Math.max(...zIndexNumbers) : 0;
    const summaryParts: string[] = [];
    summaryParts.push(`Found ${stackingContexts.length} stacking context${stackingContexts.length !== 1 ? 's' : ''}`);
    if (zIndexNumbers.length > 0) {
      summaryParts.push(`z-index range: ${minZ} to ${maxZ}`);
    }
    if (potentialIssues.length > 0) {
      summaryParts.push(`${potentialIssues.length} potential issue${potentialIssues.length !== 1 ? 's' : ''} detected`);
    }
    const summary = summaryParts.join('. ');

    // Build result
    const result: AnalyzeStackingContextResult = {
      file: path.relative(projectRoot, filePath).replace(/\\/g, '/'),
      stacking_tree: stackingTree,
      stacking_contexts: stackingContexts,
      context_creators: contextCreators,
      z_index_values: zIndexValues,
      potential_issues: potentialIssues,
      issues: potentialIssues, // Alias for backward compatibility
      summary,
    };

    // Detect portals if requested
    if (includePortals) {
      const portals = detectPortals(content, sourceFile);
      if (portals.length > 0) {
        result.portals = portals;
      }
    }

    return createSuccessResponse(result);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Unknown error during analysis';
    return createErrorResponse(message, { file: args.file });
  }
}
