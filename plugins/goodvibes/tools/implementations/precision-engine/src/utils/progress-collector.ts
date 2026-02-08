/**
 * Progress reporting for long-running commands.
 * Supports two tiers:
 * - Tier 1: Inline milestones captured during command execution
 * - Tier 2: Live progress file written to disk for polling
 */

import { createWriteStream, WriteStream } from 'fs';
import { join } from 'path';
import { mkdirSync } from 'fs';

export interface ProgressMilestone {
  at_ms: number;    // milliseconds since command start
  line: string;     // first non-empty line after silence gap
}

export interface ProgressConfig {
  enabled: boolean;           // Tier 1: collect inline milestones
  progress_file: boolean;     // Tier 2: write to pollable file
  silence_gap_ms: number;     // Min gap to trigger milestone (default: 2000)
  max_milestones: number;     // Cap (default: 20)
}

export interface ProgressCollector {
  onData(chunk: string): void;
  finalize(totalDurationMs: number): ProgressMilestone[];
  getProgressFilePath(): string | undefined;
  dispose(): void;
}

/**
 * Create a progress collector for a command.
 * @param config - Progress configuration
 * @param commandId - Unique command identifier
 * @param overflowDir - Directory for overflow files (e.g., .goodvibes/.exec-output)
 * @returns Progress collector instance
 */
export function createProgressCollector(
  config: ProgressConfig,
  commandId: string,
  overflowDir: string
): ProgressCollector {
  const startTime = Date.now();
  let lastDataTimestamp = startTime;
  const milestones: ProgressMilestone[] = [];
  let firstLine: string | undefined;
  let lastLine: string | undefined;
  let writeStream: WriteStream | undefined;
  let progressFilePath: string | undefined;

  // Tier 2: Initialize progress file if enabled
  if (config.progress_file) {
    try {
      // Ensure directory exists
      mkdirSync(overflowDir, { recursive: true });
      
      // Create unique filename
      const safeId = commandId.replace(/[^a-zA-Z0-9_-]/g, '_');
      const timestamp = Date.now();
      progressFilePath = join(overflowDir, `progress-${safeId}-${timestamp}.log`);
      
      // Open write stream in append mode
      writeStream = createWriteStream(progressFilePath, { flags: 'a' });
      writeStream.on('error', () => {
        // Silently degrade - progress file is optional
        writeStream = undefined;
      });
    } catch (error) {
      // Fail silently - progress file is optional
      console.warn(`Failed to create progress file: ${(error as Error).message}`);
    }
  }

  return {
    onData(chunk: string): void {
      const now = Date.now();
      const elapsedSinceStart = now - startTime;
      const gapSinceLastData = now - lastDataTimestamp;

      // Extract first non-empty line from chunk
      const lines = chunk.split('\n').map(l => l.trim()).filter(l => l.length > 0);
      const firstNonEmpty = lines[0];
      const lastNonEmpty = lines[lines.length - 1];

      if (firstNonEmpty) {
        // Capture first line ever seen
        if (!firstLine) {
          firstLine = firstNonEmpty;
        }
        
        // Always update last line to actual last non-empty line
        lastLine = lastNonEmpty ?? firstNonEmpty;

        // Tier 1: Capture milestone if gap is large enough
        if (config.enabled && 
            gapSinceLastData >= config.silence_gap_ms && 
            milestones.length < config.max_milestones) {
          milestones.push({
            at_ms: elapsedSinceStart,
            line: firstNonEmpty,
          });
        }
      }

      // Tier 2: Write timestamped line to progress file
      if (writeStream && firstNonEmpty) {
        writeStream.write(`[${elapsedSinceStart}ms] ${firstNonEmpty}\n`);
      }

      lastDataTimestamp = now;
    },

    finalize(totalDurationMs: number): ProgressMilestone[] {
      const result: ProgressMilestone[] = [];

      // Always include first line at 0ms
      if (firstLine) {
        result.push({ at_ms: 0, line: firstLine });
      }

      // Add intermediate milestones (skip duplicates)
      for (const milestone of milestones) {
        // Skip if same as first line
        if (milestone.at_ms === 0 || milestone.line === firstLine) {
          continue;
        }
        // Skip if same as last line
        if (milestone.line === lastLine) {
          continue;
        }
        result.push(milestone);
      }

      // Always include last line at completion (if different from first)
      if (lastLine && lastLine !== firstLine) {
        result.push({ at_ms: totalDurationMs, line: lastLine });
      }

      return result;
    },

    getProgressFilePath(): string | undefined {
      return progressFilePath;
    },

    dispose(): void {
      // Close write stream but don't delete file
      // Agent may still poll, GC handles cleanup
      if (writeStream) {
        writeStream.end();
        writeStream = undefined;
      }
    },
  };
}
