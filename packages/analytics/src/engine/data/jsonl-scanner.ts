/**
 * jsonl-scanner.ts, Discovers JSONL session files across Claude project directories.
 *
 * Scans `~/.claude/projects/<project-hash>/` directories and returns structured
 * metadata for each JSONL file found. Handles both main session files and
 * subagent JSONL files.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { homedir } from 'node:os';
import { resolveProjectsBaseDir } from './jsonl-reader.js';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Metadata for a discovered JSONL session file.
 */
export interface JsonlFileInfo {
  /** The project hash (parent directory name under ~/.claude/projects/). */
  projectHash: string;
  /** The session ID derived from the filename (without .jsonl extension). */
  sessionId: string;
  /** Absolute path to the JSONL file. */
  filePath: string;
  /** File size in bytes. */
  sizeBytes: number;
  /**
   * Whether this file belongs to a subagent session.
   * Subagent files are identified by a naming pattern that differs from
   * the standard UUID-based session ID (e.g. contains a dot separator).
   */
  isSubagent: boolean;
  /**
   * The parent session ID for subagent files, if derivable from the filename.
   * Null for main session files or when the parent cannot be determined.
   */
  parentSessionId: string | null;
}

/**
 * Result returned by scanner operations.
 */
export interface ScanResult {
  /** All JSONL files found. */
  files: JsonlFileInfo[];
  /** Project directories that were successfully scanned. */
  projectsScanned: number;
  /** Project directories that failed to read (e.g. permission errors). */
  projectErrors: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// JSONLScanner
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Discovers JSONL files across Claude project directories.
 *
 * Claude stores session data at:
 *   `~/.claude/projects/<project-hash>/<session-id>.jsonl`
 *
 * Subagent sessions may use a naming convention that includes a parent
 * session prefix (e.g. `<parent-id>.<agent-id>.jsonl` or a UUID variant).
 *
 * @example
 * ```ts
 * const scanner = new JSONLScanner();
 * const result = await scanner.scanAllProjects();
 * console.log(`Found ${result.files.length} JSONL files across ${result.projectsScanned} projects`);
 * ```
 */
export class JSONLScanner {
  private readonly projectsBaseDir: string;

  /**
   * @param projectsBaseDir - Base directory for Claude projects.
   *   Defaults to the resolved value from `resolveProjectsBaseDir()`
   *   (~/.claude/projects on most systems).
   */
  constructor(projectsBaseDir?: string) {
    this.projectsBaseDir = projectsBaseDir ?? resolveProjectsBaseDir();
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Public API
  // ───────────────────────────────────────────────────────────────────────────

  /**
   * Scan a single project directory for JSONL files.
   *
   * @param projectDir - Absolute path to a project directory
   *   (e.g. `~/.claude/projects/<hash>`).
   * @returns ScanResult with files found in that directory.
   */
  scanProjectDir(projectDir: string): ScanResult {
    // expandTilde is a safety net for externally-provided paths that may still
    // contain a leading '~/', even though resolveProjectsBaseDir() returns an
    // already-expanded path for internally-constructed paths.
    const expanded = this.expandTilde(projectDir);
    const projectHash = path.basename(expanded);
    const files: JsonlFileInfo[] = [];
    let projectErrors = 0;

    try {
      const entries = fs.readdirSync(expanded, { withFileTypes: true });
      for (const entry of entries) {
        if (!entry.isFile() || !entry.name.endsWith('.jsonl')) {continue;}
        const filePath = path.join(expanded, entry.name);
        const info = this.buildFileInfo(projectHash, entry.name, filePath);
        if (info) {files.push(info);}
      }
    } catch {
      projectErrors = 1;
    }

    return { files, projectsScanned: projectErrors === 0 ? 1 : 0, projectErrors };
  }

  /**
   * Scan ALL project directories under the configured base directory.
   *
   * Iterates over all subdirectories of `~/.claude/projects/` and scans
   * each for JSONL files.
   *
   * @returns ScanResult aggregating all files found.
   */
  scanAllProjects(): ScanResult {
    const expanded = this.expandTilde(this.projectsBaseDir);
    const allFiles: JsonlFileInfo[] = [];
    let projectsScanned = 0;
    let projectErrors = 0;

    let projectDirs: string[];
    try {
      const entries = fs.readdirSync(expanded, { withFileTypes: true });
      projectDirs = entries
        .filter((e) => e.isDirectory())
        .map((e) => path.join(expanded, e.name));
    } catch {
      // Base directory unreadable or does not exist
      return { files: [], projectsScanned: 0, projectErrors: 1 };
    }

    for (const projectDir of projectDirs) {
      const result = this.scanProjectDir(projectDir);
      allFiles.push(...result.files);
      projectsScanned += result.projectsScanned;
      projectErrors += result.projectErrors;
    }

    return { files: allFiles, projectsScanned, projectErrors };
  }

  /**
   * Find the project directory containing JSONL files for a given session ID.
   *
   * Searches all project directories for a file whose name matches
   * `<sessionId>.jsonl` or starts with `<sessionId>`.
   *
   * @param sessionId - The session identifier to locate.
   * @returns Absolute path to the project directory, or null if not found.
   */
  findProjectDirForSession(sessionId: string): string | null {
    const expanded = this.expandTilde(this.projectsBaseDir);

    let projectDirs: string[];
    try {
      const entries = fs.readdirSync(expanded, { withFileTypes: true });
      projectDirs = entries
        .filter((e) => e.isDirectory())
        .map((e) => path.join(expanded, e.name));
    } catch {
      return null;
    }

    for (const dir of projectDirs) {
      try {
        const files = fs.readdirSync(dir);
        const match = files.some(
          (f) => f === `${sessionId}.jsonl` || f.startsWith(sessionId),
        );
        if (match) {return dir;}
      } catch {
        // Skip unreadable directories
      }
    }

    return null;
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Private helpers
  // ───────────────────────────────────────────────────────────────────────────

  /**
   * Construct a JsonlFileInfo for a given file within a project directory.
   *
   * Returns null if the file cannot be stat'd (e.g. a dangling symlink).
   */
  private buildFileInfo(
    projectHash: string,
    filename: string,
    filePath: string,
  ): JsonlFileInfo | null {
    let sizeBytes: number;
    try {
      sizeBytes = fs.statSync(filePath).size;
    } catch {
      return null;
    }

    const sessionId = filename.replace(/\.jsonl$/, '');
    const { isSubagent, parentSessionId } = this.parseSessionIdMeta(sessionId);

    return { projectHash, sessionId, filePath, sizeBytes, isSubagent, parentSessionId };
  }

  /**
   * Determine whether a session ID belongs to a subagent and extract the
   * parent session ID if possible.
   *
   * Claude subagent JSONL files can follow naming patterns such as:
   *   - `<parent-uuid>.<suffix>` (dot-separated parent reference)
   *   - Standard UUID sessions are NOT subagents
   *
   * Without a definitive naming spec, we apply a conservative heuristic:
   * a session ID containing a dot separator after a UUID-length prefix is
   * treated as a potential subagent file.
   *
   * @param sessionId - The session ID (filename without extension).
   * @returns isSubagent flag and optional parentSessionId.
   */
  private parseSessionIdMeta(
    sessionId: string,
  ): { isSubagent: boolean; parentSessionId: string | null } {
    // UUID format: 8-4-4-4-12 hex chars with dashes (36 chars total)
    const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

    if (UUID_RE.test(sessionId)) {
      return { isSubagent: false, parentSessionId: null };
    }

    // Check for dot-separated format: <parent-uuid>.<suffix>
    const dotIdx = sessionId.indexOf('.');
    if (dotIdx > 0) {
      const prefix = sessionId.slice(0, dotIdx);
      if (UUID_RE.test(prefix)) {
        return { isSubagent: true, parentSessionId: prefix };
      }
    }

    return { isSubagent: false, parentSessionId: null };
  }

  /**
   * Expand a leading tilde in a path to the home directory.
   */
  private expandTilde(inputPath: string): string {
    if (inputPath.startsWith('~/') || inputPath === '~') {
      return path.join(homedir(), inputPath.slice(2));
    }
    return inputPath;
  }
}
