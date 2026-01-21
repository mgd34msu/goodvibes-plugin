/**
 * Analyze Tailwind Conflicts Handler
 *
 * Detects conflicting and redundant Tailwind CSS classes in React/Vue/Svelte
 * components. Identifies overrides, redundant shorthand/longhand combinations,
 * contradictory classes, and provides fix suggestions.
 *
 * @module handlers/frontend/analyze-tailwind-conflicts
 */

import * as fs from 'fs';
import * as path from 'path';
import ts from 'typescript';

// Re-export types from sub-modules
export type {
  ConflictType,
  Conflict,
  RedundantClass,
  SpecificityIssue,
  Suggestion,
  ElementInfo,
} from './tailwind-conflicts-analyzers.js';

// Import from sub-modules
import {
  type Conflict,
  type RedundantClass,
  type SpecificityIssue,
  type Suggestion,
  detectConflicts,
  detectSpecificityIssues,
  generateSuggestions,
} from './tailwind-conflicts-analyzers.js';
import { analyzeJsxFile } from './tailwind-conflicts-core.js';

// =============================================================================
// Types
// =============================================================================

/**
 * Arguments for the analyze_tailwind_conflicts tool
 */
export interface AnalyzeTailwindConflictsArgs {
  /** File path to analyze (relative to project root or absolute) */
  file: string;
  /** Check arbitrary values like [100px] (default true) */
  include_arbitrary?: boolean;
}

/**
 * Complete analysis result
 */
interface AnalyzeTailwindConflictsResult {
  /** File that was analyzed */
  file: string;
  /** Number of elements analyzed */
  elements_analyzed: number;
  /** Detected conflicts */
  conflicts: Conflict[];
  /** Redundant classes */
  redundant_classes: RedundantClass[];
  /** Specificity issues */
  specificity_issues: SpecificityIssue[];
  /** Improvement suggestions */
  suggestions: Suggestion[];
  /** Summary of findings */
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
// Handler
// =============================================================================

/**
 * Handles the analyze_tailwind_conflicts MCP tool call.
 *
 * Analyzes Tailwind CSS classes in a component file to detect:
 * - Override conflicts (same property set multiple times)
 * - Redundant classes (shorthand + longhand combinations)
 * - Contradiction conflicts (mutually exclusive classes)
 * - Specificity issues
 * - Optimization suggestions
 *
 * @param args - The analyze_tailwind_conflicts tool arguments
 * @returns MCP tool response with conflict analysis
 */
export async function handleAnalyzeTailwindConflicts(
  args: AnalyzeTailwindConflictsArgs
): Promise<ToolResponse> {
  const projectRoot = process.cwd();
  const includeArbitrary = args.include_arbitrary ?? true;

  try {
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

    // Check file extension
    const ext = path.extname(filePath).toLowerCase();
    if (!['.tsx', '.jsx', '.vue', '.svelte'].includes(ext)) {
      return createErrorResponse(
        `Unsupported file type: ${ext}. Supported: .tsx, .jsx, .vue, .svelte`,
        { file: args.file }
      );
    }

    // Read file content
    const content = fs.readFileSync(filePath, 'utf-8');

    // For Vue/Svelte, extract template section
    let processableContent = content;
    if (ext === '.vue') {
      const templateMatch = content.match(/<template[^>]*>([\s\S]*?)<\/template>/);
      if (templateMatch) {
        processableContent = `function Component() { return (<>${templateMatch[1]}</>) }`;
      }
    } else if (ext === '.svelte') {
      let templateContent = content;
      templateContent = templateContent
        .replace(/<script[^>]*>[\s\S]*?<\/script>/g, '')
        .replace(/<style[^>]*>[\s\S]*?<\/style>/g, '');
      processableContent = `function Component() { return (<>${templateContent}</>) }`;
    }

    // Create TypeScript source file for parsing
    const sourceFile = ts.createSourceFile(
      filePath,
      processableContent,
      ts.ScriptTarget.Latest,
      true,
      ext === '.tsx' ? ts.ScriptKind.TSX : ts.ScriptKind.JSX
    );

    // Analyze elements
    const elements = analyzeJsxFile(processableContent, sourceFile);

    if (elements.length === 0) {
      return createSuccessResponse({
        file: path.relative(projectRoot, filePath),
        elements_analyzed: 0,
        conflicts: [],
        redundant_classes: [],
        specificity_issues: [],
        suggestions: [],
        summary: 'No elements with className/class attributes found',
      } as AnalyzeTailwindConflictsResult);
    }

    // Analyze each element
    const allConflicts: Conflict[] = [];
    const allRedundant: RedundantClass[] = [];
    const allSpecificityIssues: SpecificityIssue[] = [];
    const allSuggestions: Suggestion[] = [];

    for (const elem of elements) {
      const { conflicts, redundant } = detectConflicts(
        elem.element,
        elem.line,
        elem.classes,
        includeArbitrary
      );

      allConflicts.push(...conflicts);
      allRedundant.push(...redundant);

      const specificityIssues = detectSpecificityIssues(elem.element, elem.classes);
      allSpecificityIssues.push(...specificityIssues);

      const suggestions = generateSuggestions(elem.element, elem.classes, elem.rawClassName);
      allSuggestions.push(...suggestions);
    }

    // Generate summary
    const summaryParts: string[] = [];
    summaryParts.push(`Analyzed ${elements.length} elements with Tailwind classes`);

    if (allConflicts.length === 0 && allRedundant.length === 0 && allSpecificityIssues.length === 0) {
      summaryParts.push('No conflicts detected');
    } else {
      if (allConflicts.length > 0) {
        const overrides = allConflicts.filter((c) => c.conflict_type === 'override').length;
        const contradictions = allConflicts.filter((c) => c.conflict_type === 'contradiction').length;
        summaryParts.push(
          `Found ${allConflicts.length} conflicts (${overrides} overrides, ${contradictions} contradictions)`
        );
      }
      if (allRedundant.length > 0) {
        summaryParts.push(`Found ${allRedundant.length} redundant classes`);
      }
      if (allSpecificityIssues.length > 0) {
        summaryParts.push(`Found ${allSpecificityIssues.length} specificity issues`);
      }
    }

    if (allSuggestions.length > 0) {
      summaryParts.push(`${allSuggestions.length} optimization suggestions available`);
    }

    const result: AnalyzeTailwindConflictsResult = {
      file: path.relative(projectRoot, filePath).replace(/\\/g, '/'),
      elements_analyzed: elements.length,
      conflicts: allConflicts,
      redundant_classes: allRedundant,
      specificity_issues: allSpecificityIssues,
      suggestions: allSuggestions,
      summary: summaryParts.join('. '),
    };

    return createSuccessResponse(result);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Unknown error during analysis';
    return createErrorResponse(message, { file: args.file });
  }
}
