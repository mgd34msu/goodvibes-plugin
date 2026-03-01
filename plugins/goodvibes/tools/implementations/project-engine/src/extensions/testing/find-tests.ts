/**
 * Find Tests for File — L2 Extension
 *
 * Composes L1 core/testing utilities to implement the find_tests_for_file
 * workflow. Validates inputs, discovers test files, scores them, and
 * returns an McpResponse.
 *
 * @module extensions/testing/find-tests
 */

import * as node_fs from 'node:fs/promises';

import { PROJECT_ROOT } from '../../shared/config.js';
import { ok, fail, missingArg } from '../../shared/response.js';
import type { McpResponse } from '../../shared/types.js';
import {
  normalizeFilePath,
  resolveFilePath,
} from '../../core/code-intel/file-utils.js';
import {
  findTestFiles,
  scoreTestFiles,
} from '../../core/testing/test-finder.js';
import type { FindTestsArgs, FindTestsResult } from '../../core/testing/types.js';

/**
 * Find test files that cover a given source file.
 *
 * Workflow:
 * 1. Validate and resolve the source file path
 * 2. Discover all test files in the project
 * 3. Score each candidate by pattern confidence and import graph analysis
 * 4. Return ranked results with confidence scores
 *
 * @param args - FindTestsArgs with required `file` and optional `include_indirect`
 * @returns McpResponse with JSON-encoded FindTestsResult or error details
 */
export async function findTestsForFile(args: FindTestsArgs): Promise<McpResponse> {
  try {
    if (!args.file) {
      return missingArg('file');
    }

    const sourceFilePath = resolveFilePath(args.file, PROJECT_ROOT);
    const normalizedSourcePath = normalizeFilePath(sourceFilePath);

    try {
      await node_fs.access(sourceFilePath);
    } catch {
      return fail(`Source file not found: ${args.file}`);
    }

    const includeIndirect = args.include_indirect ?? false;

    const testFilePaths = await findTestFiles(PROJECT_ROOT);

    const tests = await scoreTestFiles(
      normalizedSourcePath,
      testFilePaths,
      includeIndirect,
      PROJECT_ROOT
    );

    const result: FindTestsResult = {
      tests,
      count: tests.length,
    };

    return ok(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return fail(`Failed to find tests: ${message}`);
  }
}
