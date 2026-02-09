import * as fs from 'fs/promises';
import * as path from 'path';
import { getExecOverflowDir } from '../runtime-config.js';

/**
 * Result structure returned when command output exceeds the threshold.
 * Contains truncated preview (head + tail) and reference to full output file.
 */
export interface OverflowResult {
  /** Status indicator - always 'overflow' */
  status: 'overflow';
  /** First half of output up to threshold/2 characters */
  head: string;
  /** Last half of output from threshold/2 characters before end */
  tail: string;
  /** Total character count of original output */
  total_chars: number;
  /** Total line count of original output */
  total_lines: number;
  /** Absolute path to file containing full output */
  overflow_file: string;
  /** Human-readable hint for accessing the full output */
  hint: string;
}

/**
 * Write full output to overflow file when it exceeds the threshold.
 * Returns head + tail + file path for the agent.
 * 
 * @param output - Full command output that exceeded the threshold
 * @param commandId - Unique identifier for the command (used in filename)
 * @param threshold - Character threshold that was exceeded
 * @returns Object containing head/tail preview and path to full output file
 */
export async function handleOverflow(
  output: string,
  commandId: string,
  threshold: number
): Promise<OverflowResult> {
  const overflowDir = path.resolve(process.cwd(), getExecOverflowDir());
  
  // Ensure overflow directory exists
  await fs.mkdir(overflowDir, { recursive: true });
  
  // Generate overflow file path with sanitized commandId to prevent path traversal
  const safeId = commandId.replace(/[^a-zA-Z0-9_-]/g, '_');
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const fileName = `${safeId}-${timestamp}.log`;
  const filePath = path.join(overflowDir, fileName);
  
  // Verify resolved path is within overflow directory (defense in depth)
  const resolvedPath = path.resolve(filePath);
  const resolvedDir = path.resolve(overflowDir);
  if (!resolvedPath.startsWith(resolvedDir + path.sep)) {
    throw new Error(`Path traversal detected: ${filePath}`);
  }
  
  // Write full output to file
  await fs.writeFile(filePath, output, 'utf-8');
  
  // Calculate head and tail
  const halfThreshold = Math.floor(threshold / 2);
  const head = output.slice(0, halfThreshold);
  const tail = output.slice(-halfThreshold);
  
  // Count lines by counting newline characters
  // Works correctly for both LF (\n) and CRLF (\r\n) since each line break contains exactly one \n
  let totalLines = 0;
  if (output.length === 0) {
    totalLines = 0;
  } else {
    // Start with 1 line, then add for each newline
    totalLines = 1;
    // Manual iteration avoids allocating a split() array for potentially large outputs
    for (let i = 0; i < output.length; i++) {
      // Count each \n character
      if (output[i] === '\n') {
        totalLines++;
      }
    }
    // If content ends with newline, subtract 1 (trailing empty line)
    if (output[output.length - 1] === '\n') {
      totalLines--;
    }
  }
  
  return {
    status: 'overflow',
    head,
    tail,
    total_chars: output.length,
    total_lines: totalLines,
    overflow_file: filePath,
    hint: `Full output saved to ${filePath}. Use precision_read to access.`,
  };
}

/** Default maximum age in milliseconds for overflow file cleanup (1 hour). */
const DEFAULT_OVERFLOW_MAX_AGE_MS = 3_600_000;

/**
 * Clean up overflow files older than maxAge.
 * Called at the start of each exec to prevent disk fill.
 * 
 * @param maxAgeMs - Maximum age in milliseconds before cleanup (default: 1 hour)
 * @returns Number of files successfully deleted
 */
export async function cleanupOverflowFiles(maxAgeMs: number = DEFAULT_OVERFLOW_MAX_AGE_MS): Promise<number> {
  const overflowDir = path.resolve(process.cwd(), getExecOverflowDir());
  let cleaned = 0;
  
  try {
    const entries = await fs.readdir(overflowDir);
    const now = Date.now();
    
    for (const entry of entries) {
      const filePath = path.join(overflowDir, entry);

      // Defense in depth: verify resolved path is within overflow directory
      const resolvedFilePath = path.resolve(filePath);
      if (!resolvedFilePath.startsWith(path.resolve(overflowDir) + path.sep)) {
        continue; // Skip entries with suspicious path-traversal names
      }
      try {
        const stats = await fs.stat(filePath);
        if (now - stats.mtimeMs > maxAgeMs) {
          await fs.unlink(filePath);
          cleaned++;
        }
      } catch (err: unknown) {
        // Skip files that can't be stat'd or deleted (permissions, concurrent deletion, etc.)
        // This is expected and non-critical, so we continue silently
      }
    }
  } catch (err: unknown) {
    // Directory doesn't exist yet (ENOENT) — nothing to clean
    // Permission errors (EACCES) are also non-critical here
  }
  
  return cleaned;
}
