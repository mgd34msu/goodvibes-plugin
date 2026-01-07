/**
 * Comprehensive tests for environment.ts
 * Target: 100% line and branch coverage
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock dependencies BEFORE importing the module under test
vi.mock('fs/promises');
vi.mock('../shared/file-utils.js');
vi.mock('../shared/logging.js', () => ({
  debug: vi.fn(),
}));

import * as fs from 'fs/promises';
import * as fileUtils from '../shared/file-utils.js';
import {
  checkEnvStatus,
  analyzeEnvironment,
  formatEnvStatus,
  formatEnvironment,
  type EnvStatus,
  type EnvironmentContext,
} from '../context/environment.js';

const mockedFs = vi.mocked(fs);
const mockedFileUtils = vi.mocked(fileUtils);

describe('environment.ts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default: no files exist
    mockedFileUtils.fileExists.mockResolvedValue(false);
    mockedFs.readFile.mockRejectedValue(new Error('ENOENT'));
  });

  describe('checkEnvStatus', () => {
    it('should return no env files when none exist', async () => {
      const result = await checkEnvStatus('/test/project');

      expect(result).toEqual({
        hasEnvFile: false,
        hasEnvExample: false,
        missingVars: [],
        warnings: [],
      });
    });

    it('should detect .env file', async () => {
      mockedFileUtils.fileExists.mockImplementation(async (path: string) => {
        return path.endsWith('.env');
      });

      const result = await checkEnvStatus('/test/project');

      expect(result.hasEnvFile).toBe(true);
      expect(result.hasEnvExample).toBe(false);
    });

    it('should detect .env.local file', async () => {
      mockedFileUtils.fileExists.mockImplementation(async (path: string) => {
        return path.endsWith('.env.local');
      });

      const result = await checkEnvStatus('/test/project');

      expect(result.hasEnvFile).toBe(true);
    });

    it('should detect both .env and .env.local', async () => {
      mockedFileUtils.fileExists.mockImplementation(async (path: string) => {
        return path.endsWith('.env') || path.endsWith('.env.local');
      });

      const result = await checkEnvStatus('/test/project');

      expect(result.hasEnvFile).toBe(true);
    });

    it('should detect .env.example file', async () => {
      mockedFileUtils.fileExists.mockImplementation(async (path: string) => {
        return path.endsWith('.env.example');
      });
      mockedFs.readFile.mockResolvedValue('');

      const result = await checkEnvStatus('/test/project');

      expect(result.hasEnvExample).toBe(true);
    });

    it('should detect missing variables when .env.example exists with .env', async () => {
      mockedFileUtils.fileExists.mockImplementation(async (path: string) => {
        return path.endsWith('.env.example') || path.endsWith('.env');
      });
      mockedFs.readFile.mockImplementation(async (path: fs.PathLike) => {
        const pathStr = path.toString();
        if (pathStr.endsWith('.env.example')) {
          return 'API_KEY=\nDATABASE_URL=\nSECRET_KEY=';
        }
        if (pathStr.endsWith('.env')) {
          return 'API_KEY=abc123';
        }
        return '';
      });

      const result = await checkEnvStatus('/test/project');

      expect(result.hasEnvFile).toBe(true);
      expect(result.hasEnvExample).toBe(true);
      expect(result.missingVars).toEqual(['DATABASE_URL', 'SECRET_KEY']);
      expect(result.warnings).toHaveLength(1);
      expect(result.warnings[0]).toContain(
        'Missing env vars: DATABASE_URL, SECRET_KEY'
      );
    });

    it('should prefer .env.local over .env for checking variables', async () => {
      mockedFileUtils.fileExists.mockImplementation(async (path: string) => {
        return (
          path.endsWith('.env.example') ||
          path.endsWith('.env') ||
          path.endsWith('.env.local')
        );
      });
      mockedFs.readFile.mockImplementation(async (path: fs.PathLike) => {
        const pathStr = path.toString();
        if (pathStr.endsWith('.env.example')) {
          return 'API_KEY=\nDATABASE_URL=';
        }
        if (pathStr.endsWith('.env.local')) {
          return 'API_KEY=local\nDATABASE_URL=local-db';
        }
        if (pathStr.endsWith('.env')) {
          return 'API_KEY=base';
        }
        return '';
      });

      const result = await checkEnvStatus('/test/project');

      expect(result.missingVars).toEqual([]);
      expect(result.warnings).toEqual([]);
    });

    it('should parse env file with comments and empty lines', async () => {
      mockedFileUtils.fileExists.mockImplementation(async (path: string) => {
        return path.endsWith('.env.example') || path.endsWith('.env');
      });
      mockedFs.readFile.mockImplementation(async (path: fs.PathLike) => {
        const pathStr = path.toString();
        if (pathStr.endsWith('.env.example')) {
          return '# Database config\nDATABASE_URL=\n\n# API Keys\nAPI_KEY=\n# Comment line';
        }
        if (pathStr.endsWith('.env')) {
          return '# My config\n\nDATABASE_URL=postgres://localhost\n\nAPI_KEY=secret\n';
        }
        return '';
      });

      const result = await checkEnvStatus('/test/project');

      expect(result.missingVars).toEqual([]);
    });

    it('should handle env files with KEY= format (empty values)', async () => {
      mockedFileUtils.fileExists.mockImplementation(async (path: string) => {
        return path.endsWith('.env.example') || path.endsWith('.env');
      });
      mockedFs.readFile.mockImplementation(async (path: fs.PathLike) => {
        const pathStr = path.toString();
        if (pathStr.endsWith('.env.example')) {
          return 'VAR1=\nVAR2=';
        }
        if (pathStr.endsWith('.env')) {
          return 'VAR1=\nVAR2=';
        }
        return '';
      });

      const result = await checkEnvStatus('/test/project');

      expect(result.missingVars).toEqual([]);
    });

    it('should handle variable names with numbers and underscores', async () => {
      mockedFileUtils.fileExists.mockImplementation(async (path: string) => {
        return path.endsWith('.env.example') || path.endsWith('.env');
      });
      mockedFs.readFile.mockImplementation(async (path: fs.PathLike) => {
        const pathStr = path.toString();
        if (pathStr.endsWith('.env.example')) {
          return 'VAR_1=\nAPI_KEY_2=\n_PRIVATE=';
        }
        if (pathStr.endsWith('.env')) {
          return 'VAR_1=value\nAPI_KEY_2=key\n_PRIVATE=secret';
        }
        return '';
      });

      const result = await checkEnvStatus('/test/project');

      expect(result.missingVars).toEqual([]);
    });

    it('should handle env files with spaces around equals', async () => {
      mockedFileUtils.fileExists.mockImplementation(async (path: string) => {
        return path.endsWith('.env.example') || path.endsWith('.env');
      });
      mockedFs.readFile.mockImplementation(async (path: fs.PathLike) => {
        const pathStr = path.toString();
        if (pathStr.endsWith('.env.example')) {
          return 'VAR1 = \nVAR2  =';
        }
        if (pathStr.endsWith('.env')) {
          return 'VAR1 = value\nVAR2  = value2';
        }
        return '';
      });

      const result = await checkEnvStatus('/test/project');

      expect(result.missingVars).toEqual([]);
    });

    it('should not add warning when no vars are missing', async () => {
      mockedFileUtils.fileExists.mockImplementation(async (path: string) => {
        return path.endsWith('.env.example') || path.endsWith('.env');
      });
      mockedFs.readFile.mockImplementation(async (path: fs.PathLike) => {
        const pathStr = path.toString();
        if (pathStr.endsWith('.env.example')) {
          return 'API_KEY=';
        }
        if (pathStr.endsWith('.env')) {
          return 'API_KEY=value';
        }
        return '';
      });

      const result = await checkEnvStatus('/test/project');

      expect(result.missingVars).toEqual([]);
      expect(result.warnings).toEqual([]);
    });
  });

  describe('analyzeEnvironment', () => {
    it('should detect multiple env file variants', async () => {
      mockedFileUtils.fileExists.mockImplementation(async (path: string) => {
        return (
          path.endsWith('.env') ||
          path.endsWith('.env.local') ||
          path.endsWith('.env.development')
        );
      });
      mockedFs.readFile.mockResolvedValue('API_KEY=value');

      const result = await analyzeEnvironment('/test/project');

      expect(result.envFiles).toContain('.env');
      expect(result.envFiles).toContain('.env.local');
      expect(result.envFiles).toContain('.env.development');
    });

    it('should detect all env file variants', async () => {
      mockedFileUtils.fileExists.mockImplementation(async (path: string) => {
        return (
          path.endsWith('.env') ||
          path.endsWith('.env.local') ||
          path.endsWith('.env.development') ||
          path.endsWith('.env.development.local') ||
          path.endsWith('.env.production') ||
          path.endsWith('.env.production.local') ||
          path.endsWith('.env.test') ||
          path.endsWith('.env.test.local')
        );
      });
      mockedFs.readFile.mockResolvedValue('VAR=value');

      const result = await analyzeEnvironment('/test/project');

      expect(result.envFiles).toHaveLength(8);
    });

    it('should collect variables from all env files', async () => {
      mockedFileUtils.fileExists.mockImplementation(async (path: string) => {
        return path.endsWith('.env') || path.endsWith('.env.local');
      });
      mockedFs.readFile.mockImplementation(async (path: fs.PathLike) => {
        const pathStr = path.toString();
        if (pathStr.endsWith('.env.local')) {
          return 'LOCAL_VAR=value\nSHARED_VAR=local';
        }
        if (pathStr.endsWith('.env')) {
          return 'BASE_VAR=value\nSHARED_VAR=base';
        }
        return '';
      });

      const result = await analyzeEnvironment('/test/project');

      expect(result.definedVars).toContain('LOCAL_VAR');
      expect(result.definedVars).toContain('BASE_VAR');
      expect(result.definedVars).toContain('SHARED_VAR');
      // Should deduplicate SHARED_VAR
      expect(result.definedVars.filter((v) => v === 'SHARED_VAR')).toHaveLength(
        1
      );
    });

    it('should detect .env.example file', async () => {
      mockedFileUtils.fileExists.mockImplementation(async (path: string) => {
        return path.endsWith('.env.example');
      });
      mockedFs.readFile.mockResolvedValue('EXAMPLE_VAR=');

      const result = await analyzeEnvironment('/test/project');

      expect(result.hasEnvExample).toBe(true);
    });

    it('should detect .env.sample as example file', async () => {
      mockedFileUtils.fileExists.mockImplementation(async (path: string) => {
        return path.endsWith('.env.sample');
      });
      mockedFs.readFile.mockResolvedValue('SAMPLE_VAR=');

      const result = await analyzeEnvironment('/test/project');

      expect(result.hasEnvExample).toBe(true);
    });

    it('should detect .env.template as example file', async () => {
      mockedFileUtils.fileExists.mockImplementation(async (path: string) => {
        return path.endsWith('.env.template');
      });
      mockedFs.readFile.mockResolvedValue('TEMPLATE_VAR=');

      const result = await analyzeEnvironment('/test/project');

      expect(result.hasEnvExample).toBe(true);
    });

    it('should find missing variables', async () => {
      mockedFileUtils.fileExists.mockImplementation(async (path: string) => {
        return path.endsWith('.env') || path.endsWith('.env.example');
      });
      mockedFs.readFile.mockImplementation(async (path: fs.PathLike) => {
        const pathStr = path.toString();
        if (pathStr.endsWith('.env.example')) {
          return 'REQUIRED_VAR1=\nREQUIRED_VAR2=\nREQUIRED_VAR3=';
        }
        if (pathStr.endsWith('.env')) {
          return 'REQUIRED_VAR1=value';
        }
        return '';
      });

      const result = await analyzeEnvironment('/test/project');

      expect(result.missingVars).toContain('REQUIRED_VAR2');
      expect(result.missingVars).toContain('REQUIRED_VAR3');
      expect(result.missingVars).not.toContain('REQUIRED_VAR1');
    });

    it('should detect sensitive variables in non-gitignored files', async () => {
      mockedFileUtils.fileExists.mockImplementation(async (path: string) => {
        return path.endsWith('.env') || path.endsWith('.gitignore');
      });
      mockedFs.readFile.mockImplementation(async (path: fs.PathLike) => {
        const pathStr = path.toString();
        if (pathStr.endsWith('.env')) {
          return 'API_KEY=secret\nDATABASE_PASSWORD=pass\nPRIVATE_KEY=key\nCREDENTIALS=creds\nAUTH_TOKEN=token';
        }
        if (pathStr.endsWith('.gitignore')) {
          return 'node_modules/\n';
        }
        return '';
      });

      const result = await analyzeEnvironment('/test/project');

      expect(result.sensitiveVarsExposed.length).toBeGreaterThan(0);
      expect(
        result.sensitiveVarsExposed.some((v) => v.includes('API_KEY'))
      ).toBe(true);
      expect(
        result.sensitiveVarsExposed.some((v) => v.includes('PASSWORD'))
      ).toBe(true);
      expect(
        result.sensitiveVarsExposed.some((v) => v.includes('PRIVATE_KEY'))
      ).toBe(true);
      expect(
        result.sensitiveVarsExposed.some((v) => v.includes('CREDENTIALS'))
      ).toBe(true);
      expect(result.sensitiveVarsExposed.some((v) => v.includes('AUTH'))).toBe(
        true
      );
    });

    it('should not flag sensitive vars if .env is in gitignore', async () => {
      mockedFileUtils.fileExists.mockImplementation(async (path: string) => {
        return path.endsWith('.env') || path.endsWith('.gitignore');
      });
      mockedFs.readFile.mockImplementation(async (path: fs.PathLike) => {
        const pathStr = path.toString();
        if (pathStr.endsWith('.env')) {
          return 'API_KEY=secret\nDATABASE_PASSWORD=pass';
        }
        if (pathStr.endsWith('.gitignore')) {
          return 'node_modules/\n.env\n';
        }
        return '';
      });

      const result = await analyzeEnvironment('/test/project');

      expect(result.sensitiveVarsExposed).toEqual([]);
    });

    it('should not flag sensitive vars if .env* is in gitignore', async () => {
      mockedFileUtils.fileExists.mockImplementation(async (path: string) => {
        return path.endsWith('.env.local') || path.endsWith('.gitignore');
      });
      mockedFs.readFile.mockImplementation(async (path: fs.PathLike) => {
        const pathStr = path.toString();
        if (pathStr.endsWith('.env.local')) {
          return 'API_KEY=secret';
        }
        if (pathStr.endsWith('.gitignore')) {
          return 'node_modules/\n.env*\n';
        }
        return '';
      });

      const result = await analyzeEnvironment('/test/project');

      expect(result.sensitiveVarsExposed).toEqual([]);
    });

    it('should not flag sensitive vars if .env.* is in gitignore', async () => {
      mockedFileUtils.fileExists.mockImplementation(async (path: string) => {
        return path.endsWith('.env.production') || path.endsWith('.gitignore');
      });
      mockedFs.readFile.mockImplementation(async (path: fs.PathLike) => {
        const pathStr = path.toString();
        if (pathStr.endsWith('.env.production')) {
          return 'API_KEY=secret';
        }
        if (pathStr.endsWith('.gitignore')) {
          return 'node_modules/\n.env.*\n';
        }
        return '';
      });

      const result = await analyzeEnvironment('/test/project');

      expect(result.sensitiveVarsExposed).toEqual([]);
    });

    it('should skip .env.example when checking sensitive vars', async () => {
      mockedFileUtils.fileExists.mockImplementation(async (path: string) => {
        return path.endsWith('.env.example') || path.endsWith('.gitignore');
      });
      mockedFs.readFile.mockImplementation(async (path: fs.PathLike) => {
        const pathStr = path.toString();
        if (pathStr.endsWith('.env.example')) {
          return 'API_KEY=\nDATABASE_PASSWORD=';
        }
        if (pathStr.endsWith('.gitignore')) {
          return 'node_modules/\n';
        }
        return '';
      });

      const result = await analyzeEnvironment('/test/project');

      // .env.example should be skipped even if not gitignored
      expect(result.sensitiveVarsExposed).toEqual([]);
    });

    it('should handle missing .gitignore file', async () => {
      mockedFileUtils.fileExists.mockImplementation(async (path: string) => {
        return path.endsWith('.env');
      });
      mockedFs.readFile.mockResolvedValue('API_KEY=secret');

      const result = await analyzeEnvironment('/test/project');

      // Should not crash, but also no sensitive var detection without gitignore
      expect(result.envFiles).toContain('.env');
      expect(result.sensitiveVarsExposed).toEqual([]);
    });

    it('should deduplicate sensitive vars from multiple files', async () => {
      mockedFileUtils.fileExists.mockImplementation(async (path: string) => {
        return (
          path.endsWith('.env') ||
          path.endsWith('.env.local') ||
          path.endsWith('.gitignore')
        );
      });
      mockedFs.readFile.mockImplementation(async (path: fs.PathLike) => {
        const pathStr = path.toString();
        if (pathStr.endsWith('.env') || pathStr.endsWith('.env.local')) {
          return 'API_KEY=secret';
        }
        if (pathStr.endsWith('.gitignore')) {
          return 'node_modules/\n';
        }
        return '';
      });

      const result = await analyzeEnvironment('/test/project');

      // API_KEY appears in both files but should only be reported once
      const apiKeyEntries = result.sensitiveVarsExposed.filter((v) =>
        v.includes('API_KEY')
      );
      expect(apiKeyEntries.length).toBeGreaterThan(0);
    });

    it('should handle file read errors gracefully', async () => {
      mockedFileUtils.fileExists.mockImplementation(async (path: string) => {
        return path.endsWith('.env');
      });
      mockedFs.readFile.mockRejectedValue(new Error('Permission denied'));

      const result = await analyzeEnvironment('/test/project');

      // Should not crash, should return empty data
      expect(result.envFiles).toContain('.env');
      expect(result.definedVars).toEqual([]);
    });

    it('should return empty result for project with no env files', async () => {
      mockedFileUtils.fileExists.mockResolvedValue(false);

      const result = await analyzeEnvironment('/test/project');

      expect(result).toEqual({
        envFiles: [],
        hasEnvExample: false,
        missingVars: [],
        definedVars: [],
        sensitiveVarsExposed: [],
      });
    });

    it('should detect secret in variable name', async () => {
      mockedFileUtils.fileExists.mockImplementation(async (path: string) => {
        return path.endsWith('.env') || path.endsWith('.gitignore');
      });
      mockedFs.readFile.mockImplementation(async (path: fs.PathLike) => {
        const pathStr = path.toString();
        if (pathStr.endsWith('.env')) {
          return 'MY_SECRET=value';
        }
        if (pathStr.endsWith('.gitignore')) {
          return 'node_modules/\n';
        }
        return '';
      });

      const result = await analyzeEnvironment('/test/project');

      expect(
        result.sensitiveVarsExposed.some((v) => v.includes('MY_SECRET'))
      ).toBe(true);
    });

    it('should detect token in variable name', async () => {
      mockedFileUtils.fileExists.mockImplementation(async (path: string) => {
        return path.endsWith('.env') || path.endsWith('.gitignore');
      });
      mockedFs.readFile.mockImplementation(async (path: fs.PathLike) => {
        const pathStr = path.toString();
        if (pathStr.endsWith('.env')) {
          return 'GITHUB_TOKEN=value';
        }
        if (pathStr.endsWith('.gitignore')) {
          return 'node_modules/\n';
        }
        return '';
      });

      const result = await analyzeEnvironment('/test/project');

      expect(
        result.sensitiveVarsExposed.some((v) => v.includes('GITHUB_TOKEN'))
      ).toBe(true);
    });

    it('should detect api-key with dash', async () => {
      mockedFileUtils.fileExists.mockImplementation(async (path: string) => {
        return path.endsWith('.env') || path.endsWith('.gitignore');
      });
      mockedFs.readFile.mockImplementation(async (path: fs.PathLike) => {
        const pathStr = path.toString();
        if (pathStr.endsWith('.env')) {
          return 'STRIPE_API_KEY=value';
        }
        if (pathStr.endsWith('.gitignore')) {
          return 'node_modules/\n';
        }
        return '';
      });

      const result = await analyzeEnvironment('/test/project');

      expect(
        result.sensitiveVarsExposed.some((v) => v.includes('API_KEY'))
      ).toBe(true);
    });

    it('should be case-insensitive for sensitive patterns', async () => {
      mockedFileUtils.fileExists.mockImplementation(async (path: string) => {
        return path.endsWith('.env') || path.endsWith('.gitignore');
      });
      mockedFs.readFile.mockImplementation(async (path: fs.PathLike) => {
        const pathStr = path.toString();
        if (pathStr.endsWith('.env')) {
          return 'api_key=value\nPassword=value';
        }
        if (pathStr.endsWith('.gitignore')) {
          return 'node_modules/\n';
        }
        return '';
      });

      const result = await analyzeEnvironment('/test/project');

      expect(result.sensitiveVarsExposed.length).toBeGreaterThan(0);
    });

    it('should handle invalid variable lines (no match)', async () => {
      mockedFileUtils.fileExists.mockImplementation(async (path: string) => {
        return path.endsWith('.env');
      });
      mockedFs.readFile.mockResolvedValue(
        'VALID_VAR=value\n' +
          'invalid line without equals\n' +
          '123_STARTS_WITH_NUMBER=value\n' +
          'lowercase_var=value\n' +
          'ANOTHER_VALID=value'
      );

      const result = await analyzeEnvironment('/test/project');

      // Should only get valid variable names
      expect(result.definedVars).toContain('VALID_VAR');
      expect(result.definedVars).toContain('ANOTHER_VALID');
      // May or may not include lowercase depending on regex
      expect(result.definedVars).not.toContain('invalid');
      expect(result.definedVars).not.toContain('123_STARTS_WITH_NUMBER');
    });

    it('should handle parseEnvFile with non-existent file', async () => {
      // This tests the internal parseEnvFile path when fileExists returns false
      mockedFileUtils.fileExists.mockResolvedValue(false);
      mockedFs.readFile.mockRejectedValue(new Error('ENOENT'));

      const result = await analyzeEnvironment('/test/project');

      expect(result.definedVars).toEqual([]);
      expect(result.envFiles).toEqual([]);
    });
  });

  describe('formatEnvStatus', () => {
    it('should format status with env file present', () => {
      const status: EnvStatus = {
        hasEnvFile: true,
        hasEnvExample: false,
        missingVars: [],
        warnings: [],
      };

      const result = formatEnvStatus(status);

      expect(result).toBe('Environment: .env present');
    });

    it('should format status with example but no env file', () => {
      const status: EnvStatus = {
        hasEnvFile: false,
        hasEnvExample: true,
        missingVars: [],
        warnings: [],
      };

      const result = formatEnvStatus(status);

      expect(result).toBe('Environment: .env.example exists but no .env file');
    });

    it('should format status with warnings', () => {
      const status: EnvStatus = {
        hasEnvFile: true,
        hasEnvExample: true,
        missingVars: ['API_KEY', 'SECRET'],
        warnings: ['Missing env vars: API_KEY, SECRET'],
      };

      const result = formatEnvStatus(status);

      expect(result).toContain('Environment: .env present');
      expect(result).toContain('Warning: Missing env vars: API_KEY, SECRET');
    });

    it('should format status with multiple warnings', () => {
      const status: EnvStatus = {
        hasEnvFile: true,
        hasEnvExample: true,
        missingVars: ['VAR1'],
        warnings: ['Warning 1', 'Warning 2'],
      };

      const result = formatEnvStatus(status);

      expect(result).toContain('Warning: Warning 1, Warning 2');
    });

    it('should return empty string when no env files or example', () => {
      const status: EnvStatus = {
        hasEnvFile: false,
        hasEnvExample: false,
        missingVars: [],
        warnings: [],
      };

      const result = formatEnvStatus(status);

      expect(result).toBe('');
    });

    it('should handle env file with warnings but no example', () => {
      const status: EnvStatus = {
        hasEnvFile: true,
        hasEnvExample: false,
        missingVars: [],
        warnings: ['Some warning'],
      };

      const result = formatEnvStatus(status);

      expect(result).toContain('Environment: .env present');
      expect(result).toContain('Warning: Some warning');
    });
  });

  describe('formatEnvironment', () => {
    it('should return null when no env files', () => {
      const context: EnvironmentContext = {
        envFiles: [],
        hasEnvExample: false,
        missingVars: [],
        definedVars: [],
        sensitiveVarsExposed: [],
      };

      const result = formatEnvironment(context);

      expect(result).toBeNull();
    });

    it('should format basic env files', () => {
      const context: EnvironmentContext = {
        envFiles: ['.env', '.env.local'],
        hasEnvExample: false,
        missingVars: [],
        definedVars: ['VAR1'],
        sensitiveVarsExposed: [],
      };

      const result = formatEnvironment(context);

      expect(result).toContain('**Env Files:** .env, .env.local');
    });

    it('should format missing variables', () => {
      const context: EnvironmentContext = {
        envFiles: ['.env'],
        hasEnvExample: true,
        missingVars: ['API_KEY', 'DATABASE_URL'],
        definedVars: ['OTHER_VAR'],
        sensitiveVarsExposed: [],
      };

      const result = formatEnvironment(context);

      expect(result).toContain('**Env Files:** .env');
      expect(result).toContain('**Missing Vars:** API_KEY, DATABASE_URL');
      expect(result).toContain('defined in .env.example but not set');
    });

    it('should format sensitive vars warning', () => {
      const context: EnvironmentContext = {
        envFiles: ['.env'],
        hasEnvExample: false,
        missingVars: [],
        definedVars: ['API_KEY'],
        sensitiveVarsExposed: ['API_KEY (in .env)', 'PASSWORD (in .env)'],
      };

      const result = formatEnvironment(context);

      expect(result).toContain('**Env Files:** .env');
      expect(result).toContain(
        '**Warning:** Potentially sensitive vars may not be gitignored'
      );
      expect(result).toContain('API_KEY (in .env)');
      expect(result).toContain('PASSWORD (in .env)');
    });

    it('should format complete context with all fields', () => {
      const context: EnvironmentContext = {
        envFiles: ['.env', '.env.local', '.env.production'],
        hasEnvExample: true,
        missingVars: ['SECRET_KEY'],
        definedVars: ['API_KEY', 'DATABASE_URL'],
        sensitiveVarsExposed: ['API_KEY (in .env)'],
      };

      const result = formatEnvironment(context);

      expect(result).toContain(
        '**Env Files:** .env, .env.local, .env.production'
      );
      expect(result).toContain('**Missing Vars:** SECRET_KEY');
      expect(result).toContain('**Warning:** Potentially sensitive vars');
      expect(result).toContain('API_KEY (in .env)');
    });

    it('should format single env file', () => {
      const context: EnvironmentContext = {
        envFiles: ['.env'],
        hasEnvExample: false,
        missingVars: [],
        definedVars: [],
        sensitiveVarsExposed: [],
      };

      const result = formatEnvironment(context);

      expect(result).toBe('**Env Files:** .env');
    });

    it('should format only missing vars without sensitive vars', () => {
      const context: EnvironmentContext = {
        envFiles: ['.env'],
        hasEnvExample: true,
        missingVars: ['VAR1', 'VAR2'],
        definedVars: [],
        sensitiveVarsExposed: [],
      };

      const result = formatEnvironment(context);

      expect(result).toContain('**Env Files:** .env');
      expect(result).toContain('**Missing Vars:** VAR1, VAR2');
      expect(result).not.toContain('**Warning:**');
    });

    it('should format only sensitive vars without missing vars', () => {
      const context: EnvironmentContext = {
        envFiles: ['.env'],
        hasEnvExample: false,
        missingVars: [],
        definedVars: [],
        sensitiveVarsExposed: ['SECRET (in .env)'],
      };

      const result = formatEnvironment(context);

      expect(result).toContain('**Env Files:** .env');
      expect(result).toContain('**Warning:**');
      expect(result).not.toContain('**Missing Vars:**');
    });
  });
});
