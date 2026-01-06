/**
 * Unit tests for config handler
 *
 * Tests cover:
 * - handleReadConfig
 * - Config type resolution
 * - JSON parsing
 * - Custom config paths
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';

import { handleReadConfig } from '../../handlers/config.js';
import { samplePackageJson } from '../setup.js';

// Mock modules
vi.mock('fs');
vi.mock('../../config.js', () => ({
  PROJECT_ROOT: '/mock/project/root',
}));

describe('config handler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('handleReadConfig', () => {
    describe('package.json', () => {
      it('should read and parse package.json', () => {
        vi.mocked(fs.existsSync).mockReturnValue(true);
        vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(samplePackageJson));

        const result = handleReadConfig({ config: 'package.json' });
        const data = JSON.parse(result.content[0].text);

        expect(data.config_type).toBe('package.json');
        expect(data.format).toBe('json');
        expect(data.content).toEqual(samplePackageJson);
      });
    });

    describe('tsconfig', () => {
      it('should read tsconfig.json', () => {
        const tsconfig = {
          compilerOptions: {
            target: 'ES2020',
            module: 'ESNext',
            strict: true,
          },
        };
        vi.mocked(fs.existsSync).mockReturnValue(true);
        vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(tsconfig));

        const result = handleReadConfig({ config: 'tsconfig' });
        const data = JSON.parse(result.content[0].text);

        expect(data.config_type).toBe('tsconfig');
        expect(data.file_path).toBe('tsconfig.json');
        expect(data.content.compilerOptions.strict).toBe(true);
      });
    });

    describe('eslint', () => {
      it('should try multiple eslint config paths', () => {
        const checkedPaths: string[] = [];
        vi.mocked(fs.existsSync).mockImplementation((p: fs.PathLike) => {
          checkedPaths.push(String(p));
          return String(p).includes('eslint.config.js');
        });
        vi.mocked(fs.readFileSync).mockReturnValue('export default {};');

        handleReadConfig({ config: 'eslint' });

        expect(checkedPaths.some(p => p.includes('.eslintrc.js'))).toBe(true);
        expect(checkedPaths.some(p => p.includes('eslint.config.js'))).toBe(true);
      });

      it('should return JavaScript format for .js config', () => {
        vi.mocked(fs.existsSync).mockImplementation((p: fs.PathLike) => {
          return String(p).includes('.eslintrc.js');
        });
        vi.mocked(fs.readFileSync).mockReturnValue('module.exports = {};');

        const result = handleReadConfig({ config: 'eslint' });
        const data = JSON.parse(result.content[0].text);

        expect(data.format).toBe('javascript');
      });
    });

    describe('prettier', () => {
      it('should read .prettierrc', () => {
        const prettierConfig = {
          semi: true,
          singleQuote: true,
          tabWidth: 2,
        };
        vi.mocked(fs.existsSync).mockImplementation((p: fs.PathLike) => {
          return String(p).includes('.prettierrc');
        });
        vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(prettierConfig));

        const result = handleReadConfig({ config: 'prettier' });
        const data = JSON.parse(result.content[0].text);

        expect(data.config_type).toBe('prettier');
      });
    });

    describe('tailwind', () => {
      it('should read tailwind.config.js', () => {
        vi.mocked(fs.existsSync).mockImplementation((p: fs.PathLike) => {
          return String(p).includes('tailwind.config.js');
        });
        vi.mocked(fs.readFileSync).mockReturnValue(`
module.exports = {
  content: ['./src/**/*.tsx'],
  theme: { extend: {} },
  plugins: [],
};
`);

        const result = handleReadConfig({ config: 'tailwind' });
        const data = JSON.parse(result.content[0].text);

        expect(data.config_type).toBe('tailwind');
        expect(data.format).toBe('javascript');
      });

      it('should try tailwind.config.ts', () => {
        vi.mocked(fs.existsSync).mockImplementation((p: fs.PathLike) => {
          return String(p).includes('tailwind.config.ts');
        });
        vi.mocked(fs.readFileSync).mockReturnValue('export default {};');

        const result = handleReadConfig({ config: 'tailwind' });
        const data = JSON.parse(result.content[0].text);

        expect(data.file_path).toBe('tailwind.config.ts');
      });
    });

    describe('next', () => {
      it('should read next.config.js', () => {
        vi.mocked(fs.existsSync).mockImplementation((p: fs.PathLike) => {
          return String(p).includes('next.config.js');
        });
        vi.mocked(fs.readFileSync).mockReturnValue(`
module.exports = {
  reactStrictMode: true,
  images: { domains: ['example.com'] },
};
`);

        const result = handleReadConfig({ config: 'next' });
        const data = JSON.parse(result.content[0].text);

        expect(data.config_type).toBe('next');
      });

      it('should try next.config.mjs', () => {
        vi.mocked(fs.existsSync).mockImplementation((p: fs.PathLike) => {
          return String(p).includes('next.config.mjs');
        });
        vi.mocked(fs.readFileSync).mockReturnValue('export default {};');

        const result = handleReadConfig({ config: 'next' });
        const data = JSON.parse(result.content[0].text);

        expect(data.file_path).toBe('next.config.mjs');
      });
    });

    describe('vite', () => {
      it('should read vite.config.ts', () => {
        vi.mocked(fs.existsSync).mockImplementation((p: fs.PathLike) => {
          return String(p).includes('vite.config.ts');
        });
        vi.mocked(fs.readFileSync).mockReturnValue(`
import { defineConfig } from 'vite';
export default defineConfig({});
`);

        const result = handleReadConfig({ config: 'vite' });
        const data = JSON.parse(result.content[0].text);

        expect(data.config_type).toBe('vite');
      });
    });

    describe('prisma', () => {
      it('should read prisma/schema.prisma', () => {
        vi.mocked(fs.existsSync).mockImplementation((p: fs.PathLike) => {
          const pathStr = String(p);
          // Platform-independent: match both prisma/schema.prisma and prisma\schema.prisma
          return pathStr.includes('prisma') && pathStr.includes('schema.prisma');
        });
        vi.mocked(fs.readFileSync).mockReturnValue(`
generator client {
  provider = "prisma-client-js"
}
`);

        const result = handleReadConfig({ config: 'prisma' });
        const data = JSON.parse(result.content[0].text);

        expect(data.config_type).toBe('prisma');
        expect(data.format).toBe('text');
      });
    });

    describe('env', () => {
      it('should read .env file', () => {
        vi.mocked(fs.existsSync).mockImplementation((p: fs.PathLike) => {
          return String(p).includes('.env');
        });
        vi.mocked(fs.readFileSync).mockReturnValue(`
DATABASE_URL=postgresql://localhost:5432/db
API_KEY=secret
`);

        const result = handleReadConfig({ config: 'env' });
        const data = JSON.parse(result.content[0].text);

        expect(data.config_type).toBe('env');
        expect(data.content).toContain('DATABASE_URL');
      });

      it('should try .env.local and .env.example', () => {
        const checkedPaths: string[] = [];
        vi.mocked(fs.existsSync).mockImplementation((p: fs.PathLike) => {
          checkedPaths.push(String(p));
          return String(p).includes('.env.example');
        });
        vi.mocked(fs.readFileSync).mockReturnValue('EXAMPLE_VAR=value');

        handleReadConfig({ config: 'env' });

        expect(checkedPaths.some(p => p.includes('.env.local'))).toBe(true);
        expect(checkedPaths.some(p => p.includes('.env.example'))).toBe(true);
      });
    });

    describe('custom config', () => {
      it('should use path directly for custom config', () => {
        vi.mocked(fs.existsSync).mockReturnValue(true);
        vi.mocked(fs.readFileSync).mockReturnValue('custom content');

        const result = handleReadConfig({
          config: 'custom',
          path: 'my-config.yaml',
        });
        const data = JSON.parse(result.content[0].text);

        expect(data.file_path).toBe('my-config.yaml');
      });
    });

    describe('error handling', () => {
      it('should throw error when config not found', () => {
        vi.mocked(fs.existsSync).mockReturnValue(false);

        expect(() => {
          handleReadConfig({ config: 'package.json' });
        }).toThrow("Config 'package.json' not found");
      });

      it('should handle invalid JSON gracefully', () => {
        vi.mocked(fs.existsSync).mockReturnValue(true);
        vi.mocked(fs.readFileSync).mockReturnValue('invalid json {');

        const result = handleReadConfig({ config: 'package.json' });
        const data = JSON.parse(result.content[0].text);

        // Should return raw content when JSON parsing fails
        expect(data.content).toBe('invalid json {');
      });
    });

    describe('unknown config type', () => {
      it('should use config name directly when not in CONFIG_PATHS', () => {
        // Test the branch where CONFIG_PATHS[args.config] is undefined
        // so it falls back to [args.config] as the file path
        vi.mocked(fs.existsSync).mockImplementation((p: fs.PathLike) => {
          return String(p).includes('unknown-config.yaml');
        });
        vi.mocked(fs.readFileSync).mockReturnValue('key: value');

        const result = handleReadConfig({ config: 'unknown-config.yaml' });
        const data = JSON.parse(result.content[0].text);

        expect(data.config_type).toBe('unknown-config.yaml');
        expect(data.file_path).toBe('unknown-config.yaml');
        expect(data.format).toBe('text'); // Not .json, .js, or .ts
      });
    });

    describe('custom path parameter', () => {
      it('should use custom path when provided', () => {
        const checkedPaths: string[] = [];
        vi.mocked(fs.existsSync).mockImplementation((p: fs.PathLike) => {
          checkedPaths.push(String(p));
          // Match custom path with any path separator
          return String(p).includes('custom') && String(p).includes('package.json');
        });
        vi.mocked(fs.readFileSync).mockReturnValue('{}');

        handleReadConfig({ config: 'package.json', path: 'custom/path' });

        expect(checkedPaths.some(p => p.includes('custom'))).toBe(true);
      });
    });

    describe('response format', () => {
      it('should return properly formatted response', () => {
        vi.mocked(fs.existsSync).mockReturnValue(true);
        vi.mocked(fs.readFileSync).mockReturnValue('{}');

        const result = handleReadConfig({ config: 'package.json' });

        expect(result).toHaveProperty('content');
        expect(result.content).toHaveLength(1);
        expect(result.content[0]).toHaveProperty('type', 'text');
      });

      it('should return valid JSON', () => {
        vi.mocked(fs.existsSync).mockReturnValue(true);
        vi.mocked(fs.readFileSync).mockReturnValue('{}');

        const result = handleReadConfig({ config: 'tsconfig' });

        expect(() => JSON.parse(result.content[0].text)).not.toThrow();
      });

      it('should include extends and env_vars arrays', () => {
        vi.mocked(fs.existsSync).mockReturnValue(true);
        vi.mocked(fs.readFileSync).mockReturnValue('{}');

        const result = handleReadConfig({ config: 'package.json' });
        const data = JSON.parse(result.content[0].text);

        expect(data.extends).toEqual([]);
        expect(data.env_vars).toEqual([]);
      });
    });
  });
});
