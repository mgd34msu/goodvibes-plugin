/**
 * Unit tests for validate-env-complete handler
 *
 * Tests cover:
 * - handleValidateEnvComplete main function
 * - parseEnvFile helper (via integration)
 * - scanFileForEnvVars helper (via integration)
 * - scanDirectory helper (via integration)
 * - inferExpectedType helper (via integration)
 * - validateValue helper (via integration)
 * - formatAsMarkdown helper (via integration)
 * - All edge cases and error paths
 *
 * Target: 100% code coverage
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

// Mock modules before imports
vi.mock('fs');
vi.mock('../../../config.js', () => ({
  PROJECT_ROOT: '/mock/project',
}));

// Import after mocks are set up
import { handleValidateEnvComplete, ValidateEnvCompleteArgs } from '../../../handlers/env/validate-env-complete.js';

// Helper to create mock Dirent objects
function createMockDirent(name: string, isDir: boolean): fs.Dirent {
  return {
    name,
    isDirectory: () => isDir,
    isFile: () => !isDir,
    isBlockDevice: () => false,
    isCharacterDevice: () => false,
    isSymbolicLink: () => false,
    isFIFO: () => false,
    isSocket: () => false,
    path: '',
    parentPath: '',
  } as fs.Dirent;
}

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
          if (pathStr.includes('.env.example')) return exampleContent;
          if (pathStr.includes('.env')) return envContent;
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
          if (pathStr.includes('.env.example')) return exampleContent;
          if (pathStr.includes('.env')) return envContent;
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
          if (pathStr.includes('.env.example')) return exampleContent;
          if (pathStr.includes('.env')) return envContent;
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
          if (pathStr.includes('.env.example')) return exampleContent;
          if (pathStr.includes('.env')) return envContent;
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
          // Only .env.example exists
          return pathStr.includes('.env.example');
        });
        vi.mocked(fs.readFileSync).mockImplementation((p) => {
          const pathStr = String(p);
          if (pathStr.includes('.env.example')) return 'API_KEY=';
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
          // Only .env exists (not .env.example)
          if (pathStr.includes('.env.example')) return false;
          if (pathStr.includes('.env')) return true;
          return false;
        });
        vi.mocked(fs.readFileSync).mockImplementation((p) => {
          const pathStr = String(p);
          if (pathStr.includes('.env.example')) throw new Error('ENOENT');
          if (pathStr.includes('.env')) return 'API_KEY=secret';
          return '';
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
          const pathStr = String(p);
          return pathStr.includes('.env.production') || pathStr.includes('.env.example');
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
          const pathStr = String(p);
          return pathStr.includes('.env') || pathStr.includes('.env.template');
        });
        vi.mocked(fs.readFileSync).mockImplementation((p) => {
          const pathStr = String(p);
          if (pathStr.includes('.env.template')) return 'API_KEY=';
          if (pathStr.includes('.env')) return 'API_KEY=secret';
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
          if (pathStr.includes('.env.example')) return exampleContent;
          if (pathStr.includes('.env')) return envContent;
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
          if (pathStr.includes('.env.example')) return exampleContent;
          if (pathStr.includes('.env')) return envContent;
          return '';
        });
        vi.mocked(fs.readdirSync).mockReturnValue([]);

        // Lowercase ignore should match uppercase var
        const result = handleValidateEnvComplete({ ignore: ['mixed_case_var'] });
        const text = result.content[0].text;

        expect(text).not.toContain('MIXED_CASE_VAR');
      });

      it('should handle empty ignore list', () => {
        const envContent = 'API_KEY=secret';
        const exampleContent = 'API_KEY=\nMISSING_VAR=';

        vi.mocked(fs.existsSync).mockReturnValue(true);
        vi.mocked(fs.readFileSync).mockImplementation((p) => {
          const pathStr = String(p);
          if (pathStr.includes('.env.example')) return exampleContent;
          if (pathStr.includes('.env')) return envContent;
          return '';
        });
        vi.mocked(fs.readdirSync).mockReturnValue([]);

        const result = handleValidateEnvComplete({ ignore: [] });
        const text = result.content[0].text;

        // With empty ignore list, MISSING_VAR should appear
        expect(text).toContain('MISSING_VAR');
      });
    });

    describe('value type validation', () => {
      it('should not validate values by default', () => {
        const envContent = 'API_PORT=not_a_number\nAPI_URL=invalid-url';
        const exampleContent = 'API_PORT=\nAPI_URL=';

        vi.mocked(fs.existsSync).mockReturnValue(true);
        vi.mocked(fs.readFileSync).mockImplementation((p) => {
          const pathStr = String(p);
          if (pathStr.includes('.env.example')) return exampleContent;
          if (pathStr.includes('.env')) return envContent;
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
          if (pathStr.includes('.env.example')) return exampleContent;
          if (pathStr.includes('.env')) return envContent;
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
          if (pathStr.includes('.env.example')) return exampleContent;
          if (pathStr.includes('.env')) return envContent;
          return '';
        });
        vi.mocked(fs.readdirSync).mockReturnValue([]);

        const result = handleValidateEnvComplete({ check_values: true });
        const text = result.content[0].text;

        expect(text).toContain('Type Validation Issues');
        expect(text).toContain('Expected valid URL');
      });

      it('should validate URI values when check_values is true', () => {
        const envContent = 'SERVICE_URI=invalid-uri';
        const exampleContent = 'SERVICE_URI=';

        vi.mocked(fs.existsSync).mockReturnValue(true);
        vi.mocked(fs.readFileSync).mockImplementation((p) => {
          const pathStr = String(p);
          if (pathStr.includes('.env.example')) return exampleContent;
          if (pathStr.includes('.env')) return envContent;
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
          if (pathStr.includes('.env.example')) return exampleContent;
          if (pathStr.includes('.env')) return envContent;
          return '';
        });
        vi.mocked(fs.readdirSync).mockReturnValue([]);

        const result = handleValidateEnvComplete({ check_values: true });
        const text = result.content[0].text;

        expect(text).not.toContain('Type Validation Issues');
      });

      it('should validate boolean values when check_values is true', () => {
        const envContent = 'DEBUG_ENABLED=maybe\nFEATURE_DISABLED=yes';
        const exampleContent = 'DEBUG_ENABLED=\nFEATURE_DISABLED=';

        vi.mocked(fs.existsSync).mockReturnValue(true);
        vi.mocked(fs.readFileSync).mockImplementation((p) => {
          const pathStr = String(p);
          if (pathStr.includes('.env.example')) return exampleContent;
          if (pathStr.includes('.env')) return envContent;
          return '';
        });
        vi.mocked(fs.readdirSync).mockReturnValue([]);

        const result = handleValidateEnvComplete({ check_values: true });
        const text = result.content[0].text;

        expect(text).toContain('Type Validation Issues');
        expect(text).toContain('DEBUG_ENABLED');
        expect(text).toContain('Expected boolean value');
        // FEATURE_DISABLED with 'yes' should be valid
        expect(text).not.toMatch(/FEATURE_DISABLED.*Expected boolean/);
      });

      it('should accept all valid boolean formats', () => {
        const envContent = 'ENABLED1=true\nENABLED2=false\nENABLED3=1\nENABLED4=0\nENABLED5=yes\nENABLED6=no';
        const exampleContent = 'ENABLED1=\nENABLED2=\nENABLED3=\nENABLED4=\nENABLED5=\nENABLED6=';

        vi.mocked(fs.existsSync).mockReturnValue(true);
        vi.mocked(fs.readFileSync).mockImplementation((p) => {
          const pathStr = String(p);
          if (pathStr.includes('.env.example')) return exampleContent;
          if (pathStr.includes('.env')) return envContent;
          return '';
        });
        vi.mocked(fs.readdirSync).mockReturnValue([]);

        const result = handleValidateEnvComplete({ check_values: true });
        const text = result.content[0].text;

        expect(text).not.toContain('Type Validation Issues');
      });

      it('should validate secret values length when check_values is true', () => {
        const envContent = 'API_KEY=short\nSECRET_TOKEN=verylongsecretvalue';
        const exampleContent = 'API_KEY=\nSECRET_TOKEN=';

        vi.mocked(fs.existsSync).mockReturnValue(true);
        vi.mocked(fs.readFileSync).mockImplementation((p) => {
          const pathStr = String(p);
          if (pathStr.includes('.env.example')) return exampleContent;
          if (pathStr.includes('.env')) return envContent;
          return '';
        });
        vi.mocked(fs.readdirSync).mockReturnValue([]);

        const result = handleValidateEnvComplete({ check_values: true });
        const text = result.content[0].text;

        expect(text).toContain('Type Validation Issues');
        expect(text).toContain('API_KEY');
        expect(text).toContain('too short');
        // SECRET_TOKEN is long enough (>= 8 chars)
        expect(text).not.toMatch(/SECRET_TOKEN.*too short/);
      });

      it('should validate password values as secrets', () => {
        const envContent = 'DB_PASSWORD=tiny';
        const exampleContent = 'DB_PASSWORD=';

        vi.mocked(fs.existsSync).mockReturnValue(true);
        vi.mocked(fs.readFileSync).mockImplementation((p) => {
          const pathStr = String(p);
          if (pathStr.includes('.env.example')) return exampleContent;
          if (pathStr.includes('.env')) return envContent;
          return '';
        });
        vi.mocked(fs.readdirSync).mockReturnValue([]);

        const result = handleValidateEnvComplete({ check_values: true });
        const text = result.content[0].text;

        expect(text).toContain('DB_PASSWORD');
        expect(text).toContain('too short');
      });

      it('should detect empty values', () => {
        const envContent = 'API_KEY=\nDATABASE_URL=   ';
        const exampleContent = 'API_KEY=\nDATABASE_URL=';

        vi.mocked(fs.existsSync).mockReturnValue(true);
        vi.mocked(fs.readFileSync).mockImplementation((p) => {
          const pathStr = String(p);
          if (pathStr.includes('.env.example')) return exampleContent;
          if (pathStr.includes('.env')) return envContent;
          return '';
        });
        vi.mocked(fs.readdirSync).mockReturnValue([]);

        const result = handleValidateEnvComplete({ check_values: true });
        const text = result.content[0].text;

        expect(text).toContain('Type Validation Issues');
        expect(text).toContain('Value is empty');
      });

      it('should validate TIMEOUT, LIMIT, MAX, MIN, COUNT vars as numbers', () => {
        const envContent = 'REQUEST_TIMEOUT=abc\nMAX_RETRIES=10\nMIN_CONNECTIONS=five\nUSER_COUNT=100\nRATIO_LIMIT=bad';
        const exampleContent = 'REQUEST_TIMEOUT=\nMAX_RETRIES=\nMIN_CONNECTIONS=\nUSER_COUNT=\nRATIO_LIMIT=';

        vi.mocked(fs.existsSync).mockReturnValue(true);
        vi.mocked(fs.readFileSync).mockImplementation((p) => {
          const pathStr = String(p);
          if (pathStr.includes('.env.example')) return exampleContent;
          if (pathStr.includes('.env')) return envContent;
          return '';
        });
        vi.mocked(fs.readdirSync).mockReturnValue([]);

        const result = handleValidateEnvComplete({ check_values: true });
        const text = result.content[0].text;

        expect(text).toContain('REQUEST_TIMEOUT');
        expect(text).toContain('MIN_CONNECTIONS');
        expect(text).toContain('RATIO_LIMIT');
        // These are valid numbers
        expect(text).not.toMatch(/MAX_RETRIES.*Expected numeric/);
        expect(text).not.toMatch(/USER_COUNT.*Expected numeric/);
      });

      it('should accept valid numeric values including negative and decimal', () => {
        const envContent = 'API_PORT=3000\nTHROTTLE_LIMIT=-1\nRATIO_MAX=0.5';
        const exampleContent = 'API_PORT=\nTHROTTLE_LIMIT=\nRATIO_MAX=';

        vi.mocked(fs.existsSync).mockReturnValue(true);
        vi.mocked(fs.readFileSync).mockImplementation((p) => {
          const pathStr = String(p);
          if (pathStr.includes('.env.example')) return exampleContent;
          if (pathStr.includes('.env')) return envContent;
          return '';
        });
        vi.mocked(fs.readdirSync).mockReturnValue([]);

        const result = handleValidateEnvComplete({ check_values: true });
        const text = result.content[0].text;

        // None should have type issues
        expect(text).not.toContain('Type Validation Issues');
      });

      it('should infer string type for unknown variable names', () => {
        const envContent = 'RANDOM_SETTING=anyvalue';
        const exampleContent = 'RANDOM_SETTING=';

        vi.mocked(fs.existsSync).mockReturnValue(true);
        vi.mocked(fs.readFileSync).mockImplementation((p) => {
          const pathStr = String(p);
          if (pathStr.includes('.env.example')) return exampleContent;
          if (pathStr.includes('.env')) return envContent;
          return '';
        });
        vi.mocked(fs.readdirSync).mockReturnValue([]);

        const result = handleValidateEnvComplete({ check_values: true });
        const text = result.content[0].text;

        // Should pass since strings accept any non-empty value
        expect(text).toContain('Environment Validation: PASSED');
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
          if (pathStr.includes('.env.example')) return exampleContent;
          if (pathStr.includes('.env') && !pathStr.includes('.ts')) return envContent;
          if (pathStr.endsWith('.ts')) return codeContent;
          return '';
        });

        vi.mocked(fs.readdirSync).mockImplementation((dir, options) => {
          if (options && typeof options === 'object' && 'withFileTypes' in options) {
            const dirStr = String(dir).replace(/\\/g, '/');
            console.log('DEBUG readdirSync dir:', dirStr);
            if (dirStr === '/mock/project') {
              return [
                createMockDirent('src', true),
              ];
            }
            if (dirStr.includes('src')) {
              return [
                createMockDirent('index.ts', false),
              ];
            }
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
          if (pathStr.includes('.env')) return envContent;
          if (pathStr.endsWith('.ts')) return codeContent;
          return '';
        });

        vi.mocked(fs.readdirSync).mockImplementation((dir, options) => {
          if (options && typeof options === 'object' && 'withFileTypes' in options) {
            const dirStr = String(dir).replace(/\\/g, '/');
            if (dirStr === '/mock/project') {
              return [createMockDirent('app.ts', false)];
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
          if (pathStr.includes('.env')) return envContent;
          if (pathStr.endsWith('.ts')) return codeContent;
          return '';
        });

        vi.mocked(fs.readdirSync).mockImplementation((dir, options) => {
          if (options && typeof options === 'object' && 'withFileTypes' in options) {
            const dirStr = String(dir).replace(/\\/g, '/');
            if (dirStr === '/mock/project') {
              return [createMockDirent('app.ts', false)];
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
          if (pathStr.includes('.env')) return envContent;
          if (pathStr.endsWith('.ts')) return codeContent;
          return '';
        });

        vi.mocked(fs.readdirSync).mockImplementation((dir, options) => {
          if (options && typeof options === 'object' && 'withFileTypes' in options) {
            const dirStr = String(dir).replace(/\\/g, '/');
            if (dirStr === '/mock/project') {
              return [createMockDirent('app.ts', false)];
            }
          }
          return [];
        });

        const result = handleValidateEnvComplete({});
        const text = result.content[0].text;

        expect(text).toContain('DENO_PORT');
        expect(text).toContain('DENO_HOST');
      });

      it('should skip built-in env vars like NODE_ENV, MODE, DEV, PROD, SSR, BASE_URL', () => {
        const envContent = '';
        const exampleContent = '';
        const codeContent = `
          const env = process.env.NODE_ENV;
          const mode = import.meta.env.MODE;
          const isDev = import.meta.env.DEV;
          const isProd = import.meta.env.PROD;
          const isSSR = import.meta.env.SSR;
          const base = import.meta.env.BASE_URL;
        `;

        vi.mocked(fs.existsSync).mockReturnValue(true);
        vi.mocked(fs.readFileSync).mockImplementation((p) => {
          const pathStr = String(p);
          if (pathStr.includes('.env')) return envContent;
          if (pathStr.endsWith('.ts')) return codeContent;
          return '';
        });

        vi.mocked(fs.readdirSync).mockImplementation((dir, options) => {
          if (options && typeof options === 'object' && 'withFileTypes' in options) {
            const dirStr = String(dir).replace(/\\/g, '/');
            if (dirStr === '/mock/project') {
              return [createMockDirent('app.ts', false)];
            }
          }
          return [];
        });

        const result = handleValidateEnvComplete({});
        const text = result.content[0].text;

        // Built-in vars should not appear in missing list
        expect(text).not.toContain('`NODE_ENV`');
        expect(text).not.toContain('`MODE`');
        expect(text).not.toContain('`DEV`');
        expect(text).not.toContain('`PROD`');
        expect(text).not.toContain('`SSR`');
        expect(text).not.toContain('`BASE_URL`');
      });

      it('should skip directories like node_modules, .git, dist, build, out, .next, .nuxt, .svelte-kit, coverage, .cache, vendor, __pycache__, .venv, venv, target', () => {
        vi.mocked(fs.existsSync).mockReturnValue(true);
        vi.mocked(fs.readFileSync).mockImplementation((p) => {
          const pathStr = String(p);
          if (pathStr.includes('.env')) return '';
          return '';
        });

        const visitedDirs: string[] = [];
        vi.mocked(fs.readdirSync).mockImplementation((dir, options) => {
          const dirStr = String(dir);
          visitedDirs.push(dirStr);
          if (options && typeof options === 'object' && 'withFileTypes' in options) {
            if (dirStr === '/mock/project') {
              return [
                createMockDirent('node_modules', true),
                createMockDirent('.git', true),
                createMockDirent('dist', true),
                createMockDirent('build', true),
                createMockDirent('out', true),
                createMockDirent('.next', true),
                createMockDirent('.nuxt', true),
                createMockDirent('.svelte-kit', true),
                createMockDirent('coverage', true),
                createMockDirent('.cache', true),
                createMockDirent('vendor', true),
                createMockDirent('__pycache__', true),
                createMockDirent('.venv', true),
                createMockDirent('venv', true),
                createMockDirent('target', true),
                createMockDirent('src', true),
              ];
            }
            if (dirStr.includes('src')) {
              return [];
            }
          }
          return [];
        });

        handleValidateEnvComplete({});

        // Should not have visited any of the skip directories
        expect(visitedDirs.some(d => d.includes('node_modules'))).toBe(false);
        expect(visitedDirs.some(d => d.includes('.git'))).toBe(false);
        expect(visitedDirs.some(d => d.includes('/dist'))).toBe(false);
        // But should have visited src
        expect(visitedDirs.some(d => d.includes('src'))).toBe(true);
      });

      it('should scan multiple file types (.ts, .tsx, .js, .jsx, .mjs, .cjs, .vue, .svelte)', () => {
        const scannedFiles: string[] = [];

        vi.mocked(fs.existsSync).mockReturnValue(true);
        vi.mocked(fs.readFileSync).mockImplementation((p) => {
          const pathStr = String(p);
          if (pathStr.includes('.env')) return '';
          scannedFiles.push(pathStr);
          return 'const x = process.env.TEST_VAR;';
        });

        vi.mocked(fs.readdirSync).mockImplementation((dir, options) => {
          if (options && typeof options === 'object' && 'withFileTypes' in options) {
            const dirStr = String(dir).replace(/\\/g, '/');
            if (dirStr === '/mock/project') {
              return [
                createMockDirent('app.ts', false),
                createMockDirent('component.tsx', false),
                createMockDirent('util.js', false),
                createMockDirent('Form.jsx', false),
                createMockDirent('esm.mjs', false),
                createMockDirent('cjs.cjs', false),
                createMockDirent('App.vue', false),
                createMockDirent('Page.svelte', false),
                createMockDirent('readme.md', false),
                createMockDirent('data.json', false),
              ];
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
        expect(scannedFiles.some(f => f.includes('esm.mjs'))).toBe(true);
        expect(scannedFiles.some(f => f.includes('cjs.cjs'))).toBe(true);
        expect(scannedFiles.some(f => f.includes('App.vue'))).toBe(true);
        expect(scannedFiles.some(f => f.includes('Page.svelte'))).toBe(true);
        // Should not scan non-code files
        expect(scannedFiles.some(f => f.includes('readme.md'))).toBe(false);
        expect(scannedFiles.some(f => f.includes('data.json'))).toBe(false);
      });

      it('should handle same variable in multiple files', () => {
        const envContent = '';
        const codeContent = 'const x = process.env.SHARED_VAR;';

        vi.mocked(fs.existsSync).mockReturnValue(true);
        vi.mocked(fs.readFileSync).mockImplementation((p) => {
          const pathStr = String(p);
          if (pathStr.includes('.env')) return envContent;
          if (pathStr.endsWith('.ts')) return codeContent;
          return '';
        });

        vi.mocked(fs.readdirSync).mockImplementation((dir, options) => {
          if (options && typeof options === 'object' && 'withFileTypes' in options) {
            const dirStr = String(dir).replace(/\\/g, '/');
            if (dirStr === '/mock/project') {
              return [
                createMockDirent('file1.ts', false),
                createMockDirent('file2.ts', false),
                createMockDirent('file3.ts', false),
              ];
            }
          }
          return [];
        });

        const result = handleValidateEnvComplete({});
        const text = result.content[0].text;

        expect(text).toContain('SHARED_VAR');
        // Should show the files where it's used
        expect(text).toContain('Used in:');
      });
    });

    describe('error handling', () => {
      it('should handle errors when reading .env file', () => {
        vi.mocked(fs.existsSync).mockReturnValue(true);
        vi.mocked(fs.readFileSync).mockImplementation((p) => {
          const pathStr = String(p);
          if (pathStr.includes('.env') && !pathStr.includes('.example')) {
            throw new Error('Permission denied');
          }
          if (pathStr.includes('.env.example')) return 'API_KEY=';
          return '';
        });
        vi.mocked(fs.readdirSync).mockReturnValue([]);

        const result = handleValidateEnvComplete({});
        // Should not throw, should handle gracefully
        expect(result.content[0].text).toBeDefined();
        expect(console.error).toHaveBeenCalled();
      });

      it('should handle non-Error exceptions when reading .env file', () => {
        vi.mocked(fs.existsSync).mockReturnValue(true);
        vi.mocked(fs.readFileSync).mockImplementation((p) => {
          const pathStr = String(p);
          if (pathStr.includes('.env') && !pathStr.includes('.example')) {
            throw 'String error'; // Non-Error throw
          }
          if (pathStr.includes('.env.example')) return 'API_KEY=';
          return '';
        });
        vi.mocked(fs.readdirSync).mockReturnValue([]);

        const result = handleValidateEnvComplete({});
        expect(result.content[0].text).toBeDefined();
        expect(console.error).toHaveBeenCalled();
      });

      it('should handle errors when reading .env.example file', () => {
        vi.mocked(fs.existsSync).mockReturnValue(true);
        vi.mocked(fs.readFileSync).mockImplementation((p) => {
          const pathStr = String(p);
          if (pathStr.includes('.env.example')) {
            throw new Error('Permission denied');
          }
          if (pathStr.includes('.env')) return 'API_KEY=secret';
          return '';
        });
        vi.mocked(fs.readdirSync).mockReturnValue([]);

        const result = handleValidateEnvComplete({});
        expect(result.content[0].text).toBeDefined();
        expect(console.error).toHaveBeenCalled();
      });

      it('should handle non-Error exceptions when reading .env.example file', () => {
        vi.mocked(fs.existsSync).mockReturnValue(true);
        vi.mocked(fs.readFileSync).mockImplementation((p) => {
          const pathStr = String(p);
          if (pathStr.includes('.env.example')) {
            throw 'String error';
          }
          if (pathStr.includes('.env')) return 'API_KEY=secret';
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
          if (pathStr.includes('.env')) return '';
          if (pathStr.endsWith('.ts')) {
            throw new Error('File read error');
          }
          return '';
        });

        vi.mocked(fs.readdirSync).mockImplementation((dir, options) => {
          if (options && typeof options === 'object' && 'withFileTypes' in options) {
            const dirStr = String(dir).replace(/\\/g, '/');
            if (dirStr === '/mock/project') {
              return [createMockDirent('app.ts', false)];
            }
          }
          return [];
        });

        const result = handleValidateEnvComplete({});
        expect(result.content[0].text).toBeDefined();
        expect(console.error).toHaveBeenCalled();
      });

      it('should handle non-Error exceptions when scanning files', () => {
        vi.mocked(fs.existsSync).mockReturnValue(true);
        vi.mocked(fs.readFileSync).mockImplementation((p) => {
          const pathStr = String(p);
          if (pathStr.includes('.env')) return '';
          if (pathStr.endsWith('.ts')) {
            throw 'String error';
          }
          return '';
        });

        vi.mocked(fs.readdirSync).mockImplementation((dir, options) => {
          if (options && typeof options === 'object' && 'withFileTypes' in options) {
            const dirStr = String(dir).replace(/\\/g, '/');
            if (dirStr === '/mock/project') {
              return [createMockDirent('app.ts', false)];
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
          if (pathStr.includes('.env')) return '';
          return '';
        });

        vi.mocked(fs.readdirSync).mockImplementation((dir) => {
          const dirStr = String(dir);
          if (dirStr === '/mock/project') {
            throw new Error('Directory read error');
          }
          return [];
        });

        const result = handleValidateEnvComplete({});
        expect(result.content[0].text).toBeDefined();
        expect(console.error).toHaveBeenCalled();
      });

      it('should handle non-Error exceptions when scanning directories', () => {
        vi.mocked(fs.existsSync).mockReturnValue(true);
        vi.mocked(fs.readFileSync).mockImplementation((p) => {
          const pathStr = String(p);
          if (pathStr.includes('.env')) return '';
          return '';
        });

        vi.mocked(fs.readdirSync).mockImplementation((dir) => {
          const dirStr = String(dir);
          if (dirStr === '/mock/project') {
            throw 'String error';
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
        vi.mocked(fs.readFileSync).mockReturnValue('');
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
          if (pathStr.includes('.env.example')) return 'API_KEY=\nDB_URL=';
          if (pathStr.includes('.env')) return envContent;
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
          if (pathStr.includes('.env.example')) return 'API_KEY=\nDB_URL=';
          if (pathStr.includes('.env')) return envContent;
          return '';
        });
        vi.mocked(fs.readdirSync).mockReturnValue([]);

        const result = handleValidateEnvComplete({});
        const text = result.content[0].text;

        expect(text).toContain('Variables in .env: 2');
      });

      it('should handle quoted values with double quotes', () => {
        const envContent = 'API_KEY="secret with spaces"';

        vi.mocked(fs.existsSync).mockReturnValue(true);
        vi.mocked(fs.readFileSync).mockImplementation((p) => {
          const pathStr = String(p);
          if (pathStr.includes('.env.example')) return 'API_KEY=';
          if (pathStr.includes('.env')) return envContent;
          return '';
        });
        vi.mocked(fs.readdirSync).mockReturnValue([]);

        const result = handleValidateEnvComplete({});
        const text = result.content[0].text;

        expect(text).toContain('Variables in .env: 1');
        expect(text).toContain('Environment Validation: PASSED');
      });

      it('should handle quoted values with single quotes', () => {
        const envContent = "DB_URL='postgres://localhost'";

        vi.mocked(fs.existsSync).mockReturnValue(true);
        vi.mocked(fs.readFileSync).mockImplementation((p) => {
          const pathStr = String(p);
          if (pathStr.includes('.env.example')) return 'DB_URL=';
          if (pathStr.includes('.env')) return envContent;
          return '';
        });
        vi.mocked(fs.readdirSync).mockReturnValue([]);

        const result = handleValidateEnvComplete({});
        const text = result.content[0].text;

        expect(text).toContain('Variables in .env: 1');
      });

      it('should convert variable names to uppercase', () => {
        const envContent = 'api_key=secret\nDb_Url=postgres://localhost';
        const exampleContent = 'API_KEY=\nDB_URL=';

        vi.mocked(fs.existsSync).mockReturnValue(true);
        vi.mocked(fs.readFileSync).mockImplementation((p) => {
          const pathStr = String(p);
          if (pathStr.includes('.env.example')) return exampleContent;
          if (pathStr.includes('.env')) return envContent;
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
          if (pathStr.includes('.env.example')) return 'CONNECTION_STRING=';
          if (pathStr.includes('.env')) return envContent;
          return '';
        });
        vi.mocked(fs.readdirSync).mockReturnValue([]);

        const result = handleValidateEnvComplete({});
        const text = result.content[0].text;

        expect(text).toContain('Variables in .env: 1');
      });

      it('should skip lines that do not match VAR=value pattern', () => {
        const envContent = 'API_KEY=secret\ninvalid line without equals\n123INVALID=bad\n_ALSO_INVALID=bad\nGOOD_VAR=value';

        vi.mocked(fs.existsSync).mockReturnValue(true);
        vi.mocked(fs.readFileSync).mockImplementation((p) => {
          const pathStr = String(p);
          if (pathStr.includes('.env.example')) return 'API_KEY=\nGOOD_VAR=';
          if (pathStr.includes('.env')) return envContent;
          return '';
        });
        vi.mocked(fs.readdirSync).mockReturnValue([]);

        const result = handleValidateEnvComplete({});
        const text = result.content[0].text;

        // Only API_KEY and GOOD_VAR should be counted (valid patterns)
        expect(text).toContain('Variables in .env: 2');
      });
    });

    describe('formatAsMarkdown output', () => {
      it('should format file locations for missing variables defined in code', () => {
        const envContent = '';
        const exampleContent = '';
        const codeContent = 'const key = process.env.MISSING_VAR;';

        vi.mocked(fs.existsSync).mockReturnValue(true);
        vi.mocked(fs.readFileSync).mockImplementation((p) => {
          const pathStr = String(p);
          if (pathStr.includes('.env')) return envContent;
          if (pathStr.endsWith('.ts')) return codeContent;
          return '';
        });

        vi.mocked(fs.readdirSync).mockImplementation((dir, options) => {
          if (options && typeof options === 'object' && 'withFileTypes' in options) {
            const dirStr = String(dir).replace(/\\/g, '/');
            if (dirStr === '/mock/project') {
              return [createMockDirent('app.ts', false)];
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

      it('should show defined_in as example when variable is only in .env.example', () => {
        const envContent = '';
        const exampleContent = 'EXAMPLE_ONLY_VAR=placeholder';

        vi.mocked(fs.existsSync).mockReturnValue(true);
        vi.mocked(fs.readFileSync).mockImplementation((p) => {
          const pathStr = String(p);
          if (pathStr.includes('.env.example')) return exampleContent;
          if (pathStr.includes('.env')) return envContent;
          return '';
        });
        vi.mocked(fs.readdirSync).mockReturnValue([]);

        const result = handleValidateEnvComplete({});
        const text = result.content[0].text;

        expect(text).toContain('EXAMPLE_ONLY_VAR');
        expect(text).toContain('Defined in: example');
      });

      it('should truncate long lists of file references (more than 5 files)', () => {
        const envContent = '';
        const exampleContent = '';
        const codeContent = 'const key = process.env.COMMON_VAR;';

        vi.mocked(fs.existsSync).mockReturnValue(true);
        vi.mocked(fs.readFileSync).mockImplementation((p) => {
          const pathStr = String(p);
          if (pathStr.includes('.env')) return envContent;
          if (pathStr.endsWith('.ts')) return codeContent;
          return '';
        });

        vi.mocked(fs.readdirSync).mockImplementation((dir, options) => {
          if (options && typeof options === 'object' && 'withFileTypes' in options) {
            const dirStr = String(dir).replace(/\\/g, '/');
            if (dirStr === '/mock/project') {
              return [
                createMockDirent('file1.ts', false),
                createMockDirent('file2.ts', false),
                createMockDirent('file3.ts', false),
                createMockDirent('file4.ts', false),
                createMockDirent('file5.ts', false),
                createMockDirent('file6.ts', false),
                createMockDirent('file7.ts', false),
              ];
            }
          }
          return [];
        });

        const result = handleValidateEnvComplete({});
        const text = result.content[0].text;

        // Should show (+X more) for files beyond 5
        expect(text).toContain('(+2 more)');
      });

      it('should not truncate when exactly 5 or fewer files', () => {
        const envContent = '';
        const exampleContent = '';
        const codeContent = 'const key = process.env.COMMON_VAR;';

        vi.mocked(fs.existsSync).mockReturnValue(true);
        vi.mocked(fs.readFileSync).mockImplementation((p) => {
          const pathStr = String(p);
          if (pathStr.includes('.env')) return envContent;
          if (pathStr.endsWith('.ts')) return codeContent;
          return '';
        });

        vi.mocked(fs.readdirSync).mockImplementation((dir, options) => {
          if (options && typeof options === 'object' && 'withFileTypes' in options) {
            const dirStr = String(dir).replace(/\\/g, '/');
            if (dirStr === '/mock/project') {
              return [
                createMockDirent('file1.ts', false),
                createMockDirent('file2.ts', false),
                createMockDirent('file3.ts', false),
                createMockDirent('file4.ts', false),
                createMockDirent('file5.ts', false),
              ];
            }
          }
          return [];
        });

        const result = handleValidateEnvComplete({});
        const text = result.content[0].text;

        // Should NOT show (+X more) for 5 files
        expect(text).not.toContain('more)');
      });

      it('should show missing variable with no used_in files', () => {
        const envContent = '';
        const exampleContent = 'EXAMPLE_ONLY=';

        vi.mocked(fs.existsSync).mockReturnValue(true);
        vi.mocked(fs.readFileSync).mockImplementation((p) => {
          const pathStr = String(p);
          if (pathStr.includes('.env.example')) return exampleContent;
          if (pathStr.includes('.env')) return envContent;
          return '';
        });
        vi.mocked(fs.readdirSync).mockReturnValue([]);

        const result = handleValidateEnvComplete({});
        const text = result.content[0].text;

        expect(text).toContain('EXAMPLE_ONLY');
        expect(text).toContain('Defined in: example');
        // Should not show "Used in:" since there are no files
      });

      it('should truncate long values in type validation issues', () => {
        const longValue = 'x'.repeat(60); // Longer than 50 chars
        const envContent = `LONG_URL=${longValue}`;
        const exampleContent = 'LONG_URL=';

        vi.mocked(fs.existsSync).mockReturnValue(true);
        vi.mocked(fs.readFileSync).mockImplementation((p) => {
          const pathStr = String(p);
          if (pathStr.includes('.env.example')) return exampleContent;
          if (pathStr.includes('.env')) return envContent;
          return '';
        });
        vi.mocked(fs.readdirSync).mockReturnValue([]);

        const result = handleValidateEnvComplete({ check_values: true });
        const text = result.content[0].text;

        // Should show truncated value with ...
        expect(text).toContain('...');
      });

      it('should not truncate short values in type validation issues', () => {
        const envContent = 'SHORT_URL=invalid';
        const exampleContent = 'SHORT_URL=';

        vi.mocked(fs.existsSync).mockReturnValue(true);
        vi.mocked(fs.readFileSync).mockImplementation((p) => {
          const pathStr = String(p);
          if (pathStr.includes('.env.example')) return exampleContent;
          if (pathStr.includes('.env')) return envContent;
          return '';
        });
        vi.mocked(fs.readdirSync).mockReturnValue([]);

        const result = handleValidateEnvComplete({ check_values: true });
        const text = result.content[0].text;

        // Should show full value without ...
        expect(text).toContain('`invalid`');
        expect(text).not.toContain('invalid...');
      });
    });

    describe('unused variables in .env.example only', () => {
      it('should detect unused variables only in .env.example', () => {
        const envContent = 'USED_VAR=value';
        const exampleContent = 'USED_VAR=\nUNUSED_EXAMPLE_VAR=\nANOTHER_UNUSED=';

        vi.mocked(fs.existsSync).mockReturnValue(true);
        vi.mocked(fs.readFileSync).mockImplementation((p) => {
          const pathStr = String(p);
          if (pathStr.includes('.env.example')) return exampleContent;
          if (pathStr.includes('.env') && !pathStr.includes('.example')) return envContent;
          if (pathStr.endsWith('.ts')) return 'const x = process.env.USED_VAR;';
          return '';
        });

        vi.mocked(fs.readdirSync).mockImplementation((dir, options) => {
          if (options && typeof options === 'object' && 'withFileTypes' in options) {
            const dirStr = String(dir).replace(/\\/g, '/');
            if (dirStr === '/mock/project') {
              return [createMockDirent('app.ts', false)];
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
          if (pathStr.includes('.env.example')) return exampleContent;
          if (pathStr.includes('.env')) return envContent;
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

      it('should not add to unused if var is in both .env and .env.example but not in code', () => {
        const envContent = 'LEGACY_VAR=value';
        const exampleContent = 'LEGACY_VAR=';

        vi.mocked(fs.existsSync).mockReturnValue(true);
        vi.mocked(fs.readFileSync).mockImplementation((p) => {
          const pathStr = String(p);
          if (pathStr.includes('.env.example')) return exampleContent;
          if (pathStr.includes('.env')) return envContent;
          return '';
        });
        vi.mocked(fs.readdirSync).mockReturnValue([]);

        const result = handleValidateEnvComplete({});
        const text = result.content[0].text;

        // LEGACY_VAR should appear only once in unused (from .env)
        expect(text).toContain('LEGACY_VAR');
        expect(text).toContain('.env)'); // Should be from .env, not .env.example
      });
    });

    describe('max files limit', () => {
      it('should respect max files limit during scanning', () => {
        let filesScanned = 0;

        vi.mocked(fs.existsSync).mockReturnValue(true);
        vi.mocked(fs.readFileSync).mockImplementation((p) => {
          const pathStr = String(p);
          if (pathStr.includes('.env')) return '';
          filesScanned++;
          return '';
        });

        // Create a very large directory structure
        const manyFiles = Array.from({ length: 2000 }, (_, i) =>
          createMockDirent(`file${i}.ts`, false)
        );

        vi.mocked(fs.readdirSync).mockImplementation((dir, options) => {
          if (options && typeof options === 'object' && 'withFileTypes' in options) {
            const dirStr = String(dir).replace(/\\/g, '/');
            if (dirStr === '/mock/project') {
              return manyFiles;
            }
          }
          return [];
        });

        handleValidateEnvComplete({});

        // Default max is 1000, so should not scan more than that
        expect(filesScanned).toBeLessThanOrEqual(1000);
      });

      it('should stop scanning subdirectories when max files reached', () => {
        let filesScanned = 0;

        vi.mocked(fs.existsSync).mockReturnValue(true);
        vi.mocked(fs.readFileSync).mockImplementation((p) => {
          const pathStr = String(p);
          if (pathStr.includes('.env')) return '';
          filesScanned++;
          return '';
        });

        // Create directories with many files each
        vi.mocked(fs.readdirSync).mockImplementation((dir, options) => {
          if (options && typeof options === 'object' && 'withFileTypes' in options) {
            const dirStr = String(dir).replace(/\\/g, '/');
            if (dirStr === '/mock/project') {
              const files = Array.from({ length: 600 }, (_, i) =>
                createMockDirent(`file${i}.ts`, false)
              );
              return [
                ...files,
                createMockDirent('subdir', true),
              ];
            }
            if (dirStr.includes('subdir')) {
              return Array.from({ length: 600 }, (_, i) =>
                createMockDirent(`sub${i}.ts`, false)
              );
            }
          }
          return [];
        });

        handleValidateEnvComplete({});

        // Should be limited to ~1000 files total
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
          if (pathStr.includes('.env.example')) return exampleContent;
          if (pathStr.includes('.env')) return envContent;
          return '';
        });
        vi.mocked(fs.readdirSync).mockReturnValue([]);

        const result = handleValidateEnvComplete({});
        const text = result.content[0].text;

        expect(text).toContain('Environment Validation: PASSED');
      });

      it('should be valid when no missing vars and no type issues with check_values true', () => {
        const envContent = 'API_PORT=3000';
        const exampleContent = 'API_PORT=';

        vi.mocked(fs.existsSync).mockReturnValue(true);
        vi.mocked(fs.readFileSync).mockImplementation((p) => {
          const pathStr = String(p);
          if (pathStr.includes('.env.example')) return exampleContent;
          if (pathStr.includes('.env')) return envContent;
          return '';
        });
        vi.mocked(fs.readdirSync).mockReturnValue([]);

        const result = handleValidateEnvComplete({ check_values: true });
        const text = result.content[0].text;

        expect(text).toContain('Environment Validation: PASSED');
      });

      it('should be invalid when there are type issues and check_values is true', () => {
        const envContent = 'API_PORT=not_a_number';
        const exampleContent = 'API_PORT=';

        vi.mocked(fs.existsSync).mockReturnValue(true);
        vi.mocked(fs.readFileSync).mockImplementation((p) => {
          const pathStr = String(p);
          if (pathStr.includes('.env.example')) return exampleContent;
          if (pathStr.includes('.env')) return envContent;
          return '';
        });
        vi.mocked(fs.readdirSync).mockReturnValue([]);

        const result = handleValidateEnvComplete({ check_values: true });
        const text = result.content[0].text;

        expect(text).toContain('Environment Validation: FAILED');
      });

      it('should be invalid when there are missing vars even without type issues', () => {
        const envContent = '';
        const exampleContent = 'REQUIRED_VAR=';

        vi.mocked(fs.existsSync).mockReturnValue(true);
        vi.mocked(fs.readFileSync).mockImplementation((p) => {
          const pathStr = String(p);
          if (pathStr.includes('.env.example')) return exampleContent;
          if (pathStr.includes('.env')) return envContent;
          return '';
        });
        vi.mocked(fs.readdirSync).mockReturnValue([]);

        const result = handleValidateEnvComplete({});
        const text = result.content[0].text;

        expect(text).toContain('Environment Validation: FAILED');
      });
    });

    describe('default arguments', () => {
      it('should use default .env file when env_file not provided', () => {
        const checkedPaths: string[] = [];

        vi.mocked(fs.existsSync).mockImplementation((p) => {
          checkedPaths.push(String(p));
          return false;
        });
        vi.mocked(fs.readdirSync).mockReturnValue([]);

        handleValidateEnvComplete({});

        // Should check for .env (not custom path)
        expect(checkedPaths.some(p => p.endsWith('.env') || p.endsWith('\\.env'))).toBe(true);
      });

      it('should use default .env.example file when example_file not provided', () => {
        const checkedPaths: string[] = [];

        vi.mocked(fs.existsSync).mockImplementation((p) => {
          checkedPaths.push(String(p));
          return false;
        });
        vi.mocked(fs.readdirSync).mockReturnValue([]);

        handleValidateEnvComplete({});

        // Should check for .env.example
        expect(checkedPaths.some(p => p.includes('.env.example'))).toBe(true);
      });

      it('should use check_values: false by default', () => {
        const envContent = 'API_PORT=invalid';
        const exampleContent = 'API_PORT=';

        vi.mocked(fs.existsSync).mockReturnValue(true);
        vi.mocked(fs.readFileSync).mockImplementation((p) => {
          const pathStr = String(p);
          if (pathStr.includes('.env.example')) return exampleContent;
          if (pathStr.includes('.env')) return envContent;
          return '';
        });
        vi.mocked(fs.readdirSync).mockReturnValue([]);

        // Not passing check_values
        const result = handleValidateEnvComplete({});
        const text = result.content[0].text;

        // Should pass because check_values defaults to false
        expect(text).toContain('Environment Validation: PASSED');
        expect(text).not.toContain('Type Validation Issues');
      });

      it('should use empty ignore list by default', () => {
        const envContent = '';
        const exampleContent = 'SOME_VAR=';

        vi.mocked(fs.existsSync).mockReturnValue(true);
        vi.mocked(fs.readFileSync).mockImplementation((p) => {
          const pathStr = String(p);
          if (pathStr.includes('.env.example')) return exampleContent;
          if (pathStr.includes('.env')) return envContent;
          return '';
        });
        vi.mocked(fs.readdirSync).mockReturnValue([]);

        // Not passing ignore
        const result = handleValidateEnvComplete({});
        const text = result.content[0].text;

        // SOME_VAR should appear as missing
        expect(text).toContain('SOME_VAR');
      });
    });

    describe('complex scenarios', () => {
      it('should handle variable used in code but missing from both .env and .env.example', () => {
        const envContent = '';
        const exampleContent = '';
        const codeContent = 'const x = process.env.CODE_ONLY_VAR;';

        vi.mocked(fs.existsSync).mockReturnValue(true);
        vi.mocked(fs.readFileSync).mockImplementation((p) => {
          const pathStr = String(p);
          if (pathStr.includes('.env')) return envContent;
          if (pathStr.endsWith('.ts')) return codeContent;
          return '';
        });

        vi.mocked(fs.readdirSync).mockImplementation((dir, options) => {
          if (options && typeof options === 'object' && 'withFileTypes' in options) {
            const dirStr = String(dir).replace(/\\/g, '/');
            if (dirStr === '/mock/project') {
              return [createMockDirent('app.ts', false)];
            }
          }
          return [];
        });

        const result = handleValidateEnvComplete({});
        const text = result.content[0].text;

        expect(text).toContain('CODE_ONLY_VAR');
        expect(text).toContain('Defined in: code');
      });

      it('should handle variable in .env, .env.example, and code (fully documented and used)', () => {
        const envContent = 'COMPLETE_VAR=value';
        const exampleContent = 'COMPLETE_VAR=';
        const codeContent = 'const x = process.env.COMPLETE_VAR;';

        vi.mocked(fs.existsSync).mockReturnValue(true);
        vi.mocked(fs.readFileSync).mockImplementation((p) => {
          const pathStr = String(p);
          if (pathStr.includes('.env.example')) return exampleContent;
          if (pathStr.includes('.env') && !pathStr.includes('.example')) return envContent;
          if (pathStr.endsWith('.ts')) return codeContent;
          return '';
        });

        vi.mocked(fs.readdirSync).mockImplementation((dir, options) => {
          if (options && typeof options === 'object' && 'withFileTypes' in options) {
            const dirStr = String(dir).replace(/\\/g, '/');
            if (dirStr === '/mock/project') {
              return [createMockDirent('app.ts', false)];
            }
          }
          return [];
        });

        const result = handleValidateEnvComplete({});
        const text = result.content[0].text;

        // Should pass - variable is complete
        expect(text).toContain('Environment Validation: PASSED');
        expect(text).not.toContain('Missing Variables');
        expect(text).not.toContain('Unused Variables');
        expect(text).not.toContain('Undocumented Variables');
      });

      it('should handle multiple patterns in same file', () => {
        const envContent = '';
        const codeContent = `
          const a = process.env.VAR_A;
          const b = process.env["VAR_B"];
          const c = process.env['VAR_C'];
          const d = import.meta.env.VAR_D;
          const e = Deno.env.get("VAR_E");
          const f = Deno.env.get('VAR_F');
        `;

        vi.mocked(fs.existsSync).mockReturnValue(true);
        vi.mocked(fs.readFileSync).mockImplementation((p) => {
          const pathStr = String(p);
          if (pathStr.includes('.env')) return envContent;
          if (pathStr.endsWith('.ts')) return codeContent;
          return '';
        });

        vi.mocked(fs.readdirSync).mockImplementation((dir, options) => {
          if (options && typeof options === 'object' && 'withFileTypes' in options) {
            const dirStr = String(dir).replace(/\\/g, '/');
            if (dirStr === '/mock/project') {
              return [createMockDirent('app.ts', false)];
            }
          }
          return [];
        });

        const result = handleValidateEnvComplete({});
        const text = result.content[0].text;

        expect(text).toContain('VAR_A');
        expect(text).toContain('VAR_B');
        expect(text).toContain('VAR_C');
        expect(text).toContain('VAR_D');
        expect(text).toContain('VAR_E');
        expect(text).toContain('VAR_F');
      });
    });
  });
});
