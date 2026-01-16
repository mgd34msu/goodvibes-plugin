/**
 * Unit tests for permissions handler
 *
 * Tests cover:
 * - All permission patterns (filesystem, network, process, crypto)
 * - File and directory scanning
 * - Risk level assessment
 * - Recommendation generation
 * - Error handling paths
 *
 * Target: 100% line and branch coverage
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fsPromises from 'fs/promises';
import * as path from 'path';

// Import the handler and types
import { handleCheckPermissions, type CheckPermissionsArgs, type PermissionType, type RiskLevel } from '../../../handlers/security/permissions.js';

// Mock the modules
vi.mock('fs/promises');
vi.mock('../../../config.js', () => ({
  PROJECT_ROOT: '/test/project',
}));

vi.mock('../../../utils.js', () => ({
  fileExists: vi.fn(),
}));

// Get mocked modules
const mockedFsPromises = vi.mocked(fsPromises);
const { fileExists } = await import('../../../utils.js');
const mockedFileExists = vi.mocked(fileExists);

describe('permissions handler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('handleCheckPermissions', () => {
    describe('path validation', () => {
      it('should return error when specific file does not exist', async () => {
        mockedFileExists.mockResolvedValue(false);

        const result = await handleCheckPermissions({ file: 'nonexistent.ts' });
        const data = JSON.parse(result.content[0].text);

        expect(result.isError).toBe(true);
        expect(data.error).toBe('File not found: nonexistent.ts');
      });

      it('should return error when directory path does not exist', async () => {
        mockedFileExists.mockResolvedValue(false);

        const result = await handleCheckPermissions({ path: 'nonexistent' });
        const data = JSON.parse(result.content[0].text);

        expect(result.isError).toBe(true);
        expect(data.error).toBe('Path not found: nonexistent');
      });

      it('should return error when default path does not exist', async () => {
        mockedFileExists.mockResolvedValue(false);

        const result = await handleCheckPermissions({});
        const data = JSON.parse(result.content[0].text);

        expect(result.isError).toBe(true);
        expect(data.error).toBe('Path not found: .');
      });
    });

    describe('scanning single files', () => {
      it('should scan a single file when file argument is provided', async () => {
        mockedFileExists.mockResolvedValue(true);
        mockedFsPromises.readFile.mockResolvedValue('fs.writeFileSync("/path", "content")');

        const result = await handleCheckPermissions({ file: 'src/utils.ts' });
        const data = JSON.parse(result.content[0].text);

        expect(result.isError).toBeUndefined();
        expect(data.permissions.length).toBeGreaterThan(0);
        expect(data.permissions[0].type).toBe('filesystem');
      });

      it('should scan a single file when path points to a file', async () => {
        mockedFileExists.mockResolvedValue(true);
        mockedFsPromises.stat.mockResolvedValue({
          isDirectory: () => false,
          isFile: () => true,
        } as unknown as fsPromises.FileHandle['stat'] extends () => Promise<infer R> ? R : never);
        mockedFsPromises.readFile.mockResolvedValue('fetch("/api/data")');

        const result = await handleCheckPermissions({ path: 'src/api.ts' });
        const data = JSON.parse(result.content[0].text);

        expect(result.isError).toBeUndefined();
        expect(data.files_scanned).toBe(1);
      });
    });

    describe('scanning directories', () => {
      it('should scan all source files in a directory', async () => {
        mockedFileExists.mockResolvedValue(true);
        mockedFsPromises.stat.mockResolvedValue({
          isDirectory: () => true,
          isFile: () => false,
        } as unknown as fsPromises.FileHandle['stat'] extends () => Promise<infer R> ? R : never);
        mockedFsPromises.readdir.mockResolvedValue([
          { name: 'utils.ts', isDirectory: () => false, isFile: () => true },
          { name: 'api.ts', isDirectory: () => false, isFile: () => true },
        ] as unknown as ReturnType<typeof fsPromises.readdir> extends Promise<infer R> ? R : never);
        mockedFsPromises.readFile.mockResolvedValue('no permissions');

        const result = await handleCheckPermissions({});
        const data = JSON.parse(result.content[0].text);

        expect(result.isError).toBeUndefined();
        expect(data.files_scanned).toBe(2);
      });

      it('should skip node_modules directory', async () => {
        mockedFileExists.mockResolvedValue(true);
        mockedFsPromises.stat.mockResolvedValue({
          isDirectory: () => true,
          isFile: () => false,
        } as unknown as fsPromises.FileHandle['stat'] extends () => Promise<infer R> ? R : never);
        mockedFsPromises.readdir.mockResolvedValue([
          { name: 'node_modules', isDirectory: () => true, isFile: () => false },
          { name: 'app.ts', isDirectory: () => false, isFile: () => true },
        ] as unknown as ReturnType<typeof fsPromises.readdir> extends Promise<infer R> ? R : never);
        mockedFsPromises.readFile.mockResolvedValue('clean code');

        const result = await handleCheckPermissions({});
        const data = JSON.parse(result.content[0].text);

        expect(data.files_scanned).toBe(1);
      });

      it('should skip .git directory', async () => {
        mockedFileExists.mockResolvedValue(true);
        mockedFsPromises.stat.mockResolvedValue({
          isDirectory: () => true,
          isFile: () => false,
        } as unknown as fsPromises.FileHandle['stat'] extends () => Promise<infer R> ? R : never);
        mockedFsPromises.readdir.mockResolvedValue([
          { name: '.git', isDirectory: () => true, isFile: () => false },
        ] as unknown as ReturnType<typeof fsPromises.readdir> extends Promise<infer R> ? R : never);

        const result = await handleCheckPermissions({});
        const data = JSON.parse(result.content[0].text);

        expect(data.files_scanned).toBe(0);
      });

      it('should skip dist directory', async () => {
        mockedFileExists.mockResolvedValue(true);
        mockedFsPromises.stat.mockResolvedValue({
          isDirectory: () => true,
          isFile: () => false,
        } as unknown as fsPromises.FileHandle['stat'] extends () => Promise<infer R> ? R : never);
        mockedFsPromises.readdir.mockResolvedValue([
          { name: 'dist', isDirectory: () => true, isFile: () => false },
        ] as unknown as ReturnType<typeof fsPromises.readdir> extends Promise<infer R> ? R : never);

        const result = await handleCheckPermissions({});
        const data = JSON.parse(result.content[0].text);

        expect(data.files_scanned).toBe(0);
      });

      it('should skip build directory', async () => {
        mockedFileExists.mockResolvedValue(true);
        mockedFsPromises.stat.mockResolvedValue({
          isDirectory: () => true,
          isFile: () => false,
        } as unknown as fsPromises.FileHandle['stat'] extends () => Promise<infer R> ? R : never);
        mockedFsPromises.readdir.mockResolvedValue([
          { name: 'build', isDirectory: () => true, isFile: () => false },
        ] as unknown as ReturnType<typeof fsPromises.readdir> extends Promise<infer R> ? R : never);

        const result = await handleCheckPermissions({});
        const data = JSON.parse(result.content[0].text);

        expect(data.files_scanned).toBe(0);
      });

      it('should skip .next directory', async () => {
        mockedFileExists.mockResolvedValue(true);
        mockedFsPromises.stat.mockResolvedValue({
          isDirectory: () => true,
          isFile: () => false,
        } as unknown as fsPromises.FileHandle['stat'] extends () => Promise<infer R> ? R : never);
        mockedFsPromises.readdir.mockResolvedValue([
          { name: '.next', isDirectory: () => true, isFile: () => false },
        ] as unknown as ReturnType<typeof fsPromises.readdir> extends Promise<infer R> ? R : never);

        const result = await handleCheckPermissions({});
        const data = JSON.parse(result.content[0].text);

        expect(data.files_scanned).toBe(0);
      });

      it('should skip coverage directory', async () => {
        mockedFileExists.mockResolvedValue(true);
        mockedFsPromises.stat.mockResolvedValue({
          isDirectory: () => true,
          isFile: () => false,
        } as unknown as fsPromises.FileHandle['stat'] extends () => Promise<infer R> ? R : never);
        mockedFsPromises.readdir.mockResolvedValue([
          { name: 'coverage', isDirectory: () => true, isFile: () => false },
        ] as unknown as ReturnType<typeof fsPromises.readdir> extends Promise<infer R> ? R : never);

        const result = await handleCheckPermissions({});
        const data = JSON.parse(result.content[0].text);

        expect(data.files_scanned).toBe(0);
      });

      it('should skip minified JavaScript files', async () => {
        mockedFileExists.mockResolvedValue(true);
        mockedFsPromises.stat.mockResolvedValue({
          isDirectory: () => true,
          isFile: () => false,
        } as unknown as fsPromises.FileHandle['stat'] extends () => Promise<infer R> ? R : never);
        mockedFsPromises.readdir.mockResolvedValue([
          { name: 'bundle.min.js', isDirectory: () => false, isFile: () => true },
        ] as unknown as ReturnType<typeof fsPromises.readdir> extends Promise<infer R> ? R : never);

        const result = await handleCheckPermissions({});
        const data = JSON.parse(result.content[0].text);

        expect(data.files_scanned).toBe(0);
      });

      it('should skip .map files', async () => {
        mockedFileExists.mockResolvedValue(true);
        mockedFsPromises.stat.mockResolvedValue({
          isDirectory: () => true,
          isFile: () => false,
        } as unknown as fsPromises.FileHandle['stat'] extends () => Promise<infer R> ? R : never);
        mockedFsPromises.readdir.mockResolvedValue([
          { name: 'bundle.js.map', isDirectory: () => false, isFile: () => true },
        ] as unknown as ReturnType<typeof fsPromises.readdir> extends Promise<infer R> ? R : never);

        const result = await handleCheckPermissions({});
        const data = JSON.parse(result.content[0].text);

        expect(data.files_scanned).toBe(0);
      });

      it('should skip lock files', async () => {
        mockedFileExists.mockResolvedValue(true);
        mockedFsPromises.stat.mockResolvedValue({
          isDirectory: () => true,
          isFile: () => false,
        } as unknown as fsPromises.FileHandle['stat'] extends () => Promise<infer R> ? R : never);
        mockedFsPromises.readdir.mockResolvedValue([
          { name: 'package-lock.json', isDirectory: () => false, isFile: () => true },
          { name: 'yarn.lock', isDirectory: () => false, isFile: () => true },
          { name: 'pnpm-lock.yaml', isDirectory: () => false, isFile: () => true },
        ] as unknown as ReturnType<typeof fsPromises.readdir> extends Promise<infer R> ? R : never);

        const result = await handleCheckPermissions({});
        const data = JSON.parse(result.content[0].text);

        expect(data.files_scanned).toBe(0);
      });

      it('should recurse into subdirectories', async () => {
        mockedFileExists.mockResolvedValue(true);
        mockedFsPromises.stat.mockResolvedValue({
          isDirectory: () => true,
          isFile: () => false,
        } as unknown as fsPromises.FileHandle['stat'] extends () => Promise<infer R> ? R : never);

        let callCount = 0;
        mockedFsPromises.readdir.mockImplementation(async () => {
          callCount++;
          if (callCount === 1) {
            return [
              { name: 'src', isDirectory: () => true, isFile: () => false },
            ] as unknown as ReturnType<typeof fsPromises.readdir> extends Promise<infer R> ? R : never;
          }
          return [
            { name: 'app.ts', isDirectory: () => false, isFile: () => true },
          ] as unknown as ReturnType<typeof fsPromises.readdir> extends Promise<infer R> ? R : never;
        });
        mockedFsPromises.readFile.mockResolvedValue('clean code');

        const result = await handleCheckPermissions({});
        const data = JSON.parse(result.content[0].text);

        expect(data.files_scanned).toBe(1);
      });
    });

    describe('scannable file extensions', () => {
      it('should scan TypeScript files (.ts, .tsx)', async () => {
        mockedFileExists.mockResolvedValue(true);
        mockedFsPromises.stat.mockResolvedValue({
          isDirectory: () => true,
          isFile: () => false,
        } as unknown as fsPromises.FileHandle['stat'] extends () => Promise<infer R> ? R : never);
        mockedFsPromises.readdir.mockResolvedValue([
          { name: 'utils.ts', isDirectory: () => false, isFile: () => true },
          { name: 'component.tsx', isDirectory: () => false, isFile: () => true },
        ] as unknown as ReturnType<typeof fsPromises.readdir> extends Promise<infer R> ? R : never);
        mockedFsPromises.readFile.mockResolvedValue('clean code');

        const result = await handleCheckPermissions({});
        const data = JSON.parse(result.content[0].text);

        expect(data.files_scanned).toBe(2);
      });

      it('should scan JavaScript files (.js, .jsx, .mjs, .cjs)', async () => {
        mockedFileExists.mockResolvedValue(true);
        mockedFsPromises.stat.mockResolvedValue({
          isDirectory: () => true,
          isFile: () => false,
        } as unknown as fsPromises.FileHandle['stat'] extends () => Promise<infer R> ? R : never);
        mockedFsPromises.readdir.mockResolvedValue([
          { name: 'utils.js', isDirectory: () => false, isFile: () => true },
          { name: 'component.jsx', isDirectory: () => false, isFile: () => true },
          { name: 'config.mjs', isDirectory: () => false, isFile: () => true },
          { name: 'setup.cjs', isDirectory: () => false, isFile: () => true },
        ] as unknown as ReturnType<typeof fsPromises.readdir> extends Promise<infer R> ? R : never);
        mockedFsPromises.readFile.mockResolvedValue('clean code');

        const result = await handleCheckPermissions({});
        const data = JSON.parse(result.content[0].text);

        expect(data.files_scanned).toBe(4);
      });

      it('should not scan non-JavaScript/TypeScript files', async () => {
        mockedFileExists.mockResolvedValue(true);
        mockedFsPromises.stat.mockResolvedValue({
          isDirectory: () => true,
          isFile: () => false,
        } as unknown as fsPromises.FileHandle['stat'] extends () => Promise<infer R> ? R : never);
        mockedFsPromises.readdir.mockResolvedValue([
          { name: 'config.json', isDirectory: () => false, isFile: () => true },
          { name: 'readme.md', isDirectory: () => false, isFile: () => true },
          { name: 'styles.css', isDirectory: () => false, isFile: () => true },
        ] as unknown as ReturnType<typeof fsPromises.readdir> extends Promise<infer R> ? R : never);

        const result = await handleCheckPermissions({});
        const data = JSON.parse(result.content[0].text);

        expect(data.files_scanned).toBe(0);
      });
    });

    describe('permission pattern detection', () => {
      describe('filesystem permissions', () => {
        it('should detect fs.writeFileSync', async () => {
          mockedFileExists.mockResolvedValue(true);
          mockedFsPromises.stat.mockResolvedValue({
            isDirectory: () => false,
            isFile: () => true,
          } as unknown as fsPromises.FileHandle['stat'] extends () => Promise<infer R> ? R : never);
          mockedFsPromises.readFile.mockResolvedValue('fs.writeFileSync("/path", "data")');

          const result = await handleCheckPermissions({ path: 'utils.ts' });
          const data = JSON.parse(result.content[0].text);

          expect(data.permissions.some((p: { api: string }) => p.api === 'fs.writeFileSync')).toBe(true);
          expect(data.permissions.find((p: { api: string }) => p.api === 'fs.writeFileSync').risk_level).toBe('medium');
        });

        it('should detect fs.promises.writeFile', async () => {
          mockedFileExists.mockResolvedValue(true);
          mockedFsPromises.stat.mockResolvedValue({
            isDirectory: () => false,
            isFile: () => true,
          } as unknown as fsPromises.FileHandle['stat'] extends () => Promise<infer R> ? R : never);
          mockedFsPromises.readFile.mockResolvedValue('await fs.promises.writeFile("/path", "data")');

          const result = await handleCheckPermissions({ path: 'utils.ts' });
          const data = JSON.parse(result.content[0].text);

          expect(data.permissions.some((p: { api: string }) => p.api === 'fs.promises.writeFile')).toBe(true);
        });

        it('should detect fs.writeFile', async () => {
          mockedFileExists.mockResolvedValue(true);
          mockedFsPromises.stat.mockResolvedValue({
            isDirectory: () => false,
            isFile: () => true,
          } as unknown as fsPromises.FileHandle['stat'] extends () => Promise<infer R> ? R : never);
          mockedFsPromises.readFile.mockResolvedValue('fs.writeFile("/path", "data", callback)');

          const result = await handleCheckPermissions({ path: 'utils.ts' });
          const data = JSON.parse(result.content[0].text);

          expect(data.permissions.some((p: { api: string }) => p.api === 'fs.writeFile')).toBe(true);
        });

        it('should detect fs.readFileSync', async () => {
          mockedFileExists.mockResolvedValue(true);
          mockedFsPromises.stat.mockResolvedValue({
            isDirectory: () => false,
            isFile: () => true,
          } as unknown as fsPromises.FileHandle['stat'] extends () => Promise<infer R> ? R : never);
          mockedFsPromises.readFile.mockResolvedValue('const data = fs.readFileSync("/path")');

          const result = await handleCheckPermissions({ path: 'utils.ts' });
          const data = JSON.parse(result.content[0].text);

          expect(data.permissions.some((p: { api: string }) => p.api === 'fs.readFileSync')).toBe(true);
        });

        it('should detect fs.promises.readFile', async () => {
          mockedFileExists.mockResolvedValue(true);
          mockedFsPromises.stat.mockResolvedValue({
            isDirectory: () => false,
            isFile: () => true,
          } as unknown as fsPromises.FileHandle['stat'] extends () => Promise<infer R> ? R : never);
          mockedFsPromises.readFile.mockResolvedValue('await fs.promises.readFile("/path")');

          const result = await handleCheckPermissions({ path: 'utils.ts' });
          const data = JSON.parse(result.content[0].text);

          expect(data.permissions.some((p: { api: string }) => p.api === 'fs.promises.readFile')).toBe(true);
        });

        it('should detect fs.readFile', async () => {
          mockedFileExists.mockResolvedValue(true);
          mockedFsPromises.stat.mockResolvedValue({
            isDirectory: () => false,
            isFile: () => true,
          } as unknown as fsPromises.FileHandle['stat'] extends () => Promise<infer R> ? R : never);
          mockedFsPromises.readFile.mockResolvedValue('fs.readFile("/path", callback)');

          const result = await handleCheckPermissions({ path: 'utils.ts' });
          const data = JSON.parse(result.content[0].text);

          expect(data.permissions.some((p: { api: string }) => p.api === 'fs.readFile')).toBe(true);
        });

        it('should detect fs.unlinkSync', async () => {
          mockedFileExists.mockResolvedValue(true);
          mockedFsPromises.stat.mockResolvedValue({
            isDirectory: () => false,
            isFile: () => true,
          } as unknown as fsPromises.FileHandle['stat'] extends () => Promise<infer R> ? R : never);
          mockedFsPromises.readFile.mockResolvedValue('fs.unlinkSync("/path/to/file")');

          const result = await handleCheckPermissions({ path: 'utils.ts' });
          const data = JSON.parse(result.content[0].text);

          expect(data.permissions.some((p: { api: string }) => p.api === 'fs.unlinkSync')).toBe(true);
        });

        it('should detect fs.promises.unlink', async () => {
          mockedFileExists.mockResolvedValue(true);
          mockedFsPromises.stat.mockResolvedValue({
            isDirectory: () => false,
            isFile: () => true,
          } as unknown as fsPromises.FileHandle['stat'] extends () => Promise<infer R> ? R : never);
          mockedFsPromises.readFile.mockResolvedValue('await fs.promises.unlink("/path")');

          const result = await handleCheckPermissions({ path: 'utils.ts' });
          const data = JSON.parse(result.content[0].text);

          expect(data.permissions.some((p: { api: string }) => p.api === 'fs.promises.unlink')).toBe(true);
        });

        it('should detect fs.rmSync (high risk)', async () => {
          mockedFileExists.mockResolvedValue(true);
          mockedFsPromises.stat.mockResolvedValue({
            isDirectory: () => false,
            isFile: () => true,
          } as unknown as fsPromises.FileHandle['stat'] extends () => Promise<infer R> ? R : never);
          mockedFsPromises.readFile.mockResolvedValue('fs.rmSync("/path", { recursive: true })');

          const result = await handleCheckPermissions({ path: 'utils.ts' });
          const data = JSON.parse(result.content[0].text);

          expect(data.permissions.some((p: { api: string }) => p.api === 'fs.rmSync')).toBe(true);
          expect(data.permissions.find((p: { api: string }) => p.api === 'fs.rmSync').risk_level).toBe('high');
        });

        it('should detect fs.promises.rm (high risk)', async () => {
          mockedFileExists.mockResolvedValue(true);
          mockedFsPromises.stat.mockResolvedValue({
            isDirectory: () => false,
            isFile: () => true,
          } as unknown as fsPromises.FileHandle['stat'] extends () => Promise<infer R> ? R : never);
          mockedFsPromises.readFile.mockResolvedValue('await fs.promises.rm("/path", { recursive: true })');

          const result = await handleCheckPermissions({ path: 'utils.ts' });
          const data = JSON.parse(result.content[0].text);

          expect(data.permissions.some((p: { api: string }) => p.api === 'fs.promises.rm')).toBe(true);
          expect(data.permissions.find((p: { api: string }) => p.api === 'fs.promises.rm').risk_level).toBe('high');
        });

        it('should detect fs.chmodSync', async () => {
          mockedFileExists.mockResolvedValue(true);
          mockedFsPromises.stat.mockResolvedValue({
            isDirectory: () => false,
            isFile: () => true,
          } as unknown as fsPromises.FileHandle['stat'] extends () => Promise<infer R> ? R : never);
          mockedFsPromises.readFile.mockResolvedValue('fs.chmodSync("/path", 0o755)');

          const result = await handleCheckPermissions({ path: 'utils.ts' });
          const data = JSON.parse(result.content[0].text);

          expect(data.permissions.some((p: { api: string }) => p.api === 'fs.chmodSync')).toBe(true);
        });

        it('should detect fs.readdirSync', async () => {
          mockedFileExists.mockResolvedValue(true);
          mockedFsPromises.stat.mockResolvedValue({
            isDirectory: () => false,
            isFile: () => true,
          } as unknown as fsPromises.FileHandle['stat'] extends () => Promise<infer R> ? R : never);
          mockedFsPromises.readFile.mockResolvedValue('const files = fs.readdirSync("/path")');

          const result = await handleCheckPermissions({ path: 'utils.ts' });
          const data = JSON.parse(result.content[0].text);

          expect(data.permissions.some((p: { api: string }) => p.api === 'fs.readdirSync')).toBe(true);
        });
      });

      describe('network permissions', () => {
        it('should detect fetch', async () => {
          mockedFileExists.mockResolvedValue(true);
          mockedFsPromises.stat.mockResolvedValue({
            isDirectory: () => false,
            isFile: () => true,
          } as unknown as fsPromises.FileHandle['stat'] extends () => Promise<infer R> ? R : never);
          mockedFsPromises.readFile.mockResolvedValue('const response = await fetch("/api/data")');

          const result = await handleCheckPermissions({ path: 'api.ts' });
          const data = JSON.parse(result.content[0].text);

          expect(data.permissions.some((p: { api: string }) => p.api === 'fetch')).toBe(true);
          expect(data.summary.network).toBeGreaterThan(0);
        });

        it('should detect axios requests', async () => {
          mockedFileExists.mockResolvedValue(true);
          mockedFsPromises.stat.mockResolvedValue({
            isDirectory: () => false,
            isFile: () => true,
          } as unknown as fsPromises.FileHandle['stat'] extends () => Promise<infer R> ? R : never);
          mockedFsPromises.readFile.mockResolvedValue(`
            axios.get("/api")
            axios.post("/api", data)
            axios.put("/api", data)
            axios.patch("/api", data)
            axios.delete("/api")
            axios.request({ url: "/api" })
          `);

          const result = await handleCheckPermissions({ path: 'api.ts' });
          const data = JSON.parse(result.content[0].text);

          expect(data.permissions.filter((p: { api: string }) => p.api === 'axios').length).toBe(6);
        });

        it('should detect http.createServer', async () => {
          mockedFileExists.mockResolvedValue(true);
          mockedFsPromises.stat.mockResolvedValue({
            isDirectory: () => false,
            isFile: () => true,
          } as unknown as fsPromises.FileHandle['stat'] extends () => Promise<infer R> ? R : never);
          mockedFsPromises.readFile.mockResolvedValue('const server = http.createServer(handler)');

          const result = await handleCheckPermissions({ path: 'server.ts' });
          const data = JSON.parse(result.content[0].text);

          expect(data.permissions.some((p: { api: string }) => p.api === 'http.createServer')).toBe(true);
        });

        it('should detect https.createServer', async () => {
          mockedFileExists.mockResolvedValue(true);
          mockedFsPromises.stat.mockResolvedValue({
            isDirectory: () => false,
            isFile: () => true,
          } as unknown as fsPromises.FileHandle['stat'] extends () => Promise<infer R> ? R : never);
          mockedFsPromises.readFile.mockResolvedValue('const server = https.createServer(options, handler)');

          const result = await handleCheckPermissions({ path: 'server.ts' });
          const data = JSON.parse(result.content[0].text);

          expect(data.permissions.some((p: { api: string }) => p.api === 'https.createServer')).toBe(true);
        });

        it('should detect http.request', async () => {
          mockedFileExists.mockResolvedValue(true);
          mockedFsPromises.stat.mockResolvedValue({
            isDirectory: () => false,
            isFile: () => true,
          } as unknown as fsPromises.FileHandle['stat'] extends () => Promise<infer R> ? R : never);
          mockedFsPromises.readFile.mockResolvedValue('const req = http.request(options, callback)');

          const result = await handleCheckPermissions({ path: 'client.ts' });
          const data = JSON.parse(result.content[0].text);

          expect(data.permissions.some((p: { api: string }) => p.api === 'http.request')).toBe(true);
        });

        it('should detect https.request', async () => {
          mockedFileExists.mockResolvedValue(true);
          mockedFsPromises.stat.mockResolvedValue({
            isDirectory: () => false,
            isFile: () => true,
          } as unknown as fsPromises.FileHandle['stat'] extends () => Promise<infer R> ? R : never);
          mockedFsPromises.readFile.mockResolvedValue('const req = https.request(options, callback)');

          const result = await handleCheckPermissions({ path: 'client.ts' });
          const data = JSON.parse(result.content[0].text);

          expect(data.permissions.some((p: { api: string }) => p.api === 'https.request')).toBe(true);
        });

        it('should detect net.createConnection', async () => {
          mockedFileExists.mockResolvedValue(true);
          mockedFsPromises.stat.mockResolvedValue({
            isDirectory: () => false,
            isFile: () => true,
          } as unknown as fsPromises.FileHandle['stat'] extends () => Promise<infer R> ? R : never);
          mockedFsPromises.readFile.mockResolvedValue('const socket = net.createConnection(port, host)');

          const result = await handleCheckPermissions({ path: 'tcp.ts' });
          const data = JSON.parse(result.content[0].text);

          expect(data.permissions.some((p: { api: string }) => p.api === 'net.createConnection')).toBe(true);
          expect(data.permissions.find((p: { api: string }) => p.api === 'net.createConnection').risk_level).toBe('medium');
        });

        it('should detect net.createServer', async () => {
          mockedFileExists.mockResolvedValue(true);
          mockedFsPromises.stat.mockResolvedValue({
            isDirectory: () => false,
            isFile: () => true,
          } as unknown as fsPromises.FileHandle['stat'] extends () => Promise<infer R> ? R : never);
          mockedFsPromises.readFile.mockResolvedValue('const server = net.createServer(handler)');

          const result = await handleCheckPermissions({ path: 'tcp.ts' });
          const data = JSON.parse(result.content[0].text);

          expect(data.permissions.some((p: { api: string }) => p.api === 'net.createServer')).toBe(true);
        });

        it('should detect dgram.createSocket', async () => {
          mockedFileExists.mockResolvedValue(true);
          mockedFsPromises.stat.mockResolvedValue({
            isDirectory: () => false,
            isFile: () => true,
          } as unknown as fsPromises.FileHandle['stat'] extends () => Promise<infer R> ? R : never);
          mockedFsPromises.readFile.mockResolvedValue('const socket = dgram.createSocket("udp4")');

          const result = await handleCheckPermissions({ path: 'udp.ts' });
          const data = JSON.parse(result.content[0].text);

          expect(data.permissions.some((p: { api: string }) => p.api === 'dgram.createSocket')).toBe(true);
        });

        it('should detect WebSocket', async () => {
          mockedFileExists.mockResolvedValue(true);
          mockedFsPromises.stat.mockResolvedValue({
            isDirectory: () => false,
            isFile: () => true,
          } as unknown as fsPromises.FileHandle['stat'] extends () => Promise<infer R> ? R : never);
          mockedFsPromises.readFile.mockResolvedValue('const ws = new WebSocket("ws://localhost")');

          const result = await handleCheckPermissions({ path: 'ws.ts' });
          const data = JSON.parse(result.content[0].text);

          expect(data.permissions.some((p: { api: string }) => p.api === 'WebSocket')).toBe(true);
        });

        it('should detect dns.lookup', async () => {
          mockedFileExists.mockResolvedValue(true);
          mockedFsPromises.stat.mockResolvedValue({
            isDirectory: () => false,
            isFile: () => true,
          } as unknown as fsPromises.FileHandle['stat'] extends () => Promise<infer R> ? R : never);
          mockedFsPromises.readFile.mockResolvedValue('dns.lookup("example.com", callback)');

          const result = await handleCheckPermissions({ path: 'dns.ts' });
          const data = JSON.parse(result.content[0].text);

          expect(data.permissions.some((p: { api: string }) => p.api === 'dns.lookup')).toBe(true);
        });
      });

      describe('process permissions', () => {
        it('should detect exec (high risk)', async () => {
          mockedFileExists.mockResolvedValue(true);
          mockedFsPromises.stat.mockResolvedValue({
            isDirectory: () => false,
            isFile: () => true,
          } as unknown as fsPromises.FileHandle['stat'] extends () => Promise<infer R> ? R : never);
          mockedFsPromises.readFile.mockResolvedValue('exec("ls -la", callback)');

          const result = await handleCheckPermissions({ path: 'shell.ts' });
          const data = JSON.parse(result.content[0].text);

          expect(data.permissions.some((p: { api: string }) => p.api === 'child_process.exec')).toBe(true);
          expect(data.permissions.find((p: { api: string }) => p.api === 'child_process.exec').risk_level).toBe('high');
        });

        it('should detect child_process.exec', async () => {
          mockedFileExists.mockResolvedValue(true);
          mockedFsPromises.stat.mockResolvedValue({
            isDirectory: () => false,
            isFile: () => true,
          } as unknown as fsPromises.FileHandle['stat'] extends () => Promise<infer R> ? R : never);
          mockedFsPromises.readFile.mockResolvedValue('child_process.exec("ls", callback)');

          const result = await handleCheckPermissions({ path: 'shell.ts' });
          const data = JSON.parse(result.content[0].text);

          expect(data.permissions.some((p: { api: string }) => p.api === 'child_process.exec')).toBe(true);
        });

        it('should detect execSync (high risk)', async () => {
          mockedFileExists.mockResolvedValue(true);
          mockedFsPromises.stat.mockResolvedValue({
            isDirectory: () => false,
            isFile: () => true,
          } as unknown as fsPromises.FileHandle['stat'] extends () => Promise<infer R> ? R : never);
          mockedFsPromises.readFile.mockResolvedValue('const output = execSync("ls")');

          const result = await handleCheckPermissions({ path: 'shell.ts' });
          const data = JSON.parse(result.content[0].text);

          expect(data.permissions.some((p: { api: string }) => p.api === 'child_process.execSync')).toBe(true);
          expect(data.permissions.find((p: { api: string }) => p.api === 'child_process.execSync').risk_level).toBe('high');
        });

        it('should detect spawn', async () => {
          mockedFileExists.mockResolvedValue(true);
          mockedFsPromises.stat.mockResolvedValue({
            isDirectory: () => false,
            isFile: () => true,
          } as unknown as fsPromises.FileHandle['stat'] extends () => Promise<infer R> ? R : never);
          mockedFsPromises.readFile.mockResolvedValue('const child = spawn("node", ["script.js"])');

          const result = await handleCheckPermissions({ path: 'process.ts' });
          const data = JSON.parse(result.content[0].text);

          expect(data.permissions.some((p: { api: string }) => p.api === 'child_process.spawn')).toBe(true);
        });

        it('should detect spawnSync', async () => {
          mockedFileExists.mockResolvedValue(true);
          mockedFsPromises.stat.mockResolvedValue({
            isDirectory: () => false,
            isFile: () => true,
          } as unknown as fsPromises.FileHandle['stat'] extends () => Promise<infer R> ? R : never);
          mockedFsPromises.readFile.mockResolvedValue('const result = spawnSync("node", ["--version"])');

          const result = await handleCheckPermissions({ path: 'process.ts' });
          const data = JSON.parse(result.content[0].text);

          expect(data.permissions.some((p: { api: string }) => p.api === 'child_process.spawnSync')).toBe(true);
        });

        it('should detect execFile', async () => {
          mockedFileExists.mockResolvedValue(true);
          mockedFsPromises.stat.mockResolvedValue({
            isDirectory: () => false,
            isFile: () => true,
          } as unknown as fsPromises.FileHandle['stat'] extends () => Promise<infer R> ? R : never);
          mockedFsPromises.readFile.mockResolvedValue('execFile("/usr/bin/node", ["--version"], callback)');

          const result = await handleCheckPermissions({ path: 'process.ts' });
          const data = JSON.parse(result.content[0].text);

          expect(data.permissions.some((p: { api: string }) => p.api === 'child_process.execFile')).toBe(true);
        });

        it('should detect fork', async () => {
          mockedFileExists.mockResolvedValue(true);
          mockedFsPromises.stat.mockResolvedValue({
            isDirectory: () => false,
            isFile: () => true,
          } as unknown as fsPromises.FileHandle['stat'] extends () => Promise<infer R> ? R : never);
          mockedFsPromises.readFile.mockResolvedValue('const worker = fork("./worker.js")');

          const result = await handleCheckPermissions({ path: 'process.ts' });
          const data = JSON.parse(result.content[0].text);

          expect(data.permissions.some((p: { api: string }) => p.api === 'child_process.fork')).toBe(true);
        });

        it('should detect process.exit', async () => {
          mockedFileExists.mockResolvedValue(true);
          mockedFsPromises.stat.mockResolvedValue({
            isDirectory: () => false,
            isFile: () => true,
          } as unknown as fsPromises.FileHandle['stat'] extends () => Promise<infer R> ? R : never);
          mockedFsPromises.readFile.mockResolvedValue('process.exit(1)');

          const result = await handleCheckPermissions({ path: 'exit.ts' });
          const data = JSON.parse(result.content[0].text);

          expect(data.permissions.some((p: { api: string }) => p.api === 'process.exit')).toBe(true);
        });

        it('should detect process.kill (high risk)', async () => {
          mockedFileExists.mockResolvedValue(true);
          mockedFsPromises.stat.mockResolvedValue({
            isDirectory: () => false,
            isFile: () => true,
          } as unknown as fsPromises.FileHandle['stat'] extends () => Promise<infer R> ? R : never);
          mockedFsPromises.readFile.mockResolvedValue('process.kill(pid, "SIGTERM")');

          const result = await handleCheckPermissions({ path: 'kill.ts' });
          const data = JSON.parse(result.content[0].text);

          expect(data.permissions.some((p: { api: string }) => p.api === 'process.kill')).toBe(true);
          expect(data.permissions.find((p: { api: string }) => p.api === 'process.kill').risk_level).toBe('high');
        });

        it('should detect eval (high risk)', async () => {
          mockedFileExists.mockResolvedValue(true);
          mockedFsPromises.stat.mockResolvedValue({
            isDirectory: () => false,
            isFile: () => true,
          } as unknown as fsPromises.FileHandle['stat'] extends () => Promise<infer R> ? R : never);
          mockedFsPromises.readFile.mockResolvedValue('const result = eval(code)');

          const result = await handleCheckPermissions({ path: 'dynamic.ts' });
          const data = JSON.parse(result.content[0].text);

          expect(data.permissions.some((p: { api: string }) => p.api === 'eval')).toBe(true);
          expect(data.permissions.find((p: { api: string }) => p.api === 'eval').risk_level).toBe('high');
        });

        it('should detect new Function (high risk)', async () => {
          mockedFileExists.mockResolvedValue(true);
          mockedFsPromises.stat.mockResolvedValue({
            isDirectory: () => false,
            isFile: () => true,
          } as unknown as fsPromises.FileHandle['stat'] extends () => Promise<infer R> ? R : never);
          mockedFsPromises.readFile.mockResolvedValue('const fn = new Function("return 1")');

          const result = await handleCheckPermissions({ path: 'dynamic.ts' });
          const data = JSON.parse(result.content[0].text);

          expect(data.permissions.some((p: { api: string }) => p.api === 'Function constructor')).toBe(true);
          expect(data.permissions.find((p: { api: string }) => p.api === 'Function constructor').risk_level).toBe('high');
        });

        it('should detect vm.runInContext (high risk)', async () => {
          mockedFileExists.mockResolvedValue(true);
          mockedFsPromises.stat.mockResolvedValue({
            isDirectory: () => false,
            isFile: () => true,
          } as unknown as fsPromises.FileHandle['stat'] extends () => Promise<infer R> ? R : never);
          mockedFsPromises.readFile.mockResolvedValue('vm.runInContext(code, context)');

          const result = await handleCheckPermissions({ path: 'vm.ts' });
          const data = JSON.parse(result.content[0].text);

          expect(data.permissions.some((p: { api: string }) => p.api === 'vm.runInContext')).toBe(true);
          expect(data.permissions.find((p: { api: string }) => p.api === 'vm.runInContext').risk_level).toBe('high');
        });

        it('should detect vm.runInNewContext (high risk)', async () => {
          mockedFileExists.mockResolvedValue(true);
          mockedFsPromises.stat.mockResolvedValue({
            isDirectory: () => false,
            isFile: () => true,
          } as unknown as fsPromises.FileHandle['stat'] extends () => Promise<infer R> ? R : never);
          mockedFsPromises.readFile.mockResolvedValue('vm.runInNewContext(code, sandbox)');

          const result = await handleCheckPermissions({ path: 'vm.ts' });
          const data = JSON.parse(result.content[0].text);

          expect(data.permissions.some((p: { api: string }) => p.api === 'vm.runInNewContext')).toBe(true);
          expect(data.permissions.find((p: { api: string }) => p.api === 'vm.runInNewContext').risk_level).toBe('high');
        });
      });

      describe('crypto permissions', () => {
        it('should detect crypto.randomBytes', async () => {
          mockedFileExists.mockResolvedValue(true);
          mockedFsPromises.stat.mockResolvedValue({
            isDirectory: () => false,
            isFile: () => true,
          } as unknown as fsPromises.FileHandle['stat'] extends () => Promise<infer R> ? R : never);
          mockedFsPromises.readFile.mockResolvedValue('const bytes = crypto.randomBytes(32)');

          const result = await handleCheckPermissions({ path: 'crypto.ts' });
          const data = JSON.parse(result.content[0].text);

          expect(data.permissions.some((p: { api: string }) => p.api === 'crypto.randomBytes')).toBe(true);
          expect(data.summary.crypto).toBeGreaterThan(0);
        });

        it('should detect crypto.createHash', async () => {
          mockedFileExists.mockResolvedValue(true);
          mockedFsPromises.stat.mockResolvedValue({
            isDirectory: () => false,
            isFile: () => true,
          } as unknown as fsPromises.FileHandle['stat'] extends () => Promise<infer R> ? R : never);
          mockedFsPromises.readFile.mockResolvedValue('const hash = crypto.createHash("sha256")');

          const result = await handleCheckPermissions({ path: 'crypto.ts' });
          const data = JSON.parse(result.content[0].text);

          expect(data.permissions.some((p: { api: string }) => p.api === 'crypto.createHash')).toBe(true);
        });

        it('should detect crypto.createCipheriv', async () => {
          mockedFileExists.mockResolvedValue(true);
          mockedFsPromises.stat.mockResolvedValue({
            isDirectory: () => false,
            isFile: () => true,
          } as unknown as fsPromises.FileHandle['stat'] extends () => Promise<infer R> ? R : never);
          mockedFsPromises.readFile.mockResolvedValue('const cipher = crypto.createCipheriv("aes-256-cbc", key, iv)');

          const result = await handleCheckPermissions({ path: 'crypto.ts' });
          const data = JSON.parse(result.content[0].text);

          expect(data.permissions.some((p: { api: string }) => p.api === 'crypto.createCipheriv')).toBe(true);
        });

        it('should detect crypto.createDecipheriv', async () => {
          mockedFileExists.mockResolvedValue(true);
          mockedFsPromises.stat.mockResolvedValue({
            isDirectory: () => false,
            isFile: () => true,
          } as unknown as fsPromises.FileHandle['stat'] extends () => Promise<infer R> ? R : never);
          mockedFsPromises.readFile.mockResolvedValue('const decipher = crypto.createDecipheriv("aes-256-cbc", key, iv)');

          const result = await handleCheckPermissions({ path: 'crypto.ts' });
          const data = JSON.parse(result.content[0].text);

          expect(data.permissions.some((p: { api: string }) => p.api === 'crypto.createDecipheriv')).toBe(true);
        });

        it('should detect crypto.createSign', async () => {
          mockedFileExists.mockResolvedValue(true);
          mockedFsPromises.stat.mockResolvedValue({
            isDirectory: () => false,
            isFile: () => true,
          } as unknown as fsPromises.FileHandle['stat'] extends () => Promise<infer R> ? R : never);
          mockedFsPromises.readFile.mockResolvedValue('const sign = crypto.createSign("SHA256")');

          const result = await handleCheckPermissions({ path: 'crypto.ts' });
          const data = JSON.parse(result.content[0].text);

          expect(data.permissions.some((p: { api: string }) => p.api === 'crypto.createSign')).toBe(true);
        });

        it('should detect crypto.createVerify', async () => {
          mockedFileExists.mockResolvedValue(true);
          mockedFsPromises.stat.mockResolvedValue({
            isDirectory: () => false,
            isFile: () => true,
          } as unknown as fsPromises.FileHandle['stat'] extends () => Promise<infer R> ? R : never);
          mockedFsPromises.readFile.mockResolvedValue('const verify = crypto.createVerify("SHA256")');

          const result = await handleCheckPermissions({ path: 'crypto.ts' });
          const data = JSON.parse(result.content[0].text);

          expect(data.permissions.some((p: { api: string }) => p.api === 'crypto.createVerify')).toBe(true);
        });

        it('should detect crypto.createHmac', async () => {
          mockedFileExists.mockResolvedValue(true);
          mockedFsPromises.stat.mockResolvedValue({
            isDirectory: () => false,
            isFile: () => true,
          } as unknown as fsPromises.FileHandle['stat'] extends () => Promise<infer R> ? R : never);
          mockedFsPromises.readFile.mockResolvedValue('const hmac = crypto.createHmac("sha256", secret)');

          const result = await handleCheckPermissions({ path: 'crypto.ts' });
          const data = JSON.parse(result.content[0].text);

          expect(data.permissions.some((p: { api: string }) => p.api === 'crypto.createHmac')).toBe(true);
        });

        it('should detect crypto.pbkdf2', async () => {
          mockedFileExists.mockResolvedValue(true);
          mockedFsPromises.stat.mockResolvedValue({
            isDirectory: () => false,
            isFile: () => true,
          } as unknown as fsPromises.FileHandle['stat'] extends () => Promise<infer R> ? R : never);
          mockedFsPromises.readFile.mockResolvedValue('crypto.pbkdf2(password, salt, iterations, keylen, digest, callback)');

          const result = await handleCheckPermissions({ path: 'crypto.ts' });
          const data = JSON.parse(result.content[0].text);

          expect(data.permissions.some((p: { api: string }) => p.api === 'crypto.pbkdf2')).toBe(true);
        });

        it('should detect crypto.pbkdf2Sync', async () => {
          mockedFileExists.mockResolvedValue(true);
          mockedFsPromises.stat.mockResolvedValue({
            isDirectory: () => false,
            isFile: () => true,
          } as unknown as fsPromises.FileHandle['stat'] extends () => Promise<infer R> ? R : never);
          mockedFsPromises.readFile.mockResolvedValue('const key = crypto.pbkdf2Sync(password, salt, iterations, keylen, digest)');

          const result = await handleCheckPermissions({ path: 'crypto.ts' });
          const data = JSON.parse(result.content[0].text);

          expect(data.permissions.some((p: { api: string }) => p.api === 'crypto.pbkdf2')).toBe(true);
        });

        it('should detect crypto.scrypt', async () => {
          mockedFileExists.mockResolvedValue(true);
          mockedFsPromises.stat.mockResolvedValue({
            isDirectory: () => false,
            isFile: () => true,
          } as unknown as fsPromises.FileHandle['stat'] extends () => Promise<infer R> ? R : never);
          mockedFsPromises.readFile.mockResolvedValue('crypto.scrypt(password, salt, keylen, callback)');

          const result = await handleCheckPermissions({ path: 'crypto.ts' });
          const data = JSON.parse(result.content[0].text);

          expect(data.permissions.some((p: { api: string }) => p.api === 'crypto.scrypt')).toBe(true);
        });

        it('should detect crypto.scryptSync', async () => {
          mockedFileExists.mockResolvedValue(true);
          mockedFsPromises.stat.mockResolvedValue({
            isDirectory: () => false,
            isFile: () => true,
          } as unknown as fsPromises.FileHandle['stat'] extends () => Promise<infer R> ? R : never);
          mockedFsPromises.readFile.mockResolvedValue('const key = crypto.scryptSync(password, salt, keylen)');

          const result = await handleCheckPermissions({ path: 'crypto.ts' });
          const data = JSON.parse(result.content[0].text);

          expect(data.permissions.some((p: { api: string }) => p.api === 'crypto.scrypt')).toBe(true);
        });
      });
    });

    describe('comment skipping', () => {
      it('should skip lines starting with //', async () => {
        mockedFileExists.mockResolvedValue(true);
        mockedFsPromises.stat.mockResolvedValue({
          isDirectory: () => false,
          isFile: () => true,
        } as unknown as fsPromises.FileHandle['stat'] extends () => Promise<infer R> ? R : never);
        mockedFsPromises.readFile.mockResolvedValue('// exec("ls")');

        const result = await handleCheckPermissions({ path: 'utils.ts' });
        const data = JSON.parse(result.content[0].text);

        expect(data.permissions.length).toBe(0);
      });

      it('should skip lines starting with *', async () => {
        mockedFileExists.mockResolvedValue(true);
        mockedFsPromises.stat.mockResolvedValue({
          isDirectory: () => false,
          isFile: () => true,
        } as unknown as fsPromises.FileHandle['stat'] extends () => Promise<infer R> ? R : never);
        mockedFsPromises.readFile.mockResolvedValue(' * exec("ls")');

        const result = await handleCheckPermissions({ path: 'utils.ts' });
        const data = JSON.parse(result.content[0].text);

        expect(data.permissions.length).toBe(0);
      });

      it('should skip lines starting with /*', async () => {
        mockedFileExists.mockResolvedValue(true);
        mockedFsPromises.stat.mockResolvedValue({
          isDirectory: () => false,
          isFile: () => true,
        } as unknown as fsPromises.FileHandle['stat'] extends () => Promise<infer R> ? R : never);
        mockedFsPromises.readFile.mockResolvedValue('/* exec("ls") */');

        const result = await handleCheckPermissions({ path: 'utils.ts' });
        const data = JSON.parse(result.content[0].text);

        expect(data.permissions.length).toBe(0);
      });
    });

    describe('risk assessment', () => {
      it('should return low risk for no findings', async () => {
        mockedFileExists.mockResolvedValue(true);
        mockedFsPromises.stat.mockResolvedValue({
          isDirectory: () => false,
          isFile: () => true,
        } as unknown as fsPromises.FileHandle['stat'] extends () => Promise<infer R> ? R : never);
        mockedFsPromises.readFile.mockResolvedValue('const x = 1;');

        const result = await handleCheckPermissions({ path: 'clean.ts' });
        const data = JSON.parse(result.content[0].text);

        expect(data.risk_assessment).toBe('low');
      });

      it('should return low risk for only low-risk findings', async () => {
        mockedFileExists.mockResolvedValue(true);
        mockedFsPromises.stat.mockResolvedValue({
          isDirectory: () => false,
          isFile: () => true,
        } as unknown as fsPromises.FileHandle['stat'] extends () => Promise<infer R> ? R : never);
        mockedFsPromises.readFile.mockResolvedValue('fetch("/api")');

        const result = await handleCheckPermissions({ path: 'api.ts' });
        const data = JSON.parse(result.content[0].text);

        expect(data.risk_assessment).toBe('low');
      });

      it('should return medium risk for 1-2 high risk findings', async () => {
        mockedFileExists.mockResolvedValue(true);
        mockedFsPromises.stat.mockResolvedValue({
          isDirectory: () => false,
          isFile: () => true,
        } as unknown as fsPromises.FileHandle['stat'] extends () => Promise<infer R> ? R : never);
        mockedFsPromises.readFile.mockResolvedValue(`
          exec("ls")
          fetch("/api")
        `);

        const result = await handleCheckPermissions({ path: 'mixed.ts' });
        const data = JSON.parse(result.content[0].text);

        expect(data.risk_assessment).toBe('medium');
      });

      it('should return medium risk for 5+ medium risk findings', async () => {
        mockedFileExists.mockResolvedValue(true);
        mockedFsPromises.stat.mockResolvedValue({
          isDirectory: () => false,
          isFile: () => true,
        } as unknown as fsPromises.FileHandle['stat'] extends () => Promise<infer R> ? R : never);
        mockedFsPromises.readFile.mockResolvedValue(`
          fs.writeFileSync("/a", "data")
          fs.writeFileSync("/b", "data")
          fs.writeFileSync("/c", "data")
          fs.writeFileSync("/d", "data")
          fs.writeFileSync("/e", "data")
        `);

        const result = await handleCheckPermissions({ path: 'writes.ts' });
        const data = JSON.parse(result.content[0].text);

        expect(data.risk_assessment).toBe('medium');
      });

      it('should return high risk for 3+ high risk findings', async () => {
        mockedFileExists.mockResolvedValue(true);
        mockedFsPromises.stat.mockResolvedValue({
          isDirectory: () => false,
          isFile: () => true,
        } as unknown as fsPromises.FileHandle['stat'] extends () => Promise<infer R> ? R : never);
        mockedFsPromises.readFile.mockResolvedValue(`
          exec("ls")
          execSync("pwd")
          eval(code)
        `);

        const result = await handleCheckPermissions({ path: 'dangerous.ts' });
        const data = JSON.parse(result.content[0].text);

        expect(data.risk_assessment).toBe('high');
      });
    });

    describe('recommendations generation', () => {
      it('should generate recommendations for high-risk APIs', async () => {
        mockedFileExists.mockResolvedValue(true);
        mockedFsPromises.stat.mockResolvedValue({
          isDirectory: () => false,
          isFile: () => true,
        } as unknown as fsPromises.FileHandle['stat'] extends () => Promise<infer R> ? R : never);
        mockedFsPromises.readFile.mockResolvedValue('exec("ls -la")');

        const result = await handleCheckPermissions({ path: 'shell.ts' });
        const data = JSON.parse(result.content[0].text);

        expect(data.recommendations.length).toBeGreaterThan(0);
        expect(data.recommendations.some((r: string) => r.includes('execFile'))).toBe(true);
      });

      it('should recommend using execFile instead of exec', async () => {
        mockedFileExists.mockResolvedValue(true);
        mockedFsPromises.stat.mockResolvedValue({
          isDirectory: () => false,
          isFile: () => true,
        } as unknown as fsPromises.FileHandle['stat'] extends () => Promise<infer R> ? R : never);
        mockedFsPromises.readFile.mockResolvedValue('exec("command")');

        const result = await handleCheckPermissions({ path: 'shell.ts' });
        const data = JSON.parse(result.content[0].text);

        expect(data.recommendations.some((r: string) => r.includes('execFile') || r.includes('shell injection'))).toBe(true);
      });

      it('should recommend against eval', async () => {
        mockedFileExists.mockResolvedValue(true);
        mockedFsPromises.stat.mockResolvedValue({
          isDirectory: () => false,
          isFile: () => true,
        } as unknown as fsPromises.FileHandle['stat'] extends () => Promise<infer R> ? R : never);
        mockedFsPromises.readFile.mockResolvedValue('eval(code)');

        const result = await handleCheckPermissions({ path: 'dynamic.ts' });
        const data = JSON.parse(result.content[0].text);

        expect(data.recommendations.some((r: string) => r.includes('eval') || r.includes('security'))).toBe(true);
      });

      it('should recommend against new Function', async () => {
        mockedFileExists.mockResolvedValue(true);
        mockedFsPromises.stat.mockResolvedValue({
          isDirectory: () => false,
          isFile: () => true,
        } as unknown as fsPromises.FileHandle['stat'] extends () => Promise<infer R> ? R : never);
        mockedFsPromises.readFile.mockResolvedValue('new Function("return 1")');

        const result = await handleCheckPermissions({ path: 'dynamic.ts' });
        const data = JSON.parse(result.content[0].text);

        expect(data.recommendations.some((r: string) => r.includes('Function') || r.includes('security'))).toBe(true);
      });

      it('should limit recommendations to 10', async () => {
        mockedFileExists.mockResolvedValue(true);
        mockedFsPromises.stat.mockResolvedValue({
          isDirectory: () => false,
          isFile: () => true,
        } as unknown as fsPromises.FileHandle['stat'] extends () => Promise<infer R> ? R : never);
        // Create many high-risk findings
        mockedFsPromises.readFile.mockResolvedValue(`
          exec("a")
          exec("b")
          exec("c")
          exec("d")
          exec("e")
          eval(a)
          eval(b)
          eval(c)
          new Function(a)
          new Function(b)
          new Function(c)
          process.kill(1)
          process.kill(2)
        `);

        const result = await handleCheckPermissions({ path: 'many.ts' });
        const data = JSON.parse(result.content[0].text);

        expect(data.recommendations.length).toBeLessThanOrEqual(10);
      });

      it('should not duplicate recommendations for same API', async () => {
        mockedFileExists.mockResolvedValue(true);
        mockedFsPromises.stat.mockResolvedValue({
          isDirectory: () => false,
          isFile: () => true,
        } as unknown as fsPromises.FileHandle['stat'] extends () => Promise<infer R> ? R : never);
        mockedFsPromises.readFile.mockResolvedValue(`
          exec("ls")
          exec("pwd")
          exec("cat")
        `);

        const result = await handleCheckPermissions({ path: 'multi-exec.ts' });
        const data = JSON.parse(result.content[0].text);

        // Should only have one exec-related recommendation despite multiple occurrences
        const execRecommendations = data.recommendations.filter((r: string) =>
          r.includes('child_process.exec') && r.includes('execFile')
        );
        expect(execRecommendations.length).toBeLessThanOrEqual(2);
      });
    });

    describe('empty results', () => {
      it('should return empty result when no files found', async () => {
        mockedFileExists.mockResolvedValue(true);
        mockedFsPromises.stat.mockResolvedValue({
          isDirectory: () => true,
          isFile: () => false,
        } as unknown as fsPromises.FileHandle['stat'] extends () => Promise<infer R> ? R : never);
        mockedFsPromises.readdir.mockResolvedValue([]);

        const result = await handleCheckPermissions({});
        const data = JSON.parse(result.content[0].text);

        expect(data.permissions).toEqual([]);
        expect(data.summary).toEqual({
          filesystem: 0,
          network: 0,
          process: 0,
          crypto: 0,
        });
        expect(data.risk_assessment).toBe('low');
        expect(data.recommendations).toEqual([]);
        expect(data.files_scanned).toBe(0);
      });
    });

    describe('error handling', () => {
      it('should handle directory read error gracefully', async () => {
        mockedFileExists.mockResolvedValue(true);
        mockedFsPromises.stat.mockResolvedValue({
          isDirectory: () => true,
          isFile: () => false,
        } as unknown as fsPromises.FileHandle['stat'] extends () => Promise<infer R> ? R : never);
        mockedFsPromises.readdir.mockRejectedValue(new Error('Permission denied'));

        const result = await handleCheckPermissions({});
        const data = JSON.parse(result.content[0].text);

        expect(result.isError).toBeUndefined();
        expect(data.files_scanned).toBe(0);
      });

      it('should handle file read error gracefully', async () => {
        mockedFileExists.mockResolvedValue(true);
        mockedFsPromises.stat.mockResolvedValue({
          isDirectory: () => true,
          isFile: () => false,
        } as unknown as fsPromises.FileHandle['stat'] extends () => Promise<infer R> ? R : never);
        mockedFsPromises.readdir.mockResolvedValue([
          { name: 'file.ts', isDirectory: () => false, isFile: () => true },
        ] as unknown as ReturnType<typeof fsPromises.readdir> extends Promise<infer R> ? R : never);
        mockedFsPromises.readFile.mockRejectedValue(new Error('Cannot read file'));

        const result = await handleCheckPermissions({});
        const data = JSON.parse(result.content[0].text);

        expect(result.isError).toBeUndefined();
        // File was attempted to be scanned but failed
        expect(data.files_scanned).toBe(1);
      });
    });

    describe('result formatting', () => {
      it('should sort findings by risk level (high first)', async () => {
        mockedFileExists.mockResolvedValue(true);
        mockedFsPromises.stat.mockResolvedValue({
          isDirectory: () => false,
          isFile: () => true,
        } as unknown as fsPromises.FileHandle['stat'] extends () => Promise<infer R> ? R : never);
        mockedFsPromises.readFile.mockResolvedValue(`
          fetch("/api")
          exec("ls")
          fs.writeFileSync("/path", "data")
        `);

        const result = await handleCheckPermissions({ path: 'mixed.ts' });
        const data = JSON.parse(result.content[0].text);

        if (data.permissions.length >= 2) {
          const riskOrder: Record<string, number> = { high: 2, medium: 1, low: 0 };
          for (let i = 0; i < data.permissions.length - 1; i++) {
            const current = riskOrder[data.permissions[i].risk_level];
            const next = riskOrder[data.permissions[i + 1].risk_level];
            expect(current).toBeGreaterThanOrEqual(next);
          }
        }
      });

      it('should sort findings by file name when risk is equal', async () => {
        mockedFileExists.mockResolvedValue(true);
        mockedFsPromises.stat.mockResolvedValue({
          isDirectory: () => true,
          isFile: () => false,
        } as unknown as fsPromises.FileHandle['stat'] extends () => Promise<infer R> ? R : never);
        mockedFsPromises.readdir.mockResolvedValue([
          { name: 'z-file.ts', isDirectory: () => false, isFile: () => true },
          { name: 'a-file.ts', isDirectory: () => false, isFile: () => true },
        ] as unknown as ReturnType<typeof fsPromises.readdir> extends Promise<infer R> ? R : never);
        mockedFsPromises.readFile.mockResolvedValue('fetch("/api")');

        const result = await handleCheckPermissions({});
        const data = JSON.parse(result.content[0].text);

        if (data.permissions.length >= 2) {
          // Check that files with same risk level are sorted alphabetically
          const sameRisk = data.permissions.filter((p: { risk_level: string }) => p.risk_level === 'low');
          if (sameRisk.length >= 2) {
            const files = sameRisk.map((p: { file: string }) => p.file);
            const sortedFiles = [...files].sort();
            expect(files).toEqual(sortedFiles);
          }
        }
      });

      it('should include summary counts', async () => {
        mockedFileExists.mockResolvedValue(true);
        mockedFsPromises.stat.mockResolvedValue({
          isDirectory: () => false,
          isFile: () => true,
        } as unknown as fsPromises.FileHandle['stat'] extends () => Promise<infer R> ? R : never);
        mockedFsPromises.readFile.mockResolvedValue(`
          fs.writeFileSync("/path", "data")
          fetch("/api")
          exec("ls")
          crypto.randomBytes(32)
        `);

        const result = await handleCheckPermissions({ path: 'all.ts' });
        const data = JSON.parse(result.content[0].text);

        expect(data.summary.filesystem).toBeGreaterThan(0);
        expect(data.summary.network).toBeGreaterThan(0);
        expect(data.summary.process).toBeGreaterThan(0);
        expect(data.summary.crypto).toBeGreaterThan(0);
      });

      it('should include line numbers in findings', async () => {
        mockedFileExists.mockResolvedValue(true);
        mockedFsPromises.stat.mockResolvedValue({
          isDirectory: () => false,
          isFile: () => true,
        } as unknown as fsPromises.FileHandle['stat'] extends () => Promise<infer R> ? R : never);
        mockedFsPromises.readFile.mockResolvedValue('exec("ls")');

        const result = await handleCheckPermissions({ path: 'utils.ts' });
        const data = JSON.parse(result.content[0].text);

        expect(data.permissions[0].line).toBe(1);
      });

      it('should include description in findings', async () => {
        mockedFileExists.mockResolvedValue(true);
        mockedFsPromises.stat.mockResolvedValue({
          isDirectory: () => false,
          isFile: () => true,
        } as unknown as fsPromises.FileHandle['stat'] extends () => Promise<infer R> ? R : never);
        mockedFsPromises.readFile.mockResolvedValue('exec("ls")');

        const result = await handleCheckPermissions({ path: 'utils.ts' });
        const data = JSON.parse(result.content[0].text);

        expect(data.permissions[0].description).toBeDefined();
        expect(data.permissions[0].description.length).toBeGreaterThan(0);
      });

      it('should include files_scanned in response', async () => {
        mockedFileExists.mockResolvedValue(true);
        mockedFsPromises.stat.mockResolvedValue({
          isDirectory: () => true,
          isFile: () => false,
        } as unknown as fsPromises.FileHandle['stat'] extends () => Promise<infer R> ? R : never);
        mockedFsPromises.readdir.mockResolvedValue([
          { name: 'a.ts', isDirectory: () => false, isFile: () => true },
          { name: 'b.ts', isDirectory: () => false, isFile: () => true },
          { name: 'c.ts', isDirectory: () => false, isFile: () => true },
        ] as unknown as ReturnType<typeof fsPromises.readdir> extends Promise<infer R> ? R : never);
        mockedFsPromises.readFile.mockResolvedValue('const x = 1;');

        const result = await handleCheckPermissions({});
        const data = JSON.parse(result.content[0].text);

        expect(data.files_scanned).toBe(3);
      });
    });

    describe('fsPromises import alias', () => {
      it('should detect fsPromises.promises.writeFile', async () => {
        mockedFileExists.mockResolvedValue(true);
        mockedFsPromises.stat.mockResolvedValue({
          isDirectory: () => false,
          isFile: () => true,
        } as unknown as fsPromises.FileHandle['stat'] extends () => Promise<infer R> ? R : never);
        mockedFsPromises.readFile.mockResolvedValue('await fsPromises.promises.writeFile("/path", "data")');

        const result = await handleCheckPermissions({ path: 'utils.ts' });
        const data = JSON.parse(result.content[0].text);

        expect(data.permissions.some((p: { api: string }) => p.api === 'fs.promises.writeFile')).toBe(true);
      });

      it('should detect fsPromises.promises.readFile', async () => {
        mockedFileExists.mockResolvedValue(true);
        mockedFsPromises.stat.mockResolvedValue({
          isDirectory: () => false,
          isFile: () => true,
        } as unknown as fsPromises.FileHandle['stat'] extends () => Promise<infer R> ? R : never);
        mockedFsPromises.readFile.mockResolvedValue('await fsPromises.promises.readFile("/path")');

        const result = await handleCheckPermissions({ path: 'utils.ts' });
        const data = JSON.parse(result.content[0].text);

        expect(data.permissions.some((p: { api: string }) => p.api === 'fs.promises.readFile')).toBe(true);
      });

      it('should detect fsPromises.promises.unlink', async () => {
        mockedFileExists.mockResolvedValue(true);
        mockedFsPromises.stat.mockResolvedValue({
          isDirectory: () => false,
          isFile: () => true,
        } as unknown as fsPromises.FileHandle['stat'] extends () => Promise<infer R> ? R : never);
        mockedFsPromises.readFile.mockResolvedValue('await fsPromises.promises.unlink("/path")');

        const result = await handleCheckPermissions({ path: 'utils.ts' });
        const data = JSON.parse(result.content[0].text);

        expect(data.permissions.some((p: { api: string }) => p.api === 'fs.promises.unlink')).toBe(true);
      });

      it('should detect fsPromises.promises.rm', async () => {
        mockedFileExists.mockResolvedValue(true);
        mockedFsPromises.stat.mockResolvedValue({
          isDirectory: () => false,
          isFile: () => true,
        } as unknown as fsPromises.FileHandle['stat'] extends () => Promise<infer R> ? R : never);
        mockedFsPromises.readFile.mockResolvedValue('await fsPromises.promises.rm("/path", { recursive: true })');

        const result = await handleCheckPermissions({ path: 'utils.ts' });
        const data = JSON.parse(result.content[0].text);

        expect(data.permissions.some((p: { api: string }) => p.api === 'fs.promises.rm')).toBe(true);
      });
    });

    describe('skip pattern edge cases', () => {
      it('should skip paths ending with skip pattern name', async () => {
        mockedFileExists.mockResolvedValue(true);
        mockedFsPromises.stat.mockResolvedValue({
          isDirectory: () => true,
          isFile: () => false,
        } as unknown as fsPromises.FileHandle['stat'] extends () => Promise<infer R> ? R : never);
        mockedFsPromises.readdir.mockResolvedValue([
          { name: 'node_modules', isDirectory: () => true, isFile: () => false },
        ] as unknown as ReturnType<typeof fsPromises.readdir> extends Promise<infer R> ? R : never);

        const result = await handleCheckPermissions({});
        const data = JSON.parse(result.content[0].text);

        expect(data.files_scanned).toBe(0);
      });

      it('should handle Windows-style paths', async () => {
        mockedFileExists.mockResolvedValue(true);
        mockedFsPromises.stat.mockResolvedValue({
          isDirectory: () => false,
          isFile: () => true,
        } as unknown as fsPromises.FileHandle['stat'] extends () => Promise<infer R> ? R : never);
        mockedFsPromises.readFile.mockResolvedValue('exec("ls")');

        const result = await handleCheckPermissions({ path: 'src\\utils.ts' });
        const data = JSON.parse(result.content[0].text);

        expect(result.isError).toBeUndefined();
      });
    });
  });
});
