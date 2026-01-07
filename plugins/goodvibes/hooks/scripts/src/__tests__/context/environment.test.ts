/**
 * Tests for environment.ts
 *
 * This module tests the comprehensive environment analysis functions.
 * Aims for 100% line and branch coverage.
 */

import * as fs from 'fs/promises';

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import {
  checkEnvStatus,
  analyzeEnvironment,
  checkEnvironment,
  formatEnvStatus,
  formatEnvironment,
  type EnvStatus,
  type EnvironmentContext,
} from '../../context/environment.js';
import { fileExists } from '../../shared/file-utils.js';

// Mock dependencies
vi.mock('fs/promises');
vi.mock('../../shared/file-utils.js');
vi.mock('../../shared/logging.js', () => ({
  debug: vi.fn(),
}));

describe('environment.ts', () => {
  const mockCwd = '/test/project';

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // =============================================================================
  // checkEnvStatus Tests
  // =============================================================================

  describe('checkEnvStatus', () => {
    it('should detect .env file exists', async () => {
      vi.mocked(fileExists).mockImplementation(async (path: string) => {
        return (
          path.endsWith('.env') &&
          !path.includes('example') &&
          !path.includes('local')
        );
      });

      const result = await checkEnvStatus(mockCwd);

      expect(result.hasEnvFile).toBe(true);
      expect(result.hasEnvExample).toBe(false);
    });

    it('should detect .env.local file exists', async () => {
      vi.mocked(fileExists).mockImplementation(async (path: string) => {
        return path.includes('.env.local');
      });

      const result = await checkEnvStatus(mockCwd);

      expect(result.hasEnvFile).toBe(true);
    });

    it('should detect .env.example exists', async () => {
      vi.mocked(fileExists).mockImplementation(async (path: string) => {
        return path.includes('.env.example');
      });

      vi.mocked(fs.readFile).mockResolvedValue('API_KEY=\n');

      const result = await checkEnvStatus(mockCwd);

      expect(result.hasEnvExample).toBe(true);
      expect(result.hasEnvFile).toBe(false);
    });

    it('should detect missing variables when .env.example exists', async () => {
      vi.mocked(fileExists).mockImplementation(async (path: string) => {
        if (path.includes('.env.example')) {
          return true;
        }
        if (path.endsWith('.env') && !path.includes('local')) {
          return true;
        }
        return false;
      });

      vi.mocked(fs.readFile).mockImplementation(async (filePath) => {
        const pathStr = filePath.toString();
        if (pathStr.includes('.env.example')) {
          return 'API_KEY=\nSECRET_TOKEN=\nDATABASE_URL=\n';
        }
        if (pathStr.endsWith('.env')) {
          return 'DATABASE_URL=postgres://localhost\n';
        }
        return '';
      });

      const result = await checkEnvStatus(mockCwd);

      expect(result.missingVars).toContain('API_KEY');
      expect(result.missingVars).toContain('SECRET_TOKEN');
      expect(result.missingVars).not.toContain('DATABASE_URL');
      expect(result.warnings).toHaveLength(1);
      expect(result.warnings[0]).toContain('Missing env vars');
    });

    it('should prefer .env.local over .env when checking variables', async () => {
      vi.mocked(fileExists).mockImplementation(async (path: string) => {
        if (path.includes('.env.example')) {
          return true;
        }
        if (path.includes('.env.local')) {
          return true;
        }
        if (path.endsWith('.env') && !path.includes('local')) {
          return true;
        }
        return false;
      });

      vi.mocked(fs.readFile).mockImplementation(async (filePath) => {
        const pathStr = filePath.toString();
        if (pathStr.includes('.env.example')) {
          return 'API_KEY=\n';
        }
        if (pathStr.includes('.env.local')) {
          return 'API_KEY=from_local\n';
        }
        // .env does not have API_KEY
        if (pathStr.endsWith('.env') && !pathStr.includes('local')) {
          return 'OTHER=value\n';
        }
        return '';
      });

      const result = await checkEnvStatus(mockCwd);

      // Should use .env.local which has API_KEY
      expect(result.missingVars).toHaveLength(0);
    });

    it('should fall back to .env when .env.local does not exist', async () => {
      vi.mocked(fileExists).mockImplementation(async (path: string) => {
        if (path.includes('.env.example')) {
          return true;
        }
        if (path.includes('.env.local')) {
          return false;
        }
        if (path.endsWith('.env') && !path.includes('local')) {
          return true;
        }
        return false;
      });

      vi.mocked(fs.readFile).mockImplementation(async (filePath) => {
        const pathStr = filePath.toString();
        if (pathStr.includes('.env.example')) {
          return 'API_KEY=\n';
        }
        if (pathStr.endsWith('.env') && !pathStr.includes('local')) {
          return 'API_KEY=from_env\n';
        }
        return '';
      });

      const result = await checkEnvStatus(mockCwd);

      expect(result.missingVars).toHaveLength(0);
    });

    it('should return empty warnings when no variables are missing', async () => {
      vi.mocked(fileExists).mockImplementation(async (path: string) => {
        if (path.includes('.env.example')) {
          return true;
        }
        if (path.endsWith('.env') && !path.includes('local')) {
          return true;
        }
        return false;
      });

      vi.mocked(fs.readFile).mockImplementation(async (filePath) => {
        const pathStr = filePath.toString();
        if (pathStr.includes('.env.example')) {
          return 'API_KEY=\n';
        }
        if (pathStr.endsWith('.env')) {
          return 'API_KEY=test123\n';
        }
        return '';
      });

      const result = await checkEnvStatus(mockCwd);

      expect(result.warnings).toHaveLength(0);
      expect(result.missingVars).toHaveLength(0);
    });

    it('should handle when no env files exist', async () => {
      vi.mocked(fileExists).mockResolvedValue(false);

      const result = await checkEnvStatus(mockCwd);

      expect(result.hasEnvFile).toBe(false);
      expect(result.hasEnvExample).toBe(false);
      expect(result.missingVars).toHaveLength(0);
      expect(result.warnings).toHaveLength(0);
    });

    it('should parse env files with comments and empty lines', async () => {
      vi.mocked(fileExists).mockImplementation(async (path: string) => {
        if (path.includes('.env.example')) {
          return true;
        }
        if (path.endsWith('.env') && !path.includes('local')) {
          return true;
        }
        return false;
      });

      vi.mocked(fs.readFile).mockImplementation(async (filePath) => {
        const pathStr = filePath.toString();
        if (pathStr.includes('.env.example')) {
          return '# Comment\n\nAPI_KEY=\n# Another comment\nSECRET=\n';
        }
        if (pathStr.endsWith('.env')) {
          return '# Comment\nAPI_KEY=value\n';
        }
        return '';
      });

      const result = await checkEnvStatus(mockCwd);

      expect(result.missingVars).toContain('SECRET');
      expect(result.missingVars).not.toContain('API_KEY');
    });

    it('should handle variables with whitespace around equals', async () => {
      vi.mocked(fileExists).mockImplementation(async (path: string) => {
        if (path.includes('.env.example')) {
          return true;
        }
        if (path.endsWith('.env') && !path.includes('local')) {
          return true;
        }
        return false;
      });

      vi.mocked(fs.readFile).mockImplementation(async (filePath) => {
        const pathStr = filePath.toString();
        if (pathStr.includes('.env.example')) {
          return 'VAR1 = value\nVAR2= value\nVAR3 =value\n';
        }
        if (pathStr.endsWith('.env')) {
          return 'VAR1=v\nVAR2=v\nVAR3=v\n';
        }
        return '';
      });

      const result = await checkEnvStatus(mockCwd);

      expect(result.missingVars).toHaveLength(0);
    });

    it('should skip invalid lines without equals sign', async () => {
      vi.mocked(fileExists).mockImplementation(async (path: string) => {
        if (path.includes('.env.example')) {
          return true;
        }
        if (path.endsWith('.env') && !path.includes('local')) {
          return true;
        }
        return false;
      });

      vi.mocked(fs.readFile).mockImplementation(async (filePath) => {
        const pathStr = filePath.toString();
        if (pathStr.includes('.env.example')) {
          return 'VALID_VAR=\ninvalid line without equals\nVALID_VAR2=\n';
        }
        if (pathStr.endsWith('.env')) {
          return 'VALID_VAR=value\n';
        }
        return '';
      });

      const result = await checkEnvStatus(mockCwd);

      expect(result.missingVars).toContain('VALID_VAR2');
      expect(result.missingVars).not.toContain('VALID_VAR');
    });
  });

  // =============================================================================
  // analyzeEnvironment Tests
  // =============================================================================

  describe('analyzeEnvironment', () => {
    it('should detect multiple env file variants', async () => {
      vi.mocked(fileExists).mockImplementation(async (path: string) => {
        if (path.endsWith('.env')) {
          return true;
        }
        if (path.includes('.env.local')) {
          return true;
        }
        if (path.includes('.env.development')) {
          return true;
        }
        return false;
      });

      vi.mocked(fs.readFile).mockImplementation(async (filePath) => {
        const pathStr = filePath.toString();
        if (
          pathStr.endsWith('.env') &&
          !pathStr.includes('local') &&
          !pathStr.includes('development')
        ) {
          return 'VAR1=value\n';
        }
        if (pathStr.includes('.env.local')) {
          return 'VAR2=value\n';
        }
        if (
          pathStr.includes('.env.development') &&
          !pathStr.includes('local')
        ) {
          return 'VAR3=value\n';
        }
        return '';
      });

      const result = await analyzeEnvironment(mockCwd);

      expect(result.envFiles).toContain('.env');
      expect(result.envFiles).toContain('.env.local');
      expect(result.envFiles).toContain('.env.development');
      expect(result.definedVars).toContain('VAR1');
      expect(result.definedVars).toContain('VAR2');
      expect(result.definedVars).toContain('VAR3');
    });

    it('should deduplicate defined variables', async () => {
      vi.mocked(fileExists).mockImplementation(async (path: string) => {
        if (path.endsWith('.env') && !path.includes('local')) {
          return true;
        }
        if (path.includes('.env.local')) {
          return true;
        }
        return false;
      });

      vi.mocked(fs.readFile).mockImplementation(async (filePath) => {
        const pathStr = filePath.toString();
        if (pathStr.endsWith('.env') && !pathStr.includes('local')) {
          return 'API_KEY=value1\nSHARED=a\n';
        }
        if (pathStr.includes('.env.local')) {
          return 'API_KEY=value2\nSHARED=b\n';
        }
        return '';
      });

      const result = await analyzeEnvironment(mockCwd);

      // Should deduplicate
      const apiKeyCount = result.definedVars.filter(
        (v) => v === 'API_KEY'
      ).length;
      const sharedCount = result.definedVars.filter(
        (v) => v === 'SHARED'
      ).length;
      expect(apiKeyCount).toBe(1);
      expect(sharedCount).toBe(1);
    });

    it('should check .env.example for required variables', async () => {
      vi.mocked(fileExists).mockImplementation(async (path: string) => {
        if (path.includes('.env.example')) {
          return true;
        }
        if (
          path.endsWith('.env') &&
          !path.includes('local') &&
          !path.includes('example')
        ) {
          return true;
        }
        return false;
      });

      vi.mocked(fs.readFile).mockImplementation(async (filePath) => {
        const pathStr = filePath.toString();
        if (pathStr.includes('.env.example')) {
          return 'REQUIRED_VAR=\nOPTIONAL_VAR=\n';
        }
        if (pathStr.endsWith('.env') && !pathStr.includes('example')) {
          return 'OPTIONAL_VAR=value\n';
        }
        return '';
      });

      const result = await analyzeEnvironment(mockCwd);

      expect(result.hasEnvExample).toBe(true);
      expect(result.missingVars).toContain('REQUIRED_VAR');
      expect(result.missingVars).not.toContain('OPTIONAL_VAR');
    });

    it('should check .env.sample as an alternative to .env.example', async () => {
      vi.mocked(fileExists).mockImplementation(async (path: string) => {
        if (path.includes('.env.sample')) {
          return true;
        }
        if (path.endsWith('.env') && !path.includes('sample')) {
          return true;
        }
        return false;
      });

      vi.mocked(fs.readFile).mockImplementation(async (filePath) => {
        const pathStr = filePath.toString();
        if (pathStr.includes('.env.sample')) {
          return 'SAMPLE_VAR=\n';
        }
        if (pathStr.endsWith('.env') && !pathStr.includes('sample')) {
          return '';
        }
        return '';
      });

      const result = await analyzeEnvironment(mockCwd);

      expect(result.hasEnvExample).toBe(true);
      expect(result.missingVars).toContain('SAMPLE_VAR');
    });

    it('should check .env.template as an alternative to .env.example', async () => {
      vi.mocked(fileExists).mockImplementation(async (path: string) => {
        if (path.includes('.env.template')) {
          return true;
        }
        if (path.endsWith('.env') && !path.includes('template')) {
          return true;
        }
        return false;
      });

      vi.mocked(fs.readFile).mockImplementation(async (filePath) => {
        const pathStr = filePath.toString();
        if (pathStr.includes('.env.template')) {
          return 'TEMPLATE_VAR=\n';
        }
        if (pathStr.endsWith('.env') && !pathStr.includes('template')) {
          return '';
        }
        return '';
      });

      const result = await analyzeEnvironment(mockCwd);

      expect(result.hasEnvExample).toBe(true);
      expect(result.missingVars).toContain('TEMPLATE_VAR');
    });

    it('should detect sensitive variables exposed (not in gitignore)', async () => {
      vi.mocked(fileExists).mockImplementation(async (path: string) => {
        if (
          path.endsWith('.env') &&
          !path.includes('local') &&
          !path.includes('example')
        ) {
          return true;
        }
        if (path.includes('.gitignore')) {
          return true;
        }
        return false;
      });

      vi.mocked(fs.readFile).mockImplementation(async (filePath) => {
        const pathStr = filePath.toString();
        if (
          pathStr.endsWith('.env') &&
          !pathStr.includes('local') &&
          !pathStr.includes('example')
        ) {
          return 'API_KEY=secret\nSECRET_TOKEN=xyz\nPASSWORD=abc\nDATABASE_URL=postgres\n';
        }
        if (pathStr.includes('.gitignore')) {
          // .env is NOT ignored
          return 'node_modules/\n';
        }
        return '';
      });

      const result = await analyzeEnvironment(mockCwd);

      // Should detect sensitive vars not properly gitignored
      expect(result.sensitiveVarsExposed.length).toBeGreaterThan(0);
      // Check for specific patterns
      const exposedVarNames = result.sensitiveVarsExposed.join(' ');
      expect(exposedVarNames).toContain('API_KEY');
      expect(exposedVarNames).toContain('SECRET_TOKEN');
      expect(exposedVarNames).toContain('PASSWORD');
    });

    it('should not report sensitive vars when .env is in gitignore', async () => {
      vi.mocked(fileExists).mockImplementation(async (path: string) => {
        if (
          path.endsWith('.env') &&
          !path.includes('local') &&
          !path.includes('example')
        ) {
          return true;
        }
        if (path.includes('.gitignore')) {
          return true;
        }
        return false;
      });

      vi.mocked(fs.readFile).mockImplementation(async (filePath) => {
        const pathStr = filePath.toString();
        if (
          pathStr.endsWith('.env') &&
          !pathStr.includes('local') &&
          !pathStr.includes('example')
        ) {
          return 'API_KEY=secret\n';
        }
        if (pathStr.includes('.gitignore')) {
          return 'node_modules/\n.env\n';
        }
        return '';
      });

      const result = await analyzeEnvironment(mockCwd);

      expect(result.sensitiveVarsExposed).toHaveLength(0);
    });

    it('should not report sensitive vars when .env* pattern is in gitignore', async () => {
      vi.mocked(fileExists).mockImplementation(async (path: string) => {
        if (
          path.endsWith('.env') &&
          !path.includes('local') &&
          !path.includes('example')
        ) {
          return true;
        }
        if (path.includes('.gitignore')) {
          return true;
        }
        return false;
      });

      vi.mocked(fs.readFile).mockImplementation(async (filePath) => {
        const pathStr = filePath.toString();
        if (
          pathStr.endsWith('.env') &&
          !pathStr.includes('local') &&
          !pathStr.includes('example')
        ) {
          return 'API_KEY=secret\n';
        }
        if (pathStr.includes('.gitignore')) {
          return 'node_modules/\n.env*\n';
        }
        return '';
      });

      const result = await analyzeEnvironment(mockCwd);

      expect(result.sensitiveVarsExposed).toHaveLength(0);
    });

    it('should not report sensitive vars when .env.* pattern is in gitignore', async () => {
      vi.mocked(fileExists).mockImplementation(async (path: string) => {
        if (path.includes('.env.local')) {
          return true;
        }
        if (path.includes('.gitignore')) {
          return true;
        }
        return false;
      });

      vi.mocked(fs.readFile).mockImplementation(async (filePath) => {
        const pathStr = filePath.toString();
        if (pathStr.includes('.env.local')) {
          return 'SECRET=secret\n';
        }
        if (pathStr.includes('.gitignore')) {
          return 'node_modules/\n.env.*\n';
        }
        return '';
      });

      const result = await analyzeEnvironment(mockCwd);

      expect(result.sensitiveVarsExposed).toHaveLength(0);
    });

    it('should skip .env.example when checking sensitive vars', async () => {
      // This tests the condition: envFile !== '.env.example'
      vi.mocked(fileExists).mockImplementation(async (path: string) => {
        // Only .env.example exists (unusual but possible)
        if (path.includes('.env.example')) {
          return true;
        }
        if (path.includes('.gitignore')) {
          return true;
        }
        return false;
      });

      vi.mocked(fs.readFile).mockImplementation(async (filePath) => {
        const pathStr = filePath.toString();
        if (pathStr.includes('.env.example')) {
          return 'API_KEY=example_value\n';
        }
        if (pathStr.includes('.gitignore')) {
          // .env.example is not ignored
          return 'node_modules/\n';
        }
        return '';
      });

      const result = await analyzeEnvironment(mockCwd);

      // .env.example should not be checked for sensitive var exposure
      expect(result.sensitiveVarsExposed).toHaveLength(0);
    });

    it('should handle when no gitignore exists', async () => {
      vi.mocked(fileExists).mockImplementation(async (path: string) => {
        if (
          path.endsWith('.env') &&
          !path.includes('local') &&
          !path.includes('example')
        ) {
          return true;
        }
        if (path.includes('.gitignore')) {
          return false;
        }
        return false;
      });

      vi.mocked(fs.readFile).mockImplementation(async (filePath) => {
        const pathStr = filePath.toString();
        if (pathStr.endsWith('.env')) {
          return 'API_KEY=secret\n';
        }
        return '';
      });

      const result = await analyzeEnvironment(mockCwd);

      // Without gitignore, no sensitive var check is performed
      expect(result.sensitiveVarsExposed).toHaveLength(0);
    });

    it('should handle when no env files exist', async () => {
      vi.mocked(fileExists).mockResolvedValue(false);

      const result = await analyzeEnvironment(mockCwd);

      expect(result.envFiles).toHaveLength(0);
      expect(result.hasEnvExample).toBe(false);
      expect(result.missingVars).toHaveLength(0);
      expect(result.definedVars).toHaveLength(0);
      expect(result.sensitiveVarsExposed).toHaveLength(0);
    });

    it('should handle parseEnvFile error gracefully', async () => {
      vi.mocked(fileExists).mockImplementation(async (path: string) => {
        if (
          path.endsWith('.env') &&
          !path.includes('local') &&
          !path.includes('example')
        ) {
          return true;
        }
        return false;
      });

      vi.mocked(fs.readFile).mockRejectedValue(new Error('File read error'));

      const result = await analyzeEnvironment(mockCwd);

      // Should still report the file exists but with no vars parsed
      expect(result.envFiles).toContain('.env');
      expect(result.definedVars).toHaveLength(0);
    });

    it('should detect all sensitive variable patterns', async () => {
      vi.mocked(fileExists).mockImplementation(async (path: string) => {
        if (
          path.endsWith('.env') &&
          !path.includes('local') &&
          !path.includes('example')
        ) {
          return true;
        }
        if (path.includes('.gitignore')) {
          return true;
        }
        return false;
      });

      vi.mocked(fs.readFile).mockImplementation(async (filePath) => {
        const pathStr = filePath.toString();
        if (
          pathStr.endsWith('.env') &&
          !pathStr.includes('local') &&
          !pathStr.includes('example')
        ) {
          // Test all sensitive patterns
          return [
            'API_KEY=1',
            'APIKEY=2',
            'api_key=3',
            'SECRET=4',
            'PASSWORD=5',
            'TOKEN=6',
            'PRIVATE_KEY=7',
            'PRIVATEKEY=8',
            'CREDENTIALS=9',
            'AUTH=10',
            'AUTH_TOKEN=11',
            'SAFE_VAR=12',
          ].join('\n');
        }
        if (pathStr.includes('.gitignore')) {
          return 'node_modules/\n';
        }
        return '';
      });

      const result = await analyzeEnvironment(mockCwd);

      const exposed = result.sensitiveVarsExposed.join(' ');
      expect(exposed).toContain('API_KEY');
      expect(exposed).toContain('APIKEY');
      expect(exposed).toContain('api_key');
      expect(exposed).toContain('SECRET');
      expect(exposed).toContain('PASSWORD');
      expect(exposed).toContain('TOKEN');
      expect(exposed).toContain('PRIVATE_KEY');
      expect(exposed).toContain('PRIVATEKEY');
      expect(exposed).toContain('CREDENTIALS');
      expect(exposed).toContain('AUTH');
      expect(exposed).toContain('AUTH_TOKEN');
      // SAFE_VAR should not be detected as sensitive
      expect(exposed).not.toContain('SAFE_VAR');
    });

    it('should deduplicate sensitive vars exposed', async () => {
      vi.mocked(fileExists).mockImplementation(async (path: string) => {
        if (
          path.endsWith('.env') &&
          !path.includes('local') &&
          !path.includes('example')
        ) {
          return true;
        }
        if (path.includes('.env.local')) {
          return true;
        }
        if (path.includes('.gitignore')) {
          return true;
        }
        return false;
      });

      vi.mocked(fs.readFile).mockImplementation(async (filePath) => {
        const pathStr = filePath.toString();
        if (
          pathStr.endsWith('.env') &&
          !pathStr.includes('local') &&
          !pathStr.includes('example')
        ) {
          return 'API_KEY=1\n';
        }
        if (pathStr.includes('.env.local')) {
          return 'API_KEY=2\n';
        }
        if (pathStr.includes('.gitignore')) {
          return 'node_modules/\n';
        }
        return '';
      });

      const result = await analyzeEnvironment(mockCwd);

      // Should have entries for both files but deduplicated
      expect(result.sensitiveVarsExposed.length).toBeGreaterThan(0);
      // Check that we have unique entries
      const uniqueEntries = new Set(result.sensitiveVarsExposed);
      expect(uniqueEntries.size).toBe(result.sensitiveVarsExposed.length);
    });
  });

  // =============================================================================
  // formatEnvStatus Tests
  // =============================================================================

  describe('formatEnvStatus', () => {
    it('should format status when .env file is present', () => {
      const status: EnvStatus = {
        hasEnvFile: true,
        hasEnvExample: false,
        missingVars: [],
        warnings: [],
      };

      const formatted = formatEnvStatus(status);

      expect(formatted).toBe('Environment: .env present');
    });

    it('should format status when only .env.example exists', () => {
      const status: EnvStatus = {
        hasEnvFile: false,
        hasEnvExample: true,
        missingVars: [],
        warnings: [],
      };

      const formatted = formatEnvStatus(status);

      expect(formatted).toBe(
        'Environment: .env.example exists but no .env file'
      );
    });

    it('should include warnings in formatted output', () => {
      const status: EnvStatus = {
        hasEnvFile: true,
        hasEnvExample: true,
        missingVars: ['API_KEY'],
        warnings: ['Missing env vars: API_KEY'],
      };

      const formatted = formatEnvStatus(status);

      expect(formatted).toContain('Environment: .env present');
      expect(formatted).toContain('Warning: Missing env vars: API_KEY');
    });

    it('should format multiple warnings joined by comma', () => {
      const status: EnvStatus = {
        hasEnvFile: true,
        hasEnvExample: true,
        missingVars: [],
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

    it('should return only warning when no env files but has warnings', () => {
      const status: EnvStatus = {
        hasEnvFile: false,
        hasEnvExample: false,
        missingVars: [],
        warnings: ['Some warning'],
      };

      const formatted = formatEnvStatus(status);

      expect(formatted).toBe('Warning: Some warning');
    });
  });

  // =============================================================================
  // formatEnvironment Tests
  // =============================================================================

  describe('formatEnvironment', () => {
    it('should return null when no env files exist', () => {
      const context: EnvironmentContext = {
        envFiles: [],
        hasEnvExample: false,
        missingVars: [],
        definedVars: [],
        sensitiveVarsExposed: [],
      };

      const formatted = formatEnvironment(context);

      expect(formatted).toBeNull();
    });

    it('should format env files list', () => {
      const context: EnvironmentContext = {
        envFiles: ['.env', '.env.local'],
        hasEnvExample: false,
        missingVars: [],
        definedVars: ['VAR1', 'VAR2'],
        sensitiveVarsExposed: [],
      };

      const formatted = formatEnvironment(context);

      expect(formatted).toContain('**Env Files:** .env, .env.local');
    });

    it('should format missing vars', () => {
      const context: EnvironmentContext = {
        envFiles: ['.env'],
        hasEnvExample: true,
        missingVars: ['API_KEY', 'SECRET'],
        definedVars: ['OTHER'],
        sensitiveVarsExposed: [],
      };

      const formatted = formatEnvironment(context);

      expect(formatted).toContain(
        '**Missing Vars:** API_KEY, SECRET (defined in .env.example but not set)'
      );
    });

    it('should format sensitive vars warning', () => {
      const context: EnvironmentContext = {
        envFiles: ['.env'],
        hasEnvExample: false,
        missingVars: [],
        definedVars: ['API_KEY'],
        sensitiveVarsExposed: ['API_KEY (in .env)'],
      };

      const formatted = formatEnvironment(context);

      expect(formatted).toContain(
        '**Warning:** Potentially sensitive vars may not be gitignored: API_KEY (in .env)'
      );
    });

    it('should format all sections together', () => {
      const context: EnvironmentContext = {
        envFiles: ['.env', '.env.local'],
        hasEnvExample: true,
        missingVars: ['MISSING_VAR'],
        definedVars: ['API_KEY', 'DATABASE_URL'],
        sensitiveVarsExposed: ['API_KEY (in .env)'],
      };

      const formatted = formatEnvironment(context);

      expect(formatted).not.toBeNull();
      const lines = formatted!.split('\n');
      expect(lines.length).toBe(3);
      expect(lines[0]).toContain('**Env Files:**');
      expect(lines[1]).toContain('**Missing Vars:**');
      expect(lines[2]).toContain('**Warning:**');
    });

    it('should return formatted string when only env files exist (no missing or sensitive)', () => {
      const context: EnvironmentContext = {
        envFiles: ['.env'],
        hasEnvExample: false,
        missingVars: [],
        definedVars: ['SAFE_VAR'],
        sensitiveVarsExposed: [],
      };

      const formatted = formatEnvironment(context);

      expect(formatted).toBe('**Env Files:** .env');
    });
  });

  // =============================================================================
  // Type Exports Tests
  // =============================================================================

  describe('Type exports', () => {
    it('should export EnvStatus type correctly', () => {
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

    it('should export EnvironmentContext type correctly', () => {
      const context: EnvironmentContext = {
        envFiles: ['.env'],
        hasEnvExample: true,
        missingVars: ['VAR'],
        definedVars: ['OTHER'],
        sensitiveVarsExposed: ['SECRET (in .env)'],
      };

      expect(context).toHaveProperty('envFiles');
      expect(context).toHaveProperty('hasEnvExample');
      expect(context).toHaveProperty('missingVars');
      expect(context).toHaveProperty('definedVars');
      expect(context).toHaveProperty('sensitiveVarsExposed');
    });
  });

  // =============================================================================
  // Edge Cases for Branch Coverage
  // =============================================================================

  describe('Branch coverage edge cases', () => {
    it('should handle race condition where file exists then disappears in parseEnvFile', async () => {
      // This tests the internal parseEnvFile early return when fileExists returns false
      // Simulate: first call (outer check) returns true, second call (inner parseEnvFile) returns false
      let callCount = 0;
      vi.mocked(fileExists).mockImplementation(async (path: string) => {
        if (
          path.endsWith('.env') &&
          !path.includes('local') &&
          !path.includes('example')
        ) {
          callCount++;
          // First call returns true (outer check), second returns false (inner parseEnvFile)
          return callCount === 1;
        }
        return false;
      });

      const result = await analyzeEnvironment(mockCwd);

      // The file was detected but parseEnvFile returned [] due to race condition
      expect(result.envFiles).toContain('.env');
      expect(result.definedVars).toHaveLength(0);
    });

    it('should handle parseEnvFile returning empty when file disappears (example files)', async () => {
      // Test the same race condition for example files
      let envExampleCallCount = 0;
      vi.mocked(fileExists).mockImplementation(async (path: string) => {
        if (path.includes('.env.example')) {
          envExampleCallCount++;
          // First call returns true (outer check), second returns false (inner parseEnvFile)
          return envExampleCallCount === 1;
        }
        return false;
      });

      const result = await analyzeEnvironment(mockCwd);

      expect(result.hasEnvExample).toBe(true);
      // But no vars parsed because parseEnvFile returned [] when file "disappeared"
      expect(result.missingVars).toHaveLength(0);
    });

    it('should handle parseEnvFile returning empty for sensitive var check', async () => {
      // For sensitive vars detection, parseEnvFile is called again
      // Simulate file existing for initial detection but not for sensitive var parse
      const callCounts: Record<string, number> = {};
      vi.mocked(fileExists).mockImplementation(async (path: string) => {
        if (path.endsWith('.gitignore')) {
          return true;
        }
        if (
          path.endsWith('.env') &&
          !path.includes('local') &&
          !path.includes('example')
        ) {
          callCounts[path] = (callCounts[path] || 0) + 1;
          // First 2 calls return true, third (for sensitive var check) returns false
          return callCounts[path] <= 2;
        }
        return false;
      });

      vi.mocked(fs.readFile).mockImplementation(async (filePath) => {
        const pathStr = filePath.toString();
        if (pathStr.endsWith('.env') && !pathStr.includes('example')) {
          return 'API_KEY=secret\n';
        }
        if (pathStr.includes('.gitignore')) {
          return 'node_modules/\n';
        }
        return '';
      });

      const result = await analyzeEnvironment(mockCwd);

      expect(result.envFiles).toContain('.env');
      // Sensitive vars check would return empty due to parseEnvFile returning []
    });
  });
});
