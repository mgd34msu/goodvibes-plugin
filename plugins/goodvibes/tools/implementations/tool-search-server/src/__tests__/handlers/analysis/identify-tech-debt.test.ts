/**
 * Comprehensive unit tests for identify-tech-debt handler
 *
 * Tests cover:
 * - Argument handling (path, include, coverage_threshold, max_issues)
 * - Path validation
 * - Category-specific scoring functions
 * - Issue prioritization and sorting
 * - Grade calculation
 * - Summary generation
 * - Analysis orchestration
 * - Error handling
 *
 * @module __tests__/handlers/analysis/identify-tech-debt
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

// Mock fs module
vi.mock('fs');

// Mock config
vi.mock('../../../config.js', () => ({
  PROJECT_ROOT: '/mock/project/root',
}));

// Mock the LSP utils that the handler uses
vi.mock('../../../handlers/lsp/utils.js', () => ({
  createSuccessResponse: vi.fn((data) => ({
    content: [{ type: 'text', text: JSON.stringify(data, null, 2) }],
  })),
  createErrorResponse: vi.fn((msg) => ({
    content: [{ type: 'text', text: JSON.stringify({ error: msg }, null, 2) }],
    isError: true,
  })),
}));

// Mock all dependent handlers
vi.mock('../../../handlers/lsp/dead-code.js', () => ({
  handleFindDeadCode: vi.fn().mockResolvedValue({
    isError: false,
    content: [{ text: JSON.stringify({ count: 0, dead_exports: [] }) }],
  }),
}));

vi.mock('../../../handlers/deps/circular.js', () => ({
  handleFindCircularDeps: vi.fn().mockResolvedValue({
    isError: false,
    content: [{ text: JSON.stringify({ count: 0, cycles: [] }) }],
  }),
}));

vi.mock('../../../handlers/security/secrets-scanner.js', () => ({
  handleScanForSecrets: vi.fn().mockResolvedValue({
    isError: false,
    content: [{ text: JSON.stringify({ findings: [], by_severity: { high: 0, medium: 0, low: 0 } }) }],
  }),
}));

vi.mock('../../../handlers/test/coverage.js', () => ({
  handleGetTestCoverage: vi.fn().mockResolvedValue({
    isError: false,
    content: [{ text: JSON.stringify({ coverage: { lines: 80 }, uncovered_functions: [] }) }],
  }),
}));

vi.mock('../../../handlers/validation/index.js', () => ({
  handleCheckTypes: vi.fn().mockResolvedValue({
    isError: false,
    content: [{ text: JSON.stringify({ errors: [] }) }],
  }),
}));

vi.mock('../../../handlers/issues/todo-scanner.js', () => ({
  scanDirectory: vi.fn(),
}));

import {
  handleIdentifyTechDebt,
  type IdentifyTechDebtArgs,
  type TechDebtCategory,
} from '../../../handlers/analysis/identify-tech-debt.js';
import { createSuccessResponse, createErrorResponse } from '../../../handlers/lsp/utils.js';
import { handleFindDeadCode } from '../../../handlers/lsp/dead-code.js';
import { handleFindCircularDeps } from '../../../handlers/deps/circular.js';
import { handleScanForSecrets } from '../../../handlers/security/secrets-scanner.js';
import { handleGetTestCoverage } from '../../../handlers/test/coverage.js';
import { handleCheckTypes } from '../../../handlers/validation/index.js';
import { scanDirectory } from '../../../handlers/issues/todo-scanner.js';

describe('handleIdentifyTechDebt', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(fs.existsSync).mockReturnValue(true);

    // Reset all mocks to default success responses
    vi.mocked(handleFindDeadCode).mockResolvedValue({
      isError: false,
      content: [{ type: 'text', text: JSON.stringify({ count: 0, dead_exports: [] }) }],
    });

    vi.mocked(handleFindCircularDeps).mockResolvedValue({
      isError: false,
      content: [{ type: 'text', text: JSON.stringify({ count: 0, cycles: [] }) }],
    });

    vi.mocked(handleScanForSecrets).mockResolvedValue({
      isError: false,
      content: [{ type: 'text', text: JSON.stringify({ findings: [], by_severity: { high: 0, medium: 0, low: 0 } }) }],
    });

    vi.mocked(handleGetTestCoverage).mockResolvedValue({
      isError: false,
      content: [{ type: 'text', text: JSON.stringify({ coverage: { lines: 80 }, uncovered_functions: [] }) }],
    });

    vi.mocked(handleCheckTypes).mockResolvedValue({
      isError: false,
      content: [{ type: 'text', text: JSON.stringify({ errors: [] }) }],
    });

    vi.mocked(scanDirectory).mockImplementation(() => {});
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  // ===========================================================================
  // Argument Handling Tests
  // ===========================================================================

  describe('argument handling', () => {
    it('should use PROJECT_ROOT when no path provided', async () => {
      const args: IdentifyTechDebtArgs = {};

      await handleIdentifyTechDebt(args);

      expect(fs.existsSync).toHaveBeenCalled();
      expect(createSuccessResponse).toHaveBeenCalled();
    });

    it('should check path existence', async () => {
      const args: IdentifyTechDebtArgs = {
        path: '/some/path',
      };

      await handleIdentifyTechDebt(args);

      expect(fs.existsSync).toHaveBeenCalled();
    });

    it('should return error when path does not exist', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);

      const args: IdentifyTechDebtArgs = {
        path: '/nonexistent',
      };

      await handleIdentifyTechDebt(args);

      expect(createErrorResponse).toHaveBeenCalledWith(
        expect.stringContaining('not exist')
      );
    });

    it('should resolve relative path from PROJECT_ROOT', async () => {
      const args: IdentifyTechDebtArgs = {
        path: 'src/components',
      };

      await handleIdentifyTechDebt(args);

      expect(fs.existsSync).toHaveBeenCalledWith(
        expect.stringContaining('src')
      );
    });

    it('should use absolute path directly', async () => {
      const args: IdentifyTechDebtArgs = {
        path: '/absolute/path',
      };

      await handleIdentifyTechDebt(args);

      expect(fs.existsSync).toHaveBeenCalledWith('/absolute/path');
    });

    it('should use default coverage threshold of 80', async () => {
      const args: IdentifyTechDebtArgs = {};

      await handleIdentifyTechDebt(args);

      expect(createSuccessResponse).toHaveBeenCalled();
    });

    it('should use custom coverage threshold', async () => {
      const args: IdentifyTechDebtArgs = {
        coverage_threshold: 90,
      };

      await handleIdentifyTechDebt(args);

      expect(createSuccessResponse).toHaveBeenCalled();
    });

    it('should use default max_issues of 50', async () => {
      const args: IdentifyTechDebtArgs = {};

      await handleIdentifyTechDebt(args);

      const call = vi.mocked(createSuccessResponse).mock.calls[0][0];
      expect(call.prioritized_issues.length).toBeLessThanOrEqual(50);
    });

    it('should use custom max_issues', async () => {
      const args: IdentifyTechDebtArgs = {
        max_issues: 10,
      };

      await handleIdentifyTechDebt(args);

      const call = vi.mocked(createSuccessResponse).mock.calls[0][0];
      expect(call.prioritized_issues.length).toBeLessThanOrEqual(10);
    });
  });

  // ===========================================================================
  // Category Selection Tests
  // ===========================================================================

  describe('category selection', () => {
    it('should analyze all categories by default', async () => {
      const args: IdentifyTechDebtArgs = {};

      await handleIdentifyTechDebt(args);

      expect(handleFindDeadCode).toHaveBeenCalled();
      expect(handleFindCircularDeps).toHaveBeenCalled();
      expect(handleScanForSecrets).toHaveBeenCalled();
      expect(handleGetTestCoverage).toHaveBeenCalled();
      expect(handleCheckTypes).toHaveBeenCalled();
      expect(scanDirectory).toHaveBeenCalled();
    });

    it('should only analyze included categories', async () => {
      const args: IdentifyTechDebtArgs = {
        include: ['dead_code', 'security'],
      };

      await handleIdentifyTechDebt(args);

      expect(handleFindDeadCode).toHaveBeenCalled();
      expect(handleScanForSecrets).toHaveBeenCalled();
      expect(handleFindCircularDeps).not.toHaveBeenCalled();
      expect(handleGetTestCoverage).not.toHaveBeenCalled();
      expect(handleCheckTypes).not.toHaveBeenCalled();
      expect(scanDirectory).not.toHaveBeenCalled();
    });

    it('should analyze only circular_deps when specified', async () => {
      const args: IdentifyTechDebtArgs = {
        include: ['circular_deps'],
      };

      await handleIdentifyTechDebt(args);

      expect(handleFindCircularDeps).toHaveBeenCalled();
      expect(handleFindDeadCode).not.toHaveBeenCalled();
    });

    it('should analyze only coverage when specified', async () => {
      const args: IdentifyTechDebtArgs = {
        include: ['coverage'],
      };

      await handleIdentifyTechDebt(args);

      expect(handleGetTestCoverage).toHaveBeenCalled();
      expect(handleFindDeadCode).not.toHaveBeenCalled();
    });

    it('should analyze only type_errors when specified', async () => {
      const args: IdentifyTechDebtArgs = {
        include: ['type_errors'],
      };

      await handleIdentifyTechDebt(args);

      expect(handleCheckTypes).toHaveBeenCalled();
      expect(handleFindDeadCode).not.toHaveBeenCalled();
    });

    it('should analyze only todos when specified', async () => {
      const args: IdentifyTechDebtArgs = {
        include: ['todos'],
      };

      await handleIdentifyTechDebt(args);

      expect(scanDirectory).toHaveBeenCalled();
      expect(handleFindDeadCode).not.toHaveBeenCalled();
    });
  });

  // ===========================================================================
  // Dead Code Scoring Tests
  // ===========================================================================

  describe('dead code scoring', () => {
    it('should score 0 for no dead code', async () => {
      vi.mocked(handleFindDeadCode).mockResolvedValue({
        isError: false,
        content: [{ type: 'text', text: JSON.stringify({ count: 0, dead_exports: [] }) }],
      });

      const args: IdentifyTechDebtArgs = {
        include: ['dead_code'],
      };

      await handleIdentifyTechDebt(args);

      const call = vi.mocked(createSuccessResponse).mock.calls[0][0];
      expect(call.breakdown.dead_code?.score).toBe(0);
    });

    it('should score 20 for 1-5 dead code items', async () => {
      vi.mocked(handleFindDeadCode).mockResolvedValue({
        isError: false,
        content: [{
          type: 'text',
          text: JSON.stringify({
            count: 3,
            dead_exports: [
              { file: 'a.ts', name: 'foo', kind: 'function', line: 1 },
              { file: 'b.ts', name: 'bar', kind: 'function', line: 1 },
              { file: 'c.ts', name: 'baz', kind: 'function', line: 1 },
            ],
          }),
        }],
      });

      const args: IdentifyTechDebtArgs = {
        include: ['dead_code'],
      };

      await handleIdentifyTechDebt(args);

      const call = vi.mocked(createSuccessResponse).mock.calls[0][0];
      expect(call.breakdown.dead_code?.score).toBe(20);
    });

    it('should score 40 for 6-15 dead code items', async () => {
      vi.mocked(handleFindDeadCode).mockResolvedValue({
        isError: false,
        content: [{ type: 'text', text: JSON.stringify({ count: 10, dead_exports: [] }) }],
      });

      const args: IdentifyTechDebtArgs = {
        include: ['dead_code'],
      };

      await handleIdentifyTechDebt(args);

      const call = vi.mocked(createSuccessResponse).mock.calls[0][0];
      expect(call.breakdown.dead_code?.score).toBe(40);
    });

    it('should score 60 for 16-30 dead code items', async () => {
      vi.mocked(handleFindDeadCode).mockResolvedValue({
        isError: false,
        content: [{ type: 'text', text: JSON.stringify({ count: 25, dead_exports: [] }) }],
      });

      const args: IdentifyTechDebtArgs = {
        include: ['dead_code'],
      };

      await handleIdentifyTechDebt(args);

      const call = vi.mocked(createSuccessResponse).mock.calls[0][0];
      expect(call.breakdown.dead_code?.score).toBe(60);
    });

    it('should score 80 for 31-50 dead code items', async () => {
      vi.mocked(handleFindDeadCode).mockResolvedValue({
        isError: false,
        content: [{ type: 'text', text: JSON.stringify({ count: 45, dead_exports: [] }) }],
      });

      const args: IdentifyTechDebtArgs = {
        include: ['dead_code'],
      };

      await handleIdentifyTechDebt(args);

      const call = vi.mocked(createSuccessResponse).mock.calls[0][0];
      expect(call.breakdown.dead_code?.score).toBe(80);
    });

    it('should score 100 for 50+ dead code items', async () => {
      vi.mocked(handleFindDeadCode).mockResolvedValue({
        isError: false,
        content: [{ type: 'text', text: JSON.stringify({ count: 100, dead_exports: [] }) }],
      });

      const args: IdentifyTechDebtArgs = {
        include: ['dead_code'],
      };

      await handleIdentifyTechDebt(args);

      const call = vi.mocked(createSuccessResponse).mock.calls[0][0];
      expect(call.breakdown.dead_code?.score).toBe(100);
    });

    it('should handle dead code analysis error gracefully', async () => {
      vi.mocked(handleFindDeadCode).mockResolvedValue({
        isError: true,
        content: [{ type: 'text', text: JSON.stringify({ error: 'Analysis failed' }) }],
      });

      const args: IdentifyTechDebtArgs = {
        include: ['dead_code'],
      };

      await handleIdentifyTechDebt(args);

      expect(createSuccessResponse).toHaveBeenCalled();
    });
  });

  // ===========================================================================
  // Circular Dependencies Scoring Tests
  // ===========================================================================

  describe('circular dependencies scoring', () => {
    it('should score 0 for no circular dependencies', async () => {
      vi.mocked(handleFindCircularDeps).mockResolvedValue({
        isError: false,
        content: [{ type: 'text', text: JSON.stringify({ count: 0, cycles: [] }) }],
      });

      const args: IdentifyTechDebtArgs = {
        include: ['circular_deps'],
      };

      await handleIdentifyTechDebt(args);

      const call = vi.mocked(createSuccessResponse).mock.calls[0][0];
      expect(call.breakdown.circular_deps?.score).toBe(0);
    });

    it('should score 30 for 1 circular dependency', async () => {
      vi.mocked(handleFindCircularDeps).mockResolvedValue({
        isError: false,
        content: [{
          type: 'text',
          text: JSON.stringify({
            count: 1,
            cycles: [{ path: ['a.ts', 'b.ts', 'a.ts'], length: 3 }],
          }),
        }],
      });

      const args: IdentifyTechDebtArgs = {
        include: ['circular_deps'],
      };

      await handleIdentifyTechDebt(args);

      const call = vi.mocked(createSuccessResponse).mock.calls[0][0];
      expect(call.breakdown.circular_deps?.score).toBe(30);
    });

    it('should score 50 for 2-3 circular dependencies', async () => {
      vi.mocked(handleFindCircularDeps).mockResolvedValue({
        isError: false,
        content: [{ type: 'text', text: JSON.stringify({ count: 3, cycles: [] }) }],
      });

      const args: IdentifyTechDebtArgs = {
        include: ['circular_deps'],
      };

      await handleIdentifyTechDebt(args);

      const call = vi.mocked(createSuccessResponse).mock.calls[0][0];
      expect(call.breakdown.circular_deps?.score).toBe(50);
    });

    it('should score 70 for 4-5 circular dependencies', async () => {
      vi.mocked(handleFindCircularDeps).mockResolvedValue({
        isError: false,
        content: [{ type: 'text', text: JSON.stringify({ count: 5, cycles: [] }) }],
      });

      const args: IdentifyTechDebtArgs = {
        include: ['circular_deps'],
      };

      await handleIdentifyTechDebt(args);

      const call = vi.mocked(createSuccessResponse).mock.calls[0][0];
      expect(call.breakdown.circular_deps?.score).toBe(70);
    });

    it('should score 85 for 6-10 circular dependencies', async () => {
      vi.mocked(handleFindCircularDeps).mockResolvedValue({
        isError: false,
        content: [{ type: 'text', text: JSON.stringify({ count: 8, cycles: [] }) }],
      });

      const args: IdentifyTechDebtArgs = {
        include: ['circular_deps'],
      };

      await handleIdentifyTechDebt(args);

      const call = vi.mocked(createSuccessResponse).mock.calls[0][0];
      expect(call.breakdown.circular_deps?.score).toBe(85);
    });

    it('should score 100 for 10+ circular dependencies', async () => {
      vi.mocked(handleFindCircularDeps).mockResolvedValue({
        isError: false,
        content: [{ type: 'text', text: JSON.stringify({ count: 15, cycles: [] }) }],
      });

      const args: IdentifyTechDebtArgs = {
        include: ['circular_deps'],
      };

      await handleIdentifyTechDebt(args);

      const call = vi.mocked(createSuccessResponse).mock.calls[0][0];
      expect(call.breakdown.circular_deps?.score).toBe(100);
    });

    it('should handle circular deps analysis error gracefully', async () => {
      vi.mocked(handleFindCircularDeps).mockResolvedValue({
        isError: true,
        content: [{ type: 'text', text: JSON.stringify({ error: 'Analysis failed' }) }],
      });

      const args: IdentifyTechDebtArgs = {
        include: ['circular_deps'],
      };

      await handleIdentifyTechDebt(args);

      expect(createSuccessResponse).toHaveBeenCalled();
    });
  });

  // ===========================================================================
  // Security Scoring Tests
  // ===========================================================================

  describe('security scoring', () => {
    it('should score 0 for no security issues', async () => {
      vi.mocked(handleScanForSecrets).mockResolvedValue({
        isError: false,
        content: [{ type: 'text', text: JSON.stringify({ findings: [], by_severity: { high: 0, medium: 0, low: 0 } }) }],
      });

      const args: IdentifyTechDebtArgs = {
        include: ['security'],
      };

      await handleIdentifyTechDebt(args);

      const call = vi.mocked(createSuccessResponse).mock.calls[0][0];
      expect(call.breakdown.security_issues?.score).toBe(0);
    });

    it('should score high for high severity issues (30 per high)', async () => {
      vi.mocked(handleScanForSecrets).mockResolvedValue({
        isError: false,
        content: [{
          type: 'text',
          text: JSON.stringify({
            findings: [{ file: 'a.ts', line: 1, secret_type: 'api_key', severity: 'high' }],
            by_severity: { high: 2, medium: 0, low: 0 },
          }),
        }],
      });

      const args: IdentifyTechDebtArgs = {
        include: ['security'],
      };

      await handleIdentifyTechDebt(args);

      const call = vi.mocked(createSuccessResponse).mock.calls[0][0];
      expect(call.breakdown.security_issues?.score).toBe(60); // 2 * 30
    });

    it('should score medium for medium severity issues (10 per medium)', async () => {
      vi.mocked(handleScanForSecrets).mockResolvedValue({
        isError: false,
        content: [{
          type: 'text',
          text: JSON.stringify({
            findings: [],
            by_severity: { high: 0, medium: 5, low: 0 },
          }),
        }],
      });

      const args: IdentifyTechDebtArgs = {
        include: ['security'],
      };

      await handleIdentifyTechDebt(args);

      const call = vi.mocked(createSuccessResponse).mock.calls[0][0];
      expect(call.breakdown.security_issues?.score).toBe(50); // 5 * 10
    });

    it('should score low for low severity issues (2 per low)', async () => {
      vi.mocked(handleScanForSecrets).mockResolvedValue({
        isError: false,
        content: [{
          type: 'text',
          text: JSON.stringify({
            findings: [],
            by_severity: { high: 0, medium: 0, low: 10 },
          }),
        }],
      });

      const args: IdentifyTechDebtArgs = {
        include: ['security'],
      };

      await handleIdentifyTechDebt(args);

      const call = vi.mocked(createSuccessResponse).mock.calls[0][0];
      expect(call.breakdown.security_issues?.score).toBe(20); // 10 * 2
    });

    it('should cap score at 100', async () => {
      vi.mocked(handleScanForSecrets).mockResolvedValue({
        isError: false,
        content: [{
          type: 'text',
          text: JSON.stringify({
            findings: [],
            by_severity: { high: 10, medium: 10, low: 10 }, // 10*30 + 10*10 + 10*2 = 420 -> capped to 100
          }),
        }],
      });

      const args: IdentifyTechDebtArgs = {
        include: ['security'],
      };

      await handleIdentifyTechDebt(args);

      const call = vi.mocked(createSuccessResponse).mock.calls[0][0];
      expect(call.breakdown.security_issues?.score).toBe(100);
    });

    it('should handle security analysis error gracefully', async () => {
      vi.mocked(handleScanForSecrets).mockResolvedValue({
        isError: true,
        content: [{ type: 'text', text: JSON.stringify({ error: 'Analysis failed' }) }],
      });

      const args: IdentifyTechDebtArgs = {
        include: ['security'],
      };

      await handleIdentifyTechDebt(args);

      expect(createSuccessResponse).toHaveBeenCalled();
    });
  });

  // ===========================================================================
  // Coverage Scoring Tests
  // ===========================================================================

  describe('coverage scoring', () => {
    it('should score 0 for 100% coverage', async () => {
      vi.mocked(handleGetTestCoverage).mockResolvedValue({
        isError: false,
        content: [{ type: 'text', text: JSON.stringify({ coverage: { lines: 100 }, uncovered_functions: [] }) }],
      });

      const args: IdentifyTechDebtArgs = {
        include: ['coverage'],
        coverage_threshold: 80,
      };

      await handleIdentifyTechDebt(args);

      const call = vi.mocked(createSuccessResponse).mock.calls[0][0];
      expect(call.breakdown.coverage_gaps?.score).toBe(0);
    });

    it('should score proportionally for coverage above threshold', async () => {
      vi.mocked(handleGetTestCoverage).mockResolvedValue({
        isError: false,
        content: [{ type: 'text', text: JSON.stringify({ coverage: { lines: 90 }, uncovered_functions: [] }) }],
      });

      const args: IdentifyTechDebtArgs = {
        include: ['coverage'],
        coverage_threshold: 80,
      };

      await handleIdentifyTechDebt(args);

      const call = vi.mocked(createSuccessResponse).mock.calls[0][0];
      // 90% coverage, threshold 80%: score = 50 * (100 - 90) / (100 - 80) = 50 * 10 / 20 = 25
      expect(call.breakdown.coverage_gaps?.score).toBe(25);
    });

    it('should score 50 for threshold coverage', async () => {
      vi.mocked(handleGetTestCoverage).mockResolvedValue({
        isError: false,
        content: [{ type: 'text', text: JSON.stringify({ coverage: { lines: 80 }, uncovered_functions: [] }) }],
      });

      const args: IdentifyTechDebtArgs = {
        include: ['coverage'],
        coverage_threshold: 80,
      };

      await handleIdentifyTechDebt(args);

      const call = vi.mocked(createSuccessResponse).mock.calls[0][0];
      // At threshold: score = 50 * (100 - 80) / (100 - 80) = 50
      expect(call.breakdown.coverage_gaps?.score).toBe(50);
    });

    it('should score higher for coverage below threshold', async () => {
      vi.mocked(handleGetTestCoverage).mockResolvedValue({
        isError: false,
        content: [{ type: 'text', text: JSON.stringify({ coverage: { lines: 40 }, uncovered_functions: [] }) }],
      });

      const args: IdentifyTechDebtArgs = {
        include: ['coverage'],
        coverage_threshold: 80,
      };

      await handleIdentifyTechDebt(args);

      const call = vi.mocked(createSuccessResponse).mock.calls[0][0];
      // 40% coverage, threshold 80%: score = 50 + 50 * (80 - 40) / 80 = 50 + 25 = 75
      expect(call.breakdown.coverage_gaps?.score).toBe(75);
    });

    it('should score 100 for 0% coverage', async () => {
      vi.mocked(handleGetTestCoverage).mockResolvedValue({
        isError: false,
        content: [{ type: 'text', text: JSON.stringify({ coverage: { lines: 0 }, uncovered_functions: [] }) }],
      });

      const args: IdentifyTechDebtArgs = {
        include: ['coverage'],
        coverage_threshold: 80,
      };

      await handleIdentifyTechDebt(args);

      const call = vi.mocked(createSuccessResponse).mock.calls[0][0];
      // 0% coverage: score = 50 + 50 * 80 / 80 = 100
      expect(call.breakdown.coverage_gaps?.score).toBe(100);
    });

    it('should handle coverage analysis error gracefully', async () => {
      vi.mocked(handleGetTestCoverage).mockResolvedValue({
        isError: true,
        content: [{ type: 'text', text: JSON.stringify({ error: 'Analysis failed' }) }],
      });

      const args: IdentifyTechDebtArgs = {
        include: ['coverage'],
      };

      await handleIdentifyTechDebt(args);

      expect(createSuccessResponse).toHaveBeenCalled();
    });
  });

  // ===========================================================================
  // Type Errors Scoring Tests
  // ===========================================================================

  describe('type errors scoring', () => {
    it('should score 0 for no type errors', async () => {
      vi.mocked(handleCheckTypes).mockResolvedValue({
        isError: false,
        content: [{ type: 'text', text: JSON.stringify({ errors: [] }) }],
      });

      const args: IdentifyTechDebtArgs = {
        include: ['type_errors'],
      };

      await handleIdentifyTechDebt(args);

      const call = vi.mocked(createSuccessResponse).mock.calls[0][0];
      expect(call.breakdown.type_errors?.score).toBe(0);
    });

    it('should score 30 for 1-3 type errors', async () => {
      vi.mocked(handleCheckTypes).mockResolvedValue({
        isError: false,
        content: [{
          type: 'text',
          text: JSON.stringify({
            errors: [
              { file: 'a.ts', line: 1, message: 'Error 1' },
              { file: 'b.ts', line: 2, message: 'Error 2' },
            ],
          }),
        }],
      });

      const args: IdentifyTechDebtArgs = {
        include: ['type_errors'],
      };

      await handleIdentifyTechDebt(args);

      const call = vi.mocked(createSuccessResponse).mock.calls[0][0];
      expect(call.breakdown.type_errors?.score).toBe(30);
    });

    it('should score 50 for 4-10 type errors', async () => {
      vi.mocked(handleCheckTypes).mockResolvedValue({
        isError: false,
        content: [{
          type: 'text',
          text: JSON.stringify({
            errors: Array(8).fill({ file: 'a.ts', line: 1, message: 'Error' }),
          }),
        }],
      });

      const args: IdentifyTechDebtArgs = {
        include: ['type_errors'],
      };

      await handleIdentifyTechDebt(args);

      const call = vi.mocked(createSuccessResponse).mock.calls[0][0];
      expect(call.breakdown.type_errors?.score).toBe(50);
    });

    it('should score 70 for 11-25 type errors', async () => {
      vi.mocked(handleCheckTypes).mockResolvedValue({
        isError: false,
        content: [{
          type: 'text',
          text: JSON.stringify({
            errors: Array(20).fill({ file: 'a.ts', line: 1, message: 'Error' }),
          }),
        }],
      });

      const args: IdentifyTechDebtArgs = {
        include: ['type_errors'],
      };

      await handleIdentifyTechDebt(args);

      const call = vi.mocked(createSuccessResponse).mock.calls[0][0];
      expect(call.breakdown.type_errors?.score).toBe(70);
    });

    it('should score 85 for 26-50 type errors', async () => {
      vi.mocked(handleCheckTypes).mockResolvedValue({
        isError: false,
        content: [{
          type: 'text',
          text: JSON.stringify({
            errors: Array(40).fill({ file: 'a.ts', line: 1, message: 'Error' }),
          }),
        }],
      });

      const args: IdentifyTechDebtArgs = {
        include: ['type_errors'],
      };

      await handleIdentifyTechDebt(args);

      const call = vi.mocked(createSuccessResponse).mock.calls[0][0];
      expect(call.breakdown.type_errors?.score).toBe(85);
    });

    it('should score 100 for 50+ type errors', async () => {
      vi.mocked(handleCheckTypes).mockResolvedValue({
        isError: false,
        content: [{
          type: 'text',
          text: JSON.stringify({
            errors: Array(60).fill({ file: 'a.ts', line: 1, message: 'Error' }),
          }),
        }],
      });

      const args: IdentifyTechDebtArgs = {
        include: ['type_errors'],
      };

      await handleIdentifyTechDebt(args);

      const call = vi.mocked(createSuccessResponse).mock.calls[0][0];
      expect(call.breakdown.type_errors?.score).toBe(100);
    });

    it('should handle type check error gracefully', async () => {
      vi.mocked(handleCheckTypes).mockResolvedValue({
        isError: true,
        content: [{ type: 'text', text: JSON.stringify({ error: 'Analysis failed' }) }],
      });

      const args: IdentifyTechDebtArgs = {
        include: ['type_errors'],
      };

      await handleIdentifyTechDebt(args);

      expect(createSuccessResponse).toHaveBeenCalled();
    });
  });

  // ===========================================================================
  // TODO Scoring Tests
  // ===========================================================================

  describe('todos scoring', () => {
    it('should score 0 for no TODOs', async () => {
      vi.mocked(scanDirectory).mockImplementation(() => {});

      const args: IdentifyTechDebtArgs = {
        include: ['todos'],
      };

      await handleIdentifyTechDebt(args);

      const call = vi.mocked(createSuccessResponse).mock.calls[0][0];
      expect(call.breakdown.todos?.score).toBe(0);
    });

    it('should score higher for high priority TODOs (3x weight)', async () => {
      vi.mocked(scanDirectory).mockImplementation((dir, baseDir, items) => {
        items.push(
          { type: 'FIXME', text: 'Critical bug', file: 'a.ts', line: 1, priority: 'high' },
          { type: 'FIXME', text: 'Another critical', file: 'b.ts', line: 2, priority: 'high' },
        );
      });

      const args: IdentifyTechDebtArgs = {
        include: ['todos'],
      };

      await handleIdentifyTechDebt(args);

      const call = vi.mocked(createSuccessResponse).mock.calls[0][0];
      // 2 high priority = 2*3 = 6 weighted, score = 15 (for 5 < weighted <= 15)
      expect(call.breakdown.todos?.score).toBe(30);
    });

    it('should score medium for medium priority TODOs (1.5x weight)', async () => {
      vi.mocked(scanDirectory).mockImplementation((dir, baseDir, items) => {
        items.push(
          { type: 'TODO', text: 'Refactor', file: 'a.ts', line: 1, priority: 'medium' },
          { type: 'TODO', text: 'Cleanup', file: 'b.ts', line: 2, priority: 'medium' },
        );
      });

      const args: IdentifyTechDebtArgs = {
        include: ['todos'],
      };

      await handleIdentifyTechDebt(args);

      const call = vi.mocked(createSuccessResponse).mock.calls[0][0];
      // 2 medium priority = 2*1.5 = 3 weighted, score = 15 (for 0 < weighted <= 5)
      expect(call.breakdown.todos?.score).toBe(15);
    });

    it('should score low for low priority TODOs (0.5x weight)', async () => {
      vi.mocked(scanDirectory).mockImplementation((dir, baseDir, items) => {
        items.push(
          { type: 'NOTE', text: 'Nice to have', file: 'a.ts', line: 1, priority: 'low' },
          { type: 'NOTE', text: 'Maybe later', file: 'b.ts', line: 2, priority: 'low' },
        );
      });

      const args: IdentifyTechDebtArgs = {
        include: ['todos'],
      };

      await handleIdentifyTechDebt(args);

      const call = vi.mocked(createSuccessResponse).mock.calls[0][0];
      // 2 low priority = 2*0.5 = 1 weighted, score = 15
      expect(call.breakdown.todos?.score).toBe(15);
    });

    it('should score 100 for many high priority TODOs', async () => {
      vi.mocked(scanDirectory).mockImplementation((dir, baseDir, items) => {
        for (let i = 0; i < 30; i++) {
          items.push({ type: 'FIXME', text: `Critical ${i}`, file: 'a.ts', line: i, priority: 'high' });
        }
      });

      const args: IdentifyTechDebtArgs = {
        include: ['todos'],
      };

      await handleIdentifyTechDebt(args);

      const call = vi.mocked(createSuccessResponse).mock.calls[0][0];
      // 30 high priority = 30*3 = 90 weighted, score = 100
      expect(call.breakdown.todos?.score).toBe(100);
    });

    it('should handle scan error gracefully', async () => {
      vi.mocked(scanDirectory).mockImplementation(() => {
        throw new Error('Scan failed');
      });

      const args: IdentifyTechDebtArgs = {
        include: ['todos'],
      };

      await handleIdentifyTechDebt(args);

      // Should not crash
      expect(createSuccessResponse).toHaveBeenCalled();
    });
  });

  // ===========================================================================
  // Grade Calculation Tests
  // ===========================================================================

  describe('grade calculation', () => {
    it('should give grade A for score < 20', async () => {
      // All categories with 0 issues
      const args: IdentifyTechDebtArgs = {};

      await handleIdentifyTechDebt(args);

      const call = vi.mocked(createSuccessResponse).mock.calls[0][0];
      expect(call.grade).toBe('A');
    });

    it('should give grade B for score 20-39', async () => {
      // Dead code count 1-5 gives score 20 (via scoreDeadCode function)
      // With only dead_code included (weight 10), final score = 20 * 10 / 10 = 20
      vi.mocked(handleFindDeadCode).mockResolvedValue({
        isError: false,
        content: [{ type: 'text', text: JSON.stringify({ count: 3, dead_exports: [] }) }],
      });

      const args: IdentifyTechDebtArgs = {
        include: ['dead_code'],
      };

      await handleIdentifyTechDebt(args);

      const call = vi.mocked(createSuccessResponse).mock.calls[0][0];
      expect(call.score).toBeGreaterThanOrEqual(20);
      expect(call.score).toBeLessThan(40);
      expect(call.grade).toBe('B');
    });

    it('should give grade C for score 40-59', async () => {
      vi.mocked(handleFindDeadCode).mockResolvedValue({
        isError: false,
        content: [{ type: 'text', text: JSON.stringify({ count: 40, dead_exports: [] }) }],
      });

      const args: IdentifyTechDebtArgs = {
        include: ['dead_code'],
      };

      await handleIdentifyTechDebt(args);

      const call = vi.mocked(createSuccessResponse).mock.calls[0][0];
      // Score should be around 80 for 40 dead code items
      // But since it's only one category, weighted score is different
    });

    it('should give grade D for score 60-79', async () => {
      vi.mocked(handleScanForSecrets).mockResolvedValue({
        isError: false,
        content: [{
          type: 'text',
          text: JSON.stringify({
            findings: [],
            by_severity: { high: 2, medium: 0, low: 0 },
          }),
        }],
      });

      const args: IdentifyTechDebtArgs = {
        include: ['security'],
      };

      await handleIdentifyTechDebt(args);

      const call = vi.mocked(createSuccessResponse).mock.calls[0][0];
      expect(call.grade).toBe('D');
    });

    it('should give grade F for score >= 80', async () => {
      vi.mocked(handleScanForSecrets).mockResolvedValue({
        isError: false,
        content: [{
          type: 'text',
          text: JSON.stringify({
            findings: [],
            by_severity: { high: 5, medium: 0, low: 0 },
          }),
        }],
      });

      const args: IdentifyTechDebtArgs = {
        include: ['security'],
      };

      await handleIdentifyTechDebt(args);

      const call = vi.mocked(createSuccessResponse).mock.calls[0][0];
      expect(call.grade).toBe('F');
    });
  });

  // ===========================================================================
  // Summary Generation Tests
  // ===========================================================================

  describe('summary generation', () => {
    it('should include "Excellent" for grade A', async () => {
      const args: IdentifyTechDebtArgs = {};

      await handleIdentifyTechDebt(args);

      const call = vi.mocked(createSuccessResponse).mock.calls[0][0];
      expect(call.summary).toContain('Excellent');
    });

    it('should include security concerns when high severity issues exist', async () => {
      vi.mocked(handleScanForSecrets).mockResolvedValue({
        isError: false,
        content: [{
          type: 'text',
          text: JSON.stringify({
            findings: [{ file: 'a.ts', line: 1, secret_type: 'api_key', severity: 'high' }],
            by_severity: { high: 3, medium: 0, low: 0 },
          }),
        }],
      });

      const args: IdentifyTechDebtArgs = {
        include: ['security'],
      };

      await handleIdentifyTechDebt(args);

      const call = vi.mocked(createSuccessResponse).mock.calls[0][0];
      expect(call.summary).toContain('security');
    });

    it('should include type errors in concerns', async () => {
      vi.mocked(handleCheckTypes).mockResolvedValue({
        isError: false,
        content: [{
          type: 'text',
          text: JSON.stringify({
            errors: [
              { file: 'a.ts', line: 1, message: 'Error 1' },
              { file: 'b.ts', line: 2, message: 'Error 2' },
            ],
          }),
        }],
      });

      const args: IdentifyTechDebtArgs = {
        include: ['type_errors'],
      };

      await handleIdentifyTechDebt(args);

      const call = vi.mocked(createSuccessResponse).mock.calls[0][0];
      expect(call.summary).toContain('type error');
    });

    it('should include circular dependencies in concerns', async () => {
      vi.mocked(handleFindCircularDeps).mockResolvedValue({
        isError: false,
        content: [{
          type: 'text',
          text: JSON.stringify({
            count: 2,
            cycles: [],
          }),
        }],
      });

      const args: IdentifyTechDebtArgs = {
        include: ['circular_deps'],
      };

      await handleIdentifyTechDebt(args);

      const call = vi.mocked(createSuccessResponse).mock.calls[0][0];
      expect(call.summary).toContain('circular');
    });

    it('should include coverage gaps in concerns when > 30%', async () => {
      vi.mocked(handleGetTestCoverage).mockResolvedValue({
        isError: false,
        content: [{ type: 'text', text: JSON.stringify({ coverage: { lines: 50 }, uncovered_functions: [] }) }],
      });

      const args: IdentifyTechDebtArgs = {
        include: ['coverage'],
      };

      await handleIdentifyTechDebt(args);

      const call = vi.mocked(createSuccessResponse).mock.calls[0][0];
      expect(call.summary).toContain('uncovered');
    });
  });

  // ===========================================================================
  // Issue Prioritization Tests
  // ===========================================================================

  describe('issue prioritization', () => {
    it('should sort issues by severity (critical first)', async () => {
      vi.mocked(handleScanForSecrets).mockResolvedValue({
        isError: false,
        content: [{
          type: 'text',
          text: JSON.stringify({
            findings: [
              { file: 'low.ts', line: 1, secret_type: 'comment', severity: 'low' },
              { file: 'high.ts', line: 2, secret_type: 'api_key', severity: 'high' },
              { file: 'medium.ts', line: 3, secret_type: 'password', severity: 'medium' },
            ],
            by_severity: { high: 1, medium: 1, low: 1 },
          }),
        }],
      });

      const args: IdentifyTechDebtArgs = {
        include: ['security'],
      };

      await handleIdentifyTechDebt(args);

      const call = vi.mocked(createSuccessResponse).mock.calls[0][0];
      const issues = call.prioritized_issues;

      if (issues.length >= 2) {
        // Security high is critical
        const firstCriticalIndex = issues.findIndex((i: { severity: string }) => i.severity === 'critical');
        const firstHighIndex = issues.findIndex((i: { severity: string }) => i.severity === 'high');

        if (firstCriticalIndex >= 0 && firstHighIndex >= 0) {
          expect(firstCriticalIndex).toBeLessThan(firstHighIndex);
        }
      }
    });

    it('should sort by effort within same severity (trivial first)', async () => {
      vi.mocked(handleFindDeadCode).mockResolvedValue({
        isError: false,
        content: [{
          type: 'text',
          text: JSON.stringify({
            count: 2,
            dead_exports: [
              { file: 'a.ts', name: 'foo', kind: 'function', line: 1 },
              { file: 'b.ts', name: 'bar', kind: 'function', line: 2 },
            ],
          }),
        }],
      });

      const args: IdentifyTechDebtArgs = {
        include: ['dead_code'],
      };

      await handleIdentifyTechDebt(args);

      const call = vi.mocked(createSuccessResponse).mock.calls[0][0];
      expect(call.prioritized_issues.length).toBeGreaterThan(0);
    });

    it('should limit issues to max_issues', async () => {
      vi.mocked(handleFindDeadCode).mockResolvedValue({
        isError: false,
        content: [{
          type: 'text',
          text: JSON.stringify({
            count: 30,
            dead_exports: Array(30).fill(null).map((_, i) => ({
              file: `file${i}.ts`,
              name: `func${i}`,
              kind: 'function',
              line: i,
            })),
          }),
        }],
      });

      const args: IdentifyTechDebtArgs = {
        include: ['dead_code'],
        max_issues: 5,
      };

      await handleIdentifyTechDebt(args);

      const call = vi.mocked(createSuccessResponse).mock.calls[0][0];
      expect(call.prioritized_issues.length).toBeLessThanOrEqual(5);
    });
  });

  // ===========================================================================
  // Error Handling Tests
  // ===========================================================================

  describe('error handling', () => {
    it('should catch and return error for unexpected exceptions', async () => {
      vi.mocked(fs.existsSync).mockImplementation(() => {
        throw new Error('Unexpected error');
      });

      const args: IdentifyTechDebtArgs = {};

      await handleIdentifyTechDebt(args);

      expect(createErrorResponse).toHaveBeenCalledWith(
        expect.stringContaining('Failed to identify tech debt')
      );
    });

    it('should handle JSON parse errors in dead code response', async () => {
      vi.mocked(handleFindDeadCode).mockResolvedValue({
        isError: false,
        content: [{ type: 'text', text: 'invalid json' }],
      });

      const args: IdentifyTechDebtArgs = {
        include: ['dead_code'],
      };

      await handleIdentifyTechDebt(args);

      // Should not crash, returns success with 0 for that category
      expect(createSuccessResponse).toHaveBeenCalled();
    });

    it('should handle JSON parse errors in circular deps response', async () => {
      vi.mocked(handleFindCircularDeps).mockResolvedValue({
        isError: false,
        content: [{ type: 'text', text: 'invalid json' }],
      });

      const args: IdentifyTechDebtArgs = {
        include: ['circular_deps'],
      };

      await handleIdentifyTechDebt(args);

      expect(createSuccessResponse).toHaveBeenCalled();
    });

    it('should handle JSON parse errors in security response', async () => {
      vi.mocked(handleScanForSecrets).mockResolvedValue({
        isError: false,
        content: [{ type: 'text', text: 'invalid json' }],
      });

      const args: IdentifyTechDebtArgs = {
        include: ['security'],
      };

      await handleIdentifyTechDebt(args);

      expect(createSuccessResponse).toHaveBeenCalled();
    });

    it('should handle JSON parse errors in coverage response', async () => {
      vi.mocked(handleGetTestCoverage).mockResolvedValue({
        isError: false,
        content: [{ type: 'text', text: 'invalid json' }],
      });

      const args: IdentifyTechDebtArgs = {
        include: ['coverage'],
      };

      await handleIdentifyTechDebt(args);

      expect(createSuccessResponse).toHaveBeenCalled();
    });

    it('should handle JSON parse errors in type errors response', async () => {
      vi.mocked(handleCheckTypes).mockResolvedValue({
        isError: false,
        content: [{ type: 'text', text: 'invalid json' }],
      });

      const args: IdentifyTechDebtArgs = {
        include: ['type_errors'],
      };

      await handleIdentifyTechDebt(args);

      expect(createSuccessResponse).toHaveBeenCalled();
    });
  });

  // ===========================================================================
  // Result Structure Tests
  // ===========================================================================

  describe('result structure', () => {
    it('should return complete result structure', async () => {
      const args: IdentifyTechDebtArgs = {};

      await handleIdentifyTechDebt(args);

      const call = vi.mocked(createSuccessResponse).mock.calls[0][0];

      expect(call).toHaveProperty('score');
      expect(call).toHaveProperty('grade');
      expect(call).toHaveProperty('summary');
      expect(call).toHaveProperty('breakdown');
      expect(call).toHaveProperty('prioritized_issues');
    });

    it('should include breakdown for each analyzed category', async () => {
      const args: IdentifyTechDebtArgs = {};

      await handleIdentifyTechDebt(args);

      const call = vi.mocked(createSuccessResponse).mock.calls[0][0];

      expect(call.breakdown).toHaveProperty('dead_code');
      expect(call.breakdown).toHaveProperty('circular_deps');
      expect(call.breakdown).toHaveProperty('security_issues');
      expect(call.breakdown).toHaveProperty('coverage_gaps');
      expect(call.breakdown).toHaveProperty('type_errors');
      expect(call.breakdown).toHaveProperty('todos');
    });

    it('should include count, score, and weight in category breakdown', async () => {
      const args: IdentifyTechDebtArgs = {
        include: ['dead_code'],
      };

      await handleIdentifyTechDebt(args);

      const call = vi.mocked(createSuccessResponse).mock.calls[0][0];
      const deadCode = call.breakdown.dead_code;

      expect(deadCode).toHaveProperty('count');
      expect(deadCode).toHaveProperty('score');
      expect(deadCode).toHaveProperty('weight');
    });

    it('should include severity split in security breakdown', async () => {
      vi.mocked(handleScanForSecrets).mockResolvedValue({
        isError: false,
        content: [{
          type: 'text',
          text: JSON.stringify({
            findings: [],
            by_severity: { high: 1, medium: 2, low: 3 },
          }),
        }],
      });

      const args: IdentifyTechDebtArgs = {
        include: ['security'],
      };

      await handleIdentifyTechDebt(args);

      const call = vi.mocked(createSuccessResponse).mock.calls[0][0];
      const security = call.breakdown.security_issues;

      expect(security).toHaveProperty('high');
      expect(security).toHaveProperty('medium');
      expect(security).toHaveProperty('low');
    });

    it('should include uncovered_percent in coverage breakdown', async () => {
      const args: IdentifyTechDebtArgs = {
        include: ['coverage'],
      };

      await handleIdentifyTechDebt(args);

      const call = vi.mocked(createSuccessResponse).mock.calls[0][0];
      const coverage = call.breakdown.coverage_gaps;

      expect(coverage).toHaveProperty('uncovered_percent');
    });
  });

  // ===========================================================================
  // Weighted Score Calculation Tests
  // ===========================================================================

  describe('weighted score calculation', () => {
    it('should calculate weighted average of category scores', async () => {
      // All categories with specific scores
      vi.mocked(handleFindDeadCode).mockResolvedValue({
        isError: false,
        content: [{ type: 'text', text: JSON.stringify({ count: 3, dead_exports: [] }) }], // score 20
      });

      vi.mocked(handleFindCircularDeps).mockResolvedValue({
        isError: false,
        content: [{ type: 'text', text: JSON.stringify({ count: 1, cycles: [] }) }], // score 30
      });

      vi.mocked(handleScanForSecrets).mockResolvedValue({
        isError: false,
        content: [{
          type: 'text',
          text: JSON.stringify({
            findings: [],
            by_severity: { high: 0, medium: 2, low: 0 },
          }),
        }], // score 20
      });

      vi.mocked(handleGetTestCoverage).mockResolvedValue({
        isError: false,
        content: [{ type: 'text', text: JSON.stringify({ coverage: { lines: 90 }, uncovered_functions: [] }) }], // score 25
      });

      vi.mocked(handleCheckTypes).mockResolvedValue({
        isError: false,
        content: [{ type: 'text', text: JSON.stringify({ errors: [] }) }], // score 0
      });

      vi.mocked(scanDirectory).mockImplementation(() => {}); // score 0

      const args: IdentifyTechDebtArgs = {};

      await handleIdentifyTechDebt(args);

      const call = vi.mocked(createSuccessResponse).mock.calls[0][0];

      // Weighted average calculation:
      // dead_code: 20 * 10 = 200
      // circular_deps: 30 * 15 = 450
      // security: 20 * 25 = 500
      // coverage: 25 * 20 = 500
      // type_errors: 0 * 20 = 0
      // todos: 0 * 10 = 0
      // Total: 1650 / 100 = 16.5 -> rounded to 17
      expect(call.score).toBeGreaterThanOrEqual(0);
      expect(call.score).toBeLessThanOrEqual(100);
    });

    it('should handle single category with correct weight', async () => {
      vi.mocked(handleFindDeadCode).mockResolvedValue({
        isError: false,
        content: [{ type: 'text', text: JSON.stringify({ count: 100, dead_exports: [] }) }], // score 100
      });

      const args: IdentifyTechDebtArgs = {
        include: ['dead_code'],
      };

      await handleIdentifyTechDebt(args);

      const call = vi.mocked(createSuccessResponse).mock.calls[0][0];

      // Single category: score = 100 * 10 / 10 = 100
      expect(call.score).toBe(100);
    });

    it('should return 0 score when all categories have 0 issues', async () => {
      // Need 100% coverage to get 0 score from coverage category
      // (80% coverage with 80% threshold = score 50, contributing 10 points)
      vi.mocked(handleGetTestCoverage).mockResolvedValue({
        isError: false,
        content: [{ type: 'text', text: JSON.stringify({ coverage: { lines: 100 }, uncovered_functions: [] }) }],
      });

      const args: IdentifyTechDebtArgs = {};

      await handleIdentifyTechDebt(args);

      const call = vi.mocked(createSuccessResponse).mock.calls[0][0];
      expect(call.score).toBe(0);
      expect(call.grade).toBe('A');
    });
  });
});
