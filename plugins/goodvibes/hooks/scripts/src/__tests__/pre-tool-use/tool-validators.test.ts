/**
 * Tests for pre-tool-use/tool-validators.ts
 * Target: 100% line and branch coverage
 */

import path from 'node:path';

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import {
  validateDetectStack,
  validateGetSchema,
  validateRunSmokeTest,
  validateCheckTypes,
  validateImplementation,
  TOOL_VALIDATORS,
} from '../../pre-tool-use/tool-validators.js';
import { fileExists } from '../../shared/file-utils.js';
import { respond, allowTool, blockTool } from '../../shared/hook-io.js';

import type { HookInput } from '../../shared/hook-io.js';

// Mock dependencies
vi.mock('../../shared/hook-io.js');
vi.mock('../../shared/file-utils.js');

const mockedRespond = vi.mocked(respond);
const mockedAllowTool = vi.mocked(allowTool);
const mockedBlockTool = vi.mocked(blockTool);
const mockedFileExists = vi.mocked(fileExists);

describe('tool-validators', () => {
  let mockInput: HookInput;

  beforeEach(() => {
    mockInput = {
      session_id: 'test-session',
      transcript_path: '/path/to/transcript',
      cwd: '/test/project',
      permission_mode: 'default',
      hook_event_name: 'PreToolUse',
      tool_name: 'detect_stack',
      tool_input: {},
    };

    vi.clearAllMocks();

    mockedAllowTool.mockReturnValue({
      continue: true,
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision: 'allow',
      },
    });

    mockedBlockTool.mockReturnValue({
      continue: false,
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision: 'deny',
      },
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('validateDetectStack', () => {
    it('should allow when package.json exists', async () => {
      mockedFileExists.mockResolvedValue(true);

      await validateDetectStack(mockInput);

      expect(mockedFileExists).toHaveBeenCalledWith(path.join('/test/project', 'package.json'));
      expect(mockedAllowTool).toHaveBeenCalledWith('PreToolUse');
      expect(mockedRespond).toHaveBeenCalledWith(
        expect.objectContaining({ continue: true })
      );
    });

    it('should block when package.json does not exist', async () => {
      mockedFileExists.mockResolvedValue(false);

      await validateDetectStack(mockInput);

      expect(mockedBlockTool).toHaveBeenCalledWith(
        'PreToolUse',
        'No package.json found in project root. Cannot detect stack.'
      );
      expect(mockedRespond).toHaveBeenCalledWith(
        expect.objectContaining({ continue: false }),
        true
      );
    });

    it('should use process.cwd() when input.cwd is undefined', async () => {
      const inputNoCwd = { ...mockInput, cwd: undefined };
      const originalCwd = process.cwd();
      mockedFileExists.mockResolvedValue(true);

      await validateDetectStack(inputNoCwd);

      expect(mockedFileExists).toHaveBeenCalledWith(path.join(originalCwd, 'package.json'));
    });
  });

  describe('validateGetSchema', () => {
    it('should allow when Prisma schema exists', async () => {
      mockedFileExists
        .mockResolvedValueOnce(true) // prisma/schema.prisma
        .mockResolvedValueOnce(false)
        .mockResolvedValueOnce(false);

      await validateGetSchema(mockInput);

      expect(mockedFileExists).toHaveBeenCalledWith(
        path.join('/test/project', 'prisma/schema.prisma')
      );
      expect(mockedAllowTool).toHaveBeenCalledWith('PreToolUse');
    });

    it('should allow when Drizzle config exists', async () => {
      mockedFileExists
        .mockResolvedValueOnce(false)
        .mockResolvedValueOnce(true) // drizzle.config.ts
        .mockResolvedValueOnce(false);

      await validateGetSchema(mockInput);

      expect(mockedFileExists).toHaveBeenCalledWith(
        path.join('/test/project', 'drizzle.config.ts')
      );
      expect(mockedAllowTool).toHaveBeenCalledWith('PreToolUse');
    });

    it('should allow when Drizzle schema exists', async () => {
      mockedFileExists
        .mockResolvedValueOnce(false)
        .mockResolvedValueOnce(false)
        .mockResolvedValueOnce(true); // drizzle/schema.ts

      await validateGetSchema(mockInput);

      expect(mockedFileExists).toHaveBeenCalledWith(
        path.join('/test/project', 'drizzle/schema.ts')
      );
      expect(mockedAllowTool).toHaveBeenCalledWith('PreToolUse');
    });

    it('should allow with warning when no schema file exists', async () => {
      mockedFileExists
        .mockResolvedValueOnce(false)
        .mockResolvedValueOnce(false)
        .mockResolvedValueOnce(false);

      await validateGetSchema(mockInput);

      expect(mockedAllowTool).toHaveBeenCalledWith(
        'PreToolUse',
        'No schema file detected. get_schema may fail.'
      );
      expect(mockedRespond).toHaveBeenCalledWith(
        expect.objectContaining({ continue: true })
      );
    });

    it('should use process.cwd() when input.cwd is undefined', async () => {
      const inputNoCwd = { ...mockInput, cwd: undefined };
      const originalCwd = process.cwd();
      mockedFileExists.mockResolvedValue(false);

      await validateGetSchema(inputNoCwd);

      expect(mockedFileExists).toHaveBeenCalledWith(
        path.join(originalCwd, 'prisma/schema.prisma')
      );
    });
  });

  describe('validateRunSmokeTest', () => {
    it('should block when package.json does not exist', async () => {
      mockedFileExists.mockResolvedValue(false);

      await validateRunSmokeTest(mockInput);

      expect(mockedBlockTool).toHaveBeenCalledWith(
        'PreToolUse',
        'No package.json found. Cannot run smoke tests.'
      );
      expect(mockedRespond).toHaveBeenCalledWith(
        expect.objectContaining({ continue: false }),
        true
      );
    });

    it('should allow when pnpm-lock.yaml exists', async () => {
      mockedFileExists
        .mockResolvedValueOnce(true) // package.json
        .mockResolvedValueOnce(true) // pnpm-lock.yaml
        .mockResolvedValueOnce(false)
        .mockResolvedValueOnce(false);

      await validateRunSmokeTest(mockInput);

      expect(mockedAllowTool).toHaveBeenCalledWith('PreToolUse');
    });

    it('should allow when yarn.lock exists', async () => {
      mockedFileExists
        .mockResolvedValueOnce(true) // package.json
        .mockResolvedValueOnce(false)
        .mockResolvedValueOnce(true) // yarn.lock
        .mockResolvedValueOnce(false);

      await validateRunSmokeTest(mockInput);

      expect(mockedAllowTool).toHaveBeenCalledWith('PreToolUse');
    });

    it('should allow when package-lock.json exists', async () => {
      mockedFileExists
        .mockResolvedValueOnce(true) // package.json
        .mockResolvedValueOnce(false)
        .mockResolvedValueOnce(false)
        .mockResolvedValueOnce(true); // package-lock.json

      await validateRunSmokeTest(mockInput);

      expect(mockedAllowTool).toHaveBeenCalledWith('PreToolUse');
    });

    it('should warn when no lockfile exists', async () => {
      mockedFileExists
        .mockResolvedValueOnce(true) // package.json
        .mockResolvedValueOnce(false)
        .mockResolvedValueOnce(false)
        .mockResolvedValueOnce(false);

      await validateRunSmokeTest(mockInput);

      expect(mockedAllowTool).toHaveBeenCalledWith(
        'PreToolUse',
        'No lockfile detected. Install dependencies first.'
      );
    });

    it('should use process.cwd() when input.cwd is undefined', async () => {
      const inputNoCwd = { ...mockInput, cwd: undefined };
      const originalCwd = process.cwd();
      mockedFileExists.mockResolvedValue(false);

      await validateRunSmokeTest(inputNoCwd);

      expect(mockedFileExists).toHaveBeenCalledWith(path.join(originalCwd, 'package.json'));
    });
  });

  describe('validateCheckTypes', () => {
    it('should allow when tsconfig.json exists', async () => {
      mockedFileExists.mockResolvedValue(true);

      await validateCheckTypes(mockInput);

      expect(mockedFileExists).toHaveBeenCalledWith(path.join('/test/project', 'tsconfig.json'));
      expect(mockedAllowTool).toHaveBeenCalledWith('PreToolUse');
    });

    it('should block when tsconfig.json does not exist', async () => {
      mockedFileExists.mockResolvedValue(false);

      await validateCheckTypes(mockInput);

      expect(mockedBlockTool).toHaveBeenCalledWith(
        'PreToolUse',
        'No tsconfig.json found. TypeScript not configured.'
      );
      expect(mockedRespond).toHaveBeenCalledWith(
        expect.objectContaining({ continue: false }),
        true
      );
    });

    it('should use process.cwd() when input.cwd is undefined', async () => {
      const inputNoCwd = { ...mockInput, cwd: undefined };
      const originalCwd = process.cwd();
      mockedFileExists.mockResolvedValue(true);

      await validateCheckTypes(inputNoCwd);

      expect(mockedFileExists).toHaveBeenCalledWith(path.join(originalCwd, 'tsconfig.json'));
    });
  });

  describe('validateImplementation', () => {
    it('should always allow', async () => {
      await validateImplementation(mockInput);

      expect(mockedAllowTool).toHaveBeenCalledWith('PreToolUse');
      expect(mockedRespond).toHaveBeenCalledWith(
        expect.objectContaining({ continue: true })
      );
    });
  });

  describe('TOOL_VALIDATORS', () => {
    it('should export validators for all tools', () => {
      expect(TOOL_VALIDATORS).toHaveProperty('detect_stack');
      expect(TOOL_VALIDATORS).toHaveProperty('get_schema');
      expect(TOOL_VALIDATORS).toHaveProperty('run_smoke_test');
      expect(TOOL_VALIDATORS).toHaveProperty('check_types');
      expect(TOOL_VALIDATORS).toHaveProperty('validate_implementation');
    });

    it('should map detect_stack to validateDetectStack', () => {
      expect(TOOL_VALIDATORS.detect_stack).toBe(validateDetectStack);
    });

    it('should map get_schema to validateGetSchema', () => {
      expect(TOOL_VALIDATORS.get_schema).toBe(validateGetSchema);
    });

    it('should map run_smoke_test to validateRunSmokeTest', () => {
      expect(TOOL_VALIDATORS.run_smoke_test).toBe(validateRunSmokeTest);
    });

    it('should map check_types to validateCheckTypes', () => {
      expect(TOOL_VALIDATORS.check_types).toBe(validateCheckTypes);
    });

    it('should map validate_implementation to validateImplementation', () => {
      expect(TOOL_VALIDATORS.validate_implementation).toBe(
        validateImplementation
      );
    });
  });
});
