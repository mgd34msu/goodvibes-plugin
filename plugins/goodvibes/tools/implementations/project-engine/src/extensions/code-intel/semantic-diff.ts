/**
 * Semantic Diff Extension
 *
 * L2 orchestration function that composes L1 git utilities, reference finding,
 * and LLM analysis to provide type-aware semantic diff with impact explanation.
 *
 * @module extensions/code-intel/semantic-diff
 */

import * as path from 'node:path';
import { execFileSync } from 'node:child_process';

import { PROJECT_ROOT } from '../../shared/config.js';
import { ok, fail, failFromException } from '../../shared/response.js';
import type { McpResponse } from '../../shared/types.js';
import { toRelativePath } from '../../shared/utils.js';
import { getChangedFilesDetailed } from '../../core/git/diff.js';
import { findReferencingFiles } from '../../core/code-intel/references.js';
import { analyzeSemanticChanges } from '../../core/ai/analyze.js';
import { GIT_REF_PATTERN } from '../../core/code-intel/constants.js';
import { withTempFile, makeTempPath } from '../../core/code-intel/type-extraction.js';
import type { SemanticDiffArgs } from '../../core/code-intel/types.js';

/**
 * Analyze code changes semantically using LLM.
 *
 * Orchestrates: validate refs → getChangedFilesDetailed → findReferencingFiles
 * → analyzeSemanticChanges → normalize paths → ok()
 *
 * @param args - The semantic_diff tool arguments
 * @returns MCP tool response with semantic diff analysis
 *
 * @example
 * ```typescript
 * await semanticDiff({ before_ref: 'HEAD~1' });
 * ```
 */
export async function semanticDiff(args: SemanticDiffArgs): Promise<McpResponse> {
  if (!args.before_ref) {
    return fail('Missing required argument: before_ref');
  }

  const beforeRef = args.before_ref;
  const afterRef = args.after_ref ?? 'HEAD';
  const fileFilter = args.file;

  // Validate git refs to prevent shell injection
  if (!GIT_REF_PATTERN.test(beforeRef)) {
    return fail(`Invalid git ref format: ${beforeRef}`);
  }
  if (!GIT_REF_PATTERN.test(afterRef)) {
    return fail(`Invalid git ref format: ${afterRef}`);
  }

  try {
    try {
      execFileSync('git', ['rev-parse', beforeRef], { cwd: PROJECT_ROOT, stdio: 'pipe' });
      execFileSync('git', ['rev-parse', afterRef], { cwd: PROJECT_ROOT, stdio: 'pipe' });
    } catch {
      return fail(`Invalid git refs: ${beforeRef} or ${afterRef}`);
    }

    const changedFiles = getChangedFilesDetailed(beforeRef, afterRef, fileFilter, PROJECT_ROOT);

    if (changedFiles.length === 0) {
      return ok({
        changes: [],
        overall_summary: 'No TypeScript/JavaScript files changed between refs',
      });
    }

    // Find references for each changed file using withTempFile for guaranteed cleanup
    const fileReferences = new Map<string, string[]>();
    for (const { file, afterContent } of changedFiles) {
      if (afterContent) {
        const { file: tempPath } = makeTempPath(PROJECT_ROOT, path.basename(file));
        try {
          const refs = await withTempFile(tempPath, afterContent, (tempFile) =>
            findReferencingFiles(tempFile, PROJECT_ROOT)
          );
          fileReferences.set(file, refs);
        } catch {
          // Ignore reference-finding errors for individual files
        }
      }
    }

    const timeout = args.timeout ?? 120;
    const model = args.model ?? 'haiku';
    const result = await analyzeSemanticChanges(
      changedFiles,
      fileReferences,
      timeout,
      model,
      PROJECT_ROOT
    );

    // Normalize absolute file paths
    result.changes = result.changes.map((change) => ({
      ...change,
      file: change.file.startsWith('/')
        ? toRelativePath(change.file, PROJECT_ROOT)
        : change.file,
      affected_callers: change.affected_callers.map((caller) =>
        caller.startsWith('/') ? toRelativePath(caller, PROJECT_ROOT) : caller
      ),
    }));

    return ok(result);
  } catch (error) {
    return failFromException(error, 'Failed to analyze semantic diff');
  }
}
