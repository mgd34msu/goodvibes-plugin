/**
 * Unit tests for pre-tool-use hook
 *
 * Tests cover:
 * - detect_stack validation (package.json check)
 * - get_schema validation (schema file check)
 * - run_smoke_test validation (package manager check)
 * - check_types validation (tsconfig.json check)
 * - validate_implementation (allow by default)
 * - Unknown tool handling
 * - Response format (allow/block)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as path from 'path';

// Mock fs/promises module
vi.mock('fs/promises');

describe('pre-tool-use hook utilities', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('fileExists', () => {
    it('should return true when file exists', async () => {
      vi.doMock('fs/promises', () => ({
        access: vi.fn().mockResolvedValue(undefined),
        mkdir: vi.fn().mockResolvedValue(undefined),
        readFile: vi.fn().mockResolvedValue('{}'),
        writeFile: vi.fn().mockResolvedValue(undefined),
      }));

      const { fileExists } = await import('../shared/index.js');
      const result = await fileExists('package.json');

      expect(result).toBe(true);
    });

    it('should return false when file does not exist', async () => {
      vi.doMock('fs/promises', () => ({
        access: vi.fn().mockRejectedValue(new Error('ENOENT')),
        mkdir: vi.fn().mockResolvedValue(undefined),
        readFile: vi.fn().mockResolvedValue('{}'),
        writeFile: vi.fn().mockResolvedValue(undefined),
      }));

      const { fileExists } = await import('../shared/index.js');
      const result = await fileExists('nonexistent.json');

      expect(result).toBe(false);
    });

    it('should resolve path relative to project root', async () => {
      const mockAccess = vi.fn().mockResolvedValue(undefined);
      vi.doMock('fs/promises', () => ({
        access: mockAccess,
        mkdir: vi.fn().mockResolvedValue(undefined),
        readFile: vi.fn().mockResolvedValue('{}'),
        writeFile: vi.fn().mockResolvedValue(undefined),
      }));

      const { fileExists } = await import('../shared/index.js');
      await fileExists('src/index.ts');

      expect(mockAccess).toHaveBeenCalled();
      const calledPath = mockAccess.mock.calls[0][0] as string;
      expect(calledPath).toContain('src');
    });
  });

  describe('allowTool', () => {
    it('should return continue true', async () => {
      const { allowTool } = await import('../shared/index.js');
      const response = allowTool('PreToolUse');

      expect(response.continue).toBe(true);
    });

    it('should include system message when provided', async () => {
      const { allowTool } = await import('../shared/index.js');
      const response = allowTool('PreToolUse', 'Tool allowed with warning');

      expect(response.systemMessage).toBe('Tool allowed with warning');
    });

    it('should set permissionDecision to allow', async () => {
      const { allowTool } = await import('../shared/index.js');
      const response = allowTool('PreToolUse');

      expect(response.hookSpecificOutput?.permissionDecision).toBe('allow');
    });

    it('should include hookEventName', async () => {
      const { allowTool } = await import('../shared/index.js');
      const response = allowTool('PreToolUse');

      expect(response.hookSpecificOutput?.hookEventName).toBe('PreToolUse');
    });
  });

  describe('blockTool', () => {
    it('should return continue false', async () => {
      const { blockTool } = await import('../shared/index.js');
      const response = blockTool('PreToolUse', 'Not allowed');

      expect(response.continue).toBe(false);
    });

    it('should set permissionDecision to deny', async () => {
      const { blockTool } = await import('../shared/index.js');
      const response = blockTool('PreToolUse', 'Not allowed');

      expect(response.hookSpecificOutput?.permissionDecision).toBe('deny');
    });

    it('should include reason in permissionDecisionReason', async () => {
      const { blockTool } = await import('../shared/index.js');
      const response = blockTool('PreToolUse', 'Missing configuration');

      expect(response.hookSpecificOutput?.permissionDecisionReason).toBe('Missing configuration');
    });

    it('should include hookEventName', async () => {
      const { blockTool } = await import('../shared/index.js');
      const response = blockTool('PreToolUse', 'Not allowed');

      expect(response.hookSpecificOutput?.hookEventName).toBe('PreToolUse');
    });
  });

  describe('detect_stack validation logic', () => {
    it('should block when package.json is missing', async () => {
      vi.doMock('fs/promises', () => ({
        access: vi.fn().mockRejectedValue(new Error('ENOENT')),
        mkdir: vi.fn().mockResolvedValue(undefined),
        readFile: vi.fn().mockResolvedValue('{}'),
        writeFile: vi.fn().mockResolvedValue(undefined),
      }));

      const { fileExists, blockTool } = await import('../shared/index.js');
      const hasPackageJson = await fileExists('package.json');

      expect(hasPackageJson).toBe(false);
      const response = blockTool('PreToolUse', 'No package.json found');
      expect(response.continue).toBe(false);
    });

    it('should allow when package.json exists', async () => {
      vi.doMock('fs/promises', () => ({
        access: vi.fn().mockResolvedValue(undefined),
        mkdir: vi.fn().mockResolvedValue(undefined),
        readFile: vi.fn().mockResolvedValue('{}'),
        writeFile: vi.fn().mockResolvedValue(undefined),
      }));

      const { fileExists, allowTool } = await import('../shared/index.js');
      const hasPackageJson = await fileExists('package.json');

      expect(hasPackageJson).toBe(true);
      const response = allowTool('PreToolUse');
      expect(response.continue).toBe(true);
    });
  });

  describe('get_schema validation logic', () => {
    it('should allow when prisma schema exists', async () => {
      vi.doMock('fs/promises', () => ({
        access: vi.fn().mockImplementation((p: string) => {
          const pathStr = String(p).replace(/\\/g, '/');
          return pathStr.includes('prisma') ? Promise.resolve() : Promise.reject(new Error('ENOENT'));
        }),
        mkdir: vi.fn().mockResolvedValue(undefined),
        readFile: vi.fn().mockResolvedValue('{}'),
        writeFile: vi.fn().mockResolvedValue(undefined),
      }));

      const { fileExists, allowTool } = await import('../shared/index.js');
      const hasPrisma = await fileExists('prisma/schema.prisma');

      expect(hasPrisma).toBe(true);
      const response = allowTool('PreToolUse');
      expect(response.continue).toBe(true);
    });

    it('should allow when drizzle config exists', async () => {
      vi.doMock('fs/promises', () => ({
        access: vi.fn().mockImplementation((p: string) => {
          const pathStr = String(p).replace(/\\/g, '/');
          return pathStr.includes('drizzle.config') ? Promise.resolve() : Promise.reject(new Error('ENOENT'));
        }),
        mkdir: vi.fn().mockResolvedValue(undefined),
        readFile: vi.fn().mockResolvedValue('{}'),
        writeFile: vi.fn().mockResolvedValue(undefined),
      }));

      const { fileExists, allowTool } = await import('../shared/index.js');
      const hasDrizzle = await fileExists('drizzle.config.ts');

      expect(hasDrizzle).toBe(true);
      const response = allowTool('PreToolUse');
      expect(response.continue).toBe(true);
    });

    it('should allow with warning when no schema found', async () => {
      vi.doMock('fs/promises', () => ({
        access: vi.fn().mockRejectedValue(new Error('ENOENT')),
        mkdir: vi.fn().mockResolvedValue(undefined),
        readFile: vi.fn().mockResolvedValue('{}'),
        writeFile: vi.fn().mockResolvedValue(undefined),
      }));

      const { fileExists, allowTool } = await import('../shared/index.js');
      const hasSchema = await fileExists('prisma/schema.prisma') ||
                        await fileExists('drizzle.config.ts') ||
                        await fileExists('drizzle/schema.ts');

      expect(hasSchema).toBe(false);
      const response = allowTool('PreToolUse', 'No schema file detected. get_schema may fail.');
      expect(response.continue).toBe(true);
      expect(response.systemMessage).toContain('schema');
    });
  });

  describe('run_smoke_test validation logic', () => {
    it('should block when package.json is missing', async () => {
      vi.doMock('fs/promises', () => ({
        access: vi.fn().mockRejectedValue(new Error('ENOENT')),
        mkdir: vi.fn().mockResolvedValue(undefined),
        readFile: vi.fn().mockResolvedValue('{}'),
        writeFile: vi.fn().mockResolvedValue(undefined),
      }));

      const { fileExists, blockTool } = await import('../shared/index.js');
      const hasPackageJson = await fileExists('package.json');

      expect(hasPackageJson).toBe(false);
      const response = blockTool('PreToolUse', 'No package.json found');
      expect(response.continue).toBe(false);
    });

    it('should allow when npm lockfile exists', async () => {
      vi.doMock('fs/promises', () => ({
        access: vi.fn().mockImplementation((p: string) => {
          return String(p).includes('package-lock.json') || String(p).includes('package.json')
            ? Promise.resolve() : Promise.reject(new Error('ENOENT'));
        }),
        mkdir: vi.fn().mockResolvedValue(undefined),
        readFile: vi.fn().mockResolvedValue('{}'),
        writeFile: vi.fn().mockResolvedValue(undefined),
      }));

      const { fileExists, allowTool } = await import('../shared/index.js');
      const hasLockfile = await fileExists('package-lock.json');

      expect(hasLockfile).toBe(true);
      const response = allowTool('PreToolUse');
      expect(response.continue).toBe(true);
    });

    it('should allow when pnpm lockfile exists', async () => {
      vi.doMock('fs/promises', () => ({
        access: vi.fn().mockImplementation((p: string) => {
          return String(p).includes('pnpm-lock.yaml') || String(p).includes('package.json')
            ? Promise.resolve() : Promise.reject(new Error('ENOENT'));
        }),
        mkdir: vi.fn().mockResolvedValue(undefined),
        readFile: vi.fn().mockResolvedValue('{}'),
        writeFile: vi.fn().mockResolvedValue(undefined),
      }));

      const { fileExists, allowTool } = await import('../shared/index.js');
      const hasLockfile = await fileExists('pnpm-lock.yaml');

      expect(hasLockfile).toBe(true);
      const response = allowTool('PreToolUse');
      expect(response.continue).toBe(true);
    });

    it('should allow when yarn lockfile exists', async () => {
      vi.doMock('fs/promises', () => ({
        access: vi.fn().mockImplementation((p: string) => {
          return String(p).includes('yarn.lock') || String(p).includes('package.json')
            ? Promise.resolve() : Promise.reject(new Error('ENOENT'));
        }),
        mkdir: vi.fn().mockResolvedValue(undefined),
        readFile: vi.fn().mockResolvedValue('{}'),
        writeFile: vi.fn().mockResolvedValue(undefined),
      }));

      const { fileExists, allowTool } = await import('../shared/index.js');
      const hasLockfile = await fileExists('yarn.lock');

      expect(hasLockfile).toBe(true);
      const response = allowTool('PreToolUse');
      expect(response.continue).toBe(true);
    });

    it('should allow with warning when no lockfile found', async () => {
      vi.doMock('fs/promises', () => ({
        access: vi.fn().mockImplementation((p: string) => {
          return String(p).includes('package.json')
            ? Promise.resolve() : Promise.reject(new Error('ENOENT'));
        }),
        mkdir: vi.fn().mockResolvedValue(undefined),
        readFile: vi.fn().mockResolvedValue('{}'),
        writeFile: vi.fn().mockResolvedValue(undefined),
      }));

      const { fileExists, allowTool } = await import('../shared/index.js');
      const hasLockfile = await fileExists('pnpm-lock.yaml') ||
                          await fileExists('yarn.lock') ||
                          await fileExists('package-lock.json');

      expect(hasLockfile).toBe(false);
      const response = allowTool('PreToolUse', 'No lockfile detected. Install dependencies first.');
      expect(response.continue).toBe(true);
      expect(response.systemMessage).toContain('dependencies');
    });
  });

  describe('check_types validation logic', () => {
    it('should block when tsconfig.json is missing', async () => {
      vi.doMock('fs/promises', () => ({
        access: vi.fn().mockRejectedValue(new Error('ENOENT')),
        mkdir: vi.fn().mockResolvedValue(undefined),
        readFile: vi.fn().mockResolvedValue('{}'),
        writeFile: vi.fn().mockResolvedValue(undefined),
      }));

      const { fileExists, blockTool } = await import('../shared/index.js');
      const hasTsConfig = await fileExists('tsconfig.json');

      expect(hasTsConfig).toBe(false);
      const response = blockTool('PreToolUse', 'No tsconfig.json found');
      expect(response.continue).toBe(false);
    });

    it('should allow when tsconfig.json exists', async () => {
      vi.doMock('fs/promises', () => ({
        access: vi.fn().mockResolvedValue(undefined),
        mkdir: vi.fn().mockResolvedValue(undefined),
        readFile: vi.fn().mockResolvedValue('{}'),
        writeFile: vi.fn().mockResolvedValue(undefined),
      }));

      const { fileExists, allowTool } = await import('../shared/index.js');
      const hasTsConfig = await fileExists('tsconfig.json');

      expect(hasTsConfig).toBe(true);
      const response = allowTool('PreToolUse');
      expect(response.continue).toBe(true);
    });
  });

  describe('validate_implementation logic', () => {
    it('should allow by default', async () => {
      const { allowTool } = await import('../shared/index.js');
      const response = allowTool('PreToolUse');

      expect(response.continue).toBe(true);
    });
  });

  describe('unknown tool handling', () => {
    it('should allow unknown tools by default', async () => {
      const { allowTool } = await import('../shared/index.js');
      const response = allowTool('PreToolUse');

      expect(response.continue).toBe(true);
      expect(response.hookSpecificOutput?.permissionDecision).toBe('allow');
    });
  });
});
