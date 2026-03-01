/**
 * Secrets scanner extension
 *
 * High-level handler for the scan_for_secrets MCP tool.
 * Delegates to core security utilities for pattern matching and reporting.
 *
 * @module extensions/security/secrets
 */

import * as node_fsPromises from 'node:fs/promises';
import * as node_path from 'node:path';
import type { McpResponse } from '../../shared/types.js';
import { ok, fail, failFromException } from '../../shared/response.js';
import { getProjectRoot } from '../../shared/config.js';
import { fileExists, shellExec } from '../../shared/utils.js';
import { logger } from '../../shared/logger.js';
import {
  type ScanForSecretsArgs,
  type SecretFinding,
  SECRET_PATTERNS,
  shouldSkip,
  isScannable,
  getDefaultMaxDepth,
  redactSecret,
  isLikelyPlaceholder,
  filterBySeverity,
} from '../../core/security/index.js';

// =============================================================================
// Internal Helpers
// =============================================================================

/** Result of scanning a single file */
interface ScanFileResult {
  findings: SecretFinding[];
  stoppedEarly: boolean;
}

/**
 * Recursively collect all scannable files in a directory.
 *
 * @param dirPath - Directory to recurse into
 * @param files - Accumulator for discovered file paths
 * @param currentDepth - Current recursion depth
 * @param maxDepth - Maximum depth to recurse
 * @returns Array of absolute file paths
 */
async function getFilesRecursively(
  dirPath: string,
  files: string[] = [],
  currentDepth: number = 0,
  maxDepth: number = getDefaultMaxDepth()
): Promise<string[]> {
  if (currentDepth >= maxDepth) return files;

  try {
    const entries = await node_fsPromises.readdir(dirPath, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = node_path.join(dirPath, entry.name);

      if (shouldSkip(fullPath)) continue;

      if (entry.isDirectory()) {
        await getFilesRecursively(fullPath, files, currentDepth + 1, maxDepth);
      } else if (entry.isFile() && isScannable(fullPath)) {
        files.push(fullPath);
      }
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    logger.warn(`[secrets-scanner] Could not read directory ${dirPath}: ${message}`);
  }

  return files;
}

/**
 * Get git-staged files for additional scanning.
 *
 * @param projectRoot - Project root for git commands
 * @returns Array of absolute staged file paths
 */
async function getStagedFiles(projectRoot: string): Promise<string[]> {
  const result = await shellExec('git diff --cached --name-only', projectRoot, 5000);

  if (result.error || !result.stdout) return [];

  return result.stdout
    .split('\n')
    .filter(f => f.trim())
    .map(f => node_path.join(projectRoot, f))
    .filter(f => isScannable(f) && !shouldSkip(f));
}

/**
 * Scan a single file for secret patterns.
 *
 * @param filePath - Absolute path to the file
 * @param projectRoot - Project root for relative path calculation
 * @param earlyExit - Stop after first match (for presence-only checks)
 * @returns Findings and early-exit flag
 */
async function scanFile(
  filePath: string,
  projectRoot: string,
  earlyExit: boolean = false
): Promise<ScanFileResult> {
  const findings: SecretFinding[] = [];

  try {
    const content = await node_fsPromises.readFile(filePath, 'utf-8');
    const lines = content.split('\n');
    const relativePath = node_path.relative(projectRoot, filePath);

    for (const pattern of SECRET_PATTERNS) {
      pattern.pattern.lastIndex = 0;

      for (let lineNum = 0; lineNum < lines.length; lineNum++) {
        const line = lines[lineNum];
        pattern.pattern.lastIndex = 0;

        let match;
        while ((match = pattern.pattern.exec(line)) !== null) {
          const matchValue = match[1] || match[0];

          if (isLikelyPlaceholder(matchValue, line)) continue;

          findings.push({
            file: relativePath,
            line: lineNum + 1,
            column: match.index + 1,
            secret_type: pattern.name,
            severity: pattern.severity,
            preview: redactSecret(matchValue),
            recommendation: pattern.recommendation,
          });

          if (earlyExit) return { findings, stoppedEarly: true };
        }
      }
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    logger.warn(`[secrets-scanner] Could not read file ${filePath}: ${message}`);
  }

  return { findings, stoppedEarly: false };
}

// =============================================================================
// Public Handler
// =============================================================================

/**
 * Scan source files for potential secrets, credentials, and sensitive data.
 *
 * Supports:
 * - Directory and single-file scanning with configurable depth
 * - Git staged file inclusion
 * - Severity threshold filtering
 * - Fast presence-only mode that stops at first match
 *
 * @param args - The scan_for_secrets tool arguments
 * @returns MCP response with findings, severity counts, and scan metadata
 *
 * @example
 * await scanForSecrets({});
 * // Returns all findings across project
 *
 * @example
 * await scanForSecrets({ check_presence_only: true });
 * // Returns after first finding for fast presence checks
 */
export async function scanForSecrets(args: ScanForSecretsArgs): Promise<McpResponse> {
  const projectRoot = getProjectRoot();
  const scanPath = node_path.resolve(projectRoot, args.path || '.');
  const includeStagedFiles = args.include_staged !== false;
  const severityThreshold = args.severity_threshold || 'low';
  const maxDepth = args.max_depth ?? getDefaultMaxDepth();
  const checkPresenceOnly = args.check_presence_only === true;

  let allFindings: SecretFinding[] = [];
  const scannedFiles = new Set<string>();
  let stoppedEarly = false;

  if (!await fileExists(scanPath)) {
    return fail(`Path does not exist: ${args.path || '.'}`);
  }

  const stats = await node_fsPromises.stat(scanPath);
  let filesToScan: string[] = [];

  if (stats.isDirectory()) {
    filesToScan = await getFilesRecursively(scanPath, [], 0, maxDepth);
  } else if (stats.isFile()) {
    filesToScan = [scanPath];
  }

  if (includeStagedFiles) {
    const stagedFiles = await getStagedFiles(projectRoot);
    filesToScan = Array.from(new Set([...filesToScan, ...stagedFiles]));
  }

  for (const filePath of filesToScan) {
    /* istanbul ignore if -- @preserve Defensive code */
    if (scannedFiles.has(filePath)) continue;
    scannedFiles.add(filePath);

    const result = await scanFile(filePath, projectRoot, checkPresenceOnly);
    allFindings.push(...result.findings);

    if (checkPresenceOnly && result.stoppedEarly) {
      stoppedEarly = true;
      break;
    }
  }

  allFindings = filterBySeverity(allFindings, severityThreshold);

  // Sort: high severity first, then by file and line
  allFindings.sort((a, b) => {
    const severityOrder: Record<string, number> = { high: 2, medium: 1, low: 0 };
    const severityDiff = (severityOrder[b.severity] ?? 0) - (severityOrder[a.severity] ?? 0);
    if (severityDiff !== 0) return severityDiff;
    const fileDiff = a.file.localeCompare(b.file);
    if (fileDiff !== 0) return fileDiff;
    return a.line - b.line;
  });

  const bySeverity = {
    high: allFindings.filter(f => f.severity === 'high').length,
    medium: allFindings.filter(f => f.severity === 'medium').length,
    low: allFindings.filter(f => f.severity === 'low').length,
  };

  const response: Record<string, unknown> = {
    findings: allFindings,
    count: allFindings.length,
    by_severity: bySeverity,
    files_scanned: scannedFiles.size,
    scan_path: node_path.relative(projectRoot, scanPath) || '.',
    max_depth: maxDepth,
  };

  if (checkPresenceOnly) {
    response.has_secrets = allFindings.length > 0;
    response.stopped_early = stoppedEarly;
  }

  return ok(response);
}
