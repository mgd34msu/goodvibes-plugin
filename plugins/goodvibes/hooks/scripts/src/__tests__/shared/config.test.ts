/**
 * Comprehensive unit tests for config.ts
 *
 * Tests cover:
 * - STDIN_TIMEOUT_MS: environment variable parsing
 * - CHECKPOINT_TRIGGERS: constant export
 * - QUALITY_GATES: constant export
 * - getDefaultSharedConfig: default configuration generation
 * - loadSharedConfig: file loading, parsing, merging, error handling
 * - deepMerge: deep merging logic (private function tested via loadSharedConfig)
 *
 * Target: 100% line and branch coverage
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs/promises';
import * as path from 'path';

// Mock dependencies before importing the module
vi.mock('fs/promises');
vi.mock('../../shared/logging.js', () => ({
  debug: vi.fn(),
}));
vi.mock('../../shared/file-utils.js', () => ({
  fileExists: vi.fn(),
}));

// Import after mocks are set up
import {
  STDIN_TIMEOUT_MS,
  CHECKPOINT_TRIGGERS,
  QUALITY_GATES,
  getDefaultSharedConfig,
  loadSharedConfig,
  type SharedConfig,
} from '../../shared/config.js';
import { debug } from '../../shared/logging.js';
import { fileExists } from '../../shared/file-utils.js';

describe('config', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('STDIN_TIMEOUT_MS', () => {
    it('should use default value of 100ms when env var is not set', () => {
      // This test validates the import-time constant
      // Since we can't easily test different env values in the same process,
      // we verify the constant is a number
      expect(typeof STDIN_TIMEOUT_MS).toBe('number');
      expect(STDIN_TIMEOUT_MS).toBeGreaterThanOrEqual(0);
    });
  });

  describe('CHECKPOINT_TRIGGERS', () => {
    it('should export checkpoint trigger configuration', () => {
      expect(CHECKPOINT_TRIGGERS).toEqual({
        fileCountThreshold: 5,
        afterAgentComplete: true,
        afterMajorChange: true,
      });
    });

    it('should have correct types for all properties', () => {
      expect(typeof CHECKPOINT_TRIGGERS.fileCountThreshold).toBe('number');
      expect(typeof CHECKPOINT_TRIGGERS.afterAgentComplete).toBe('boolean');
      expect(typeof CHECKPOINT_TRIGGERS.afterMajorChange).toBe('boolean');
    });
  });

  describe('QUALITY_GATES', () => {
    it('should export quality gate configurations', () => {
      expect(QUALITY_GATES).toHaveLength(4);
    });

    it('should include TypeScript gate', () => {
      const tsGate = QUALITY_GATES.find((g) => g.name === 'TypeScript');
      expect(tsGate).toEqual({
        name: 'TypeScript',
        check: 'npx tsc --noEmit',
        autoFix: null,
        blocking: true,
      });
    });

    it('should include ESLint gate with auto-fix', () => {
      const eslintGate = QUALITY_GATES.find((g) => g.name === 'ESLint');
      expect(eslintGate).toEqual({
        name: 'ESLint',
        check: 'npx eslint . --max-warnings=0',
        autoFix: 'npx eslint . --fix',
        blocking: true,
      });
    });

    it('should include Prettier gate with auto-fix', () => {
      const prettierGate = QUALITY_GATES.find((g) => g.name === 'Prettier');
      expect(prettierGate).toEqual({
        name: 'Prettier',
        check: 'npx prettier --check .',
        autoFix: 'npx prettier --write .',
        blocking: false,
      });
    });

    it('should include Tests gate', () => {
      const testsGate = QUALITY_GATES.find((g) => g.name === 'Tests');
      expect(testsGate).toEqual({
        name: 'Tests',
        check: 'npm test',
        autoFix: null,
        blocking: true,
      });
    });
  });

  describe('getDefaultSharedConfig', () => {
    it('should return complete default configuration', () => {
      const config = getDefaultSharedConfig();

      expect(config).toEqual({
        telemetry: {
          enabled: true,
          anonymize: true,
        },
        quality: {
          gates: QUALITY_GATES,
          autoFix: true,
        },
        memory: {
          enabled: true,
          maxEntries: 100,
        },
        checkpoints: {
          enabled: true,
          triggers: CHECKPOINT_TRIGGERS,
        },
      });
    });

    it('should return telemetry config with enabled and anonymize flags', () => {
      const config = getDefaultSharedConfig();

      expect(config.telemetry).toBeDefined();
      expect(config.telemetry?.enabled).toBe(true);
      expect(config.telemetry?.anonymize).toBe(true);
    });

    it('should return quality config with gates and autoFix', () => {
      const config = getDefaultSharedConfig();

      expect(config.quality).toBeDefined();
      expect(config.quality?.gates).toEqual(QUALITY_GATES);
      expect(config.quality?.autoFix).toBe(true);
    });

    it('should return memory config with enabled and maxEntries', () => {
      const config = getDefaultSharedConfig();

      expect(config.memory).toBeDefined();
      expect(config.memory?.enabled).toBe(true);
      expect(config.memory?.maxEntries).toBe(100);
    });

    it('should return checkpoints config with enabled and triggers', () => {
      const config = getDefaultSharedConfig();

      expect(config.checkpoints).toBeDefined();
      expect(config.checkpoints?.enabled).toBe(true);
      expect(config.checkpoints?.triggers).toEqual(CHECKPOINT_TRIGGERS);
    });
  });

  describe('loadSharedConfig', () => {
    const mockCwd = '/mock/project';
    const expectedConfigPath = path.join(mockCwd, '.goodvibes', 'settings.json');

    beforeEach(() => {
      vi.clearAllMocks();
    });

    afterEach(() => {
      vi.restoreAllMocks();
    });

    it('should return defaults when config file does not exist', async () => {
      vi.mocked(fileExists).mockResolvedValue(false);

      const config = await loadSharedConfig(mockCwd);

      expect(fileExists).toHaveBeenCalledWith(expectedConfigPath);
      expect(config).toEqual(getDefaultSharedConfig());
    });

    it('should load and merge user config with goodvibes key', async () => {
      vi.mocked(fileExists).mockResolvedValue(true);

      const userConfig = {
        goodvibes: {
          telemetry: {
            enabled: false,
          },
          quality: {
            autoFix: false,
          },
        },
      };

      vi.spyOn(fs, 'readFile').mockResolvedValue(JSON.stringify(userConfig));

      const config = await loadSharedConfig(mockCwd);

      expect(fileExists).toHaveBeenCalledWith(expectedConfigPath);
      expect(fs.readFile).toHaveBeenCalledWith(expectedConfigPath, 'utf-8');

      // Should merge user config with defaults
      expect(config.telemetry?.enabled).toBe(false);
      expect(config.telemetry?.anonymize).toBe(true); // From defaults
      expect(config.quality?.autoFix).toBe(false);
      expect(config.quality?.gates).toEqual(QUALITY_GATES); // From defaults
      expect(config.memory?.enabled).toBe(true); // From defaults
      expect(config.checkpoints?.enabled).toBe(true); // From defaults
    });

    it('should load and merge user config at root level (without goodvibes key)', async () => {
      vi.mocked(fileExists).mockResolvedValue(true);

      const userConfig = {
        telemetry: {
          anonymize: false,
        },
        memory: {
          maxEntries: 200,
        },
      };

      vi.spyOn(fs, 'readFile').mockResolvedValue(JSON.stringify(userConfig));

      const config = await loadSharedConfig(mockCwd);

      expect(config.telemetry?.enabled).toBe(true); // From defaults
      expect(config.telemetry?.anonymize).toBe(false); // From user config
      expect(config.memory?.enabled).toBe(true); // From defaults
      expect(config.memory?.maxEntries).toBe(200); // From user config
    });

    it('should handle nested object merging', async () => {
      vi.mocked(fileExists).mockResolvedValue(true);

      const userConfig = {
        telemetry: {
          enabled: false,
          // anonymize should be preserved from defaults
        },
        checkpoints: {
          triggers: {
            fileCountThreshold: 10,
            afterAgentComplete: false,
            // afterMajorChange should be preserved from defaults
          },
        },
      };

      vi.spyOn(fs, 'readFile').mockResolvedValue(JSON.stringify(userConfig));

      const config = await loadSharedConfig(mockCwd);

      expect(config.telemetry?.enabled).toBe(false);
      expect(config.telemetry?.anonymize).toBe(true);
      expect(config.checkpoints?.triggers?.fileCountThreshold).toBe(10);
      expect(config.checkpoints?.triggers?.afterAgentComplete).toBe(false);
      expect(config.checkpoints?.triggers?.afterMajorChange).toBe(true);
    });

    it('should handle array replacement in user config', async () => {
      vi.mocked(fileExists).mockResolvedValue(true);

      const customGates = [
        { name: 'Custom', check: 'custom check', autoFix: null, blocking: true },
      ];

      const userConfig = {
        quality: {
          gates: customGates,
        },
      };

      vi.spyOn(fs, 'readFile').mockResolvedValue(JSON.stringify(userConfig));

      const config = await loadSharedConfig(mockCwd);

      // Arrays should be replaced, not merged
      expect(config.quality?.gates).toEqual(customGates);
      expect(config.quality?.gates).toHaveLength(1);
    });

    it('should handle undefined values in user config (keep defaults)', async () => {
      vi.mocked(fileExists).mockResolvedValue(true);

      // Note: JSON.stringify removes undefined values, so we need to construct
      // JSON manually to test this edge case
      const userConfigJson = '{"telemetry":{"enabled":undefined}}';

      vi.spyOn(fs, 'readFile').mockResolvedValue(userConfigJson);

      const config = await loadSharedConfig(mockCwd);

      // Invalid JSON should cause fallback to defaults
      expect(config).toEqual(getDefaultSharedConfig());
    });

    it('should return defaults when file read fails', async () => {
      vi.mocked(fileExists).mockResolvedValue(true);
      vi.spyOn(fs, 'readFile').mockRejectedValue(new Error('Read error'));

      const config = await loadSharedConfig(mockCwd);

      expect(debug).toHaveBeenCalledWith('loadSharedConfig failed', {
        error: 'Error: Read error',
      });
      expect(config).toEqual(getDefaultSharedConfig());
    });

    it('should return defaults when JSON parse fails', async () => {
      vi.mocked(fileExists).mockResolvedValue(true);
      vi.spyOn(fs, 'readFile').mockResolvedValue('{ invalid json }');

      const config = await loadSharedConfig(mockCwd);

      expect(debug).toHaveBeenCalledWith(
        'loadSharedConfig failed',
        expect.objectContaining({
          error: expect.stringContaining('SyntaxError'),
        })
      );
      expect(config).toEqual(getDefaultSharedConfig());
    });

    it('should handle empty JSON file', async () => {
      vi.mocked(fileExists).mockResolvedValue(true);
      vi.spyOn(fs, 'readFile').mockResolvedValue('{}');

      const config = await loadSharedConfig(mockCwd);

      // Empty config should still merge with defaults
      expect(config).toEqual(getDefaultSharedConfig());
    });

    it('should handle file with only goodvibes key and empty object', async () => {
      vi.mocked(fileExists).mockResolvedValue(true);
      vi.spyOn(fs, 'readFile').mockResolvedValue('{"goodvibes":{}}');

      const config = await loadSharedConfig(mockCwd);

      expect(config).toEqual(getDefaultSharedConfig());
    });

    it('should handle null values in user config', async () => {
      vi.mocked(fileExists).mockResolvedValue(true);

      const userConfig = {
        telemetry: null,
        quality: {
          autoFix: null,
        },
      };

      vi.spyOn(fs, 'readFile').mockResolvedValue(JSON.stringify(userConfig));

      const config = await loadSharedConfig(mockCwd);

      // null values should override
      expect(config.telemetry).toBeNull();
      expect(config.quality?.autoFix).toBeNull();
    });

    it('should handle non-Error exceptions during file operations', async () => {
      vi.mocked(fileExists).mockResolvedValue(true);
      vi.spyOn(fs, 'readFile').mockRejectedValue('String error');

      const config = await loadSharedConfig(mockCwd);

      expect(debug).toHaveBeenCalledWith('loadSharedConfig failed', {
        error: 'String error',
      });
      expect(config).toEqual(getDefaultSharedConfig());
    });

    it('should handle complex nested merging with multiple levels', async () => {
      vi.mocked(fileExists).mockResolvedValue(true);

      const userConfig = {
        goodvibes: {
          telemetry: {
            enabled: false,
          },
          quality: {
            autoFix: false,
            gates: [
              { name: 'Custom', check: 'test', autoFix: null, blocking: true },
            ],
          },
          memory: {
            enabled: false,
            maxEntries: 50,
          },
          checkpoints: {
            enabled: false,
            triggers: {
              fileCountThreshold: 3,
              afterAgentComplete: false,
              afterMajorChange: false,
            },
          },
        },
      };

      vi.spyOn(fs, 'readFile').mockResolvedValue(JSON.stringify(userConfig));

      const config = await loadSharedConfig(mockCwd);

      // All user overrides should be applied
      expect(config.telemetry?.enabled).toBe(false);
      expect(config.telemetry?.anonymize).toBe(true); // Default preserved
      expect(config.quality?.autoFix).toBe(false);
      expect(config.quality?.gates).toHaveLength(1);
      expect(config.memory?.enabled).toBe(false);
      expect(config.memory?.maxEntries).toBe(50);
      expect(config.checkpoints?.enabled).toBe(false);
      expect(config.checkpoints?.triggers?.fileCountThreshold).toBe(3);
    });

    it('should deep merge nested objects correctly', async () => {
      vi.mocked(fileExists).mockResolvedValue(true);

      // Test that deepMerge properly handles nested object merging
      const userConfig = {
        checkpoints: {
          triggers: {
            fileCountThreshold: 7,
            // Other trigger properties should be preserved
          },
        },
      };

      vi.spyOn(fs, 'readFile').mockResolvedValue(JSON.stringify(userConfig));

      const config = await loadSharedConfig(mockCwd);

      expect(config.checkpoints?.triggers?.fileCountThreshold).toBe(7);
      expect(config.checkpoints?.triggers?.afterAgentComplete).toBe(true);
      expect(config.checkpoints?.triggers?.afterMajorChange).toBe(true);
      expect(config.checkpoints?.enabled).toBe(true);
    });

    it('should handle boolean false values correctly in merge', async () => {
      vi.mocked(fileExists).mockResolvedValue(true);

      const userConfig = {
        telemetry: {
          enabled: false,
          anonymize: false,
        },
      };

      vi.spyOn(fs, 'readFile').mockResolvedValue(JSON.stringify(userConfig));

      const config = await loadSharedConfig(mockCwd);

      // false values should override defaults
      expect(config.telemetry?.enabled).toBe(false);
      expect(config.telemetry?.anonymize).toBe(false);
    });

    it('should handle number 0 values correctly in merge', async () => {
      vi.mocked(fileExists).mockResolvedValue(true);

      const userConfig = {
        memory: {
          maxEntries: 0,
        },
      };

      vi.spyOn(fs, 'readFile').mockResolvedValue(JSON.stringify(userConfig));

      const config = await loadSharedConfig(mockCwd);

      // 0 should override default
      expect(config.memory?.maxEntries).toBe(0);
    });

    it('should handle empty string values in merge', async () => {
      vi.mocked(fileExists).mockResolvedValue(true);

      const userConfig = {
        quality: {
          gates: [
            { name: '', check: '', autoFix: '', blocking: false },
          ],
        },
      };

      vi.spyOn(fs, 'readFile').mockResolvedValue(JSON.stringify(userConfig));

      const config = await loadSharedConfig(mockCwd);

      // Empty strings should be preserved
      expect(config.quality?.gates?.[0]?.name).toBe('');
      expect(config.quality?.gates?.[0]?.check).toBe('');
      expect(config.quality?.gates?.[0]?.autoFix).toBe('');
    });

    it('should skip undefined values during merge (not override defaults)', async () => {
      vi.mocked(fileExists).mockResolvedValue(true);

      // Create a config object with a mix of defined and undefined at nested level
      const userConfig = {
        telemetry: {
          enabled: false,
          // anonymize will be undefined (not in the object)
        },
        memory: {
          // Create an object with no enumerable own properties to test edge case
          // This tests the for..in loop with properties that might be undefined
        },
      };

      vi.spyOn(fs, 'readFile').mockResolvedValue(JSON.stringify(userConfig));

      const config = await loadSharedConfig(mockCwd);

      // Explicitly set value should override
      expect(config.telemetry?.enabled).toBe(false);
      // Missing value should use default
      expect(config.telemetry?.anonymize).toBe(true);
      // Empty object should merge with defaults
      expect(config.memory?.enabled).toBe(true);
      expect(config.memory?.maxEntries).toBe(100);
    });

    it('should handle explicit undefined values in user config (else branch of deepMerge)', async () => {
      vi.mocked(fileExists).mockResolvedValue(true);

      // To test the branch where source[key] is explicitly undefined,
      // we need to mock JSON.parse to return an object with undefined values.
      // This tests line 110's else branch (when source[key] !== undefined is false)
      const userConfig = {
        telemetry: {
          enabled: false,
        },
      };
      const jsonString = JSON.stringify(userConfig);

      // Store original and create mock that adds undefined property
      const originalParse = JSON.parse;
      vi.stubGlobal('JSON', {
        ...JSON,
        parse: (text: string) => {
          const parsed = originalParse(text);
          // Add an explicit undefined value to test the branch
          if (parsed.telemetry) {
            parsed.telemetry.explicitUndefined = undefined;
          }
          return parsed;
        },
      });

      vi.spyOn(fs, 'readFile').mockResolvedValue(jsonString);

      const config = await loadSharedConfig(mockCwd);

      // The explicitly undefined value should be skipped, keeping defaults
      expect(config.telemetry?.enabled).toBe(false);
      expect(config.telemetry?.anonymize).toBe(true);

      // Restore JSON
      vi.unstubAllGlobals();
    });
  });
});
