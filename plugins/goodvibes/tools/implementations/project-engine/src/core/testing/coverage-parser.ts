/**
 * Coverage Parser — L1 Core
 *
 * Parsing and calculation utilities for test coverage reports.
 * Supports LCOV and Istanbul/NYC JSON formats.
 * No handler logic: all functions are pure data transformations.
 *
 * @module core/testing/coverage-parser
 */

import * as node_path from 'node:path';
import * as node_fs from 'node:fs/promises';

import {
  normalizeFilePath,
  makeRelativePath,
} from '../code-intel/file-utils.js';
import { COVERAGE_PATHS } from './constants.js';
import type {
  CoverageReportType,
  LcovFileCoverage,
  IstanbulFileCoverage,
  CoverageMetrics,
  UncoveredLines,
  UncoveredFunction,
} from './types.js';

// =============================================================================
// Coverage File Discovery
// =============================================================================

/**
 * Find the coverage report file for a project.
 *
 * Search order:
 * 1. If `customPath` is an existing file, detect its type and return it directly.
 * 2. Search `COVERAGE_PATHS` relative to the resolved `customPath` directory.
 * 3. If a `customPath` was given but nothing found there, fall back to `projectRoot`.
 *
 * @param customPath - Optional caller-supplied path (file or directory)
 * @param projectRoot - Absolute path to the project root (fallback search base)
 * @returns Object with `path` and `type`, or `null` if no report is found
 */
export async function findCoverageReport(
  customPath: string | undefined,
  projectRoot: string
): Promise<{ path: string; type: CoverageReportType } | null> {
  const searchBase = customPath
    ? (node_path.isAbsolute(customPath)
        ? customPath
        : node_path.resolve(projectRoot, customPath))
    : projectRoot;

  // Direct file check
  if (customPath) {
    try {
      const stat = await node_fs.stat(searchBase);
      if (stat.isFile()) {
        const type = await detectCoverageType(searchBase);
        if (type) {
          return { path: searchBase, type };
        }
      }
    } catch {
      // Path doesn't exist or isn't accessible
    }
  }

  // Determine base directory for search
  let baseDir = projectRoot;
  try {
    const stat = await node_fs.stat(searchBase);
    if (stat.isDirectory()) {
      baseDir = searchBase;
    }
  } catch {
    // searchBase doesn't exist; fall back to projectRoot
  }

  // Directory search
  for (const relativePath of COVERAGE_PATHS) {
    const fullPath = node_path.resolve(baseDir, relativePath);
    try {
      await node_fs.access(fullPath);
      const type = await detectCoverageType(fullPath);
      if (type) {
        return { path: fullPath, type };
      }
    } catch {
      // File doesn't exist, continue
    }
  }

  // Fall back to projectRoot if a customPath was given but nothing found there
  if (customPath && baseDir !== projectRoot) {
    for (const relativePath of COVERAGE_PATHS) {
      const fullPath = node_path.resolve(projectRoot, relativePath);
      try {
        await node_fs.access(fullPath);
        const type = await detectCoverageType(fullPath);
        if (type) {
          return { path: fullPath, type };
        }
      } catch {
        // File doesn't exist, continue
      }
    }
  }

  return null;
}

/**
 * Detect the coverage format type from a file path and contents.
 *
 * @param filePath - Absolute path to the coverage file
 * @returns Coverage format type, or `null` if unrecognized
 */
export async function detectCoverageType(filePath: string): Promise<CoverageReportType | null> {
  const fileName = node_path.basename(filePath).toLowerCase();
  const ext = node_path.extname(filePath).toLowerCase();

  if (fileName === 'lcov.info' || ext === '.lcov') {
    return 'lcov';
  }

  if (ext === '.json') {
    try {
      const content = await node_fs.readFile(filePath, 'utf-8');
      const data = JSON.parse(content) as Record<string, unknown>;

      const firstKey = Object.keys(data)[0];
      if (firstKey && typeof data[firstKey] === 'object') {
        const firstValue = data[firstKey] as Record<string, unknown>;
        if ('statementMap' in firstValue || 'path' in firstValue) {
          if (filePath.includes('vitest') || filePath.includes('.vitest')) {
            return 'vitest';
          }
          if (filePath.includes('jest') || filePath.includes('.jest')) {
            return 'jest';
          }
          return 'istanbul';
        }
      }

      if ('total' in data) {
        return 'istanbul';
      }
    } catch {
      // Invalid JSON or file not readable
    }
  }

  return null;
}

// =============================================================================
// LCOV Parser
// =============================================================================

/**
 * Parse LCOV format coverage report into a per-file coverage map.
 *
 * LCOV format reference:
 * - SF: Source file path
 * - FN: Function definition (line,name)
 * - FNDA: Function data (hits,name)
 * - DA: Line data (line,hits)
 * - BRDA: Branch data (line,block,branch,taken)
 * - end_of_record: End of file record
 *
 * @param content - Raw LCOV file content
 * @returns Map of normalized file path to parsed coverage data
 */
export function parseLcov(content: string): Map<string, LcovFileCoverage> {
  const files = new Map<string, LcovFileCoverage>();
  let currentFile: LcovFileCoverage | null = null;

  for (const line of content.split('\n')) {
    const trimmed = line.trim();

    if (trimmed.startsWith('SF:')) {
      const filePath = trimmed.slice(3);
      currentFile = {
        file: filePath,
        lines: new Map(),
        functions: new Map(),
        branches: new Map(),
      };
    } else if (trimmed === 'end_of_record' && currentFile) {
      files.set(normalizeFilePath(currentFile.file), currentFile);
      currentFile = null;
    } else if (currentFile) {
      if (trimmed.startsWith('DA:')) {
        const [lineNum, hits] = trimmed.slice(3).split(',').map(Number);
        if (!isNaN(lineNum) && !isNaN(hits)) {
          currentFile.lines.set(lineNum, hits);
        }
      } else if (trimmed.startsWith('FN:')) {
        const match = trimmed.slice(3).match(/^(\d+),(.+)$/);
        if (match) {
          const fnLine = parseInt(match[1], 10);
          if (!isNaN(fnLine)) {
            currentFile.functions.set(match[2], { line: fnLine, hits: 0 });
          }
        }
      } else if (trimmed.startsWith('FNDA:')) {
        const match = trimmed.slice(5).match(/^(\d+),(.+)$/);
        if (match) {
          const hits = parseInt(match[1], 10);
          const fn = currentFile.functions.get(match[2]);
          if (fn && !isNaN(hits)) {
            fn.hits = hits;
          }
        }
      } else if (trimmed.startsWith('BRDA:')) {
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
 * Parse Istanbul/NYC JSON coverage format into unified LcovFileCoverage format.
 *
 * Converts Istanbul's statement-based format to line-based format compatible
 * with LCOV processing functions.
 *
 * @param content - Raw JSON string from coverage-final.json
 * @returns Map of normalized file paths to parsed coverage data
 */
export function parseIstanbul(content: string): Map<string, LcovFileCoverage> {
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

      // Statement coverage → line coverage
      if (coverage.statementMap && coverage.s) {
        for (const [id, stmt] of Object.entries(coverage.statementMap)) {
          const hits = coverage.s[id] || 0;
          for (let line = stmt.start.line; line <= stmt.end.line; line++) {
            const existing = lcovFile.lines.get(line) || 0;
            lcovFile.lines.set(line, Math.max(existing, hits));
          }
        }
      }

      // Function coverage
      if (coverage.fnMap && coverage.f) {
        for (const [id, fn] of Object.entries(coverage.fnMap)) {
          const hits = coverage.f[id] || 0;
          const line = fn.decl?.start?.line || fn.loc?.start?.line || 0;
          lcovFile.functions.set(fn.name, { line, hits });
        }
      }

      // Branch coverage
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
 * Calculate coverage metrics from parsed file data.
 *
 * Aggregates line, function, and branch coverage across all files or a
 * specific target file. Returns percentages rounded to one decimal place.
 *
 * @param files - Map of normalized file paths to coverage data
 * @param targetFile - Optional normalized path of a specific file to calculate for
 * @returns Coverage metrics with percentages for lines, branches, functions, and statements
 */
export function calculateCoverageMetrics(
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

    for (const hits of file.lines.values()) {
      totalLines++;
      if (hits > 0) coveredLines++;
    }

    for (const fn of file.functions.values()) {
      totalFunctions++;
      if (fn.hits > 0) coveredFunctions++;
    }

    for (const branch of file.branches.values()) {
      totalBranches += branch.total;
      coveredBranches += branch.taken;
    }
  }

  return {
    lines: totalLines > 0 ? Math.round((coveredLines / totalLines) * 1000) / 10 : 0,
    branches: totalBranches > 0 ? Math.round((coveredBranches / totalBranches) * 1000) / 10 : 0,
    functions: totalFunctions > 0 ? Math.round((coveredFunctions / totalFunctions) * 1000) / 10 : 0,
    // Note: statement coverage approximated as line coverage — a known limitation of
    // the lcov format used here, which does not always distinguish the two metrics.
    statements: totalLines > 0 ? Math.round((coveredLines / totalLines) * 1000) / 10 : 0,
  };
}

/**
 * Extract uncovered lines from parsed coverage data.
 *
 * @param files - Map of normalized file paths to coverage data
 * @param projectRoot - Project root for computing relative paths
 * @param targetFile - Optional normalized path to limit to one file
 * @returns Array of UncoveredLines objects, one per file with uncovered lines
 */
export function extractUncoveredLines(
  files: Map<string, LcovFileCoverage>,
  projectRoot: string,
  targetFile?: string
): UncoveredLines[] {
  const result: UncoveredLines[] = [];

  const filesToProcess = targetFile
    ? ([[normalizeFilePath(targetFile), files.get(normalizeFilePath(targetFile))] as const]).filter(
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
 * Extract uncovered functions from parsed coverage data.
 *
 * @param files - Map of normalized file paths to coverage data
 * @param projectRoot - Project root for computing relative paths
 * @param targetFile - Optional normalized path to limit to one file
 * @returns Array of UncoveredFunction objects sorted by file then line number
 */
export function extractUncoveredFunctions(
  files: Map<string, LcovFileCoverage>,
  projectRoot: string,
  targetFile?: string
): UncoveredFunction[] {
  const result: UncoveredFunction[] = [];

  const filesToProcess = targetFile
    ? ([[normalizeFilePath(targetFile), files.get(normalizeFilePath(targetFile))] as const]).filter(
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
