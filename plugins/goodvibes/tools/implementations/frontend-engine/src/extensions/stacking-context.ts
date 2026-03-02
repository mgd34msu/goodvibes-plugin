/**
 * Stacking Context Extension
 *
 * L2 orchestration function that composes L1 core stacking primitives
 * to analyze z-index and stacking contexts in React components.
 *
 * @module extensions/stacking-context
 */

import * as fs from 'fs';
import * as path from 'path';
import ts from 'typescript';

import { ok, fail, missingArg, invalidArg, failFromException } from '../shared/response.js';
import { getProjectRoot } from '../shared/config.js';
import type { McpResponse } from '../shared/types.js';
import type {
  AnalyzeStackingContextArgs,
  AnalyzeStackingContextResult,
  ContextCreator,
  StackingContextEntry,
} from '../core/stacking/types.js';
import { analyzeJsxFile } from '../core/stacking/jsx-analyzer.js';
import { buildStackingTree, collectZIndexValues } from '../core/stacking/tree-builder.js';
import { detectStackingIssues } from '../core/stacking/issue-detector.js';
import { detectPortals } from '../core/stacking/portal-detector.js';

/**
 * Analyze z-index and stacking contexts in a component file.
 *
 * Orchestrates: validate args → resolve & read file → parse TypeScript AST
 * → analyzeJsxFile → buildStackingTree → detectStackingIssues
 * → detectPortals → ok()
 *
 * @param args - The analyze_stacking_context tool arguments
 * @returns MCP tool response with stacking context analysis
 */
export async function analyzeStackingContext(args: unknown): Promise<McpResponse> {
  const typedArgs = args as Partial<AnalyzeStackingContextArgs>;

  if (!typedArgs.file) {
    return missingArg('file');
  }

  const projectRoot = getProjectRoot();
  const includePortals = typedArgs.include_portals ?? true;

  try {
    // Resolve file path
    const filePath = path.isAbsolute(typedArgs.file)
      ? typedArgs.file
      : path.resolve(projectRoot, typedArgs.file);

    // Check file exists
    if (!fs.existsSync(filePath)) {
      return fail(`File not found: ${typedArgs.file}`, {
        provided_path: typedArgs.file,
        resolved_path: filePath,
      });
    }

    // Validate file extension
    const ext = path.extname(filePath).toLowerCase();
    if (!['.tsx', '.jsx', '.ts', '.js'].includes(ext)) {
      return invalidArg('file', `Unsupported file type: ${ext}. Supported: .tsx, .jsx, .ts, .js`);
    }

    // Read file content
    const content = fs.readFileSync(filePath, 'utf-8');

    // Determine TypeScript script kind
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

    // Analyze JSX elements
    let elements = analyzeJsxFile(filePath, content, sourceFile);

    // Filter by element name if specified
    if (typedArgs.element) {
      const filterName = typedArgs.element.toLowerCase();
      elements = elements.filter((elem) => {
        const elemName = elem.element.split(':')[0].toLowerCase();
        return elemName.includes(filterName);
      });
    }

    // Return empty result if no stacking elements found
    if (elements.length === 0) {
      return ok({
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

    // Detect stacking issues
    const potentialIssues = detectStackingIssues(elements, zIndexValues);

    // Generate summary
    const zIndexNumbers = zIndexValues
      .map((z) => z.z_index)
      .filter((z): z is number => typeof z === 'number');
    const minZ = zIndexNumbers.length > 0 ? Math.min(...zIndexNumbers) : 0;
    const maxZ = zIndexNumbers.length > 0 ? Math.max(...zIndexNumbers) : 0;
    const summaryParts: string[] = [];
    summaryParts.push(
      `Found ${stackingContexts.length} stacking context${stackingContexts.length !== 1 ? 's' : ''}`
    );
    if (zIndexNumbers.length > 0) {
      summaryParts.push(`z-index range: ${minZ} to ${maxZ}`);
    }
    if (potentialIssues.length > 0) {
      summaryParts.push(
        `${potentialIssues.length} potential issue${potentialIssues.length !== 1 ? 's' : ''} detected`
      );
    }
    const summary = summaryParts.join('. ');

    // Detect portals if requested
    const portals =
      includePortals ? detectPortals(content, sourceFile) : [];

    // Build result (summary included in initial object — no mutation needed)
    const result: AnalyzeStackingContextResult = {
      file: path.relative(projectRoot, filePath).replace(/\\/g, '/'),
      stacking_tree: stackingTree,
      stacking_contexts: stackingContexts,
      context_creators: contextCreators,
      z_index_values: zIndexValues,
      potential_issues: potentialIssues,
      issues: potentialIssues,
      summary,
      ...(portals.length > 0 ? { portals } : {}),
    };

    return ok(result);
  } catch (error) {
    return failFromException(error, 'Failed to analyze stacking context');
  }
}

/** @deprecated Use analyzeStackingContext */
export const handleAnalyzeStackingContext = analyzeStackingContext;
