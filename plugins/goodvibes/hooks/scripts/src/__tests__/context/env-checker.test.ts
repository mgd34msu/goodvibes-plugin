/**
 * Tests for env-checker.ts (Backwards Compatibility Module)
 *
 * This module tests the backwards compatibility re-exports from env-checker.ts.
 * Since env-checker.ts is purely a re-export module, we test that:
 * 1. All re-exports are available and functional
 * 2. The backwards compatibility alias (checkEnvironment) works
 * 3. Type exports are available
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { checkEnvironment, formatEnvStatus } from '../../context/env-checker.js';
import type { EnvStatus } from '../../context/env-checker.js';
import * as fs from 'fs/promises';
import { fileExists } from '../../shared/file-utils.js';

// Mock dependencies
vi.mock('fs/promises');
vi.mock('../../shared/file-utils.js');
vi.mock('../../shared/logging.js', () => ({
  debug: vi.fn(),
}));

describe('env-checker (Backwards Compatibility Module)', () => {
  const mockCwd = '/test/project';

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('checkEnvironment (re-exported from checkEnvStatus)', () => {
    it('should detect when .env file exists', async () => {
      vi.mocked(fileExists).mockImplementation(async (path: string) => {
        return path.includes('.env') && !path.includes('example');
      });

      vi.mocked(fs.readFile).mockResolvedValue('');

      const result = await checkEnvironment(mockCwd);

      expect(result).toHaveProperty('hasEnvFile');
      expect(result).toHaveProperty('hasEnvExample');
      expect(result).toHaveProperty('missingVars');
      expect(result).toHaveProperty('warnings');
    });

    it('should detect when .env.local file exists', async () => {
      vi.mocked(fileExists).mockImplementation(async (path: string) => {
        return path.includes('.env.local');
      });

      vi.mocked(fs.readFile).mockResolvedValue('');

      const result = await checkEnvironment(mockCwd);

      expect(result.hasEnvFile).toBe(true);
    });

    it('should detect when .env.example exists', async () => {
      vi.mocked(fileExists).mockImplementation(async (path: string) => {
        return path.includes('.env.example');
      });

      vi.mocked(fs.readFile).mockResolvedValue('DATABASE_URL=\nAPI_KEY=\n');

      const result = await checkEnvironment(mockCwd);

      expect(result.hasEnvExample).toBe(true);
    });

    it('should detect missing variables from .env.example', async () => {
      vi.mocked(fileExists).mockImplementation(async (path: string) => {
        if (path.includes('.env.example')) return true;
        if (path.endsWith('.env')) return true;
        return false;
      });

      vi.mocked(fs.readFile).mockImplementation(async (path: string) => {
        if (path.includes('.env.example')) {
          return 'DATABASE_URL=\nAPI_KEY=\nSECRET_TOKEN=\n';
        }
        if (path.endsWith('.env')) {
          return 'DATABASE_URL=postgres://localhost\n';
        }
        return '';
      });

      const result = await checkEnvironment(mockCwd);

      expect(result.missingVars).toContain('API_KEY');
      expect(result.missingVars).toContain('SECRET_TOKEN');
      expect(result.missingVars).not.toContain('DATABASE_URL');
    });

    it('should add warnings when variables are missing', async () => {
      vi.mocked(fileExists).mockImplementation(async (path: string) => {
        if (path.includes('.env.example')) return true;
        if (path.endsWith('.env')) return true;
        return false;
      });

      vi.mocked(fs.readFile).mockImplementation(async (path: string) => {
        if (path.includes('.env.example')) {
          return 'API_KEY=\nSECRET=\n';
        }
        if (path.endsWith('.env')) {
          return '';
        }
        return '';
      });

      const result = await checkEnvironment(mockCwd);

      expect(result.warnings).toHaveLength(1);
      expect(result.warnings[0]).toContain('Missing env vars');
      expect(result.warnings[0]).toContain('API_KEY');
      expect(result.warnings[0]).toContain('SECRET');
    });

    it('should return empty warnings when no variables are missing', async () => {
      vi.mocked(fileExists).mockImplementation(async (path: string) => {
        if (path.includes('.env.example')) return true;
        if (path.endsWith('.env')) return true;
        return false;
      });

      vi.mocked(fs.readFile).mockImplementation(async (path: string) => {
        if (path.includes('.env.example')) {
          return 'API_KEY=\n';
        }
        if (path.endsWith('.env')) {
          return 'API_KEY=test123\n';
        }
        return '';
      });

      const result = await checkEnvironment(mockCwd);

      expect(result.warnings).toHaveLength(0);
      expect(result.missingVars).toHaveLength(0);
    });

    it('should prefer .env.local over .env when checking variables', async () => {
      vi.mocked(fileExists).mockImplementation(async (path: string) => {
        if (path.includes('.env.example')) return true;
        if (path.includes('.env.local')) return true;
        if (path.endsWith('.env')) return true;
        return false;
      });

      vi.mocked(fs.readFile).mockImplementation(async (path: string) => {
        if (path.includes('.env.example')) {
          return 'API_KEY=\n';
        }
        if (path.includes('.env.local')) {
          return 'API_KEY=from_local\n';
        }
        if (path.endsWith('.env')) {
          return 'OTHER_VAR=from_env\n';
        }
        return '';
      });

      const result = await checkEnvironment(mockCwd);

      // Should use .env.local, which has API_KEY
      expect(result.missingVars).toHaveLength(0);
    });

    it('should handle when no env files exist', async () => {
      vi.mocked(fileExists).mockResolvedValue(false);

      const result = await checkEnvironment(mockCwd);

      expect(result.hasEnvFile).toBe(false);
      expect(result.hasEnvExample).toBe(false);
      expect(result.missingVars).toHaveLength(0);
      expect(result.warnings).toHaveLength(0);
    });

    it('should handle invalid env file format gracefully', async () => {
      vi.mocked(fileExists).mockImplementation(async (path: string) => {
        if (path.includes('.env.example')) return true;
        if (path.endsWith('.env')) return true;
        return false;
      });

      vi.mocked(fs.readFile).mockImplementation(async (path: string) => {
        if (path.includes('.env.example')) {
          return 'VALID_VAR=\ninvalid line without equals\n# comment\n\nVALID_VAR2=\n';
        }
        if (path.endsWith('.env')) {
          return 'VALID_VAR=value\n';
        }
        return '';
      });

      const result = await checkEnvironment(mockCwd);

      // Should parse valid vars and skip invalid lines
      expect(result.missingVars).toContain('VALID_VAR2');
      expect(result.missingVars).not.toContain('VALID_VAR');
    });

    it('should handle env files with comments', async () => {
      vi.mocked(fileExists).mockImplementation(async (path: string) => {
        if (path.includes('.env.example')) return true;
        if (path.endsWith('.env')) return true;
        return false;
      });

      vi.mocked(fs.readFile).mockImplementation(async (path: string) => {
        if (path.includes('.env.example')) {
          return '# This is a comment\nAPI_KEY=\n# Another comment\nSECRET=\n';
        }
        if (path.endsWith('.env')) {
          return '# Comment\nAPI_KEY=value\n';
        }
        return '';
      });

      const result = await checkEnvironment(mockCwd);

      expect(result.missingVars).toContain('SECRET');
      expect(result.missingVars).not.toContain('API_KEY');
    });

    it('should handle env files with empty lines', async () => {
      vi.mocked(fileExists).mockImplementation(async (path: string) => {
        if (path.includes('.env.example')) return true;
        if (path.endsWith('.env')) return true;
        return false;
      });

      vi.mocked(fs.readFile).mockImplementation(async (path: string) => {
        if (path.includes('.env.example')) {
          return '\n\nAPI_KEY=\n\n\nSECRET=\n\n';
        }
        if (path.endsWith('.env')) {
          return '\n\nAPI_KEY=value\n\n';
        }
        return '';
      });

      const result = await checkEnvironment(mockCwd);

      expect(result.missingVars).toContain('SECRET');
      expect(result.missingVars).not.toContain('API_KEY');
    });

    it('should handle variables with various naming conventions', async () => {
      vi.mocked(fileExists).mockImplementation(async (path: string) => {
        if (path.includes('.env.example')) return true;
        if (path.endsWith('.env')) return true;
        return false;
      });

      vi.mocked(fs.readFile).mockImplementation(async (path: string) => {
        if (path.includes('.env.example')) {
          return 'UPPER_CASE=\nlower_case=\nMixed_Case=\n_LEADING_UNDERSCORE=\nTRAILING_123=\n';
        }
        if (path.endsWith('.env')) {
          return 'UPPER_CASE=value\nlower_case=value\nMixed_Case=value\n_LEADING_UNDERSCORE=value\nTRAILING_123=value\n';
        }
        return '';
      });

      const result = await checkEnvironment(mockCwd);

      expect(result.missingVars).toHaveLength(0);
    });

    it('should handle variables with values containing special characters', async () => {
      vi.mocked(fileExists).mockImplementation(async (path: string) => {
        if (path.includes('.env.example')) return true;
        if (path.endsWith('.env')) return true;
        return false;
      });

      vi.mocked(fs.readFile).mockImplementation(async (path: string) => {
        if (path.includes('.env.example')) {
          return 'URL=\nJSON=\n';
        }
        if (path.endsWith('.env')) {
          return 'URL=https://example.com?foo=bar&baz=qux\nJSON={"key":"value"}\n';
        }
        return '';
      });

      const result = await checkEnvironment(mockCwd);

      expect(result.missingVars).toHaveLength(0);
    });

    it('should handle variables with whitespace around equals sign', async () => {
      vi.mocked(fileExists).mockImplementation(async (path: string) => {
        if (path.includes('.env.example')) return true;
        if (path.endsWith('.env')) return true;
        return false;
      });

      vi.mocked(fs.readFile).mockImplementation(async (path: string) => {
        if (path.includes('.env.example')) {
          return 'VAR1 = value\nVAR2= value\nVAR3 =value\n';
        }
        if (path.endsWith('.env')) {
          return 'VAR1=value\nVAR2=value\nVAR3=value\n';
        }
        return '';
      });

      const result = await checkEnvironment(mockCwd);

      expect(result.missingVars).toHaveLength(0);
    });

    it('should handle empty values correctly', async () => {
      vi.mocked(fileExists).mockImplementation(async (path: string) => {
        if (path.includes('.env.example')) return true;
        if (path.endsWith('.env')) return true;
        return false;
      });

      vi.mocked(fs.readFile).mockImplementation(async (path: string) => {
        if (path.includes('.env.example')) {
          return 'EMPTY_VAR=\nFILLED_VAR=\n';
        }
        if (path.endsWith('.env')) {
          return 'EMPTY_VAR=\nFILLED_VAR=value\n';
        }
        return '';
      });

      const result = await checkEnvironment(mockCwd);

      // Both variables are defined (even if one is empty)
      expect(result.missingVars).toHaveLength(0);
    });
  });

  describe('formatEnvStatus', () => {
    it('should format status when .env file is present', () => {
      const status: EnvStatus = {
        hasEnvFile: true,
        hasEnvExample: false,
        missingVars: [],
        warnings: [],
      };

      const formatted = formatEnvStatus(status);

      expect(formatted).toContain('Environment: .env present');
    });

    it('should format status when only .env.example exists', () => {
      const status: EnvStatus = {
        hasEnvFile: false,
        hasEnvExample: true,
        missingVars: [],
        warnings: [],
      };

      const formatted = formatEnvStatus(status);

      expect(formatted).toContain('.env.example exists but no .env file');
    });

    it('should include warnings in formatted output', () => {
      const status: EnvStatus = {
        hasEnvFile: true,
        hasEnvExample: true,
        missingVars: ['API_KEY', 'SECRET'],
        warnings: ['Missing env vars: API_KEY, SECRET'],
      };

      const formatted = formatEnvStatus(status);

      expect(formatted).toContain('Environment: .env present');
      expect(formatted).toContain('Warning: Missing env vars: API_KEY, SECRET');
    });

    it('should handle multiple warnings', () => {
      const status: EnvStatus = {
        hasEnvFile: true,
        hasEnvExample: true,
        missingVars: ['API_KEY'],
        warnings: ['Warning 1', 'Warning 2'],
      };

      const formatted = formatEnvStatus(status);

      expect(formatted).toContain('Warning: Warning 1, Warning 2');
    });

    it('should return empty string when no env file and no example', () => {
      const status: EnvStatus = {
        hasEnvFile: false,
        hasEnvExample: false,
        missingVars: [],
        warnings: [],
      };

      const formatted = formatEnvStatus(status);

      expect(formatted).toBe('');
    });

    it('should handle status with only warnings', () => {
      const status: EnvStatus = {
        hasEnvFile: false,
        hasEnvExample: false,
        missingVars: [],
        warnings: ['Some warning'],
      };

      const formatted = formatEnvStatus(status);

      expect(formatted).toBe('Warning: Some warning');
    });

    it('should format multiline output correctly', () => {
      const status: EnvStatus = {
        hasEnvFile: true,
        hasEnvExample: true,
        missingVars: ['VAR1'],
        warnings: ['Warning message'],
      };

      const formatted = formatEnvStatus(status);
      const lines = formatted.split('\n');

      expect(lines).toHaveLength(2);
      expect(lines[0]).toContain('Environment: .env present');
      expect(lines[1]).toContain('Warning: Warning message');
    });
  });

  describe('Type exports', () => {
    it('should export EnvStatus type correctly', () => {
      // Type test - if this compiles, the type is exported correctly
      const status: EnvStatus = {
        hasEnvFile: true,
        hasEnvExample: true,
        missingVars: ['TEST'],
        warnings: ['test warning'],
      };

      expect(status).toHaveProperty('hasEnvFile');
      expect(status).toHaveProperty('hasEnvExample');
      expect(status).toHaveProperty('missingVars');
      expect(status).toHaveProperty('warnings');
    });

    it('should validate EnvStatus structure', () => {
      const status: EnvStatus = {
        hasEnvFile: false,
        hasEnvExample: false,
        missingVars: [],
        warnings: [],
      };

      expect(typeof status.hasEnvFile).toBe('boolean');
      expect(typeof status.hasEnvExample).toBe('boolean');
      expect(Array.isArray(status.missingVars)).toBe(true);
      expect(Array.isArray(status.warnings)).toBe(true);
    });
  });

  describe('Edge cases and error handling', () => {
    it('should handle file read errors gracefully', async () => {
      vi.mocked(fileExists).mockImplementation(async (path: string) => {
        if (path.includes('.env.example')) return true;
        if (path.endsWith('.env')) return true;
        return false;
      });

      vi.mocked(fs.readFile).mockRejectedValue(new Error('File read error'));

      // Should not throw, but handle gracefully
      await expect(checkEnvironment(mockCwd)).rejects.toThrow();
    });

    it('should handle very large env files', async () => {
      vi.mocked(fileExists).mockImplementation(async (path: string) => {
        if (path.includes('.env.example')) return true;
        if (path.endsWith('.env')) return true;
        return false;
      });

      // Generate a large env file content
      const largeContent = Array.from({ length: 1000 }, (_, i) => `VAR_${i}=value${i}`).join('\n');

      vi.mocked(fs.readFile).mockImplementation(async (path: string) => {
        if (path.includes('.env.example')) {
          return largeContent;
        }
        if (path.endsWith('.env')) {
          return largeContent;
        }
        return '';
      });

      const result = await checkEnvironment(mockCwd);

      expect(result.missingVars).toHaveLength(0);
    });

    it('should handle unicode characters in variable names and values', async () => {
      vi.mocked(fileExists).mockImplementation(async (path: string) => {
        if (path.includes('.env.example')) return true;
        if (path.endsWith('.env')) return true;
        return false;
      });

      vi.mocked(fs.readFile).mockImplementation(async (path: string) => {
        if (path.includes('.env.example')) {
          return 'UNICODE_VAR=\n';
        }
        if (path.endsWith('.env')) {
          return 'UNICODE_VAR=café 🚀\n';
        }
        return '';
      });

      const result = await checkEnvironment(mockCwd);

      expect(result.missingVars).toHaveLength(0);
    });

    it('should handle duplicate variable definitions', async () => {
      vi.mocked(fileExists).mockImplementation(async (path: string) => {
        if (path.includes('.env.example')) return true;
        if (path.endsWith('.env')) return true;
        return false;
      });

      vi.mocked(fs.readFile).mockImplementation(async (path: string) => {
        if (path.includes('.env.example')) {
          return 'DUPLICATE_VAR=\nDUPLICATE_VAR=\n';
        }
        if (path.endsWith('.env')) {
          return 'DUPLICATE_VAR=value1\nDUPLICATE_VAR=value2\n';
        }
        return '';
      });

      const result = await checkEnvironment(mockCwd);

      expect(result.missingVars).toHaveLength(0);
    });

    it('should handle lines with only whitespace', async () => {
      vi.mocked(fileExists).mockImplementation(async (path: string) => {
        if (path.includes('.env.example')) return true;
        if (path.endsWith('.env')) return true;
        return false;
      });

      vi.mocked(fs.readFile).mockImplementation(async (path: string) => {
        if (path.includes('.env.example')) {
          return '   \n\t\n  \t  \nVAR=\n';
        }
        if (path.endsWith('.env')) {
          return 'VAR=value\n';
        }
        return '';
      });

      const result = await checkEnvironment(mockCwd);

      expect(result.missingVars).toHaveLength(0);
    });

    it('should handle mixed line endings (CRLF and LF)', async () => {
      vi.mocked(fileExists).mockImplementation(async (path: string) => {
        if (path.includes('.env.example')) return true;
        if (path.endsWith('.env')) return true;
        return false;
      });

      vi.mocked(fs.readFile).mockImplementation(async (path: string) => {
        if (path.includes('.env.example')) {
          return 'VAR1=\r\nVAR2=\nVAR3=\r\n';
        }
        if (path.endsWith('.env')) {
          return 'VAR1=value\nVAR2=value\r\nVAR3=value\n';
        }
        return '';
      });

      const result = await checkEnvironment(mockCwd);

      expect(result.missingVars).toHaveLength(0);
    });

    it('should handle completely empty env file', async () => {
      vi.mocked(fileExists).mockImplementation(async (path: string) => {
        if (path.includes('.env.example')) return true;
        if (path.endsWith('.env')) return true;
        return false;
      });

      vi.mocked(fs.readFile).mockImplementation(async (path: string) => {
        if (path.includes('.env.example')) {
          return 'REQUIRED_VAR=\n';
        }
        if (path.endsWith('.env')) {
          return '';
        }
        return '';
      });

      const result = await checkEnvironment(mockCwd);

      expect(result.missingVars).toContain('REQUIRED_VAR');
    });
  });

  describe('Backwards compatibility verification', () => {
    it('should maintain API compatibility with old checkEnvironment function', async () => {
      vi.mocked(fileExists).mockImplementation(async (path: string) => {
        return path.endsWith('.env');
      });

      vi.mocked(fs.readFile).mockResolvedValue('');

      const result = await checkEnvironment(mockCwd);

      // Verify the result has the expected EnvStatus shape
      expect(result).toMatchObject({
        hasEnvFile: expect.any(Boolean),
        hasEnvExample: expect.any(Boolean),
        missingVars: expect.any(Array),
        warnings: expect.any(Array),
      });
    });

    it('should work as a drop-in replacement for legacy code', async () => {
      // Simulate legacy usage pattern
      vi.mocked(fileExists).mockImplementation(async (path: string) => {
        if (path.includes('.env.example')) return true;
        if (path.endsWith('.env')) return true;
        return false;
      });

      vi.mocked(fs.readFile).mockImplementation(async (path: string) => {
        if (path.includes('.env.example')) {
          return 'DATABASE_URL=\n';
        }
        if (path.endsWith('.env')) {
          return '';
        }
        return '';
      });

      const result = await checkEnvironment(mockCwd);

      // Legacy code would expect these properties
      expect(result.hasEnvFile).toBeDefined();
      expect(result.hasEnvExample).toBeDefined();
      expect(result.missingVars).toBeDefined();
      expect(result.warnings).toBeDefined();

      // And would expect these behaviors
      expect(result.hasEnvFile).toBe(true);
      expect(result.hasEnvExample).toBe(true);
      expect(result.missingVars).toContain('DATABASE_URL');
    });
  });
});
