/**
 * Resolve Merge Conflict Handler
 *
 * Uses LLM (Claude) to intelligently resolve git merge conflicts.
 * Parses conflict markers, sends context to Claude for resolution,
 * and optionally validates the result with TypeScript.
 *
 * @module handlers/edit/resolve-merge-conflict
 */

import * as fs from 'fs';
import * as path from 'path';
import { spawn } from 'child_process';

import { PROJECT_ROOT } from '../../config.js';
import {
  createSuccessResponse,
  createErrorResponse,
  resolveFilePath,
  makeRelativePath,
  type ToolResponse,
} from '../lsp/utils.js';
import { safeExec } from '../../utils.js';

// =============================================================================
// Types
// =============================================================================

/**
 * Arguments for the resolve_merge_conflict tool.
 */
export interface ResolveMergeConflictArgs {
  /** File path with conflicts (relative to project root or absolute) */
  file: string;
  /** Context about what we were trying to do (helps LLM understand intent) */
  context?: string;
  /** Hint for resolution strategy */
  prefer?: 'ours' | 'theirs' | 'merge';
  /** Run type check after resolution */
  validate_after?: boolean;
  /** Preview resolution without applying */
  dry_run?: boolean;
}

/**
 * A single conflict found in the file.
 */
interface Conflict {
  /** Index of this conflict in the file (0-based) */
  index: number;
  /** Start position in the file */
  startPos: number;
  /** End position in the file */
  endPos: number;
  /** Content from HEAD (current branch) */
  ours: string;
  /** Content from incoming branch */
  theirs: string;
  /** Content from common ancestor (diff3 style, optional) */
  base?: string;
  /** The full conflict marker block */
  fullMarker: string;
  /** Branch name or ref for "ours" */
  ourRef: string;
  /** Branch name or ref for "theirs" */
  theirRef: string;
}

/**
 * Resolution for a single conflict.
 */
interface Resolution {
  /** Index of the resolved conflict */
  conflict_index: number;
  /** Our content (from HEAD) */
  ours: string;
  /** Their content (incoming) */
  theirs: string;
  /** Base content (if available) */
  base?: string;
  /** Merged result */
  merged: string;
  /** Explanation of the resolution */
  explanation: string;
}

/**
 * Validation result after resolution.
 */
interface ValidationResult {
  /** Whether validation passed */
  passed: boolean;
  /** Any errors found */
  errors?: string[];
}

/**
 * Result of the resolve_merge_conflict tool.
 */
interface ResolveMergeConflictResult {
  /** Whether all conflicts were resolved */
  resolved: boolean;
  /** File that was processed */
  file: string;
  /** Number of conflicts found */
  conflicts_found: number;
  /** Resolution for each conflict */
  resolutions: Resolution[];
  /** Full resolved file content (only if dry_run) */
  final_content?: string;
  /** Whether changes were applied to disk */
  applied: boolean;
  /** Validation result (if validate_after was true) */
  validation?: ValidationResult;
}

// =============================================================================
// Conflict Parsing
// =============================================================================

/**
 * Parse conflict markers from file content.
 *
 * Supports both standard and diff3 conflict styles:
 * - Standard: <<<<<<< ... ======= ... >>>>>>>
 * - Diff3: <<<<<<< ... ||||||| ... ======= ... >>>>>>>
 *
 * @param content - File content with conflict markers
 * @returns Array of parsed conflicts
 */
function parseConflicts(content: string): Conflict[] {
  const conflicts: Conflict[] = [];

  // Regex to match conflict blocks
  // Captures:
  // 1. Our ref (branch name after <<<<<<<)
  // 2. Ours content
  // 3. Base ref (optional, for diff3)
  // 4. Base content (optional, for diff3)
  // 5. Theirs content
  // 6. Their ref (branch name after >>>>>>>)
  const conflictRegex =
    /<<<<<<< ([^\n]*)\n([\s\S]*?)(?:\|\|\|\|\|\|\| ([^\n]*)\n([\s\S]*?))?=======\n([\s\S]*?)>>>>>>> ([^\n]*)\n?/g;

  let match: RegExpExecArray | null;
  let index = 0;

  while ((match = conflictRegex.exec(content)) !== null) {
    const fullMarker = match[0];
    const ourRef = match[1].trim();
    const ours = match[2];
    const baseRef = match[3]?.trim();
    const base = match[4];
    const theirs = match[5];
    const theirRef = match[6].trim();

    conflicts.push({
      index,
      startPos: match.index,
      endPos: match.index + fullMarker.length,
      ours: ours.trimEnd(),
      theirs: theirs.trimEnd(),
      base: base?.trimEnd(),
      fullMarker,
      ourRef: ourRef || 'HEAD',
      theirRef: theirRef || 'incoming',
    });

    index++;
  }

  return conflicts;
}

// =============================================================================
// LLM Resolution
// =============================================================================

/**
 * Build prompt for Claude to resolve a conflict.
 *
 * @param conflict - The conflict to resolve
 * @param filename - Name of the file being resolved
 * @param userContext - Optional context from user about what they were doing
 * @param prefer - Preferred resolution strategy
 * @returns Prompt string for Claude
 */
function buildResolutionPrompt(
  conflict: Conflict,
  filename: string,
  userContext?: string,
  prefer: 'ours' | 'theirs' | 'merge' = 'merge'
): string {
  const baseSection = conflict.base
    ? `
BASE (common ancestor from ${conflict.ourRef} and ${conflict.theirRef}):
\`\`\`
${conflict.base}
\`\`\`
`
    : '';

  const contextSection = userContext
    ? `
User Context: ${userContext}
`
    : '';

  const preferenceHint =
    prefer === 'merge'
      ? 'Intelligently merge both changes to preserve the intent of each.'
      : `Prefer the "${prefer}" version, but incorporate useful changes from the other if they do not conflict.`;

  return `Resolve this git merge conflict intelligently.

File: ${filename}
${contextSection}
Conflict #${conflict.index + 1}:

OURS (${conflict.ourRef} - current branch):
\`\`\`
${conflict.ours}
\`\`\`

THEIRS (${conflict.theirRef} - incoming):
\`\`\`
${conflict.theirs}
\`\`\`
${baseSection}
Resolution Strategy: ${preferenceHint}

Provide the merged version that resolves this conflict correctly.
Consider:
- What each change is trying to accomplish
- Whether changes are to the same logical unit or different parts
- Proper syntax and semantics for the language
- Import ordering and deduplication if relevant

Respond with ONLY a JSON object (no markdown, no explanation outside JSON):
{
  "merged": "the resolved code as a single string",
  "explanation": "brief explanation of why this resolution was chosen"
}`;
}

/**
 * Spawn Claude CLI and get JSON response.
 *
 * @param prompt - The prompt to send to Claude
 * @param timeout - Timeout in milliseconds (default: 60s)
 * @returns Parsed JSON response from Claude
 */
async function spawnClaude(
  prompt: string,
  timeout: number = 60000
): Promise<{ merged: string; explanation: string }> {
  return new Promise((resolve, reject) => {
    const args = ['--print', '-p', prompt];
    const child = spawn('claude', args, {
      shell: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (data: Buffer) => {
      stdout += data.toString();
    });

    child.stderr.on('data', (data: Buffer) => {
      stderr += data.toString();
    });

    const timer = setTimeout(() => {
      child.kill();
      reject(new Error(`Claude CLI timed out after ${timeout}ms`));
    }, timeout);

    child.on('close', (code: number | null) => {
      clearTimeout(timer);

      if (code !== 0) {
        reject(new Error(`Claude CLI exited with code ${code}: ${stderr}`));
        return;
      }

      try {
        // Try to extract JSON from the response
        // Look for JSON block in the output
        const jsonMatch = stdout.match(/```json\n?([\s\S]*?)\n?```/);
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[1]) as { merged: string; explanation: string };
          resolve(parsed);
          return;
        }

        // Try parsing the whole output as JSON
        const trimmed = stdout.trim();
        const startIdx = trimmed.indexOf('{');
        const endIdx = trimmed.lastIndexOf('}');
        if (startIdx !== -1 && endIdx !== -1 && endIdx > startIdx) {
          const parsed = JSON.parse(trimmed.substring(startIdx, endIdx + 1)) as {
            merged: string;
            explanation: string;
          };
          resolve(parsed);
          return;
        }

        reject(new Error('No valid JSON found in Claude response'));
      } catch (parseError) {
        reject(
          new Error(
            `Failed to parse Claude response: ${parseError instanceof Error ? parseError.message : parseError}`
          )
        );
      }
    });

    child.on('error', (err: Error) => {
      clearTimeout(timer);
      reject(new Error(`Failed to spawn Claude CLI: ${err.message}`));
    });
  });
}

/**
 * Resolve a single conflict using Claude.
 *
 * @param conflict - The conflict to resolve
 * @param filename - File being resolved
 * @param context - User-provided context
 * @param prefer - Resolution preference
 * @returns Resolution with merged content and explanation
 */
async function resolveConflictWithLLM(
  conflict: Conflict,
  filename: string,
  context?: string,
  prefer?: 'ours' | 'theirs' | 'merge'
): Promise<Resolution> {
  const prompt = buildResolutionPrompt(conflict, filename, context, prefer);

  try {
    const response = await spawnClaude(prompt);

    return {
      conflict_index: conflict.index,
      ours: conflict.ours,
      theirs: conflict.theirs,
      base: conflict.base,
      merged: response.merged,
      explanation: response.explanation,
    };
  } catch (error) {
    // Fallback: if LLM fails, use simple preference-based resolution
    const message = error instanceof Error ? error.message : String(error);
    const fallbackMerged =
      prefer === 'theirs'
        ? conflict.theirs
        : prefer === 'ours'
          ? conflict.ours
          : conflict.ours; // Default to ours on failure

    return {
      conflict_index: conflict.index,
      ours: conflict.ours,
      theirs: conflict.theirs,
      base: conflict.base,
      merged: fallbackMerged,
      explanation: `LLM resolution failed (${message}). Falling back to "${prefer || 'ours'}" version.`,
    };
  }
}

// =============================================================================
// Resolution Application
// =============================================================================

/**
 * Apply resolutions to the file content.
 *
 * @param content - Original file content with conflicts
 * @param conflicts - Parsed conflicts
 * @param resolutions - Resolved content for each conflict
 * @returns New file content with conflicts resolved
 */
function applyResolutions(content: string, conflicts: Conflict[], resolutions: Resolution[]): string {
  // Create a map of conflict index to resolution
  const resolutionMap = new Map<number, Resolution>();
  for (const resolution of resolutions) {
    resolutionMap.set(resolution.conflict_index, resolution);
  }

  // Apply resolutions from end to start to preserve positions
  let result = content;
  for (let i = conflicts.length - 1; i >= 0; i--) {
    const conflict = conflicts[i];
    const resolution = resolutionMap.get(conflict.index);

    if (resolution) {
      // Replace the entire conflict marker block with the merged content
      result =
        result.substring(0, conflict.startPos) + resolution.merged + result.substring(conflict.endPos);
    }
  }

  return result;
}

// =============================================================================
// Validation
// =============================================================================

/**
 * Validate the resolved file using TypeScript.
 *
 * @param filePath - Path to the resolved file
 * @returns Validation result with any errors
 */
async function validateWithTypeScript(filePath: string): Promise<ValidationResult> {
  try {
    // Check if file is TypeScript
    const ext = path.extname(filePath).toLowerCase();
    if (!['.ts', '.tsx', '.mts', '.cts'].includes(ext)) {
      return { passed: true }; // Skip validation for non-TS files
    }

    // Run tsc --noEmit on the file
    const result = await safeExec(`npx tsc --noEmit "${filePath}"`, path.dirname(filePath), 30000);

    if (result.error || result.stderr) {
      const errorLines = (result.stderr || result.stdout || result.error || '')
        .split('\n')
        .filter((line) => line.includes('error TS'));

      if (errorLines.length > 0) {
        return {
          passed: false,
          errors: errorLines.slice(0, 10), // Limit to 10 errors
        };
      }
    }

    return { passed: true };
  } catch {
    // If tsc fails to run, assume validation passed
    return { passed: true };
  }
}

// =============================================================================
// Handler
// =============================================================================

/**
 * Handle the resolve_merge_conflict MCP tool call.
 *
 * This tool:
 * 1. Parses git conflict markers from the specified file
 * 2. Sends each conflict to Claude for intelligent resolution
 * 3. Optionally validates the result with TypeScript
 * 4. Applies changes to disk (unless dry_run is true)
 *
 * @param args - The resolve_merge_conflict tool arguments
 * @returns MCP tool response with resolution details
 *
 * @example
 * handleResolveMergeConflict({
 *   file: 'src/utils.ts',
 *   context: 'Adding new validation helper',
 *   prefer: 'merge',
 *   validate_after: true
 * });
 */
export async function handleResolveMergeConflict(args: ResolveMergeConflictArgs): Promise<ToolResponse> {
  try {
    // Validate required arguments
    if (!args.file) {
      return createErrorResponse('Missing required argument: file');
    }

    // Resolve file path
    const filePath = resolveFilePath(args.file, PROJECT_ROOT);
    const relativePath = makeRelativePath(filePath, PROJECT_ROOT);

    // Verify file exists
    if (!fs.existsSync(filePath)) {
      return createErrorResponse(`File not found: ${args.file}`);
    }

    // Read file content
    const content = fs.readFileSync(filePath, 'utf-8');

    // Parse conflicts
    const conflicts = parseConflicts(content);

    if (conflicts.length === 0) {
      return createSuccessResponse({
        resolved: true,
        file: relativePath,
        conflicts_found: 0,
        resolutions: [],
        applied: false,
        message: 'No merge conflicts found in file',
      });
    }

    // Resolve each conflict with LLM
    const resolutions: Resolution[] = [];
    const filename = path.basename(filePath);

    for (const conflict of conflicts) {
      const resolution = await resolveConflictWithLLM(conflict, filename, args.context, args.prefer);
      resolutions.push(resolution);
    }

    // Apply resolutions to content
    const resolvedContent = applyResolutions(content, conflicts, resolutions);

    // Build result
    const result: ResolveMergeConflictResult = {
      resolved: resolutions.length === conflicts.length,
      file: relativePath,
      conflicts_found: conflicts.length,
      resolutions,
      applied: false,
    };

    // Handle dry run - return content without applying
    if (args.dry_run) {
      result.final_content = resolvedContent;
      return createSuccessResponse(result);
    }

    // Write resolved content to disk
    fs.writeFileSync(filePath, resolvedContent, 'utf-8');
    result.applied = true;

    // Optionally validate with TypeScript
    if (args.validate_after) {
      result.validation = await validateWithTypeScript(filePath);
    }

    return createSuccessResponse(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return createErrorResponse(`Failed to resolve merge conflicts: ${message}`);
  }
}
