/**
 * Event Flow Extension
 *
 * L2 orchestrator that composes L1 core primitives to analyze event handling
 * and propagation in React components. Detects event handlers, propagation
 * patterns, delegation, and common issues.
 *
 * @module extensions/event-flow
 */

import * as fs from 'fs';
import * as path from 'path';
import ts from 'typescript';

import { getProjectRoot } from '../shared/config.js';
import { ok, fail, failFromException, missingArg } from '../shared/response.js';
import type { McpResponse } from '../shared/response.js';
import type {
  EventHandler,
  EventFlow,
  EventIssue,
  DelegationPattern,
  AnalyzeEventFlowArgs,
} from '../core/event-flow/types.js';
import { normalizeFilePath } from '../shared/utils.js';
import {
  extractEventHandlers,
  findReactComponent,
  detectDelegationPatterns,
} from '../core/event-flow/tracer.js';
import {
  buildEventFlows,
  detectIssues,
  generateSummary,
} from '../core/event-flow/analyzer.js';

// =============================================================================
// Result Type
// =============================================================================

/**
 * Result of event flow analysis
 */
interface AnalyzeEventFlowResult {
  file: string;
  handlers: Array<{
    element: string;
    event: string;
    handler: string;
    line: number;
    stops_propagation: boolean;
    prevents_default: boolean;
  }>;
  event_flows: Record<string, EventFlow>;
  issues: EventIssue[];
  delegation_patterns: DelegationPattern[];
  summary: string;
}

// =============================================================================
// Handler
// =============================================================================

/**
 * Analyze event handling and propagation in a React component file.
 *
 * Orchestrates: validate args → resolve path → parse TypeScript → findReactComponent
 * → extractEventHandlers → buildEventFlows + detectIssues
 * + detectDelegationPatterns + generateSummary → ok(result)
 *
 * @param args - The analyze_event_flow tool arguments (unknown at call site)
 * @returns McpResponse with JSON-formatted event flow analysis
 *
 * @example
 * ```typescript
 * const result = await analyzeEventFlow({ file: 'src/components/Form.tsx', event: 'click' });
 * // Returns handlers, event_flows, issues, delegation_patterns, summary
 * ```
 */
export async function analyzeEventFlow(args: unknown): Promise<McpResponse> {
  const typedArgs = args as AnalyzeEventFlowArgs;

  if (!typedArgs.file) {
    return missingArg('file');
  }

  const projectRoot = getProjectRoot();

  try {
    // Resolve and validate file path
    const filePath = path.isAbsolute(typedArgs.file)
      ? typedArgs.file
      : path.resolve(projectRoot, typedArgs.file);

    if (!fs.existsSync(filePath)) {
      return fail(`File not found: ${typedArgs.file}`, { provided_path: typedArgs.file });
    }

    // Check file extension
    const ext = path.extname(filePath).toLowerCase();
    if (!['.tsx', '.jsx', '.ts', '.js'].includes(ext)) {
      return fail(
        'File must be a component file (.tsx, .jsx, .ts, .js)',
        { provided_extension: ext }
      );
    }

    const content = fs.readFileSync(filePath, 'utf-8');
    const sourceFile = ts.createSourceFile(
      filePath,
      content,
      ts.ScriptTarget.Latest,
      true,
      ext === '.tsx' ? ts.ScriptKind.TSX
      : ext === '.jsx' ? ts.ScriptKind.JSX
      : ext === '.ts' ? ts.ScriptKind.TS
      : ts.ScriptKind.JS
    );

    const relativePath = normalizeFilePath(path.relative(projectRoot, filePath));

    // Find the component
    const componentNode = findReactComponent(sourceFile);
    if (!componentNode) {
      return ok({
        message: 'No React component found in file',
        file: relativePath,
        handlers: [],
        event_flows: {},
        issues: [],
        delegation_patterns: [],
        summary: 'No component found to analyze.',
      });
    }

    // Extract event handlers using core tracer
    const { handlers, tree } = extractEventHandlers(
      componentNode,
      sourceFile,
      typedArgs.event
    );

    if (handlers.length === 0) {
      const eventMsg = typedArgs.event ? ` for event type "${typedArgs.event}"` : '';
      return ok({
        file: relativePath,
        handlers: [],
        event_flows: {},
        issues: [],
        delegation_patterns: [],
        summary: `No event handlers found${eventMsg}.`,
      });
    }

    // Compose core analysis functions
    const eventFlows = buildEventFlows(handlers, tree, typedArgs.event);
    const issues = detectIssues(handlers, tree, sourceFile);
    const delegationPatterns = detectDelegationPatterns(handlers, sourceFile);
    const summary = generateSummary(handlers, issues, delegationPatterns);

    const result: AnalyzeEventFlowResult = {
      file: relativePath,
      handlers,
      event_flows: eventFlows,
      issues,
      delegation_patterns: delegationPatterns,
      summary,
    };

    return ok(result);
  } catch (error) {
    return failFromException(error, `Failed to analyze event flow: ${typedArgs.file}`);
  }
}

// =============================================================================
// Deprecated Alias
// =============================================================================

/** @deprecated Use analyzeEventFlow */
export const handleAnalyzeEventFlow = analyzeEventFlow;
