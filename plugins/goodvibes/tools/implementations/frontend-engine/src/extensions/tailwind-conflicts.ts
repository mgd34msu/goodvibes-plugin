/**
 * Tailwind Conflicts Extension
 *
 * L2 orchestrator that composes L1 core primitives to detect conflicting and
 * redundant Tailwind CSS classes in React components. Identifies overrides,
 * redundant shorthand/longhand combinations, contradictory classes, and
 * provides fix suggestions.
 *
 * @module extensions/tailwind-conflicts
 */

import * as fs from 'fs';
import * as path from 'path';
import ts from 'typescript';

import { getProjectRoot } from '../shared/config.js';
import { ok, fail, failFromException, missingArg } from '../shared/response.js';
import type { McpResponse } from '../shared/response.js';
import type {
  Conflict,
  RedundantClass,
  SpecificityIssue,
  Suggestion,
  AnalyzeTailwindConflictsArgs,
} from '../core/tailwind-conflicts/types.js';
import { analyzeJsxFile } from '../core/tailwind-conflicts/scanner.js';
import {
  detectConflicts,
  detectSpecificityIssues,
  generateSuggestions,
  generateSummary,
} from '../core/tailwind-conflicts/analyzer.js';

// =============================================================================
// Result Type
// =============================================================================

/**
 * Complete Tailwind conflict analysis result
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

// =============================================================================
// Handler
// =============================================================================

/**
 * Analyze Tailwind CSS classes in a component file for conflicts and redundancies.
 *
 * Orchestrates: validate args → resolve path → parse TypeScript → analyzeJsxFile
 * → per-element detectConflicts + detectSpecificityIssues + generateSuggestions
 * → buildSummary → ok(result)
 *
 * @param args - The analyze_tailwind_conflicts tool arguments (unknown at call site)
 * @returns McpResponse with JSON-formatted conflict analysis
 *
 * @example
 * ```typescript
 * const result = await analyzeTailwindConflicts({ file: 'src/components/Card.tsx' });
 * // Returns conflicts, redundant_classes, specificity_issues, suggestions, summary
 * ```
 */
export async function analyzeTailwindConflicts(args: unknown): Promise<McpResponse> {
  const typedArgs = args as AnalyzeTailwindConflictsArgs;

  if (!typedArgs.file) {
    return missingArg('file');
  }

  const projectRoot = getProjectRoot();
  const includeArbitrary = typedArgs.include_arbitrary ?? true;

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

    // Check file extension
    const ext = path.extname(filePath).toLowerCase();
    if (!['.tsx', '.jsx', '.ts', '.js'].includes(ext)) {
      return fail(
        `Unsupported file type: ${ext}. Supported: .tsx, .jsx, .ts, .js`,
        { file: typedArgs.file }
      );
    }

    // Read file content
    const content = fs.readFileSync(filePath, 'utf-8');

    // Create TypeScript source file for parsing
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

    // Analyze elements using core scanner
    const elements = analyzeJsxFile(content, sourceFile);

    const relativePath = path.relative(projectRoot, filePath).replace(/\\/g, '/');

    if (elements.length === 0) {
      return ok({
        file: relativePath,
        elements_analyzed: 0,
        conflicts: [],
        redundant_classes: [],
        specificity_issues: [],
        suggestions: [],
        summary: 'No elements with className/class attributes found',
      } as AnalyzeTailwindConflictsResult);
    }

    // Compose core analysis functions per element
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

    // Build summary using core function
    const summary = generateSummary(
      elements.length,
      allConflicts,
      allRedundant,
      allSpecificityIssues,
      allSuggestions
    );

    const result: AnalyzeTailwindConflictsResult = {
      file: relativePath,
      elements_analyzed: elements.length,
      conflicts: allConflicts,
      redundant_classes: allRedundant,
      specificity_issues: allSpecificityIssues,
      suggestions: allSuggestions,
      summary,
    };

    return ok(result);
  } catch (error) {
    return failFromException(error, `Failed to analyze Tailwind conflicts: ${typedArgs.file}`);
  }
}

// =============================================================================
// Deprecated Alias
// =============================================================================

/** @deprecated Use analyzeTailwindConflicts */
export const handleAnalyzeTailwindConflicts = analyzeTailwindConflicts;
