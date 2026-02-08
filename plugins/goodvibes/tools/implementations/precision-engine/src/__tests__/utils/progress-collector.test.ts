/**
 * Tests for progress-collector module.
 * 
 * The progress collector provides two-tier progress reporting for long-running commands:
 * - Tier 1: Inline milestones captured during command execution
 * - Tier 2: Live progress file written to disk for polling
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createProgressCollector, type ProgressConfig, type ProgressCollector } from '../../utils/progress-collector.js';
import * as fs from 'fs/promises';
import * as path from 'path';

// Test fixture directory
const TEST_DIR = path.join(process.cwd(), '.goodvibes-test-progress');

describe('progress-collector', () => {
  let collector: ProgressCollector | undefined;

  beforeEach(async () => {
    // Ensure test directory exists
    await fs.mkdir(TEST_DIR, { recursive: true });
  });

  afterEach(async () => {
    // Clean up collector
    if (collector) {
      collector.dispose();
      collector = undefined;
    }

    // Clean up test directory
    try {
      await fs.rm(TEST_DIR, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe('createProgressCollector', () => {
    it('should create a progress collector instance', () => {
      const config: ProgressConfig = {
        enabled: true,
        progress_file: false,
        silence_gap_ms: 2000,
        max_milestones: 20,
      };

      collector = createProgressCollector(config, 'test-cmd-1', TEST_DIR);

      expect(collector).toBeDefined();
      expect(typeof collector.onData).toBe('function');
      expect(typeof collector.finalize).toBe('function');
      expect(typeof collector.getProgressFilePath).toBe('function');
      expect(typeof collector.dispose).toBe('function');
    });

    it('should return undefined progress file path when progress_file is false', () => {
      const config: ProgressConfig = {
        enabled: true,
        progress_file: false,
        silence_gap_ms: 2000,
        max_milestones: 20,
      };

      collector = createProgressCollector(config, 'test-cmd-2', TEST_DIR);

      expect(collector.getProgressFilePath()).toBeUndefined();
    });

    it('should create progress file when progress_file is true', () => {
      const config: ProgressConfig = {
        enabled: true,
        progress_file: true,
        silence_gap_ms: 2000,
        max_milestones: 20,
      };

      collector = createProgressCollector(config, 'test-cmd-3', TEST_DIR);

      const progressFilePath = collector.getProgressFilePath();
      expect(progressFilePath).toBeDefined();
      expect(progressFilePath).toContain('.goodvibes-test-progress');
      expect(progressFilePath).toContain('progress-');
    });
  });

  describe('onData', () => {
    it('should accept data chunks without throwing', () => {
      const config: ProgressConfig = {
        enabled: true,
        progress_file: false,
        silence_gap_ms: 2000,
        max_milestones: 20,
      };

      collector = createProgressCollector(config, 'test-cmd-4', TEST_DIR);

      expect(() => {
        collector!.onData('Line 1\n');
        collector!.onData('Line 2\n');
        collector!.onData('Line 3\n');
      }).not.toThrow();
    });

    it('should handle empty chunks', () => {
      const config: ProgressConfig = {
        enabled: true,
        progress_file: false,
        silence_gap_ms: 2000,
        max_milestones: 20,
      };

      collector = createProgressCollector(config, 'test-cmd-5', TEST_DIR);

      expect(() => {
        collector!.onData('');
        collector!.onData('\n');
        collector!.onData('   \n   ');
      }).not.toThrow();
    });

    it('should handle multiline chunks', () => {
      const config: ProgressConfig = {
        enabled: true,
        progress_file: false,
        silence_gap_ms: 2000,
        max_milestones: 20,
      };

      collector = createProgressCollector(config, 'test-cmd-6', TEST_DIR);

      expect(() => {
        collector!.onData('Line 1\nLine 2\nLine 3\n');
      }).not.toThrow();
    });
  });

  describe('finalize', () => {
    it('should return empty array when no data was provided', () => {
      const config: ProgressConfig = {
        enabled: true,
        progress_file: false,
        silence_gap_ms: 2000,
        max_milestones: 20,
      };

      collector = createProgressCollector(config, 'test-cmd-7', TEST_DIR);

      const milestones = collector.finalize(1000);

      expect(milestones).toEqual([]);
    });

    it('should return first line at 0ms when data was provided', () => {
      const config: ProgressConfig = {
        enabled: true,
        progress_file: false,
        silence_gap_ms: 2000,
        max_milestones: 20,
      };

      collector = createProgressCollector(config, 'test-cmd-8', TEST_DIR);
      collector.onData('First line\n');

      const milestones = collector.finalize(1000);

      expect(milestones).toHaveLength(1);
      expect(milestones[0]).toEqual({
        at_ms: 0,
        line: 'First line',
      });
    });

    it('should return first and last lines when they differ', () => {
      const config: ProgressConfig = {
        enabled: true,
        progress_file: false,
        silence_gap_ms: 2000,
        max_milestones: 20,
      };

      collector = createProgressCollector(config, 'test-cmd-9', TEST_DIR);
      collector.onData('First line\n');
      collector.onData('Last line\n');

      const milestones = collector.finalize(5000);

      expect(milestones.length).toBeGreaterThanOrEqual(2);
      expect(milestones[0]).toEqual({
        at_ms: 0,
        line: 'First line',
      });
      expect(milestones[milestones.length - 1]).toEqual({
        at_ms: 5000,
        line: 'Last line',
      });
    });

    it('should not duplicate first line if same as last line', () => {
      const config: ProgressConfig = {
        enabled: true,
        progress_file: false,
        silence_gap_ms: 2000,
        max_milestones: 20,
      };

      collector = createProgressCollector(config, 'test-cmd-10', TEST_DIR);
      collector.onData('Same line\n');

      const milestones = collector.finalize(1000);

      expect(milestones).toHaveLength(1);
      expect(milestones[0]).toEqual({
        at_ms: 0,
        line: 'Same line',
      });
    });
  });

  describe('getProgressFilePath', () => {
    it('should return undefined when progress_file is disabled', () => {
      const config: ProgressConfig = {
        enabled: true,
        progress_file: false,
        silence_gap_ms: 2000,
        max_milestones: 20,
      };

      collector = createProgressCollector(config, 'test-cmd-11', TEST_DIR);

      expect(collector.getProgressFilePath()).toBeUndefined();
    });

    it('should return file path when progress_file is enabled', () => {
      const config: ProgressConfig = {
        enabled: true,
        progress_file: true,
        silence_gap_ms: 2000,
        max_milestones: 20,
      };

      collector = createProgressCollector(config, 'test-cmd-12', TEST_DIR);

      const filePath = collector.getProgressFilePath();
      expect(filePath).toBeDefined();
      expect(filePath).toContain(TEST_DIR);
    });
  });

  describe('dispose', () => {
    it('should close write stream without errors', () => {
      const config: ProgressConfig = {
        enabled: true,
        progress_file: true,
        silence_gap_ms: 2000,
        max_milestones: 20,
      };

      collector = createProgressCollector(config, 'test-cmd-13', TEST_DIR);

      expect(() => {
        collector!.dispose();
      }).not.toThrow();
    });

    it('should be safe to call dispose multiple times', () => {
      const config: ProgressConfig = {
        enabled: true,
        progress_file: true,
        silence_gap_ms: 2000,
        max_milestones: 20,
      };

      collector = createProgressCollector(config, 'test-cmd-14', TEST_DIR);

      expect(() => {
        collector!.dispose();
        collector!.dispose();
        collector!.dispose();
      }).not.toThrow();
    });
  });

  describe('edge cases', () => {
    it('should handle collector with disabled tier 1', () => {
      const config: ProgressConfig = {
        enabled: false,  // Tier 1 disabled
        progress_file: false,
        silence_gap_ms: 2000,
        max_milestones: 20,
      };

      collector = createProgressCollector(config, 'test-cmd-15', TEST_DIR);
      collector.onData('Line 1\n');
      collector.onData('Line 2\n');

      const milestones = collector.finalize(5000);

      // Should still capture first and last lines
      expect(milestones.length).toBeGreaterThanOrEqual(1);
      expect(milestones[0].line).toBe('Line 1');
    });

    it('should handle very long command IDs safely', () => {
      const config: ProgressConfig = {
        enabled: true,
        progress_file: true,
        silence_gap_ms: 2000,
        max_milestones: 20,
      };

      const longId = 'a'.repeat(500) + '/' + 'b'.repeat(500);
      collector = createProgressCollector(config, longId, TEST_DIR);

      const filePath = collector.getProgressFilePath();
      expect(filePath).toBeDefined();
      // Should sanitize the ID for file system safety - check filename only
      const filename = filePath!.split('/').pop()!;
      expect(filename).toContain('progress-');
      // The slash in the long ID should be replaced with underscore
      expect(filename).not.toContain('a'.repeat(500) + '/' + 'b'.repeat(500));
    });

    it('should trim whitespace from output lines', () => {
      const config: ProgressConfig = {
        enabled: true,
        progress_file: false,
        silence_gap_ms: 2000,
        max_milestones: 20,
      };

      collector = createProgressCollector(config, 'test-cmd-16', TEST_DIR);
      collector.onData('  Line with spaces  \n');

      const milestones = collector.finalize(1000);

      expect(milestones[0].line).toBe('Line with spaces');
    });

    it('should handle multiple entries with correct milestone tracking', async () => {
      const config: ProgressConfig = {
        enabled: true,
        progress_file: false,
        silence_gap_ms: 100,  // Short gap for testing
        max_milestones: 20,
      };

      collector = createProgressCollector(config, 'test-cmd-17', TEST_DIR);
      
      // Add first line
      collector.onData('First\n');
      
      // Wait to exceed silence gap
      await new Promise(resolve => setTimeout(resolve, 150));
      
      // Add second line (should be a milestone)
      collector.onData('Second\n');
      
      // Wait again
      await new Promise(resolve => setTimeout(resolve, 150));
      
      // Add third line (should be a milestone)
      collector.onData('Third\n');

      const milestones = collector.finalize(500);

      // Should have at least first and last
      expect(milestones.length).toBeGreaterThanOrEqual(2);
      expect(milestones[0].line).toBe('First');
      expect(milestones[milestones.length - 1].line).toBe('Third');
    });
  });

  describe('integration with precision_exec', () => {
    it('should be compatible with precision_exec expected data flow', () => {
      // This test validates the interface contract between progress-collector and precision_exec
      const config: ProgressConfig = {
        enabled: true,
        progress_file: true,
        silence_gap_ms: 2000,
        max_milestones: 20,
      };

      // Simulate precision_exec creating a collector
      collector = createProgressCollector(config, 'npm-install', TEST_DIR);

      // Simulate receiving command output chunks
      collector.onData('npm WARN deprecated package@1.0.0\n');
      collector.onData('added 150 packages in 5s\n');

      // Simulate command completion
      const totalDuration = 5234;
      const milestones = collector.finalize(totalDuration);

      // Verify interface contract
      expect(Array.isArray(milestones)).toBe(true);
      expect(milestones.length).toBeGreaterThan(0);
      
      // Verify milestone structure matches CommandResult.progress type
      milestones.forEach(milestone => {
        expect(milestone).toHaveProperty('at_ms');
        expect(milestone).toHaveProperty('line');
        expect(typeof milestone.at_ms).toBe('number');
        expect(typeof milestone.line).toBe('string');
      });

      // Verify progress file path is available for Tier 2
      const progressFile = collector.getProgressFilePath();
      expect(typeof progressFile).toBe('string');

      // Clean up
      collector.dispose();
    });
  });
});
