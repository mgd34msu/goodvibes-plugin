/**
 * Test Coverage — L2 Extension
 *
 * Composes L1 core/testing utilities with I/O orchestration for the
 * get_test_coverage workflow. Returns an McpResponse.
 *
 * @module extensions/testing/coverage
 */

import * as node_fs from 'node:fs';

import { PROJECT_ROOT } from '../../shared/config.js';
import { ok, fail } from '../../shared/response.js';
import type { McpResponse } from '../../shared/types.js';
import {
  normalizeFilePath,
  makeRelativePath,
  resolveFilePath,
} from '../../core/code-intel/file-utils.js';
import {
  findCoverageReport,
  parseLcov,
  parseIstanbul,
  calculateCoverageMetrics,
  extractUncoveredLines,
  extractUncoveredFunctions,
} from '../../core/testing/coverage-parser.js';
import { COVERAGE_PATHS } from '../../core/testing/constants.js';
import type { TestCoverageArgs, CoverageResult } from '../../core/testing/types.js';

/**
 * Get test coverage data for the project or a specific source file.
 *
 * Workflow:
 * 1. Locate the coverage report (LCOV or Istanbul JSON)
 * 2. Parse the report into an internal coverage map
 * 3. If a specific file is requested, resolve and filter to that file
 * 4. Calculate metrics and extract uncovered lines/functions
 * 5. Return the result as McpResponse
 *
 * @param args - TestCoverageArgs with optional file, coverage_path, and path
 * @returns McpResponse with JSON-encoded CoverageResult or error details
 */
export async function getTestCoverage(args: TestCoverageArgs): Promise<McpResponse> {
  try {
    const searchPath = args.coverage_path || args.path;
    const report = findCoverageReport(searchPath, PROJECT_ROOT);

    if (!report) {
      return fail(
        'No coverage report found. Run your test suite with coverage enabled (e.g., npm test -- --coverage)',
        {
          searched_paths: COVERAGE_PATHS,
          search_base: searchPath || 'PROJECT_ROOT',
        }
      );
    }

    const content = node_fs.readFileSync(report.path, 'utf-8');
    const files = report.type === 'lcov'
      ? parseLcov(content)
      : parseIstanbul(content);

    if (files.size === 0) {
      return fail('Coverage report was empty or could not be parsed', {
        report_path: report.path,
        report_type: report.type,
      });
    }

    // Resolve target file if specified
    let targetFile: string | undefined;
    if (args.file) {
      const resolvedPath = resolveFilePath(args.file, PROJECT_ROOT);
      const normalizedPath = normalizeFilePath(resolvedPath);

      if (!files.has(normalizedPath)) {
        // Try relative path match
        const relativePath = normalizeFilePath(args.file);
        let found = false;
        for (const key of files.keys()) {
          if (key.endsWith(relativePath) || key.includes(relativePath)) {
            targetFile = key;
            found = true;
            break;
          }
        }
        if (!found) {
          return fail(`File not found in coverage report: ${args.file}`, {
            report_path: report.path,
            available_files: Array.from(files.keys()).slice(0, 10),
          });
        }
      } else {
        targetFile = normalizedPath;
      }
    }

    const metrics = calculateCoverageMetrics(files, targetFile);
    const uncoveredLines = extractUncoveredLines(files, PROJECT_ROOT, targetFile);
    const uncoveredFunctions = extractUncoveredFunctions(files, PROJECT_ROOT, targetFile);

    const result: CoverageResult = {
      coverage: metrics,
      uncovered_lines: uncoveredLines,
      uncovered_functions: uncoveredFunctions,
      report_path: makeRelativePath(report.path, PROJECT_ROOT),
      report_type: report.type,
    };

    return ok(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return fail(`Failed to get test coverage: ${message}`);
  }
}
