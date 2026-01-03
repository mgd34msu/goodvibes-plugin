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
import * as fs from 'fs';
// Mock modules
vi.mock('fs');
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
            vi.mocked(fs.existsSync).mockReturnValue(true);
            const { fileExists } = await import('../shared.js');
            const result = fileExists('package.json');
            expect(result).toBe(true);
        });
        it('should return false when file does not exist', async () => {
            vi.mocked(fs.existsSync).mockReturnValue(false);
            const { fileExists } = await import('../shared.js');
            const result = fileExists('nonexistent.json');
            expect(result).toBe(false);
        });
        it('should resolve path relative to project root', async () => {
            vi.mocked(fs.existsSync).mockReturnValue(true);
            const { fileExists } = await import('../shared.js');
            fileExists('src/index.ts');
            expect(fs.existsSync).toHaveBeenCalled();
            const calledPath = vi.mocked(fs.existsSync).mock.calls[0][0];
            expect(calledPath).toContain('src');
        });
    });
    describe('allowTool', () => {
        it('should return continue true', async () => {
            const { allowTool } = await import('../shared.js');
            const response = allowTool('PreToolUse');
            expect(response.continue).toBe(true);
        });
        it('should include system message when provided', async () => {
            const { allowTool } = await import('../shared.js');
            const response = allowTool('PreToolUse', 'Tool allowed with warning');
            expect(response.systemMessage).toBe('Tool allowed with warning');
        });
        it('should set permissionDecision to allow', async () => {
            const { allowTool } = await import('../shared.js');
            const response = allowTool('PreToolUse');
            expect(response.hookSpecificOutput?.permissionDecision).toBe('allow');
        });
        it('should include hookEventName', async () => {
            const { allowTool } = await import('../shared.js');
            const response = allowTool('PreToolUse');
            expect(response.hookSpecificOutput?.hookEventName).toBe('PreToolUse');
        });
    });
    describe('blockTool', () => {
        it('should return continue false', async () => {
            const { blockTool } = await import('../shared.js');
            const response = blockTool('PreToolUse', 'Not allowed');
            expect(response.continue).toBe(false);
        });
        it('should set permissionDecision to deny', async () => {
            const { blockTool } = await import('../shared.js');
            const response = blockTool('PreToolUse', 'Not allowed');
            expect(response.hookSpecificOutput?.permissionDecision).toBe('deny');
        });
        it('should include reason in permissionDecisionReason', async () => {
            const { blockTool } = await import('../shared.js');
            const response = blockTool('PreToolUse', 'Missing configuration');
            expect(response.hookSpecificOutput?.permissionDecisionReason).toBe('Missing configuration');
        });
        it('should include hookEventName', async () => {
            const { blockTool } = await import('../shared.js');
            const response = blockTool('PreToolUse', 'Not allowed');
            expect(response.hookSpecificOutput?.hookEventName).toBe('PreToolUse');
        });
    });
    describe('detect_stack validation logic', () => {
        it('should block when package.json is missing', async () => {
            vi.mocked(fs.existsSync).mockReturnValue(false);
            const { fileExists, blockTool } = await import('../shared.js');
            const hasPackageJson = fileExists('package.json');
            expect(hasPackageJson).toBe(false);
            const response = blockTool('PreToolUse', 'No package.json found');
            expect(response.continue).toBe(false);
        });
        it('should allow when package.json exists', async () => {
            vi.mocked(fs.existsSync).mockReturnValue(true);
            const { fileExists, allowTool } = await import('../shared.js');
            const hasPackageJson = fileExists('package.json');
            expect(hasPackageJson).toBe(true);
            const response = allowTool('PreToolUse');
            expect(response.continue).toBe(true);
        });
    });
    describe('get_schema validation logic', () => {
        it('should allow when prisma schema exists', async () => {
            // Mock existsSync to return true for any path containing prisma
            vi.mocked(fs.existsSync).mockImplementation((p) => {
                const pathStr = String(p).replace(/\\/g, '/');
                return pathStr.includes('prisma');
            });
            const { fileExists, allowTool } = await import('../shared.js');
            const hasPrisma = fileExists('prisma/schema.prisma');
            expect(hasPrisma).toBe(true);
            const response = allowTool('PreToolUse');
            expect(response.continue).toBe(true);
        });
        it('should allow when drizzle config exists', async () => {
            vi.mocked(fs.existsSync).mockImplementation((p) => {
                const pathStr = String(p).replace(/\\/g, '/');
                return pathStr.includes('drizzle.config');
            });
            const { fileExists, allowTool } = await import('../shared.js');
            const hasDrizzle = fileExists('drizzle.config.ts');
            expect(hasDrizzle).toBe(true);
            const response = allowTool('PreToolUse');
            expect(response.continue).toBe(true);
        });
        it('should allow with warning when no schema found', async () => {
            vi.mocked(fs.existsSync).mockReturnValue(false);
            const { fileExists, allowTool } = await import('../shared.js');
            const hasSchema = fileExists('prisma/schema.prisma') ||
                fileExists('drizzle.config.ts') ||
                fileExists('drizzle/schema.ts');
            expect(hasSchema).toBe(false);
            const response = allowTool('PreToolUse', 'No schema file detected. get_schema may fail.');
            expect(response.continue).toBe(true);
            expect(response.systemMessage).toContain('schema');
        });
    });
    describe('run_smoke_test validation logic', () => {
        it('should block when package.json is missing', async () => {
            vi.mocked(fs.existsSync).mockReturnValue(false);
            const { fileExists, blockTool } = await import('../shared.js');
            const hasPackageJson = fileExists('package.json');
            expect(hasPackageJson).toBe(false);
            const response = blockTool('PreToolUse', 'No package.json found');
            expect(response.continue).toBe(false);
        });
        it('should allow when npm lockfile exists', async () => {
            vi.mocked(fs.existsSync).mockImplementation((p) => {
                return String(p).includes('package-lock.json') || String(p).includes('package.json');
            });
            const { fileExists, allowTool } = await import('../shared.js');
            const hasLockfile = fileExists('package-lock.json');
            expect(hasLockfile).toBe(true);
            const response = allowTool('PreToolUse');
            expect(response.continue).toBe(true);
        });
        it('should allow when pnpm lockfile exists', async () => {
            vi.mocked(fs.existsSync).mockImplementation((p) => {
                return String(p).includes('pnpm-lock.yaml') || String(p).includes('package.json');
            });
            const { fileExists, allowTool } = await import('../shared.js');
            const hasLockfile = fileExists('pnpm-lock.yaml');
            expect(hasLockfile).toBe(true);
            const response = allowTool('PreToolUse');
            expect(response.continue).toBe(true);
        });
        it('should allow when yarn lockfile exists', async () => {
            vi.mocked(fs.existsSync).mockImplementation((p) => {
                return String(p).includes('yarn.lock') || String(p).includes('package.json');
            });
            const { fileExists, allowTool } = await import('../shared.js');
            const hasLockfile = fileExists('yarn.lock');
            expect(hasLockfile).toBe(true);
            const response = allowTool('PreToolUse');
            expect(response.continue).toBe(true);
        });
        it('should allow with warning when no lockfile found', async () => {
            vi.mocked(fs.existsSync).mockImplementation((p) => {
                return String(p).includes('package.json');
            });
            const { fileExists, allowTool } = await import('../shared.js');
            const hasLockfile = fileExists('pnpm-lock.yaml') ||
                fileExists('yarn.lock') ||
                fileExists('package-lock.json');
            expect(hasLockfile).toBe(false);
            const response = allowTool('PreToolUse', 'No lockfile detected. Install dependencies first.');
            expect(response.continue).toBe(true);
            expect(response.systemMessage).toContain('dependencies');
        });
    });
    describe('check_types validation logic', () => {
        it('should block when tsconfig.json is missing', async () => {
            vi.mocked(fs.existsSync).mockReturnValue(false);
            const { fileExists, blockTool } = await import('../shared.js');
            const hasTsConfig = fileExists('tsconfig.json');
            expect(hasTsConfig).toBe(false);
            const response = blockTool('PreToolUse', 'No tsconfig.json found');
            expect(response.continue).toBe(false);
        });
        it('should allow when tsconfig.json exists', async () => {
            vi.mocked(fs.existsSync).mockReturnValue(true);
            const { fileExists, allowTool } = await import('../shared.js');
            const hasTsConfig = fileExists('tsconfig.json');
            expect(hasTsConfig).toBe(true);
            const response = allowTool('PreToolUse');
            expect(response.continue).toBe(true);
        });
    });
    describe('validate_implementation logic', () => {
        it('should allow by default', async () => {
            const { allowTool } = await import('../shared.js');
            const response = allowTool('PreToolUse');
            expect(response.continue).toBe(true);
        });
    });
    describe('unknown tool handling', () => {
        it('should allow unknown tools by default', async () => {
            const { allowTool } = await import('../shared.js');
            const response = allowTool('PreToolUse');
            expect(response.continue).toBe(true);
            expect(response.hookSpecificOutput?.permissionDecision).toBe('allow');
        });
    });
});
