/**
 * Unit tests for identify-tech-debt handler
 *
 * Note: The identify-tech-debt handler is an aggregator that orchestrates
 * multiple analysis tools (dead-code, circular deps, secrets scanner,
 * test coverage, type checker, and todo scanner). Full testing of this
 * handler would require extensive mocking of all dependencies.
 *
 * Due to the complexity of mocking the handler's dependencies which include
 * other handler modules with their own dependencies, these tests verify
 * only the basic argument validation. Full integration tests should be used
 * to verify the aggregation logic works correctly.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';

vi.mock('fs');
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

// Mock all dependent handlers - note: these may not mock correctly
// due to complex ESM module resolution in vitest
vi.mock('../../../handlers/lsp/dead-code.js');
vi.mock('../../../handlers/deps/circular.js');
vi.mock('../../../handlers/security/secrets-scanner.js');
vi.mock('../../../handlers/test/coverage.js');
vi.mock('../../../handlers/validation/index.js');
vi.mock('../../../handlers/issues/todo-scanner.js');

import { handleIdentifyTechDebt, IdentifyTechDebtArgs } from '../../../handlers/analysis/identify-tech-debt.js';
import { createErrorResponse } from '../../../handlers/lsp/utils.js';

describe('handleIdentifyTechDebt', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(fs.existsSync).mockReturnValue(true);
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('argument handling', () => {
    it('should check path existence', async () => {
      const args: IdentifyTechDebtArgs = {};

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
  });
});
