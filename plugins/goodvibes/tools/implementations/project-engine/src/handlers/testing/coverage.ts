/**
 * Test Coverage Handler
 *
 * Parses test coverage reports and maps coverage data to functions.
 * Supports multiple coverage report formats:
 * - LCOV (lcov.info)
 * - Istanbul/NYC (coverage-final.json, coverage-summary.json)
 * - Vitest/Jest (coverage directories)
 * - C8 (c8 coverage format)
 *
 * @module handlers/testing/coverage
 */

import * as path from 'path';
import * as fs from 'fs';

import { PROJECT_ROOT } from '../../config.js';
import {
  createSuccessResponse,
  createErrorResponse,
  type ToolResponse,
} from '../../shared/response.js';
import {
  normalizeFilePath,
  makeRelativePath,
  resolveFilePath,
} from '../lsp/utils.js';

// =============================================================================
// Types
// =============================================================================

/**
 * Arguments for the get_test_coverage MCP tool.
 * @property file - Specific source file to check coverage for (optional)
 * @property coverage_path - Path to coverage report directory or file
 * @property path - Alias for coverage_path (for convenience)
 */
export interface GetTestCoverageArgs {
  /** Specific source file to check coverage for (if omitted, returns overall coverage) */
  file?: string;
  /** Path to coverage report directory or file (relative to PROJECT_ROOT) */
  coverage_path?: string;
  /** Alias for coverage_path (either can be used) */
  path?: string;
}

/**
 * Coverage percentages for different code coverage metrics.
 * All values are percentages from 0-100, rounded to one decimal place.
 * @property lines - Percentage of source lines executed
 * @property branches - Percentage of conditional branches taken
 * @property functions - Percentage of functions called
 * @property statements - Percentage of statements executed
 */
interface CoverageMetrics {
  /** Line coverage percentage (0-100, one decimal place) */
  lines: number;
  /** Branch coverage percentage (0-100, one decimal place) */
  branches: number;
  /** Function coverage percentage (0-100, one decimal place) */
  functions: number;
  /** Statement coverage percentage (0-100, one decimal place) */
  statements: number;
}

/**
 * Uncovered lines in a source file.
 * @property file - Source file path relative to project root
 * @property lines - Sorted array of uncovered line numbers
 */
interface UncoveredLines {
  /** Source file path relative to project root */
  file: string;
  /** Sorted array of 1-based line numbers that were not executed */
  lines: number[];
}

/**
 * An uncovered function in a source file.
 * @property file - Source file path relative to project root
 * @property name - Function name as it appears in source
 * @property line - Line number where the function is defined
 */
interface UncoveredFunction {
  /** Source file path relative to project root */
  file: string;
  /** Function name as declared in source code */
  name: string;
  /** 1-based line number where the function is defined */
  line: number;
}

/**
 * Supported coverage report format types.
 * - 'lcov': LCOV format (lcov.info files)
 * - 'istanbul': Istanbul/NYC JSON format
 * - 'c8': C8 coverage format
 * - 'vitest': Vitest coverage output
 * - 'jest': Jest coverage output
 */
type CoverageReportType = 'lcov' | 'istanbul' | 'c8' | 'vitest' | 'jest';

/**
 * Result of the get_test_coverage MCP tool.
 * @property coverage - Coverage percentages for all metrics
 * @property uncovered_lines - Files with their uncovered line numbers
 * @property uncovered_functions - Functions that were never called
 * @property report_path - Path to the coverage report that was parsed
 * @property report_type - Format type of the coverage report
 */
interface CoverageResult {
  /** Coverage percentages for lines, branches, functions, and statements */
  coverage: CoverageMetrics;
  /** Array of files with their uncovered line numbers */
  uncovered_lines: UncoveredLines[];
  /** Array of functions that were never executed during tests */
  uncovered_functions: UncoveredFunction[];
  /** Relative path to the coverage report that was parsed */
  report_path: string;
  /** Format type of the coverage report that was detected and parsed */
  report_type: CoverageReportType;
}

/**
 * Parsed LCOV coverage data for a single file.
 * Internal representation used during parsing.
 * @property file - Absolute file path
 * @property lines - Map of line number to execution count
 * @property functions - Map of function name to definition info and hit count
 * @property branches - Map of line number to branch coverage info
 */
interface LcovFileCoverage {
  /** Absolute path to the source file */
  file: string;
  /** Map of line number -> execution count (0 = uncovered) */
  lines: Map<number, number>;
  /** Map of function name -> { line where defined, number of calls } */
  functions: Map<string, { line: number; hits: number }>;
  /** Map of line number -> { branches taken, total branches } */
  branches: Map<number, { taken: number; total: number }>;
}

/**
 * Istanbul/NYC JSON coverage format for a single file.
 * Represents the raw JSON structure from coverage-final.json.
 * @property path - Source file path
 * @property statementMap - Statement ID to location mapping
 * @property fnMap - Function ID to metadata mapping
 * @property branchMap - Branch ID to location mapping
 * @property s - Statement hit counts by ID
 * @property f - Function hit counts by ID
 * @property b - Branch hit counts by ID (array for each branch point)
 */
interface IstanbulFileCoverage {
  /** Absolute or relative path to source file */
  path: string;
  /** Map of statement ID to start/end line locations */
  statementMap: Record<string, { start: { line: number }; end: { line: number } }>;
  /** Map of function ID to name and location metadata */
  fnMap: Record<string, { name: string; decl: { start: { line: number } }; loc: { start: { line: number } } }>;
  /** Map of branch ID to location */
  branchMap: Record<string, { loc: { start: { line: number } } }>;
  /** Statement execution counts (key is statement ID) */
  s: Record<string, number>;
  /** Function call counts (key is function ID) */
  f: Record<string, number>;
  /** Branch execution counts (key is branch ID, value is array of counts per branch) */
  b: Record<string, number[]>;
}

// =============================================================================
// Coverage File Discovery
// =============================================================================

/** Common coverage report locations */
const COVERAGE_PATHS = [
  'coverage/lcov.info',
  'coverage/lcov-report/lcov.info',
  'coverage/coverage-final.json',
  'coverage/coverage-summary.json',
  '.nyc_output/coverage-final.json',
  'coverage.lcov',
  'lcov.info',
];

/**
 * Find coverage report file in the project.
 *
 * @param customPath - Optional custom path to check first (becomes base for search)
 * @param projectRoot - Project root directory (default fallback)
 * @returns Path to coverage file and its type, or null if not found
 */
function findCoverageReport(
  customPath: string | undefined,
  projectRoot: string
): { path: string; type: CoverageReportType } | null {
  // Determine the base directory to search in
  const searchBase = customPath
    ? (path.isAbsolute(customPath) ? customPath : path.resolve(projectRoot, customPath))
    : projectRoot;

  // If custom path is a file, check it directly
  if (customPath && fs.existsSync(searchBase) && fs.statSync(searchBase).isFile()) {
    const type = detectCoverageType(searchBase);
    if (type) {
      return { path: searchBase, type };
    }
  }

  // Search for coverage files in the base directory
  const baseDir = fs.existsSync(searchBase) && fs.statSync(searchBase).isDirectory()
    ? searchBase
    : projectRoot;

  // Check all common coverage paths relative to the base directory
  for (const relativePath of COVERAGE_PATHS) {
    const fullPath = path.resolve(baseDir, relativePath);
    if (fs.existsSync(fullPath)) {
      const type = detectCoverageType(fullPath);
      if (type) {
        return { path: fullPath, type };
      }
    }
  }

  // If custom path was provided but nothing found there, also check PROJECT_ROOT as fallback
  if (customPath && baseDir !== projectRoot) {
    for (const relativePath of COVERAGE_PATHS) {
      const fullPath = path.resolve(projectRoot, relativePath);
      if (fs.existsSync(fullPath)) {
        const type = detectCoverageType(fullPath);
        if (type) {
          return { path: fullPath, type };
        }
      }
    }
  }

  return null;
}

/**
 * Detects the type of coverage report from file path and content.
 *
 * Uses file name patterns and JSON structure to identify the format.
 *
 * @param filePath - Absolute path to the coverage file
 * @returns Coverage report type, or null if format is unrecognized
 */
function detectCoverageType(filePath: string): CoverageReportType | null {
  const fileName = path.basename(filePath).toLowerCase();
  const ext = path.extname(filePath).toLowerCase();

  // LCOV format
  if (fileName === 'lcov.info' || ext === '.lcov') {
    return 'lcov';
  }

  // JSON formats
  if (ext === '.json') {
    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      const data = JSON.parse(content) as Record<string, unknown>;

      // Istanbul/NYC format has file paths as keys
      const firstKey = Object.keys(data)[0];
      if (firstKey && typeof data[firstKey] === 'object') {
        const firstValue = data[firstKey] as Record<string, unknown>;
        if ('statementMap' in firstValue || 'path' in firstValue) {
          // Check for vitest or jest based on file location
          if (filePath.includes('vitest') || filePath.includes('.vitest')) {
            return 'vitest';
          }
          if (filePath.includes('jest') || filePath.includes('.jest')) {
            return 'jest';
          }
          return 'istanbul';
        }
      }

      // Coverage summary format
      if ('total' in data) {
        return 'istanbul';
      }
    } catch {
      // Invalid JSON
    }
  }

  return null;
}

// =============================================================================
// LCOV Parser
// =============================================================================

/**
 * Parse LCOV format coverage report.
 *
 * LCOV format reference:
 * - TN: Test name
 * - SF: Source file path
 * - FN: Function definition (line,name)
 * - FNDA: Function data (hits,name)
 * - FNF: Functions found
 * - FNH: Functions hit
 * - BRDA: Branch data (line,block,branch,taken)
 * - BRF: Branches found
 * - BRH: Branches hit
 * - DA: Line data (line,hits)
 * - LF: Lines found
 * - LH: Lines hit
 * - end_of_record
 *
 * @param content - LCOV file content
 * @returns Parsed coverage data per file
 */
function parseLcov(content: string): Map<string, LcovFileCoverage> {
  const files = new Map<string, LcovFileCoverage>();
  let currentFile: LcovFileCoverage | null = null;

  const lines = content.split('\n');

  for (const line of lines) {
    const trimmed = line.trim();

    if (trimmed.startsWith('SF:')) {
      // Start of file record
      const filePath = trimmed.slice(3);
      currentFile = {
        file: filePath,
        lines: new Map(),
        functions: new Map(),
        branches: new Map(),
      };
    } else if (trimmed === 'end_of_record' && currentFile) {
      // End of file record
      files.set(normalizeFilePath(currentFile.file), currentFile);
      currentFile = null;
    } else if (currentFile) {
      // Parse line data
      if (trimmed.startsWith('DA:')) {
        // Line data: DA:line,hits
        const [lineNum, hits] = trimmed.slice(3).split(',').map(Number);
        if (!isNaN(lineNum) && !isNaN(hits)) {
          currentFile.lines.set(lineNum, hits);
        }
      } else if (trimmed.startsWith('FN:')) {
        // Function definition: FN:line,name
        const match = trimmed.slice(3).match(/^(\d+),(.+)$/);
        if (match) {
          const [, lineStr, name] = match;
          const fnLine = parseInt(lineStr, 10);
          if (!isNaN(fnLine)) {
            currentFile.functions.set(name, { line: fnLine, hits: 0 });
          }
        }
      } else if (trimmed.startsWith('FNDA:')) {
        // Function data: FNDA:hits,name
        const match = trimmed.slice(5).match(/^(\d+),(.+)$/);
        if (match) {
          const [, hitsStr, name] = match;
          const hits = parseInt(hitsStr, 10);
          const fn = currentFile.functions.get(name);
          if (fn && !isNaN(hits)) {
            fn.hits = hits;
          }
        }
      } else if (trimmed.startsWith('BRDA:')) {
        // Branch data: BRDA:line,block,branch,taken
        const parts = trimmed.slice(5).split(',');
        if (parts.length >= 4) {
          const lineNum = parseInt(parts[0], 10);
          const taken = parts[3] === '-' ? 0 : parseInt(parts[3], 10);
          if (!isNaN(lineNum)) {
            const existing = currentFile.branches.get(lineNum) || { taken: 0, total: 0 };
            existing.total++;
            if (!isNaN(taken) && taken > 0) {
              existing.taken++;
            }
            currentFile.branches.set(lineNum, existing);
          }
        }
      }
    }
  }

  return files;
}

// =============================================================================
// Istanbul Parser
// =============================================================================

/**
 * Parses Istanbul/NYC JSON coverage format into unified LcovFileCoverage format.
 *
 * Converts Istanbul's statement-based format to line-based format.
 *
 * @param content - Raw JSON string from coverage-final.json
 * @returns Map of normalized file paths to parsed coverage data
 */
function parseIstanbul(content: string): Map<string, LcovFileCoverage> {
  const files = new Map<string, LcovFileCoverage>();

  try {
    const data = JSON.parse(content) as Record<string, IstanbulFileCoverage>;

    for (const [filePath, coverage] of Object.entries(data)) {
      const lcovFile: LcovFileCoverage = {
        file: coverage.path || filePath,
        lines: new Map(),
        functions: new Map(),
        branches: new Map(),
      };

      // Parse statement coverage as line coverage
      if (coverage.statementMap && coverage.s) {
        for (const [id, stmt] of Object.entries(coverage.statementMap)) {
          const hits = coverage.s[id] || 0;
          for (let line = stmt.start.line; line <= stmt.end.line; line++) {
            const existing = lcovFile.lines.get(line) || 0;
            lcovFile.lines.set(line, Math.max(existing, hits));
          }
        }
      }

      // Parse function coverage
      if (coverage.fnMap && coverage.f) {
        for (const [id, fn] of Object.entries(coverage.fnMap)) {
          const hits = coverage.f[id] || 0;
          const line = fn.decl?.start?.line || fn.loc?.start?.line || 0;
          lcovFile.functions.set(fn.name, { line, hits });
        }
      }

      // Parse branch coverage
      if (coverage.branchMap && coverage.b) {
        for (const [id, branch] of Object.entries(coverage.branchMap)) {
          const branchHits = coverage.b[id] || [];
          const line = branch.loc?.start?.line || 0;
          if (line > 0) {
            const taken = branchHits.filter((h: number) => h > 0).length;
            lcovFile.branches.set(line, { taken, total: branchHits.length });
          }
        }
      }

      files.set(normalizeFilePath(lcovFile.file), lcovFile);
    }
  } catch {
    // Invalid JSON
  }

  return files;
}

// =============================================================================
// Coverage Calculation
// =============================================================================

/**
 * Calculates coverage metrics from parsed file data.
 *
 * Aggregates line, function, and branch coverage across all files or a specific file.
 * Returns percentages rounded to one decimal place.
 *
 * @param files - Map of file paths to coverage data
 * @param targetFile - Optional specific file to calculate coverage for (if omitted, all files)
 * @returns Coverage metrics with percentages for lines, branches, functions, and statements
 */
function calculateMetrics(
  files: Map<string, LcovFileCoverage>,
  targetFile?: string
): CoverageMetrics {
  let totalLines = 0;
  let coveredLines = 0;
  let totalBranches = 0;
  let coveredBranches = 0;
  let totalFunctions = 0;
  let coveredFunctions = 0;

  const filesToProcess = targetFile
    ? [files.get(normalizeFilePath(targetFile))].filter(Boolean)
    : Array.from(files.values());

  for (const file of filesToProcess) {
    if (!file) continue;

    // Lines
    for (const hits of file.lines.values()) {
      totalLines++;
      if (hits > 0) coveredLines++;
    }

    // Functions
    for (const fn of file.functions.values()) {
      totalFunctions++;
      if (fn.hits > 0) coveredFunctions++;
    }

    // Branches
    for (const branch of file.branches.values()) {
      totalBranches += branch.total;
      coveredBranches += branch.taken;
    }
  }

  return {
    lines: totalLines > 0 ? Math.round((coveredLines / totalLines) * 1000) / 10 : 0,
    branches: totalBranches > 0 ? Math.round((coveredBranches / totalBranches) * 1000) / 10 : 0,
    functions: totalFunctions > 0 ? Math.round((coveredFunctions / totalFunctions) * 1000) / 10 : 0,
    statements: totalLines > 0 ? Math.round((coveredLines / totalLines) * 1000) / 10 : 0, // Same as lines for LCOV
  };
}

/**
 * Extracts uncovered lines from parsed coverage data.
 *
 * Identifies lines with zero execution count and groups them by file.
 *
 * @param files - Map of file paths to coverage data
 * @param projectRoot - Project root for computing relative paths
 * @param targetFile - Optional specific file to check (if omitted, all files)
 * @returns Array of UncoveredLines objects, one per file with uncovered lines
 */
function extractUncoveredLines(
  files: Map<string, LcovFileCoverage>,
  projectRoot: string,
  targetFile?: string
): UncoveredLines[] {
  const result: UncoveredLines[] = [];

  const filesToProcess = targetFile
    ? [[normalizeFilePath(targetFile), files.get(normalizeFilePath(targetFile))] as const].filter(
        ([, v]) => v
      )
    : Array.from(files.entries());

  for (const [filePath, file] of filesToProcess) {
    if (!file) continue;

    const uncovered: number[] = [];
    for (const [line, hits] of file.lines.entries()) {
      if (hits === 0) {
        uncovered.push(line);
      }
    }

    if (uncovered.length > 0) {
      result.push({
        file: makeRelativePath(filePath, projectRoot),
        lines: uncovered.sort((a, b) => a - b),
      });
    }
  }

  return result;
}

/**
 * Extracts uncovered functions from parsed coverage data.
 *
 * Identifies functions with zero call count.
 *
 * @param files - Map of file paths to coverage data
 * @param projectRoot - Project root for computing relative paths
 * @param targetFile - Optional specific file to check (if omitted, all files)
 * @returns Array of UncoveredFunction objects, sorted by file then line number
 */
function extractUncoveredFunctions(
  files: Map<string, LcovFileCoverage>,
  projectRoot: string,
  targetFile?: string
): UncoveredFunction[] {
  const result: UncoveredFunction[] = [];

  const filesToProcess = targetFile
    ? [[normalizeFilePath(targetFile), files.get(normalizeFilePath(targetFile))] as const].filter(
        ([, v]) => v
      )
    : Array.from(files.entries());

  for (const [filePath, file] of filesToProcess) {
    if (!file) continue;

    for (const [name, fn] of file.functions.entries()) {
      if (fn.hits === 0) {
        result.push({
          file: makeRelativePath(filePath, projectRoot),
          name,
          line: fn.line,
        });
      }
    }
  }

  return result.sort((a, b) => {
    const fileCompare = a.file.localeCompare(b.file);
    return fileCompare !== 0 ? fileCompare : a.line - b.line;
  });
}

// =============================================================================
// Handler
// =============================================================================

/**
 * Handle the get_test_coverage MCP tool call.
 *
 * Parses test coverage reports and returns:
 * - Overall or file-specific coverage percentages
 * - List of uncovered lines per file
 * - List of uncovered functions
 * - Path to the coverage report found
 *
 * @param args - The get_test_coverage tool arguments
 * @returns MCP tool response with coverage data
 */
export async function handleGetTestCoverage(args: GetTestCoverageArgs): Promise<ToolResponse> {
  try {
    // Find coverage report (support both path and coverage_path)
    const searchPath = args.coverage_path || args.path;
    const report = findCoverageReport(searchPath, PROJECT_ROOT);

    if (!report) {
      return createErrorResponse(
        'No coverage report found. Run your test suite with coverage enabled (e.g., npm test -- --coverage)',
        {
          searched_paths: COVERAGE_PATHS,
          search_base: searchPath || 'PROJECT_ROOT',
        }
      );
    }

    // Read and parse coverage file
    const content = fs.readFileSync(report.path, 'utf-8');
    let files: Map<string, LcovFileCoverage>;

    if (report.type === 'lcov') {
      files = parseLcov(content);
    } else {
      files = parseIstanbul(content);
    }

    if (files.size === 0) {
      return createErrorResponse('Coverage report was empty or could not be parsed', {
        report_path: report.path,
        report_type: report.type,
      });
    }

    // Resolve target file if specified
    let targetFile: string | undefined;
    if (args.file) {
      const resolvedPath = resolveFilePath(args.file, PROJECT_ROOT);
      const normalizedPath = normalizeFilePath(resolvedPath);

      // Check if file exists in coverage data
      if (!files.has(normalizedPath)) {
        // Try to find by relative path match
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
          return createErrorResponse(`File not found in coverage report: ${args.file}`, {
            report_path: report.path,
            available_files: Array.from(files.keys()).slice(0, 10),
          });
        }
      } else {
        targetFile = normalizedPath;
      }
    }

    // Calculate metrics
    const metrics = calculateMetrics(files, targetFile);
    const uncoveredLines = extractUncoveredLines(files, PROJECT_ROOT, targetFile);
    const uncoveredFunctions = extractUncoveredFunctions(files, PROJECT_ROOT, targetFile);

    const result: CoverageResult = {
      coverage: metrics,
      uncovered_lines: uncoveredLines,
      uncovered_functions: uncoveredFunctions,
      report_path: makeRelativePath(report.path, PROJECT_ROOT),
      report_type: report.type,
    };

    return createSuccessResponse(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return createErrorResponse(`Failed to get test coverage: ${message}`);
  }
}
