/**
 * LLM Analysis Utilities
 *
 * Merged and deduplicated from breaking-changes.ts and semantic-diff.ts.
 * Provides a unified interface for spawning Claude CLI to analyze code changes.
 *
 * @module core/ai/analyze
 */

import { spawn } from 'node:child_process';

import { logWarn } from '../../shared/logger.js';
import type { ChangedFile, ChangedFileDetailed } from '../git/diff.js';
import type { FileTypeInfo } from '../code-intel/type-extraction.js';
import type { SymbolWithReferences } from '../code-intel/exports.js';
import { extractExportedSymbols } from '../code-intel/exports.js';

// =============================================================================
// Result types
// =============================================================================

/**
 * A detected breaking change between two API versions.
 */
export interface BreakingChangeResult {
  /** File path where the breaking change occurred */
  file: string;
  /** Name of the changed symbol */
  symbol: string;
  /** Type of breaking change */
  change_type: string;
  /** Previous signature or definition */
  before: string;
  /** New signature or definition */
  after: string;
  /** Description of the impact on consumers */
  impact: string;
  /** Suggested migration steps */
  migration: string;
}

/**
 * A non-breaking change detected during analysis.
 */
export interface NonBreakingChangeResult {
  /** File path */
  file: string;
  /** Name of the changed symbol */
  symbol: string;
  /** Type of change */
  change_type: string;
  /** Description of the change */
  description: string;
}

/**
 * Full result from breaking changes analysis.
 */
export interface BreakingChangesAnalysis {
  /** List of detected breaking changes */
  breaking_changes: BreakingChangeResult[];
  /** List of non-breaking changes detected */
  non_breaking_changes: NonBreakingChangeResult[];
  /** Overall severity */
  severity: 'none' | 'minor' | 'major';
}

/**
 * A semantic change with impact analysis.
 */
export interface SemanticChangeResult {
  /** File path */
  file: string;
  /** Human-readable summary of what changed semantically */
  summary: string;
  /** Detailed explanation of the semantic impact */
  semantic_impact: string;
  /** List of files/functions that call or depend on changed code */
  affected_callers: string[];
  /** Risk level of this change */
  risk_level: 'low' | 'medium' | 'high';
}

/**
 * Full result from semantic diff analysis.
 */
export interface SemanticDiffAnalysis {
  /** List of semantic changes with impact analysis */
  changes: SemanticChangeResult[];
  /** High-level summary of all changes and their combined impact */
  overall_summary: string;
}

// =============================================================================
// Shared LLM spawn helper
// =============================================================================

/**
 * Spawn the Claude CLI and return the stdout output.
 *
 * @param prompt - The prompt to send to Claude
 * @param model - The model to use
 * @param timeoutSeconds - Timeout in seconds
 * @param projectRoot - Working directory for the process
 * @returns Resolved stdout string, or null if process failed
 */
function spawnClaude(
  prompt: string,
  model: 'haiku' | 'sonnet' | 'opus',
  timeoutSeconds: number,
  projectRoot: string
): Promise<string | null> {
  return new Promise((resolve) => {
    const claudeProcess = spawn('claude', ['--print', '--model', model, '-p', '-'], {
      cwd: projectRoot,
      shell: true,
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    claudeProcess.stdin.write(prompt);
    claudeProcess.stdin.end();

    let stdout = '';
    let stderr = '';

    claudeProcess.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    claudeProcess.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    let timedOut = false;
    const timeoutHandle = setTimeout(() => {
      timedOut = true;
      claudeProcess.kill();
      logWarn(`LLM analysis timed out after ${timeoutSeconds} seconds`);
      resolve(null);
    }, timeoutSeconds * 1000);

    claudeProcess.on('close', (code) => {
      clearTimeout(timeoutHandle);
      if (timedOut) return;
      if (code !== 0) {
        logWarn(`Claude CLI exited with code ${code}`, stderr);
        resolve(null);
        return;
      }
      resolve(stdout);
    });

    claudeProcess.on('error', (error) => {
      clearTimeout(timeoutHandle);
      logWarn('Failed to spawn Claude CLI', error);
      resolve(null);
    });
  });
}

/**
 * Parse JSON from LLM response, handling extra text around the JSON.
 *
 * NOTE: The regex /\{[\s\S]*\}/ is greedy and matches the FIRST '{' to the LAST '}'.
 * This may fail if the LLM produces multiple separate JSON blocks or embeds JSON
 * inside markdown code fences with trailing content after the closing '}'.
 */
function parseJsonResponse<T>(stdout: string): T | null {
  try {
    const jsonMatch = stdout.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;
    return JSON.parse(jsonMatch[0]) as T;
  } catch {
    return null;
  }
}

// =============================================================================
// Breaking Changes Analysis
// =============================================================================

/**
 * Analyze code changes for breaking API changes using Claude CLI.
 * Renamed from analyzeWithLLM in breaking-changes.ts.
 *
 * @param changedFiles - Array of changed files with diffs
 * @param beforeTypes - Map of file path to type info before changes
 * @param afterTypes - Map of file path to type info after changes
 * @param timeoutSeconds - Timeout in seconds (default: 120)
 * @param model - Claude model to use (default: haiku)
 * @param projectRoot - Project root working directory
 * @returns Breaking changes analysis result
 */
export async function analyzeChangesWithLLM(
  changedFiles: ChangedFile[],
  beforeTypes: Map<string, FileTypeInfo>,
  afterTypes: Map<string, FileTypeInfo>,
  timeoutSeconds: number = 120,
  model: 'haiku' | 'sonnet' | 'opus' = 'haiku',
  projectRoot: string
): Promise<BreakingChangesAnalysis> {
  const fallback: BreakingChangesAnalysis = {
    breaking_changes: [],
    non_breaking_changes: changedFiles.map((f) => ({
      file: f.file,
      symbol: '*',
      change_type: f.status === 'A' ? 'added' : f.status === 'D' ? 'removed' : 'modified',
      description: `File ${
        f.status === 'A' ? 'added' : f.status === 'D' ? 'deleted' : 'modified'
      } (LLM analysis unavailable)`,
    })),
    severity: 'none',
  };

  const context: string[] = [];

  for (const { file, status, diff } of changedFiles) {
    const beforeInfo = beforeTypes.get(file);
    const afterInfo = afterTypes.get(file);

    context.push(
      `\n## File: ${file} (${
        status === 'D' ? 'DELETED' : status === 'A' ? 'ADDED' : 'MODIFIED'
      })\n`
    );

    if (beforeInfo && beforeInfo.symbols.length > 0) {
      context.push('### Before (exported symbols):');
      for (const sym of beforeInfo.symbols.filter((s) => s.exported)) {
        context.push(`- ${sym.name} (${sym.kind}): ${sym.signature}`);
      }
    }

    if (afterInfo && afterInfo.symbols.length > 0) {
      context.push('\n### After (exported symbols):');
      for (const sym of afterInfo.symbols.filter((s) => s.exported)) {
        context.push(`- ${sym.name} (${sym.kind}): ${sym.signature}`);
      }
    }

    if (diff) {
      context.push('\n### Diff:');
      context.push('```diff');
      const diffLines = diff.split('\n').slice(0, 100);
      context.push(diffLines.join('\n'));
      if (diff.split('\n').length > 100) {
        context.push('... (diff truncated)');
      }
      context.push('```');
    }
  }

  const prompt = `You are analyzing TypeScript/JavaScript code changes to detect breaking API changes.

A breaking change is any change that could cause existing consumers of the API to fail, including:
- Removing exported functions, classes, interfaces, types, or constants
- Changing function signatures (parameter types, return types, required parameters)
- Changing interface/type property types or making optional properties required
- Renaming exported symbols without providing aliases
- Changing class method visibility or signatures

A non-breaking change is additive or internal:
- Adding new optional parameters with defaults
- Adding new exported symbols
- Adding new optional properties to interfaces
- Internal implementation changes that don't affect the public API
- Changes to non-exported (private) symbols

Here are the changes to analyze:
${context.join('\n')}

Analyze these changes and respond with ONLY a valid JSON object (no markdown, no explanation) in this exact format:
{
  "breaking_changes": [
    {
      "file": "path/to/file.ts",
      "symbol": "symbolName",
      "change_type": "removed|signature_change|type_incompatible|visibility_change",
      "before": "previous signature or definition",
      "after": "new signature or definition (empty if removed)",
      "impact": "description of impact on consumers",
      "migration": "suggested migration steps"
    }
  ],
  "non_breaking_changes": [
    {
      "file": "path/to/file.ts",
      "symbol": "symbolName",
      "change_type": "added|enhanced|internal",
      "description": "description of the change"
    }
  ],
  "severity": "none|minor|major"
}

Rules for severity:
- "none": No breaking changes
- "minor": Only parameter additions with defaults, or type narrowing
- "major": Any other breaking changes

If there are no relevant API changes, return empty arrays and severity "none".`;

  const stdout = await spawnClaude(prompt, model, timeoutSeconds, projectRoot);
  if (!stdout) return fallback;

  const result = parseJsonResponse<BreakingChangesAnalysis>(stdout);
  if (!result) {
    logWarn('Failed to parse LLM response for breaking changes analysis');
    return fallback;
  }

  return result;
}

// =============================================================================
// Semantic Diff Analysis
// =============================================================================

/**
 * Analyze code changes semantically using Claude CLI.
 * Merged from analyzeWithLLM in semantic-diff.ts.
 *
 * @param changedFiles - Array of changed files with before/after content
 * @param fileReferences - Map of file path to referencing files
 * @param timeoutSeconds - Timeout in seconds (default: 120)
 * @param model - Claude model to use (default: haiku)
 * @param projectRoot - Project root working directory
 * @returns Semantic diff analysis result
 */
export async function analyzeSemanticChanges(
  changedFiles: ChangedFileDetailed[],
  fileReferences: Map<string, string[]>,
  timeoutSeconds: number = 120,
  model: 'haiku' | 'sonnet' | 'opus' = 'haiku',
  projectRoot: string
): Promise<SemanticDiffAnalysis> {
  const fallback: SemanticDiffAnalysis = {
    changes: changedFiles.map((f) => ({
      file: f.file,
      summary: `File ${
        f.status === 'A' ? 'added' : f.status === 'D' ? 'deleted' : 'modified'
      }`,
      semantic_impact: 'LLM analysis unavailable. Please review the diff manually.',
      affected_callers: fileReferences.get(f.file) ?? [],
      risk_level: 'medium' as const,
    })),
    overall_summary: `${changedFiles.length} file(s) changed. LLM analysis unavailable.`,
  };

  const context: string[] = [];

  for (const { file, status, diff, beforeContent, afterContent } of changedFiles) {
    context.push(
      `\n## File: ${file} (${
        status === 'D' ? 'DELETED' : status === 'A' ? 'ADDED' : 'MODIFIED'
      })\n`
    );

    if (beforeContent) {
      const beforeSymbols: SymbolWithReferences[] = extractExportedSymbols(beforeContent, file);
      if (beforeSymbols.length > 0) {
        context.push('### Before (exported symbols):');
        for (const sym of beforeSymbols.slice(0, 20)) {
          context.push(`- ${sym.name} (${sym.kind}): ${sym.signature}`);
        }
        if (beforeSymbols.length > 20) {
          context.push(`... and ${beforeSymbols.length - 20} more symbols`);
        }
      }
    }

    if (afterContent) {
      const afterSymbols: SymbolWithReferences[] = extractExportedSymbols(afterContent, file);
      if (afterSymbols.length > 0) {
        context.push('\n### After (exported symbols):');
        for (const sym of afterSymbols.slice(0, 20)) {
          context.push(`- ${sym.name} (${sym.kind}): ${sym.signature}`);
        }
        if (afterSymbols.length > 20) {
          context.push(`... and ${afterSymbols.length - 20} more symbols`);
        }
      }
    }

    const refs = fileReferences.get(file);
    if (refs && refs.length > 0) {
      context.push('\n### Files that reference this file:');
      for (const ref of refs.slice(0, 10)) {
        context.push(`- ${ref}`);
      }
      if (refs.length > 10) {
        context.push(`... and ${refs.length - 10} more files`);
      }
    }

    if (diff) {
      context.push('\n### Diff:');
      context.push('```diff');
      const diffLines = diff.split('\n').slice(0, 80);
      context.push(diffLines.join('\n'));
      /* v8 ignore next 3 -- only triggered for very large diffs in real usage */
      if (diff.split('\n').length > 80) {
        context.push('... (diff truncated)');
      }
      context.push('```');
    }
  }

  const prompt = `You are analyzing TypeScript/JavaScript code changes to provide semantic understanding.

Your job is to go beyond line-by-line diff and explain:
1. What SEMANTICALLY changed (the meaning/behavior, not just syntax)
2. How these changes affect type safety and API contracts
3. Which callers/consumers might be affected
4. The risk level of each change

Here are the changes to analyze:
${context.join('\n')}

Analyze these changes and respond with ONLY a valid JSON object (no markdown, no explanation) in this exact format:
{
  "changes": [
    {
      "file": "path/to/file.ts",
      "summary": "Brief human-readable summary of what changed semantically",
      "semantic_impact": "Detailed explanation of the semantic impact, type safety implications, and behavioral changes",
      "affected_callers": ["path/to/caller1.ts", "path/to/caller2.ts"],
      "risk_level": "low|medium|high"
    }
  ],
  "overall_summary": "High-level summary of all changes and their combined impact"
}

Risk level guidelines:
- "low": Internal refactoring, documentation, adding new optional functionality
- "medium": Changes to shared utilities, output format changes, behavioral changes that might affect some callers
- "high": Breaking API changes, security-related changes, changes that affect many callers

Focus on what matters to developers consuming this code. Be specific about behavioral changes, not just structural ones.`;

  const stdout = await spawnClaude(prompt, model, timeoutSeconds, projectRoot);
  if (!stdout) return fallback;

  const result = parseJsonResponse<SemanticDiffAnalysis>(stdout);
  if (!result) {
    logWarn('Failed to parse LLM response for semantic diff analysis');
    return {
      changes: [],
      overall_summary: 'Failed to analyze changes. Please review manually.',
    };
  }

  return result;
}
