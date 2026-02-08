import * as fs from 'fs/promises';
import * as path from 'path';
import { getExecOverflowDir } from '../runtime-config.js';

export interface OverflowResult {
  status: 'overflow';
  head: string;
  tail: string;
  total_chars: number;
  total_lines: number;
  overflow_file: string;
  hint: string;
}

/**
 * Write full output to overflow file when it exceeds the threshold.
 * Returns head + tail + file path for the agent.
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
  
  // Write full output to file
  await fs.writeFile(filePath, output, 'utf-8');
  
  // Calculate head and tail
  const halfThreshold = Math.floor(threshold / 2);
  const head = output.slice(0, halfThreshold);
  const tail = output.slice(-halfThreshold);
  // Efficiently count lines without splitting the entire string
  let totalLines = 1;
  for (let i = 0; i < output.length; i++) {
    if (output[i] === '\n') totalLines++;
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

/**
 * Clean up overflow files older than maxAge.
 * Called at the start of each exec to prevent disk fill.
 */
export async function cleanupOverflowFiles(maxAgeMs: number = 3600000): Promise<number> {
  const overflowDir = path.resolve(process.cwd(), getExecOverflowDir());
  let cleaned = 0;
  
  try {
    const entries = await fs.readdir(overflowDir);
    const now = Date.now();
    
    for (const entry of entries) {
      const filePath = path.join(overflowDir, entry);
      try {
        const stats = await fs.stat(filePath);
        if (now - stats.mtimeMs > maxAgeMs) {
          await fs.unlink(filePath);
          cleaned++;
        }
      } catch {
        // Skip files that can't be stat'd
      }
    }
  } catch {
    // Directory doesn't exist yet — nothing to clean
  }
  
  return cleaned;
}
