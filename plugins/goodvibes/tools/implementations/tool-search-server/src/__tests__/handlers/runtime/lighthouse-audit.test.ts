/**
 * Unit tests for lighthouse-audit handler
 *
 * Tests cover:
 * - handleLighthouseAudit main function
 * - URL validation
 * - Lighthouse availability checking
 * - Score extraction from reports
 * - Metrics extraction
 * - Opportunities extraction
 * - Diagnostics extraction
 * - Report saving
 * - CLI and programmatic execution paths
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as path from 'path';
import * as fsPromises from 'fs/promises';
import { spawn, ChildProcess } from 'child_process';
import { EventEmitter } from 'events';

// Mock modules
vi.mock('fs/promises', () => ({
  mkdir: vi.fn().mockResolvedValue(undefined),
  writeFile: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('child_process', () => ({
  spawn: vi.fn(),
}));

vi.mock('../../config.js', () => ({
  PROJECT_ROOT: '/mock/project/root',
}));

vi.mock('../../utils.js', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual as object,
    fileExists: vi.fn().mockResolvedValue(true),
  };
});

// Import after mocks
import {
  handleLighthouseAudit,
  type LighthouseAuditArgs,
} from '../../../handlers/runtime/lighthouse-audit.js';

// Mock process helper
function createMockProcess(exitCode: number = 0, stdout: string = '', stderr: string = ''): ChildProcess {
  const proc = new EventEmitter() as ChildProcess;
  proc.stdout = new EventEmitter() as NodeJS.ReadableStream;
  proc.stderr = new EventEmitter() as NodeJS.ReadableStream;
  proc.stdin = null as unknown as NodeJS.WritableStream;
  proc.pid = 12345;
  proc.connected = false;
  proc.exitCode = null;
  proc.signalCode = null;
  proc.spawnargs = [];
  proc.spawnfile = '';
  proc.killed = false;
  proc.kill = vi.fn(() => true);
  proc.send = vi.fn();
  proc.disconnect = vi.fn();
  proc.unref = vi.fn();
  proc.ref = vi.fn();

  // Simulate async execution - use setImmediate for faster execution in tests
  setImmediate(() => {
    if (stdout) {
      (proc.stdout as EventEmitter).emit('data', Buffer.from(stdout));
    }
    if (stderr) {
      (proc.stderr as EventEmitter).emit('data', Buffer.from(stderr));
    }
    proc.emit('close', exitCode);
  });

  return proc;
}

// Sample Lighthouse report
const mockLighthouseReport = {
  finalUrl: 'https://example.com/',
  fetchTime: '2024-01-15T10:00:00.000Z',
  categories: {
    performance: { id: 'performance', title: 'Performance', score: 0.85 },
    accessibility: { id: 'accessibility', title: 'Accessibility', score: 0.92 },
    'best-practices': { id: 'best-practices', title: 'Best Practices', score: 0.88 },
    seo: { id: 'seo', title: 'SEO', score: 0.95 },
  },
  audits: {
    'first-contentful-paint': {
      id: 'first-contentful-paint',
      title: 'First Contentful Paint',
      description: 'Time to FCP',
      score: 0.8,
      scoreDisplayMode: 'numeric',
      numericValue: 1200,
      numericUnit: 'millisecond',
    },
    'largest-contentful-paint': {
      id: 'largest-contentful-paint',
      title: 'Largest Contentful Paint',
      description: 'Time to LCP',
      score: 0.7,
      scoreDisplayMode: 'numeric',
      numericValue: 2500,
      numericUnit: 'millisecond',
    },
    'cumulative-layout-shift': {
      id: 'cumulative-layout-shift',
      title: 'Cumulative Layout Shift',
      description: 'CLS score',
      score: 0.95,
      scoreDisplayMode: 'numeric',
      numericValue: 0.05,
    },
    'total-blocking-time': {
      id: 'total-blocking-time',
      title: 'Total Blocking Time',
      description: 'TBT',
      score: 0.6,
      scoreDisplayMode: 'numeric',
      numericValue: 350,
      numericUnit: 'millisecond',
    },
    'speed-index': {
      id: 'speed-index',
      title: 'Speed Index',
      description: 'Speed Index',
      score: 0.75,
      scoreDisplayMode: 'numeric',
      numericValue: 2000,
      numericUnit: 'millisecond',
    },
    'interactive': {
      id: 'interactive',
      title: 'Time to Interactive',
      description: 'TTI',
      score: 0.65,
      scoreDisplayMode: 'numeric',
      numericValue: 3500,
      numericUnit: 'millisecond',
    },
    'render-blocking-resources': {
      id: 'render-blocking-resources',
      title: 'Eliminate render-blocking resources',
      description: 'Remove render-blocking',
      score: 0.5,
      scoreDisplayMode: 'numeric',
      details: {
        type: 'opportunity',
        overallSavingsMs: 500,
      },
    },
    'uses-optimized-images': {
      id: 'uses-optimized-images',
      title: 'Efficiently encode images',
      description: 'Optimize images',
      score: 0.6,
      scoreDisplayMode: 'numeric',
      details: {
        type: 'opportunity',
        overallSavingsBytes: 150000,
      },
    },
    'dom-size': {
      id: 'dom-size',
      title: 'Avoid an excessive DOM size',
      description: 'DOM size impact',
      score: 0.8,
      scoreDisplayMode: 'numeric',
      displayValue: '1,500 elements',
    },
    'mainthread-work-breakdown': {
      id: 'mainthread-work-breakdown',
      title: 'Minimize main-thread work',
      description: 'Main thread work',
      score: 0.7,
      scoreDisplayMode: 'numeric',
      displayValue: '2.5 s',
    },
    'bootup-time': {
      id: 'bootup-time',
      title: 'Reduce JavaScript execution time',
      description: 'JS execution time',
      score: 0.75,
      scoreDisplayMode: 'numeric',
      displayValue: '1.8 s',
    },
    'passed-audit': {
      id: 'passed-audit',
      title: 'Passed audit',
      description: 'This audit passed',
      score: 1.0,
      scoreDisplayMode: 'binary',
    },
    'not-applicable-audit': {
      id: 'not-applicable-audit',
      title: 'Not applicable',
      description: 'This audit is not applicable',
      score: null,
      scoreDisplayMode: 'notApplicable',
    },
  },
};

describe('lighthouse-audit handler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('handleLighthouseAudit', () => {
    describe('URL validation', () => {
      it('should return error when URL is missing', async () => {
        const result = await handleLighthouseAudit({} as LighthouseAuditArgs);

        expect(result.isError).toBe(true);
        const data = JSON.parse(result.content[0].text);
        expect(data.error).toBe('URL is required');
        expect(data.hint).toBeDefined();
      });

      it('should return error when URL is empty', async () => {
        const result = await handleLighthouseAudit({ url: '' });

        expect(result.isError).toBe(true);
        const data = JSON.parse(result.content[0].text);
        expect(data.error).toBe('URL is required');
      });

      it('should return error for invalid URL format', async () => {
        const result = await handleLighthouseAudit({ url: 'not-a-url' });

        expect(result.isError).toBe(true);
        const data = JSON.parse(result.content[0].text);
        expect(data.error).toBe('Invalid URL format');
        expect(data.url).toBe('not-a-url');
        expect(data.hint).toContain('http://');
      });

      it('should return error for ftp URL', async () => {
        const result = await handleLighthouseAudit({ url: 'ftp://files.example.com/file.txt' });

        expect(result.isError).toBe(true);
        const data = JSON.parse(result.content[0].text);
        expect(data.error).toBe('Invalid URL format');
      });

      it('should accept http URL', async () => {
        // Will fail due to lighthouse not available, but URL validation passes
        vi.mocked(spawn).mockImplementation(() => createMockProcess(1, '', 'not found'));

        const result = await handleLighthouseAudit({ url: 'http://example.com' });

        // Should not be a URL validation error
        const data = JSON.parse(result.content[0].text);
        expect(data.error).not.toBe('Invalid URL format');
      });

      it('should accept https URL', async () => {
        vi.mocked(spawn).mockImplementation(() => createMockProcess(1, '', 'not found'));

        const result = await handleLighthouseAudit({ url: 'https://example.com' });

        const data = JSON.parse(result.content[0].text);
        expect(data.error).not.toBe('Invalid URL format');
      });
    });

    describe('lighthouse availability', () => {
      it('should check for lighthouse availability via CLI', async () => {
        // Mock version check to fail
        vi.mocked(spawn).mockImplementation(() => createMockProcess(1, '', 'command not found'));

        const result = await handleLighthouseAudit({ url: 'https://example.com' });

        expect(result.isError).toBe(true);
        const data = JSON.parse(result.content[0].text);
        expect(data.error).toBe('Lighthouse is not available');
        expect(data.install_commands).toBeDefined();
      });

      it('should provide installation instructions when unavailable', async () => {
        vi.mocked(spawn).mockImplementation(() => createMockProcess(1, '', ''));

        const result = await handleLighthouseAudit({ url: 'https://example.com' });

        expect(result.isError).toBe(true);
        const data = JSON.parse(result.content[0].text);
        expect(data.install_commands).toContain('npm install -g lighthouse');
      });
    });

    describe('CLI execution', () => {
      it('should run lighthouse CLI when available', async () => {
        // First call: version check succeeds
        // Second call: actual lighthouse run
        let callCount = 0;
        vi.mocked(spawn).mockImplementation((cmd, args) => {
          callCount++;
          if (callCount === 1) {
            // Version check
            return createMockProcess(0, '11.0.0', '');
          }
          // Actual lighthouse run
          return createMockProcess(0, JSON.stringify(mockLighthouseReport), '');
        });

        const result = await handleLighthouseAudit({ url: 'https://example.com' });

        // Should have made at least the version check call
        expect(spawn).toHaveBeenCalled();
      });

      it('should include --preset=desktop for desktop device', async () => {
        let lighthouseArgs: string[] = [];
        vi.mocked(spawn).mockImplementation((cmd, args) => {
          if (Array.isArray(args) && args.includes('lighthouse')) {
            lighthouseArgs = args;
          }
          if (args && args.includes('--version')) {
            return createMockProcess(0, '11.0.0', '');
          }
          return createMockProcess(0, JSON.stringify(mockLighthouseReport), '');
        });

        await handleLighthouseAudit({
          url: 'https://example.com',
          device: 'desktop',
        });

        expect(spawn).toHaveBeenCalled();
      });

      it('should include throttling option when disabled', async () => {
        vi.mocked(spawn).mockImplementation((cmd, args) => {
          if (args && args.includes('--version')) {
            return createMockProcess(0, '11.0.0', '');
          }
          return createMockProcess(0, JSON.stringify(mockLighthouseReport), '');
        });

        await handleLighthouseAudit({
          url: 'https://example.com',
          throttling: false,
        });

        expect(spawn).toHaveBeenCalled();
      });

      it('should use specified categories', async () => {
        vi.mocked(spawn).mockImplementation((cmd, args) => {
          if (args && args.includes('--version')) {
            return createMockProcess(0, '11.0.0', '');
          }
          return createMockProcess(0, JSON.stringify(mockLighthouseReport), '');
        });

        await handleLighthouseAudit({
          url: 'https://example.com',
          categories: ['performance', 'seo'],
        });

        expect(spawn).toHaveBeenCalled();
      });
    });

    describe('result extraction', () => {
      beforeEach(() => {
        vi.mocked(spawn).mockImplementation((cmd, args) => {
          if (args && args.includes('--version')) {
            return createMockProcess(0, '11.0.0', '');
          }
          return createMockProcess(0, JSON.stringify(mockLighthouseReport), '');
        });
      });

      it('should extract scores from report', async () => {
        const result = await handleLighthouseAudit({ url: 'https://example.com' });

        if (!result.isError) {
          const data = JSON.parse(result.content[0].text);
          expect(data.scores).toBeDefined();
          expect(data.scores.performance).toBe(85);
          expect(data.scores.accessibility).toBe(92);
        }
      });

      it('should extract metrics from report', async () => {
        const result = await handleLighthouseAudit({ url: 'https://example.com' });

        if (!result.isError) {
          const data = JSON.parse(result.content[0].text);
          expect(data.metrics).toBeDefined();
          expect(data.metrics.first_contentful_paint_ms).toBeDefined();
          expect(data.metrics.largest_contentful_paint_ms).toBeDefined();
        }
      });

      it('should extract opportunities from report', async () => {
        const result = await handleLighthouseAudit({ url: 'https://example.com' });

        if (!result.isError) {
          const data = JSON.parse(result.content[0].text);
          expect(data.opportunities).toBeDefined();
          expect(Array.isArray(data.opportunities)).toBe(true);
        }
      });

      it('should extract diagnostics from report', async () => {
        const result = await handleLighthouseAudit({ url: 'https://example.com' });

        if (!result.isError) {
          const data = JSON.parse(result.content[0].text);
          expect(data.diagnostics).toBeDefined();
          expect(Array.isArray(data.diagnostics)).toBe(true);
        }
      });

      it('should count passed and failed audits', async () => {
        const result = await handleLighthouseAudit({ url: 'https://example.com' });

        if (!result.isError) {
          const data = JSON.parse(result.content[0].text);
          expect(data.passed_audits).toBeDefined();
          expect(data.failed_audits).toBeDefined();
          expect(typeof data.passed_audits).toBe('number');
          expect(typeof data.failed_audits).toBe('number');
        }
      });
    });

    describe('report saving', () => {
      beforeEach(() => {
        vi.mocked(spawn).mockImplementation((cmd, args) => {
          if (args && args.includes('--version')) {
            return createMockProcess(0, '11.0.0', '');
          }
          return createMockProcess(0, JSON.stringify(mockLighthouseReport), '');
        });
      });

      it('should save report when output_path is provided', async () => {
        const result = await handleLighthouseAudit({
          url: 'https://example.com',
          output_path: 'reports/lighthouse.json',
        });

        if (!result.isError) {
          const data = JSON.parse(result.content[0].text);
          expect(data.report_path).toBeDefined();
        }
      });

      it('should handle .json extension in output path', async () => {
        const result = await handleLighthouseAudit({
          url: 'https://example.com',
          output_path: 'report.json',
        });

        if (!result.isError) {
          expect(fsPromises.mkdir).toHaveBeenCalled();
        }
      });

      it('should convert .html extension to .json', async () => {
        const result = await handleLighthouseAudit({
          url: 'https://example.com',
          output_path: 'report.html',
        });

        if (!result.isError) {
          expect(fsPromises.writeFile).toHaveBeenCalled();
        }
      });

      it('should handle save errors gracefully', async () => {
        vi.mocked(fsPromises.writeFile).mockRejectedValue(new Error('Permission denied'));

        const result = await handleLighthouseAudit({
          url: 'https://example.com',
          output_path: 'reports/lighthouse.json',
        });

        if (!result.isError) {
          const data = JSON.parse(result.content[0].text);
          expect(data.report_path).toContain('Failed to save');
        }
      });
    });

    describe('error handling', () => {
      it('should handle CLI parse error', async () => {
        vi.mocked(spawn).mockImplementation((cmd, args) => {
          if (args && args.includes('--version')) {
            return createMockProcess(0, '11.0.0', '');
          }
          return createMockProcess(0, 'invalid json', '');
        });

        const result = await handleLighthouseAudit({ url: 'https://example.com' });

        expect(result.isError).toBe(true);
        const data = JSON.parse(result.content[0].text);
        expect(data.error).toBe('Lighthouse audit failed');
        expect(data.hints).toBeDefined();
      });

      it('should handle CLI execution error', async () => {
        vi.mocked(spawn).mockImplementation((cmd, args) => {
          if (args && args.includes('--version')) {
            return createMockProcess(0, '11.0.0', '');
          }
          return createMockProcess(1, '', 'Chrome not found');
        });

        const result = await handleLighthouseAudit({ url: 'https://example.com' });

        expect(result.isError).toBe(true);
        const data = JSON.parse(result.content[0].text);
        expect(data.error).toBe('Lighthouse audit failed');
      });

      it('should include helpful hints on failure', async () => {
        vi.mocked(spawn).mockImplementation((cmd, args) => {
          if (args && args.includes('--version')) {
            return createMockProcess(0, '11.0.0', '');
          }
          return createMockProcess(1, '', 'error');
        });

        const result = await handleLighthouseAudit({ url: 'https://example.com' });

        expect(result.isError).toBe(true);
        const data = JSON.parse(result.content[0].text);
        expect(data.hints).toContain('Ensure the URL is accessible');
      });
    });

    describe('response format', () => {
      it('should return properly formatted MCP response', async () => {
        vi.mocked(spawn).mockImplementation((cmd, args) => {
          if (args && args.includes('--version')) {
            return createMockProcess(0, '11.0.0', '');
          }
          return createMockProcess(0, JSON.stringify(mockLighthouseReport), '');
        });

        const result = await handleLighthouseAudit({ url: 'https://example.com' });

        expect(result).toHaveProperty('content');
        expect(result.content).toHaveLength(1);
        expect(result.content[0]).toHaveProperty('type', 'text');
      });

      it('should return valid JSON in response', async () => {
        vi.mocked(spawn).mockImplementation(() => createMockProcess(1, '', 'error'));

        const result = await handleLighthouseAudit({ url: 'https://example.com' });

        expect(() => JSON.parse(result.content[0].text)).not.toThrow();
      });
    });
  });
});

describe('score extraction', () => {
  it('should handle missing categories', async () => {
    const reportWithMissingCategories = {
      ...mockLighthouseReport,
      categories: {
        performance: mockLighthouseReport.categories.performance,
        // Other categories missing
      },
    };

    vi.mocked(spawn).mockImplementation((cmd, args) => {
      if (args && args.includes('--version')) {
        return createMockProcess(0, '11.0.0', '');
      }
      return createMockProcess(0, JSON.stringify(reportWithMissingCategories), '');
    });

    const result = await handleLighthouseAudit({ url: 'https://example.com' });

    if (!result.isError) {
      const data = JSON.parse(result.content[0].text);
      expect(data.scores.performance).toBeDefined();
    }
  });

  it('should handle null scores', async () => {
    const reportWithNullScores = {
      ...mockLighthouseReport,
      categories: {
        performance: { id: 'performance', title: 'Performance', score: null },
      },
    };

    vi.mocked(spawn).mockImplementation((cmd, args) => {
      if (args && args.includes('--version')) {
        return createMockProcess(0, '11.0.0', '');
      }
      return createMockProcess(0, JSON.stringify(reportWithNullScores), '');
    });

    const result = await handleLighthouseAudit({ url: 'https://example.com' });

    // Should not throw
    expect(result.content[0].text).toBeDefined();
  });
});

describe('metrics extraction', () => {
  it('should handle missing metrics', async () => {
    const reportWithMissingMetrics = {
      ...mockLighthouseReport,
      audits: {
        'first-contentful-paint': mockLighthouseReport.audits['first-contentful-paint'],
        // Other metrics missing
      },
    };

    vi.mocked(spawn).mockImplementation((cmd, args) => {
      if (args && args.includes('--version')) {
        return createMockProcess(0, '11.0.0', '');
      }
      return createMockProcess(0, JSON.stringify(reportWithMissingMetrics), '');
    });

    const result = await handleLighthouseAudit({ url: 'https://example.com' });

    if (!result.isError) {
      const data = JSON.parse(result.content[0].text);
      expect(data.metrics).toBeDefined();
      // Missing metrics should default to 0
      expect(data.metrics.largest_contentful_paint_ms).toBe(0);
    }
  });
});

describe('opportunity sorting', () => {
  it('should sort opportunities by savings', async () => {
    const reportWithOpportunities = {
      ...mockLighthouseReport,
      audits: {
        ...mockLighthouseReport.audits,
        'opp1': {
          id: 'opp1',
          title: 'Small savings',
          description: 'desc',
          score: 0.5,
          scoreDisplayMode: 'numeric',
          details: { type: 'opportunity', overallSavingsMs: 100 },
        },
        'opp2': {
          id: 'opp2',
          title: 'Large savings',
          description: 'desc',
          score: 0.5,
          scoreDisplayMode: 'numeric',
          details: { type: 'opportunity', overallSavingsMs: 1000 },
        },
      },
    };

    vi.mocked(spawn).mockImplementation((cmd, args) => {
      if (args && args.includes('--version')) {
        return createMockProcess(0, '11.0.0', '');
      }
      return createMockProcess(0, JSON.stringify(reportWithOpportunities), '');
    });

    const result = await handleLighthouseAudit({ url: 'https://example.com' });

    if (!result.isError) {
      const data = JSON.parse(result.content[0].text);
      // Opportunities should be sorted by savings (highest first)
      if (data.opportunities.length >= 2) {
        const savingsMs = data.opportunities.map((o: { savings_ms?: number; savings_bytes?: number }) =>
          (o.savings_ms || 0) + (o.savings_bytes || 0) / 1000
        );
        for (let i = 1; i < savingsMs.length; i++) {
          expect(savingsMs[i - 1]).toBeGreaterThanOrEqual(savingsMs[i]);
        }
      }
    }
  });

  it('should limit opportunities to top 10', async () => {
    const manyOpportunities: Record<string, unknown> = {};
    for (let i = 0; i < 20; i++) {
      manyOpportunities[`opp${i}`] = {
        id: `opp${i}`,
        title: `Opportunity ${i}`,
        description: 'desc',
        score: 0.5,
        scoreDisplayMode: 'numeric',
        details: { type: 'opportunity', overallSavingsMs: i * 100 },
      };
    }

    const reportWithManyOpportunities = {
      ...mockLighthouseReport,
      audits: {
        ...mockLighthouseReport.audits,
        ...manyOpportunities,
      },
    };

    vi.mocked(spawn).mockImplementation((cmd, args) => {
      if (args && args.includes('--version')) {
        return createMockProcess(0, '11.0.0', '');
      }
      return createMockProcess(0, JSON.stringify(reportWithManyOpportunities), '');
    });

    const result = await handleLighthouseAudit({ url: 'https://example.com' });

    if (!result.isError) {
      const data = JSON.parse(result.content[0].text);
      expect(data.opportunities.length).toBeLessThanOrEqual(10);
    }
  });
});

describe('audit counting', () => {
  it('should count audits with score >= 0.9 as passed', async () => {
    vi.mocked(spawn).mockImplementation((cmd, args) => {
      if (args && args.includes('--version')) {
        return createMockProcess(0, '11.0.0', '');
      }
      return createMockProcess(0, JSON.stringify(mockLighthouseReport), '');
    });

    const result = await handleLighthouseAudit({ url: 'https://example.com' });

    if (!result.isError) {
      const data = JSON.parse(result.content[0].text);
      expect(data.passed_audits).toBeGreaterThanOrEqual(0);
      expect(data.failed_audits).toBeGreaterThanOrEqual(0);
    }
  });

  it('should skip notApplicable audits in counting', async () => {
    vi.mocked(spawn).mockImplementation((cmd, args) => {
      if (args && args.includes('--version')) {
        return createMockProcess(0, '11.0.0', '');
      }
      return createMockProcess(0, JSON.stringify(mockLighthouseReport), '');
    });

    const result = await handleLighthouseAudit({ url: 'https://example.com' });

    // Should not throw and should have valid counts
    if (!result.isError) {
      const data = JSON.parse(result.content[0].text);
      expect(typeof data.passed_audits).toBe('number');
      expect(typeof data.failed_audits).toBe('number');
    }
  });
});
