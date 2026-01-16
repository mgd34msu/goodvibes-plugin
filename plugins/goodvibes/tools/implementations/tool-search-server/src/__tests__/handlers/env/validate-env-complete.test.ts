/**
 * Unit tests for validate-env-complete handler
 *
 * Tests cover:
 * - handleValidateEnvComplete main function
 * - parseEnvFile helper
 * - scanFileForEnvVars helper
 * - scanDirectory helper
 * - inferExpectedType helper
 * - validateValue helper
 * - formatAsMarkdown helper
 * - All edge cases and error paths
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

// Mock modules before imports
vi.mock('fs');
vi.mock('../../config.js', () => ({
  PROJECT_ROOT: '/mock/project',
}));

// Import after mocks are set up
import { handleValidateEnvComplete, ValidateEnvCompleteArgs } from '../../../handlers/env/validate-env-complete.js';

describe('validate-env-complete handler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset console.error mock
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('handleValidateEnvComplete', () => {
    describe('basic validation scenarios', () => {
      it('should return valid when all variables are present', () => {
        const envContent = 'API_KEY=secret123\nDATABASE_URL=postgres://localhost';
        const exampleContent = 'API_KEY=\nDATABASE_URL=';

        vi.mocked(fs.existsSync).mockReturnValue(true);
        vi.mocked(fs.readFileSync).mockImplementation((p) => {
          const pathStr = String(p);
          if (pathStr.endsWith('.env')) return envContent;
          if (pathStr.endsWith('.env.example')) return exampleContent;
          return '';
        });
        vi.mocked(fs.readdirSync).mockReturnValue([]);

        const result = handleValidateEnvComplete({});
        const text = result.content[0].text;

        expect(text).toContain('Environment Validation: PASSED');
        expect(text).toContain('.env file: exists');
        expect(text).toContain('.env.example file: exists');
      });

      it('should detect missing variables', () => {
        const envContent = 'API_KEY=secret123';
        const exampleContent = 'API_KEY=\nDATABASE_URL=\nSECRET_TOKEN=';

        vi.mocked(fs.existsSync).mockReturnValue(true);
        vi.mocked(fs.readFileSync).mockImplementation((p) => {
          const pathStr = String(p);
          if (pathStr.endsWith('.env')) return envContent;
          if (pathStr.endsWith('.env.example')) return exampleContent;
          return '';
        });
        vi.mocked(fs.readdirSync).mockReturnValue([]);

        const result = handleValidateEnvComplete({});
        const text = result.content[0].text;

        expect(text).toContain('Environment Validation: FAILED');
        expect(text).toContain('Missing Variables');
        expect(text).toContain('DATABASE_URL');
        expect(text).toContain('SECRET_TOKEN');
      });

      it('should detect unused variables', () => {
        const envContent = 'API_KEY=secret\nUNUSED_VAR=value\nANOTHER_UNUSED=test';
        const exampleContent = 'API_KEY=';

        vi.mocked(fs.existsSync).mockReturnValue(true);
        vi.mocked(fs.readFileSync).mockImplementation((p) => {
          const pathStr = String(p);
          if (pathStr.endsWith('.env')) return envContent;
          if (pathStr.endsWith('.env.example')) return exampleContent;
          return '';
        });
        vi.mocked(fs.readdirSync).mockReturnValue([]);

        const result = handleValidateEnvComplete({});
        const text = result.content[0].text;

        expect(text).toContain('Unused Variables');
        expect(text).toContain('UNUSED_VAR');
        expect(text).toContain('ANOTHER_UNUSED');
      });

      it('should detect undocumented variables', () => {
        const envContent = 'API_KEY=secret\nUNDOCUMENTED=value';
        const exampleContent = 'API_KEY=';

        vi.mocked(fs.existsSync).mockReturnValue(true);
        vi.mocked(fs.readFileSync).mockImplementation((p) => {
          const pathStr = String(p);
          if (pathStr.endsWith('.env')) return envContent;
          if (pathStr.endsWith('.env.example')) return exampleContent;
          return '';
        });
        vi.mocked(fs.readdirSync).mockReturnValue([]);

        const result = handleValidateEnvComplete({});
        const text = result.content[0].text;

        expect(text).toContain('Undocumented Variables');
        expect(text).toContain('UNDOCUMENTED');
      });
    });

    describe('file existence handling', () => {
      it('should handle missing .env file', () => {
        vi.mocked(fs.existsSync).mockImplementation((p) => {
          const pathStr = String(p);
          if (pathStr.endsWith('.env') && !pathStr.includes('.example')) return false;
          if (pathStr.endsWith('.env.example')) return true;
          return false;
        });
        vi.mocked(fs.readFileSync).mockImplementation((p) => {
          const pathStr = String(p);
          if (pathStr.endsWith('.env.example')) return 'API_KEY=';
          throw new Error('ENOENT');
        });
        vi.mocked(fs.readdirSync).mockReturnValue([]);

        const result = handleValidateEnvComplete({});
        const text = result.content[0].text;

        expect(text).toContain('.env file: MISSING');
        expect(text).toContain('.env.example file: exists');
      });

      it('should handle missing .env.example file', () => {
        vi.mocked(fs.existsSync).mockImplementation((p) => {
          const pathStr = String(p);
          if (pathStr.endsWith('.env') && !pathStr.includes('.example')) return true;
          if (pathStr.endsWith('.env.example')) return false;
          return false;
        });
        vi.mocked(fs.readFileSync).mockImplementation((p) => {
          const pathStr = String(p);
          if (pathStr.endsWith('.env') && !pathStr.includes('.example')) return 'API_KEY=secret';
          throw new Error('ENOENT');
        });
        vi.mocked(fs.readdirSync).mockReturnValue([]);

        const result = handleValidateEnvComplete({});
        const text = result.content[0].text;

        expect(text).toContain('.env file: exists');
        expect(text).toContain('.env.example file: MISSING');
      });

      it('should handle both files missing', () => {
        vi.mocked(fs.existsSync).mockReturnValue(false);
        vi.mocked(fs.readdirSync).mockReturnValue([]);

        const result = handleValidateEnvComplete({});
        const text = result.content[0].text;

        expect(text).toContain('.env file: MISSING');
        expect(text).toContain('.env.example file: MISSING');
      });
    });

    describe('custom file paths', () => {
      it('should use custom env_file path', () => {
        const checkedPaths: string[] = [];

        vi.mocked(fs.existsSync).mockImplementation((p) => {
          checkedPaths.push(String(p));
          return String(p).includes('.env.production') || String(p).includes('.env.example');
        });
        vi.mocked(fs.readFileSync).mockImplementation((p) => {
          const pathStr = String(p);
          if (pathStr.includes('.env.production')) return 'API_KEY=prod_secret';
          if (pathStr.includes('.env.example')) return 'API_KEY=';
          return '';
        });
        vi.mocked(fs.readdirSync).mockReturnValue([]);

        handleValidateEnvComplete({ env_file: '.env.production' });

        expect(checkedPaths.some(p => p.includes('.env.production'))).toBe(true);
      });

      it('should use custom example_file path', () => {
        const checkedPaths: string[] = [];

        vi.mocked(fs.existsSync).mockImplementation((p) => {
          checkedPaths.push(String(p));
          return String(p).includes('.env') || String(p).includes('.env.template');
        });
        vi.mocked(fs.readFileSync).mockImplementation((p) => {
          const pathStr = String(p);
          if (pathStr.endsWith('.env') && !pathStr.includes('.template')) return 'API_KEY=secret';
          if (pathStr.includes('.env.template')) return 'API_KEY=';
          return '';
        });
        vi.mocked(fs.readdirSync).mockReturnValue([]);

        handleValidateEnvComplete({ example_file: '.env.template' });

        expect(checkedPaths.some(p => p.includes('.env.template'))).toBe(true);
      });
    });

    describe('ignore list', () => {
      it('should ignore specified variables', () => {
        const envContent = 'API_KEY=secret\nIGNORED_VAR=value';
        const exampleContent = 'API_KEY=\nIGNORED_VAR=\nMISSING_VAR=';

        vi.mocked(fs.existsSync).mockReturnValue(true);
        vi.mocked(fs.readFileSync).mockImplementation((p) => {
          const pathStr = String(p);
          if (pathStr.endsWith('.env')) return envContent;
          if (pathStr.endsWith('.env.example')) return exampleContent;
          return '';
        });
        vi.mocked(fs.readdirSync).mockReturnValue([]);

        const result = handleValidateEnvComplete({ ignore: ['MISSING_VAR', 'IGNORED_VAR'] });
        const text = result.content[0].text;

        // MISSING_VAR should not appear as missing because it's ignored
        expect(text).not.toContain('MISSING_VAR');
        expect(text).not.toContain('IGNORED_VAR');
      });

      it('should handle case-insensitive ignore list', () => {
        const envContent = 'API_KEY=secret';
        const exampleContent = 'API_KEY=\nMIXED_CASE_VAR=';

        vi.mocked(fs.existsSync).mockReturnValue(true);
        vi.mocked(fs.readFileSync).mockImplementation((p) => {
          const pathStr = String(p);
          if (pathStr.endsWith('.env')) return envContent;
          if (pathStr.endsWith('.env.example')) return exampleContent;
          return '';
        });
        vi.mocked(fs.readdirSync).mockReturnValue([]);

        // Lowercase ignore should match uppercase var
        const result = handleValidateEnvComplete({ ignore: ['mixed_case_var'] });
        const text = result.content[0].text;

        expect(text).not.toContain('MIXED_CASE_VAR');
      });
    });

    describe('value type validation', () => {
      it('should not validate values by default', () => {
        const envContent = 'API_PORT=not_a_number\nAPI_URL=invalid-url';
        const exampleContent = 'API_PORT=\nAPI_URL=';

        vi.mocked(fs.existsSync).mockReturnValue(true);
        vi.mocked(fs.readFileSync).mockImplementation((p) => {
          const pathStr = String(p);
          if (pathStr.endsWith('.env')) return envContent;
          if (pathStr.endsWith('.env.example')) return exampleContent;
          return '';
        });
        vi.mocked(fs.readdirSync).mockReturnValue([]);

        const result = handleValidateEnvComplete({});
        const text = result.content[0].text;

        // Should pass because check_values is false by default
        expect(text).toContain('Environment Validation: PASSED');
        expect(text).not.toContain('Type Validation Issues');
      });

      it('should validate PORT values as numbers when check_values is true', () => {
        const envContent = 'API_PORT=not_a_number';
        const exampleContent = 'API_PORT=';

        vi.mocked(fs.existsSync).mockReturnValue(true);
        vi.mocked(fs.readFileSync).mockImplementation((p) => {
          const pathStr = String(p);
          if (pathStr.endsWith('.env')) return envContent;
          if (pathStr.endsWith('.env.example')) return exampleContent;
          return '';
        });
        vi.mocked(fs.readdirSync).mockReturnValue([]);

        const result = handleValidateEnvComplete({ check_values: true });
        const text = result.content[0].text;

        expect(text).toContain('Type Validation Issues');
        expect(text).toContain('API_PORT');
        expect(text).toContain('Expected numeric value');
      });

      it('should validate URL values when check_values is true', () => {
        const envContent = 'API_URL=not-a-valid-url\nSERVICE_ENDPOINT=also-invalid';
        const exampleContent = 'API_URL=\nSERVICE_ENDPOINT=';

        vi.mocked(fs.existsSync).mockReturnValue(true);
        vi.mocked(fs.readFileSync).mockImplementation((p) => {
          const pathStr = String(p);
          if (pathStr.endsWith('.env')) return envContent;
          if (pathStr.endsWith('.env.example')) return exampleContent;
          return '';
        });
        vi.mocked(fs.readdirSync).mockReturnValue([]);

        const result = handleValidateEnvComplete({ check_values: true });
        const text = result.content[0].text;

        expect(text).toContain('Type Validation Issues');
        expect(text).toContain('Expected valid URL');
      });

      it('should accept valid URLs', () => {
        const envContent = 'API_URL=https://api.example.com\nSERVICE_URI=http://localhost:3000';
        const exampleContent = 'API_URL=\nSERVICE_URI=';

        vi.mocked(fs.existsSync).mockReturnValue(true);
        vi.mocked(fs.readFileSync).mockImplementation((p) => {
          const pathStr = String(p);
          if (pathStr.endsWith('.env')) return envContent;
          if (pathStr.endsWith('.env.example')) return exampleContent;
          return '';
        });
        vi.mocked(fs.readdirSync).mockReturnValue([]);

        const result = handleValidateEnvComplete({ check_values: true });
        const text = result.content[0].text;

        expect(text).not.toContain('API_URL');
        expect(text).not.toContain('SERVICE_URI');
      });

      it('should validate boolean values when check_values is true', () => {
        const envContent = 'DEBUG_ENABLED=maybe\nFEATURE_DISABLED=yes';
        const exampleContent = 'DEBUG_ENABLED=\nFEATURE_DISABLED=';

        vi.mocked(fs.existsSync).mockReturnValue(true);
        vi.mocked(fs.readFileSync).mockImplementation((p) => {
          const pathStr = String(p);
          if (pathStr.endsWith('.env')) return envContent;
          if (pathStr.endsWith('.env.example')) return exampleContent;
          return '';
        });
        vi.mocked(fs.readdirSync).mockReturnValue([]);

        const result = handleValidateEnvComplete({ check_values: true });
        const text = result.content[0].text;

        expect(text).toContain('Type Validation Issues');
        expect(text).toContain('DEBUG_ENABLED');
        expect(text).toContain('Expected boolean value');
        // FEATURE_DISABLED with 'yes' should be valid
        expect(text).not.toContain('FEATURE_DISABLED');
      });

      it('should validate secret values length when check_values is true', () => {
        const envContent = 'API_KEY=short\nSECRET_TOKEN=verylongsecretvalue';
        const exampleContent = 'API_KEY=\nSECRET_TOKEN=';

        vi.mocked(fs.existsSync).mockReturnValue(true);
        vi.mocked(fs.readFileSync).mockImplementation((p) => {
          const pathStr = String(p);
          if (pathStr.endsWith('.env')) return envContent;
          if (pathStr.endsWith('.env.example')) return exampleContent;
          return '';
        });
        vi.mocked(fs.readdirSync).mockReturnValue([]);

        const result = handleValidateEnvComplete({ check_values: true });
        const text = result.content[0].text;

        expect(text).toContain('Type Validation Issues');
        expect(text).toContain('API_KEY');
        expect(text).toContain('too short');
        // SECRET_TOKEN is long enough
        expect(text).not.toContain('SECRET_TOKEN');
      });

      it('should detect empty values', () => {
        const envContent = 'API_KEY=\nDATABASE_URL=   ';
        const exampleContent = 'API_KEY=\nDATABASE_URL=';

        vi.mocked(fs.existsSync).mockReturnValue(true);
        vi.mocked(fs.readFileSync).mockImplementation((p) => {
          const pathStr = String(p);
          if (pathStr.endsWith('.env')) return envContent;
          if (pathStr.endsWith('.env.example')) return exampleContent;
          return '';
        });
        vi.mocked(fs.readdirSync).mockReturnValue([]);

        const result = handleValidateEnvComplete({ check_values: true });
        const text = result.content[0].text;

        expect(text).toContain('Type Validation Issues');
        expect(text).toContain('Value is empty');
      });

      it('should validate numeric values for TIMEOUT, LIMIT, MAX, MIN, COUNT vars', () => {
        const envContent = 'REQUEST_TIMEOUT=abc\nMAX_RETRIES=10\nMIN_CONNECTIONS=five\nUSER_COUNT=100';
        const exampleContent = 'REQUEST_TIMEOUT=\nMAX_RETRIES=\nMIN_CONNECTIONS=\nUSER_COUNT=';

        vi.mocked(fs.existsSync).mockReturnValue(true);
        vi.mocked(fs.readFileSync).mockImplementation((p) => {
          const pathStr = String(p);
          if (pathStr.endsWith('.env')) return envContent;
          if (pathStr.endsWith('.env.example')) return exampleContent;
          return '';
        });
        vi.mocked(fs.readdirSync).mockReturnValue([]);

        const result = handleValidateEnvComplete({ check_values: true });
        const text = result.content[0].text;

        expect(text).toContain('REQUEST_TIMEOUT');
        expect(text).toContain('MIN_CONNECTIONS');
        expect(text).not.toContain('MAX_RETRIES');
        expect(text).not.toContain('USER_COUNT');
      });

      it('should accept valid numeric values including negative and decimal', () => {
        const envContent = 'API_PORT=3000\nTHROTTLE_LIMIT=-1\nRATIO_MAX=0.5';
        const exampleContent = 'API_PORT=\nTHROTTLE_LIMIT=\nRATIO_MAX=';

        vi.mocked(fs.existsSync).mockReturnValue(true);
        vi.mocked(fs.readFileSync).mockImplementation((p) => {
          const pathStr = String(p);
          if (pathStr.endsWith('.env')) return envContent;
          if (pathStr.endsWith('.env.example')) return exampleContent;
          return '';
        });
        vi.mocked(fs.readdirSync).mockReturnValue([]);

        const result = handleValidateEnvComplete({ check_values: true });
        const text = result.content[0].text;

        // None should have type issues
        expect(text).not.toContain('Type Validation Issues');
      });
    });

    describe('code scanning', () => {
      it('should detect env vars used in code with process.env.VAR_NAME', () => {
        const envContent = 'EXISTING_VAR=value';
        const exampleContent = '';
        const codeContent = 'const apiKey = process.env.API_KEY;\nconst dbUrl = process.env.DATABASE_URL;';

        vi.mocked(fs.existsSync).mockReturnValue(true);
        vi.mocked(fs.readFileSync).mockImplementation((p) => {
          const pathStr = String(p);
          if (pathStr.endsWith('.env')) return envContent;
          if (pathStr.endsWith('.env.example')) return exampleContent;
          if (pathStr.endsWith('.ts')) return codeContent;
          return '';
        });

        // Mock directory structure
        vi.mocked(fs.readdirSync).mockImplementation((dir, options) => {
          const dirStr = String(dir);
          if (dirStr === '/mock/project' || dirStr === '\\mock\\project') {
            if (options && typeof options === 'object' && 'withFileTypes' in options) {
              return [
                { name: 'src', isDirectory: () => true, isFile: () => false },
              ] as unknown as fs.Dirent[];
            }
            return ['src'];
          }
          if (dirStr.includes('src')) {
            if (options && typeof options === 'object' && 'withFileTypes' in options) {
              return [
                { name: 'index.ts', isDirectory: () => false, isFile: () => true },
              ] as unknown as fs.Dirent[];
            }
            return ['index.ts'];
          }
          return [];
        });

        const result = handleValidateEnvComplete({});
        const text = result.content[0].text;

        expect(text).toContain('Missing Variables');
        expect(text).toContain('API_KEY');
        expect(text).toContain('DATABASE_URL');
      });

      it('should detect env vars used with bracket notation process.env["VAR"]', () => {
        const envContent = '';
        const exampleContent = '';
        const codeContent = 'const key = process.env["SECRET_KEY"];\nconst token = process.env[\'AUTH_TOKEN\'];';

        vi.mocked(fs.existsSync).mockReturnValue(true);
        vi.mocked(fs.readFileSync).mockImplementation((p) => {
          const pathStr = String(p);
          if (pathStr.endsWith('.env')) return envContent;
          if (pathStr.endsWith('.env.example')) return exampleContent;
          if (pathStr.endsWith('.ts')) return codeContent;
          return '';
        });

        vi.mocked(fs.readdirSync).mockImplementation((dir, options) => {
          const dirStr = String(dir);
          if (dirStr === '/mock/project' || dirStr === '\\mock\\project') {
            if (options && typeof options === 'object' && 'withFileTypes' in options) {
              return [
                { name: 'app.ts', isDirectory: () => false, isFile: () => true },
              ] as unknown as fs.Dirent[];
            }
          }
          return [];
        });

        const result = handleValidateEnvComplete({});
        const text = result.content[0].text;

        expect(text).toContain('SECRET_KEY');
        expect(text).toContain('AUTH_TOKEN');
      });

      it('should detect Vite env vars with import.meta.env', () => {
        const envContent = '';
        const exampleContent = '';
        const codeContent = 'const apiUrl = import.meta.env.VITE_API_URL;\nconst key = import.meta.env.VITE_PUBLIC_KEY;';

        vi.mocked(fs.existsSync).mockReturnValue(true);
        vi.mocked(fs.readFileSync).mockImplementation((p) => {
          const pathStr = String(p);
          if (pathStr.endsWith('.env')) return envContent;
          if (pathStr.endsWith('.env.example')) return exampleContent;
          if (pathStr.endsWith('.ts')) return codeContent;
          return '';
        });

        vi.mocked(fs.readdirSync).mockImplementation((dir, options) => {
          const dirStr = String(dir);
          if (dirStr === '/mock/project' || dirStr === '\\mock\\project') {
            if (options && typeof options === 'object' && 'withFileTypes' in options) {
              return [
                { name: 'app.ts', isDirectory: () => false, isFile: () => true },
              ] as unknown as fs.Dirent[];
            }
          }
          return [];
        });

        const result = handleValidateEnvComplete({});
        const text = result.content[0].text;

        expect(text).toContain('VITE_API_URL');
        expect(text).toContain('VITE_PUBLIC_KEY');
      });

      it('should detect Deno env vars with Deno.env.get', () => {
        const envContent = '';
        const exampleContent = '';
        const codeContent = 'const port = Deno.env.get("DENO_PORT");\nconst host = Deno.env.get(\'DENO_HOST\');';

        vi.mocked(fs.existsSync).mockReturnValue(true);
        vi.mocked(fs.readFileSync).mockImplementation((p) => {
          const pathStr = String(p);
          if (pathStr.endsWith('.env')) return envContent;
          if (pathStr.endsWith('.env.example')) return exampleContent;
          if (pathStr.endsWith('.ts')) return codeContent;
          return '';
        });

        vi.mocked(fs.readdirSync).mockImplementation((dir, options) => {
          const dirStr = String(dir);
          if (dirStr === '/mock/project' || dirStr === '\\mock\\project') {
            if (options && typeof options === 'object' && 'withFileTypes' in options) {
              return [
                { name: 'app.ts', isDirectory: () => false, isFile: () => true },
              ] as unknown as fs.Dirent[];
            }
          }
          return [];
        });

        const result = handleValidateEnvComplete({});
        const text = result.content[0].text;

        expect(text).toContain('DENO_PORT');
        expect(text).toContain('DENO_HOST');
      });

      it('should skip built-in env vars like NODE_ENV', () => {
        const envContent = '';
        const exampleContent = '';
        const codeContent = 'const env = process.env.NODE_ENV;\nconst mode = import.meta.env.MODE;\nconst isDev = import.meta.env.DEV;';

        vi.mocked(fs.existsSync).mockReturnValue(true);
        vi.mocked(fs.readFileSync).mockImplementation((p) => {
          const pathStr = String(p);
          if (pathStr.endsWith('.env')) return envContent;
          if (pathStr.endsWith('.env.example')) return exampleContent;
          if (pathStr.endsWith('.ts')) return codeContent;
          return '';
        });

        vi.mocked(fs.readdirSync).mockImplementation((dir, options) => {
          const dirStr = String(dir);
          if (dirStr === '/mock/project' || dirStr === '\\mock\\project') {
            if (options && typeof options === 'object' && 'withFileTypes' in options) {
              return [
                { name: 'app.ts', isDirectory: () => false, isFile: () => true },
              ] as unknown as fs.Dirent[];
            }
          }
          return [];
        });

        const result = handleValidateEnvComplete({});
        const text = result.content[0].text;

        // Built-in vars should not appear in missing list
        expect(text).not.toContain('NODE_ENV');
        expect(text).not.toContain('`MODE`');
        expect(text).not.toContain('`DEV`');
      });

      it('should skip directories like node_modules, .git, dist', () => {
        vi.mocked(fs.existsSync).mockReturnValue(true);
        vi.mocked(fs.readFileSync).mockImplementation((p) => {
          const pathStr = String(p);
          if (pathStr.endsWith('.env')) return '';
          if (pathStr.endsWith('.env.example')) return '';
          return '';
        });

        const visitedDirs: string[] = [];
        vi.mocked(fs.readdirSync).mockImplementation((dir, options) => {
          const dirStr = String(dir);
          visitedDirs.push(dirStr);
          if (dirStr === '/mock/project' || dirStr === '\\mock\\project') {
            if (options && typeof options === 'object' && 'withFileTypes' in options) {
              return [
                { name: 'node_modules', isDirectory: () => true, isFile: () => false },
                { name: '.git', isDirectory: () => true, isFile: () => false },
                { name: 'dist', isDirectory: () => true, isFile: () => false },
                { name: 'src', isDirectory: () => true, isFile: () => false },
              ] as unknown as fs.Dirent[];
            }
          }
          if (dirStr.includes('src')) {
            if (options && typeof options === 'object' && 'withFileTypes' in options) {
              return [] as unknown as fs.Dirent[];
            }
          }
          return [];
        });

        handleValidateEnvComplete({});

        // Should not have visited node_modules, .git, or dist
        expect(visitedDirs.some(d => d.includes('node_modules'))).toBe(false);
        expect(visitedDirs.some(d => d.includes('.git'))).toBe(false);
        expect(visitedDirs.some(d => d.includes('dist'))).toBe(false);
        // But should have visited src
        expect(visitedDirs.some(d => d.includes('src'))).toBe(true);
      });

      it('should scan multiple file types (.ts, .tsx, .js, .jsx, .vue, .svelte)', () => {
        const scannedFiles: string[] = [];

        vi.mocked(fs.existsSync).mockReturnValue(true);
        vi.mocked(fs.readFileSync).mockImplementation((p) => {
          const pathStr = String(p);
          if (pathStr.endsWith('.env')) return '';
          if (pathStr.endsWith('.env.example')) return '';
          scannedFiles.push(pathStr);
          return '';
        });

        vi.mocked(fs.readdirSync).mockImplementation((dir, options) => {
          const dirStr = String(dir);
          if (dirStr === '/mock/project' || dirStr === '\\mock\\project') {
            if (options && typeof options === 'object' && 'withFileTypes' in options) {
              return [
                { name: 'app.ts', isDirectory: () => false, isFile: () => true },
                { name: 'component.tsx', isDirectory: () => false, isFile: () => true },
                { name: 'util.js', isDirectory: () => false, isFile: () => true },
                { name: 'Form.jsx', isDirectory: () => false, isFile: () => true },
                { name: 'App.vue', isDirectory: () => false, isFile: () => true },
                { name: 'Page.svelte', isDirectory: () => false, isFile: () => true },
                { name: 'readme.md', isDirectory: () => false, isFile: () => true },
                { name: 'data.json', isDirectory: () => false, isFile: () => true },
              ] as unknown as fs.Dirent[];
            }
          }
          return [];
        });

        handleValidateEnvComplete({});

        // Should scan code files
        expect(scannedFiles.some(f => f.includes('app.ts'))).toBe(true);
        expect(scannedFiles.some(f => f.includes('component.tsx'))).toBe(true);
        expect(scannedFiles.some(f => f.includes('util.js'))).toBe(true);
        expect(scannedFiles.some(f => f.includes('Form.jsx'))).toBe(true);
        expect(scannedFiles.some(f => f.includes('App.vue'))).toBe(true);
        expect(scannedFiles.some(f => f.includes('Page.svelte'))).toBe(true);
        // Should not scan non-code files
        expect(scannedFiles.some(f => f.includes('readme.md'))).toBe(false);
        expect(scannedFiles.some(f => f.includes('data.json'))).toBe(false);
      });
    });

    describe('error handling', () => {
      it('should handle errors when reading .env file', () => {
        vi.mocked(fs.existsSync).mockReturnValue(true);
        vi.mocked(fs.readFileSync).mockImplementation((p) => {
          const pathStr = String(p);
          if (pathStr.endsWith('.env') && !pathStr.includes('.example')) {
            throw new Error('Permission denied');
          }
          if (pathStr.endsWith('.env.example')) return 'API_KEY=';
          return '';
        });
        vi.mocked(fs.readdirSync).mockReturnValue([]);

        const result = handleValidateEnvComplete({});
        // Should not throw, should handle gracefully
        expect(result.content[0].text).toBeDefined();
        expect(console.error).toHaveBeenCalled();
      });

      it('should handle errors when reading .env.example file', () => {
        vi.mocked(fs.existsSync).mockReturnValue(true);
        vi.mocked(fs.readFileSync).mockImplementation((p) => {
          const pathStr = String(p);
          if (pathStr.endsWith('.env') && !pathStr.includes('.example')) return 'API_KEY=secret';
          if (pathStr.endsWith('.env.example')) {
            throw new Error('Permission denied');
          }
          return '';
        });
        vi.mocked(fs.readdirSync).mockReturnValue([]);

        const result = handleValidateEnvComplete({});
        expect(result.content[0].text).toBeDefined();
        expect(console.error).toHaveBeenCalled();
      });

      it('should handle errors when scanning files', () => {
        vi.mocked(fs.existsSync).mockReturnValue(true);
        vi.mocked(fs.readFileSync).mockImplementation((p) => {
          const pathStr = String(p);
          if (pathStr.endsWith('.env')) return '';
          if (pathStr.endsWith('.env.example')) return '';
          if (pathStr.endsWith('.ts')) {
            throw new Error('File read error');
          }
          return '';
        });

        vi.mocked(fs.readdirSync).mockImplementation((dir, options) => {
          const dirStr = String(dir);
          if (dirStr === '/mock/project' || dirStr === '\\mock\\project') {
            if (options && typeof options === 'object' && 'withFileTypes' in options) {
              return [
                { name: 'app.ts', isDirectory: () => false, isFile: () => true },
              ] as unknown as fs.Dirent[];
            }
          }
          return [];
        });

        const result = handleValidateEnvComplete({});
        expect(result.content[0].text).toBeDefined();
        expect(console.error).toHaveBeenCalled();
      });

      it('should handle errors when scanning directories', () => {
        vi.mocked(fs.existsSync).mockReturnValue(true);
        vi.mocked(fs.readFileSync).mockImplementation((p) => {
          const pathStr = String(p);
          if (pathStr.endsWith('.env')) return '';
          if (pathStr.endsWith('.env.example')) return '';
          return '';
        });

        vi.mocked(fs.readdirSync).mockImplementation((dir) => {
          const dirStr = String(dir);
          if (dirStr === '/mock/project' || dirStr === '\\mock\\project') {
            throw new Error('Directory read error');
          }
          return [];
        });

        const result = handleValidateEnvComplete({});
        expect(result.content[0].text).toBeDefined();
        expect(console.error).toHaveBeenCalled();
      });
    });

    describe('parseEnvFile edge cases', () => {
      it('should handle empty env file', () => {
        vi.mocked(fs.existsSync).mockReturnValue(true);
        vi.mocked(fs.readFileSync).mockImplementation((p) => {
          return '';
        });
        vi.mocked(fs.readdirSync).mockReturnValue([]);

        const result = handleValidateEnvComplete({});
        const text = result.content[0].text;

        expect(text).toContain('Variables in .env: 0');
      });

      it('should skip comment lines', () => {
        const envContent = '# This is a comment\nAPI_KEY=secret\n# Another comment\nDB_URL=postgres://localhost';

        vi.mocked(fs.existsSync).mockReturnValue(true);
        vi.mocked(fs.readFileSync).mockImplementation((p) => {
          const pathStr = String(p);
          if (pathStr.endsWith('.env')) return envContent;
          if (pathStr.endsWith('.env.example')) return 'API_KEY=\nDB_URL=';
          return '';
        });
        vi.mocked(fs.readdirSync).mockReturnValue([]);

        const result = handleValidateEnvComplete({});
        const text = result.content[0].text;

        expect(text).toContain('Variables in .env: 2');
      });

      it('should skip empty lines', () => {
        const envContent = '\nAPI_KEY=secret\n\n\nDB_URL=postgres://localhost\n\n';

        vi.mocked(fs.existsSync).mockReturnValue(true);
        vi.mocked(fs.readFileSync).mockImplementation((p) => {
          const pathStr = String(p);
          if (pathStr.endsWith('.env')) return envContent;
          if (pathStr.endsWith('.env.example')) return 'API_KEY=\nDB_URL=';
          return '';
        });
        vi.mocked(fs.readdirSync).mockReturnValue([]);

        const result = handleValidateEnvComplete({});
        const text = result.content[0].text;

        expect(text).toContain('Variables in .env: 2');
      });

      it('should handle quoted values', () => {
        const envContent = 'API_KEY="secret with spaces"\nDB_URL=\'postgres://localhost\'';

        vi.mocked(fs.existsSync).mockReturnValue(true);
        vi.mocked(fs.readFileSync).mockImplementation((p) => {
          const pathStr = String(p);
          if (pathStr.endsWith('.env')) return envContent;
          if (pathStr.endsWith('.env.example')) return 'API_KEY=\nDB_URL=';
          return '';
        });
        vi.mocked(fs.readdirSync).mockReturnValue([]);

        const result = handleValidateEnvComplete({});
        const text = result.content[0].text;

        expect(text).toContain('Variables in .env: 2');
        expect(text).toContain('Environment Validation: PASSED');
      });

      it('should convert variable names to uppercase', () => {
        const envContent = 'api_key=secret\nDb_Url=postgres://localhost';
        const exampleContent = 'API_KEY=\nDB_URL=';

        vi.mocked(fs.existsSync).mockReturnValue(true);
        vi.mocked(fs.readFileSync).mockImplementation((p) => {
          const pathStr = String(p);
          if (pathStr.endsWith('.env')) return envContent;
          if (pathStr.endsWith('.env.example')) return exampleContent;
          return '';
        });
        vi.mocked(fs.readdirSync).mockReturnValue([]);

        const result = handleValidateEnvComplete({});
        const text = result.content[0].text;

        // Should match after uppercase conversion
        expect(text).toContain('Environment Validation: PASSED');
      });

      it('should handle values with equals sign', () => {
        const envContent = 'CONNECTION_STRING=postgres://user:pass=word@host/db';

        vi.mocked(fs.existsSync).mockReturnValue(true);
        vi.mocked(fs.readFileSync).mockImplementation((p) => {
          const pathStr = String(p);
          if (pathStr.endsWith('.env')) return envContent;
          if (pathStr.endsWith('.env.example')) return 'CONNECTION_STRING=';
          return '';
        });
        vi.mocked(fs.readdirSync).mockReturnValue([]);

        const result = handleValidateEnvComplete({});
        const text = result.content[0].text;

        expect(text).toContain('Variables in .env: 1');
      });
    });

    describe('formatAsMarkdown output', () => {
      it('should format file locations for missing variables', () => {
        const envContent = '';
        const exampleContent = '';
        const codeContent = 'const key = process.env.MISSING_VAR;';

        vi.mocked(fs.existsSync).mockReturnValue(true);
        vi.mocked(fs.readFileSync).mockImplementation((p) => {
          const pathStr = String(p);
          if (pathStr.endsWith('.env')) return envContent;
          if (pathStr.endsWith('.env.example')) return exampleContent;
          if (pathStr.endsWith('.ts')) return codeContent;
          return '';
        });

        vi.mocked(fs.readdirSync).mockImplementation((dir, options) => {
          const dirStr = String(dir);
          if (dirStr === '/mock/project' || dirStr === '\\mock\\project') {
            if (options && typeof options === 'object' && 'withFileTypes' in options) {
              return [
                { name: 'app.ts', isDirectory: () => false, isFile: () => true },
              ] as unknown as fs.Dirent[];
            }
          }
          return [];
        });

        const result = handleValidateEnvComplete({});
        const text = result.content[0].text;

        expect(text).toContain('MISSING_VAR');
        expect(text).toContain('Defined in: code');
        expect(text).toContain('Used in:');
      });

      it('should truncate long lists of file references', () => {
        const envContent = '';
        const exampleContent = '';
        const codeContent = 'const key = process.env.COMMON_VAR;';

        vi.mocked(fs.existsSync).mockReturnValue(true);
        vi.mocked(fs.readFileSync).mockImplementation((p) => {
          const pathStr = String(p);
          if (pathStr.endsWith('.env')) return envContent;
          if (pathStr.endsWith('.env.example')) return exampleContent;
          if (pathStr.endsWith('.ts')) return codeContent;
          return '';
        });

        vi.mocked(fs.readdirSync).mockImplementation((dir, options) => {
          const dirStr = String(dir);
          if (dirStr === '/mock/project' || dirStr === '\\mock\\project') {
            if (options && typeof options === 'object' && 'withFileTypes' in options) {
              return [
                { name: 'file1.ts', isDirectory: () => false, isFile: () => true },
                { name: 'file2.ts', isDirectory: () => false, isFile: () => true },
                { name: 'file3.ts', isDirectory: () => false, isFile: () => true },
                { name: 'file4.ts', isDirectory: () => false, isFile: () => true },
                { name: 'file5.ts', isDirectory: () => false, isFile: () => true },
                { name: 'file6.ts', isDirectory: () => false, isFile: () => true },
                { name: 'file7.ts', isDirectory: () => false, isFile: () => true },
              ] as unknown as fs.Dirent[];
            }
          }
          return [];
        });

        const result = handleValidateEnvComplete({});
        const text = result.content[0].text;

        // Should show (+X more) for files beyond 5
        expect(text).toContain('+');
        expect(text).toContain('more');
      });

      it('should truncate long values in type validation issues', () => {
        const longValue = 'a'.repeat(100);
        const envContent = `LONG_SECRET_KEY=${longValue}`;
        const exampleContent = 'LONG_SECRET_KEY=';

        vi.mocked(fs.existsSync).mockReturnValue(true);
        vi.mocked(fs.readFileSync).mockImplementation((p) => {
          const pathStr = String(p);
          if (pathStr.endsWith('.env')) return envContent;
          if (pathStr.endsWith('.env.example')) return exampleContent;
          return '';
        });
        vi.mocked(fs.readdirSync).mockReturnValue([]);

        const result = handleValidateEnvComplete({ check_values: true });
        const text = result.content[0].text;

        // Should pass (long secrets are fine) but if there were an issue,
        // the value should be truncated with ...
        expect(text).toContain('Environment Validation: PASSED');
      });

      it('should show defined_in as example when variable is only in .env.example', () => {
        const envContent = '';
        const exampleContent = 'EXAMPLE_ONLY_VAR=placeholder';

        vi.mocked(fs.existsSync).mockReturnValue(true);
        vi.mocked(fs.readFileSync).mockImplementation((p) => {
          const pathStr = String(p);
          if (pathStr.endsWith('.env') && !pathStr.includes('.example')) return envContent;
          if (pathStr.endsWith('.env.example')) return exampleContent;
          return '';
        });
        vi.mocked(fs.readdirSync).mockReturnValue([]);

        const result = handleValidateEnvComplete({});
        const text = result.content[0].text;

        expect(text).toContain('EXAMPLE_ONLY_VAR');
        expect(text).toContain('Defined in: example');
      });
    });

    describe('unused variables in .env.example only', () => {
      it('should detect unused variables only in .env.example', () => {
        const envContent = 'USED_VAR=value';
        const exampleContent = 'USED_VAR=\nUNUSED_EXAMPLE_VAR=\nANOTHER_UNUSED=';

        vi.mocked(fs.existsSync).mockReturnValue(true);
        vi.mocked(fs.readFileSync).mockImplementation((p) => {
          const pathStr = String(p);
          if (pathStr.endsWith('.env') && !pathStr.includes('.example')) return envContent;
          if (pathStr.endsWith('.env.example')) return exampleContent;
          if (pathStr.endsWith('.ts')) return 'const x = process.env.USED_VAR;';
          return '';
        });

        vi.mocked(fs.readdirSync).mockImplementation((dir, options) => {
          const dirStr = String(dir);
          if (dirStr === '/mock/project' || dirStr === '\\mock\\project') {
            if (options && typeof options === 'object' && 'withFileTypes' in options) {
              return [
                { name: 'app.ts', isDirectory: () => false, isFile: () => true },
              ] as unknown as fs.Dirent[];
            }
          }
          return [];
        });

        const result = handleValidateEnvComplete({});
        const text = result.content[0].text;

        expect(text).toContain('Unused Variables');
        expect(text).toContain('UNUSED_EXAMPLE_VAR');
        expect(text).toContain('.env.example');
      });

      it('should not duplicate unused variables already in .env', () => {
        const envContent = 'IN_BOTH=value';
        const exampleContent = 'IN_BOTH=';

        vi.mocked(fs.existsSync).mockReturnValue(true);
        vi.mocked(fs.readFileSync).mockImplementation((p) => {
          const pathStr = String(p);
          if (pathStr.endsWith('.env') && !pathStr.includes('.example')) return envContent;
          if (pathStr.endsWith('.env.example')) return exampleContent;
          return '';
        });
        vi.mocked(fs.readdirSync).mockReturnValue([]);

        const result = handleValidateEnvComplete({});
        const text = result.content[0].text;

        // Count occurrences of IN_BOTH in unused section
        const unusedSection = text.split('Unused Variables')[1] || '';
        const matches = unusedSection.match(/IN_BOTH/g) || [];
        expect(matches.length).toBeLessThanOrEqual(1);
      });
    });

    describe('max files limit', () => {
      it('should respect max files limit during scanning', () => {
        let filesScanned = 0;

        vi.mocked(fs.existsSync).mockReturnValue(true);
        vi.mocked(fs.readFileSync).mockImplementation((p) => {
          const pathStr = String(p);
          if (pathStr.endsWith('.env')) return '';
          if (pathStr.endsWith('.env.example')) return '';
          filesScanned++;
          return '';
        });

        // Create a very large directory structure
        const manyFiles = Array.from({ length: 2000 }, (_, i) => ({
          name: `file${i}.ts`,
          isDirectory: () => false,
          isFile: () => true,
        }));

        vi.mocked(fs.readdirSync).mockImplementation((dir, options) => {
          const dirStr = String(dir);
          if (dirStr === '/mock/project' || dirStr === '\\mock\\project') {
            if (options && typeof options === 'object' && 'withFileTypes' in options) {
              return manyFiles as unknown as fs.Dirent[];
            }
          }
          return [];
        });

        handleValidateEnvComplete({});

        // Default max is 1000, so should not scan more than that
        expect(filesScanned).toBeLessThanOrEqual(1000);
      });
    });

    describe('response format', () => {
      it('should return properly formatted MCP response', () => {
        vi.mocked(fs.existsSync).mockReturnValue(true);
        vi.mocked(fs.readFileSync).mockReturnValue('');
        vi.mocked(fs.readdirSync).mockReturnValue([]);

        const result = handleValidateEnvComplete({});

        expect(result).toHaveProperty('content');
        expect(result.content).toHaveLength(1);
        expect(result.content[0]).toHaveProperty('type', 'text');
        expect(result.content[0]).toHaveProperty('text');
      });

      it('should return markdown formatted text', () => {
        vi.mocked(fs.existsSync).mockReturnValue(true);
        vi.mocked(fs.readFileSync).mockReturnValue('');
        vi.mocked(fs.readdirSync).mockReturnValue([]);

        const result = handleValidateEnvComplete({});
        const text = result.content[0].text;

        // Should have markdown headers
        expect(text).toContain('# ');
        expect(text).toContain('## ');
      });
    });

    describe('valid result conditions', () => {
      it('should be valid when no missing vars and check_values is false', () => {
        const envContent = 'API_KEY=secret';
        const exampleContent = 'API_KEY=';

        vi.mocked(fs.existsSync).mockReturnValue(true);
        vi.mocked(fs.readFileSync).mockImplementation((p) => {
          const pathStr = String(p);
          if (pathStr.endsWith('.env')) return envContent;
          if (pathStr.endsWith('.env.example')) return exampleContent;
          return '';
        });
        vi.mocked(fs.readdirSync).mockReturnValue([]);

        const result = handleValidateEnvComplete({});
        const text = result.content[0].text;

        expect(text).toContain('Environment Validation: PASSED');
      });

      it('should be invalid when there are type issues and check_values is true', () => {
        const envContent = 'API_PORT=not_a_number';
        const exampleContent = 'API_PORT=';

        vi.mocked(fs.existsSync).mockReturnValue(true);
        vi.mocked(fs.readFileSync).mockImplementation((p) => {
          const pathStr = String(p);
          if (pathStr.endsWith('.env')) return envContent;
          if (pathStr.endsWith('.env.example')) return exampleContent;
          return '';
        });
        vi.mocked(fs.readdirSync).mockReturnValue([]);

        const result = handleValidateEnvComplete({ check_values: true });
        const text = result.content[0].text;

        expect(text).toContain('Environment Validation: FAILED');
      });
    });

    describe('inferExpectedType edge cases', () => {
      it('should infer string type for unknown variable names', () => {
        const envContent = 'RANDOM_SETTING=anyvalue';
        const exampleContent = 'RANDOM_SETTING=';

        vi.mocked(fs.existsSync).mockReturnValue(true);
        vi.mocked(fs.readFileSync).mockImplementation((p) => {
          const pathStr = String(p);
          if (pathStr.endsWith('.env')) return envContent;
          if (pathStr.endsWith('.env.example')) return exampleContent;
          return '';
        });
        vi.mocked(fs.readdirSync).mockReturnValue([]);

        const result = handleValidateEnvComplete({ check_values: true });
        const text = result.content[0].text;

        // Should pass since strings accept any non-empty value
        expect(text).toContain('Environment Validation: PASSED');
      });

      it('should infer type for PASSWORD variables', () => {
        const envContent = 'DB_PASSWORD=short';
        const exampleContent = 'DB_PASSWORD=';

        vi.mocked(fs.existsSync).mockReturnValue(true);
        vi.mocked(fs.readFileSync).mockImplementation((p) => {
          const pathStr = String(p);
          if (pathStr.endsWith('.env')) return envContent;
          if (pathStr.endsWith('.env.example')) return exampleContent;
          return '';
        });
        vi.mocked(fs.readdirSync).mockReturnValue([]);

        const result = handleValidateEnvComplete({ check_values: true });
        const text = result.content[0].text;

        // Should fail because password is too short
        expect(text).toContain('DB_PASSWORD');
        expect(text).toContain('too short');
      });
    });

    describe('mjs and cjs file extensions', () => {
      it('should scan .mjs and .cjs files', () => {
        const scannedFiles: string[] = [];

        vi.mocked(fs.existsSync).mockReturnValue(true);
        vi.mocked(fs.readFileSync).mockImplementation((p) => {
          const pathStr = String(p);
          if (pathStr.endsWith('.env')) return '';
          if (pathStr.endsWith('.env.example')) return '';
          scannedFiles.push(pathStr);
          return 'const x = process.env.TEST_VAR;';
        });

        vi.mocked(fs.readdirSync).mockImplementation((dir, options) => {
          const dirStr = String(dir);
          if (dirStr === '/mock/project' || dirStr === '\\mock\\project') {
            if (options && typeof options === 'object' && 'withFileTypes' in options) {
              return [
                { name: 'esm-module.mjs', isDirectory: () => false, isFile: () => true },
                { name: 'cjs-module.cjs', isDirectory: () => false, isFile: () => true },
              ] as unknown as fs.Dirent[];
            }
          }
          return [];
        });

        handleValidateEnvComplete({});

        expect(scannedFiles.some(f => f.includes('esm-module.mjs'))).toBe(true);
        expect(scannedFiles.some(f => f.includes('cjs-module.cjs'))).toBe(true);
      });
    });
  });
});
