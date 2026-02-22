/**
 * Analyze Event Flow Handler
 *
 * Analyzes event handling and propagation in React components.
 * Detects event handlers, propagation patterns, delegation, and common issues
 * like nested clickable elements or missing keyboard alternatives.
 *
 * @module handlers/frontend/analyze-event-flow
 */

import * as fs from 'fs';
import * as path from 'path';
import ts from 'typescript';

// Re-export types from sub-modules
export type { EventHandler, ComponentNode } from './event-flow-utils.js';
export type {
  EventFlowStep,
  EventFlow,
  EventIssue,
  DelegationPattern,
} from './event-flow-analyzers.js';

// Import from sub-modules
import { normalizeFilePath } from './event-flow-utils.js';
import {
  type EventFlow,
  type EventIssue,
  type DelegationPattern,
  detectIssues,
  buildEventFlows,
  generateSummary,
} from './event-flow-analyzers.js';
import {
  extractEventHandlers,
  findReactComponent,
  detectDelegationPatterns,
} from './event-flow-core.js';

// =============================================================================
// Types
// =============================================================================

/**
 * Arguments for the analyze_event_flow tool
 */
export interface AnalyzeEventFlowArgs {
  /** Path to the component file to analyze */
  file: string;
  /** Filter to specific event type (e.g., "click", "change") */
  event?: string;
}

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

/**
 * Tool response format
 */
interface ToolResponse {
  content: Array<{ type: 'text'; text: string }>;
  isError?: boolean;
}

// =============================================================================
// Response Helpers
// =============================================================================

function createSuccessResponse<T>(data: T): ToolResponse {
  return {
    content: [{ type: 'text', text: JSON.stringify(data, null, 2) }],
  };
}

function createErrorResponse(message: string, context?: Record<string, unknown>): ToolResponse {
  return {
    content: [{ type: 'text', text: JSON.stringify({ error: message, ...context }, null, 2) }],
    isError: true,
  };
}

// =============================================================================
// Path Helpers
// =============================================================================

function makeRelativePath(absolutePath: string, projectRoot: string): string {
  return normalizeFilePath(path.relative(projectRoot, absolutePath));
}

// =============================================================================
// Handler
// =============================================================================

/**
 * Handles the analyze_event_flow MCP tool call.
 *
 * Analyzes event handling and propagation in React components:
 * - Detects all event handlers and their properties
 * - Simulates event bubbling to show flow paths
 * - Identifies issues like nested clickables and missing keyboard support
 * - Detects event delegation patterns
 *
 * @param args - The analyze_event_flow tool arguments
 * @returns MCP tool response with event flow analysis
 */
export async function handleAnalyzeEventFlow(args: AnalyzeEventFlowArgs): Promise<ToolResponse> {
  const projectRoot = process.cwd();

  // Validate file argument
  if (!args.file) {
    return createErrorResponse('file argument is required');
  }

  const filePath = path.isAbsolute(args.file) ? args.file : path.resolve(projectRoot, args.file);

  if (!fs.existsSync(filePath)) {
    return createErrorResponse(`File not found: ${args.file}`, { provided_path: args.file });
  }

  // Check file extension
  const ext = path.extname(filePath).toLowerCase();
  if (!['.tsx', '.jsx', '.ts', '.js'].includes(ext)) {
    return createErrorResponse(
      'File must be a component file (.tsx, .jsx, .ts, .js)',
      { provided_extension: ext }
    );
  }

  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    const sourceFile = ts.createSourceFile(
      filePath,
      content,
      ts.ScriptTarget.Latest,
      true,
      ext === '.tsx' || ext === '.jsx' ? ts.ScriptKind.TSX : ts.ScriptKind.TS
    );

    const relativePath = makeRelativePath(filePath, projectRoot);

    // Find the component
    const componentNode = findReactComponent(sourceFile);
    if (!componentNode) {
      return createSuccessResponse({
        message: 'No React component found in file',
        file: relativePath,
        handlers: [],
        event_flows: {},
        issues: [],
        delegation_patterns: [],
        summary: 'No component found to analyze.',
      });
    }

    // Extract event handlers
    const { handlers, tree } = extractEventHandlers(componentNode, sourceFile, args.event);

    if (handlers.length === 0) {
      const eventMsg = args.event ? ` for event type "${args.event}"` : '';
      return createSuccessResponse({
        file: relativePath,
        handlers: [],
        event_flows: {},
        issues: [],
        delegation_patterns: [],
        summary: `No event handlers found${eventMsg}.`,
      });
    }

    // Build event flows
    const eventFlows = buildEventFlows(handlers, tree, args.event);

    // Detect issues
    const issues = detectIssues(handlers, tree, sourceFile);

    // Detect delegation patterns
    const delegationPatterns = detectDelegationPatterns(handlers, sourceFile);

    // Generate summary
    const summary = generateSummary(handlers, issues, delegationPatterns);

    const result: AnalyzeEventFlowResult = {
      file: relativePath,
      handlers,
      event_flows: eventFlows,
      issues,
      delegation_patterns: delegationPatterns,
      summary,
    };

    return createSuccessResponse(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error during analysis';
    return createErrorResponse(message, { file: args.file });
  }
}
