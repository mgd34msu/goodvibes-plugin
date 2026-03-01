/**
 * Detect Breaking Changes Extension
 *
 * L2 orchestration function that composes L1 git and type-extraction
 * utilities with LLM analysis to detect breaking API changes between git refs.
 *
 * @module extensions/code-intel/breaking-changes
 */

import { execFileSync } from 'node:child_process';

import { PROJECT_ROOT } from '../../shared/config.js';
import { ok, fail, failFromException } from '../../shared/response.js';
import type { McpResponse } from '../../shared/types.js';
import { toRelativePath } from '../../shared/utils.js';
import { getChangedFiles, getFileAtRef } from '../../core/git/diff.js';
import { extractTypeInfoFromContent } from '../../core/code-intel/type-extraction.js';
import { analyzeChangesWithLLM } from '../../core/ai/analyze.js';
import { GIT_REF_PATTERN } from '../../core/code-intel/constants.js';
import type { DetectBreakingChangesArgs } from '../../core/code-intel/types.js';

/**
 * Detect breaking API changes between two git refs using LLM analysis.
 *
 * Orchestrates: validate refs → getChangedFiles → extractTypeInfoFromContent
 * → analyzeChangesWithLLM → normalize paths → ok()
 *
 * @param args - The detect_breaking_changes tool arguments
 * @returns MCP tool response with breaking changes analysis
 *
 * @example
 * ```typescript
 * // Check for breaking changes since last commit
 * await detectBreakingChanges({ before_ref: 'HEAD~1' });
 * ```
 */
export async function detectBreakingChanges(args: DetectBreakingChangesArgs): Promise<McpResponse> {
  if (!args.before_ref) {
    return fail('Missing required argument: before_ref');
  }

  const beforeRef = args.before_ref;
  const afterRef = args.after_ref ?? 'HEAD';
  const pathFilter = args.path;

  // Validate git refs to prevent shell injection
  if (!GIT_REF_PATTERN.test(beforeRef)) {
    return fail(`Invalid git ref format: ${beforeRef}`);
  }
  if (!GIT_REF_PATTERN.test(afterRef)) {
    return fail(`Invalid git ref format: ${afterRef}`);
  }

  try {
    // Verify git is available and refs exist
    try {
      execFileSync('git', ['rev-parse', beforeRef], { cwd: PROJECT_ROOT, stdio: 'pipe' });
      execFileSync('git', ['rev-parse', afterRef], { cwd: PROJECT_ROOT, stdio: 'pipe' });
    } catch {
      return fail(`Invalid git refs: ${beforeRef} or ${afterRef}`);
    }

    const changedFiles = getChangedFiles(beforeRef, afterRef, pathFilter, PROJECT_ROOT);

    if (changedFiles.length === 0) {
      return ok({
        breaking_changes: [],
        non_breaking_changes: [],
        severity: 'none',
        message: 'No TypeScript/JavaScript files changed between refs',
      });
    }

    // Extract type information for before and after states
    const beforeTypes = new Map<string, Awaited<ReturnType<typeof extractTypeInfoFromContent>>>();
    const afterTypes = new Map<string, Awaited<ReturnType<typeof extractTypeInfoFromContent>>>();

    for (const { file, status } of changedFiles) {
      if (status !== 'A') {
        const beforeContent = getFileAtRef(file, beforeRef, PROJECT_ROOT);
        if (beforeContent) {
          const typeInfo = await extractTypeInfoFromContent(file, beforeContent, PROJECT_ROOT);
          beforeTypes.set(file, typeInfo);
        }
      }

      if (status !== 'D') {
        const afterContent = getFileAtRef(file, afterRef, PROJECT_ROOT);
        if (afterContent) {
          const typeInfo = await extractTypeInfoFromContent(file, afterContent, PROJECT_ROOT);
          afterTypes.set(file, typeInfo);
        }
      }
    }

    const timeout = args.timeout ?? 120;
    const model = args.model ?? 'haiku';
    const result = await analyzeChangesWithLLM(
      changedFiles,
      beforeTypes,
      afterTypes,
      timeout,
      model,
      PROJECT_ROOT
    );

    // Normalize absolute file paths to relative
    result.breaking_changes = result.breaking_changes.map((change) => ({
      ...change,
      file: change.file.startsWith('/')
        ? toRelativePath(change.file, PROJECT_ROOT)
        : change.file,
    }));

    result.non_breaking_changes = result.non_breaking_changes.map((change) => ({
      ...change,
      file: change.file.startsWith('/')
        ? toRelativePath(change.file, PROJECT_ROOT)
        : change.file,
    }));

    return ok(result);
  } catch (error) {
    return failFromException(error, 'Failed to detect breaking changes');
  }
}
