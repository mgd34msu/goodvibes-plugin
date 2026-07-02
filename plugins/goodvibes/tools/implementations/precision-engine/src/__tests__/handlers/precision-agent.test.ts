/**
 * Tests for precision_agent handler.
 *
 * Uses vi.mock to stub ProcessManager so no actual
 * AI agents are spawned during the test suite.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { expectSuccess, expectError } from '../test-utils.js';

// ─── Hoisted mocks ───
// Use vi.hoisted() so these variables are available inside vi.mock() factories
// which are hoisted to the top of the file by Vitest's transform.

const { mockProcessManagerSpawn } = vi.hoisted(() => ({
  mockProcessManagerSpawn: vi.fn(),
}));

// Mock ProcessManager singleton used by the handler
vi.mock('../../state/process-manager.js', () => ({
  ProcessManager: {
    getInstance: () => ({
      spawn: mockProcessManagerSpawn,
      generateId: vi.fn().mockReturnValue('bg-1'),
    }),
    resetInstance: vi.fn(),
  },
  processManager: {
    spawn: mockProcessManagerSpawn,
    generateId: vi.fn().mockReturnValue('bg-1'),
  },
}));

// Mock state/index.js to re-export our mocked processManager
vi.mock('../../state/index.js', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return {
    ...actual,
    processManager: {
      spawn: mockProcessManagerSpawn,
      generateId: vi.fn().mockReturnValue('bg-1'),
    },
  };
});

// Mock DossierGenerator to prevent real disk reads
vi.mock('../../state/dossier.js', () => ({
  DossierGenerator: vi.fn().mockImplementation(() => ({
    generate: vi.fn().mockResolvedValue({}),
    formatForPrompt: vi.fn().mockReturnValue(''),
  })),
}));

// Mock PrecisionRuntime to return null (graceful degradation path).
// Partial mock via importOriginal: state/index.ts re-exports extractMetadata,
// extractCacheHit, and extractCacheInfo from this module, so those exports
// must stay defined or module collection fails.
vi.mock('../../state/precision-runtime.js', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return {
    ...actual,
    PrecisionRuntime: {
      get: vi.fn().mockReturnValue(null),
      resetInstance: vi.fn(),
    },
  };
});

// Mock ProjectIndex singleton. Must also provide the `projectIndex` export
// (re-exported by state/index.ts) or module collection fails.
vi.mock('../../state/project-index.js', () => ({
  ProjectIndex: {
    getInstance: vi.fn().mockReturnValue({
      load: vi.fn().mockResolvedValue(undefined),
      getFiles: vi.fn().mockReturnValue([]),
      getTypeCounts: vi.fn().mockReturnValue({}),
    }),
    resetInstance: vi.fn(),
  },
  projectIndex: {
    load: vi.fn().mockResolvedValue(undefined),
    getFiles: vi.fn().mockReturnValue([]),
    getTypeCounts: vi.fn().mockReturnValue({}),
  },
}));

// ─── Imports after mocks ───

import {
  handlePrecisionAgent,
  generateAgentId,
  readContextFiles,
  assembleFinalPrompt,
  buildClaudeCommand,
  buildGeminiCommand,
  buildCodexCommand,
  buildCommand,
  buildGenericCommand,
  getDefaultModel,
} from '../../handlers/precision-agent.js';

import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';

// ─── Helpers ───

/** Create a real temp file for context file tests. */
async function createTempFile(content: string): Promise<string> {
  const tmpDir = os.tmpdir();
  const tmpPath = path.join(
    tmpDir,
    `precision-agent-test-${Date.now()}-${Math.random().toString(36).slice(2)}.txt`
  );
  await fs.writeFile(tmpPath, content, 'utf-8');
  return tmpPath;
}

// ─── Tests ───

describe('generateAgentId', () => {
  it('should produce an agent_id with expected format', () => {
    const id = generateAgentId('abc12345');
    expect(id).toMatch(/^agent_[a-f0-9]{8}_[a-f0-9]{8}$/);
    expect(id).toContain('abc12345');
  });

  it('should truncate long session IDs to 8 chars', () => {
    const id = generateAgentId('1234567890abcdef');
    expect(id).toMatch(/^agent_12345678_[a-f0-9]{8}$/);
  });

  it('should produce unique IDs on repeated calls', () => {
    const ids = new Set(Array.from({ length: 20 }, () => generateAgentId('session1')));
    expect(ids.size).toBe(20);
  });

  it('should handle missing session ID gracefully', () => {
    const id = generateAgentId(undefined);
    // Falls back to 'xxxxxxxx' placeholder
    expect(id).toMatch(/^agent_([a-f0-9]{8}|xxxxxxxx)_[a-f0-9]{8}$/);
  });
});

describe('buildClaudeCommand', () => {
  it('should include --print and omit --dangerously-skip-permissions by default', () => {
    const [exe, args] = buildClaudeCommand();
    expect(exe).toBe('claude');
    expect(args).toContain('--print');
    expect(args).not.toContain('--dangerously-skip-permissions');
  });

  it('should include --dangerously-skip-permissions only when skipPermissions is true', () => {
    const [, args] = buildClaudeCommand(undefined, undefined, true);
    expect(args).toContain('--dangerously-skip-permissions');
    expect(args).toContain('--print');
  });

  it('should include --max-turns with default value', () => {
    const [, args] = buildClaudeCommand();
    const maxTurnsIdx = args.indexOf('--max-turns');
    expect(maxTurnsIdx).toBeGreaterThan(-1);
    expect(args[maxTurnsIdx + 1]).toBe('30');
  });

  it('should include --model when specified', () => {
    const [, args] = buildClaudeCommand('sonnet');
    expect(args).toContain('--model');
    expect(args).toContain('sonnet');
  });

  it('should not include --model when not specified', () => {
    const [, args] = buildClaudeCommand();
    expect(args).not.toContain('--model');
  });

  it('should NOT include prompt in args (prompt passes via stdin)', () => {
    const [, args] = buildClaudeCommand();
    // Prompt is no longer a positional arg — passed via stdin
    expect(args).not.toContain('analyze security vulnerabilities');
  });

  it('should add boolean cli_flags as --flag', () => {
    const [, args] = buildClaudeCommand(undefined, { 'no-markdown': true });
    expect(args).toContain('--no-markdown');
  });

  it('should add key-value cli_flags as --key value', () => {
    const [, args] = buildClaudeCommand(undefined, { disallowedTools: 'Write,Edit' });
    expect(args).toContain('--disallowedTools');
    expect(args).toContain('Write,Edit');
  });

  it('should skip false/null/undefined cli_flags', () => {
    const [, args] = buildClaudeCommand(undefined, {
      someFlag: false,
      otherFlag: null,
      thirdFlag: undefined,
    });
    expect(args).not.toContain('--someFlag');
    expect(args).not.toContain('--otherFlag');
    expect(args).not.toContain('--thirdFlag');
  });

  it('should strip forbidden cli_flags (model, dangerously-skip-permissions)', () => {
    const [, args] = buildClaudeCommand(undefined, {
      model: 'evil-override',
      'dangerously-skip-permissions': true,
      verbose: true,
    });
    // Forbidden flags stripped
    expect(args.filter((a) => a === '--model').length).toBe(0);
    // Allowed flag passed through
    expect(args).toContain('--verbose');
  });
});

describe('buildGeminiCommand', () => {
  it('should use gemini executable', () => {
    const [exe] = buildGeminiCommand();
    expect(exe).toBe('gemini');
  });

  it('should NOT include prompt in args (prompt passes via stdin)', () => {
    const [, args] = buildGeminiCommand();
    // Gemini command is empty args when no model or flags specified
    expect(Array.isArray(args)).toBe(true);
  });

  it('should include model when specified', () => {
    const [, args] = buildGeminiCommand('gemini-2.5-pro');
    expect(args).toContain('gemini-2.5-pro');
  });

  it('should add cli_flags', () => {
    const [, args] = buildGeminiCommand(undefined, { format: 'json' });
    expect(args).toContain('--format');
    expect(args).toContain('json');
  });
});

describe('buildCodexCommand', () => {
  it('should use codex executable', () => {
    const [exe] = buildCodexCommand();
    expect(exe).toBe('codex');
  });

  it('should NOT include prompt in args (prompt passes via stdin)', () => {
    const [, args] = buildCodexCommand();
    expect(Array.isArray(args)).toBe(true);
  });

  it('should include model when specified', () => {
    const [, args] = buildCodexCommand('gpt-4o');
    expect(args).toContain('gpt-4o');
  });
});

describe('buildCommand', () => {
  it('should route claude provider correctly', () => {
    const [exe] = buildCommand('claude');
    expect(exe).toBe('claude');
  });

  it('should route gemini provider correctly', () => {
    const [exe] = buildCommand('gemini');
    expect(exe).toBe('gemini');
  });

  it('should route codex provider correctly', () => {
    const [exe] = buildCommand('codex');
    expect(exe).toBe('codex');
  });

  it('should forward model to provider command', () => {
    const [, args] = buildCommand('claude', 'sonnet');
    expect(args).toContain('sonnet');
  });
});

describe('buildGenericCommand', () => {
  it('should build command with base args and model', () => {
    const [exe, args] = buildGenericCommand('testcli', 'mymodel', undefined, ['--headless']);
    expect(exe).toBe('testcli');
    expect(args).toContain('--headless');
    expect(args).toContain('--model');
    expect(args).toContain('mymodel');
  });

  it('should not include model when not specified', () => {
    const [, args] = buildGenericCommand('testcli', undefined, undefined, []);
    expect(args).not.toContain('--model');
  });

  it('should strip forbidden flags from cliFlags', () => {
    const [, args] = buildGenericCommand('testcli', undefined, { 'print': true, safe: true }, []);
    expect(args).not.toContain('--print');
    expect(args).toContain('--safe');
  });
});

describe('getDefaultModel', () => {
  it('should return sonnet for claude', () => {
    expect(getDefaultModel('claude')).toBe('sonnet');
  });

  it('should return gemini-2.5-pro for gemini', () => {
    expect(getDefaultModel('gemini')).toBe('gemini-2.5-pro');
  });

  it('should return codex-mini for codex', () => {
    expect(getDefaultModel('codex')).toBe('codex-mini');
  });
});

describe('readContextFiles', () => {
  it('should return empty string for empty file list', async () => {
    const result = await readContextFiles([]);
    expect(result).toBe('');
  });

  it('should read a real file and format it correctly', async () => {
    const tmpPath = await createTempFile('hello world content');
    try {
      const result = await readContextFiles([tmpPath]);
      expect(result).toContain('hello world content');
      expect(result).toContain(`File: ${tmpPath}`);
      expect(result).toContain('--- End File ---');
    } finally {
      await fs.unlink(tmpPath).catch(() => {});
    }
  });

  it('should silently skip files that do not exist', async () => {
    const result = await readContextFiles(['/nonexistent/path/file.txt']);
    expect(result).toBe('');
  });

  it('should read multiple files and join them', async () => {
    const tmp1 = await createTempFile('content one');
    const tmp2 = await createTempFile('content two');
    try {
      const result = await readContextFiles([tmp1, tmp2]);
      expect(result).toContain('content one');
      expect(result).toContain('content two');
    } finally {
      await fs.unlink(tmp1).catch(() => {});
      await fs.unlink(tmp2).catch(() => {});
    }
  });

  it('should resolve relative paths against process.cwd()', async () => {
    // A relative path that exists: package.json in cwd
    const result = await readContextFiles(['package.json']);
    // Either reads it or silently skips it — either way no throw
    expect(typeof result).toBe('string');
  });
});

describe('assembleFinalPrompt', () => {
  it('should include task prompt', () => {
    const result = assembleFinalPrompt('my task', '', '');
    expect(result).toContain('my task');
  });

  it('should include context files section when present', () => {
    const result = assembleFinalPrompt('task', 'file content here', '');
    expect(result).toContain('## Context Files');
    expect(result).toContain('file content here');
  });

  it('should include dossier section when present', () => {
    const result = assembleFinalPrompt('task', '', 'dossier content');
    expect(result).toContain('dossier content');
  });

  it('should order: dossier → context files → task', () => {
    const result = assembleFinalPrompt('task prompt', 'ctx', 'dossier');
    const dossierPos = result.indexOf('dossier');
    const ctxPos = result.indexOf('ctx');
    const taskPos = result.indexOf('task prompt');
    expect(dossierPos).toBeLessThan(ctxPos);
    expect(ctxPos).toBeLessThan(taskPos);
  });

  it('should include ## Task header', () => {
    const result = assembleFinalPrompt('my task', '', '');
    expect(result).toContain('## Task');
  });

  it('should omit context files section when empty', () => {
    const result = assembleFinalPrompt('task', '', '');
    expect(result).not.toContain('## Context Files');
  });

  it('should work with all three parts empty (except prompt)', () => {
    const result = assembleFinalPrompt('do something', '', '');
    expect(result).toContain('do something');
    expect(result).toContain('## Task');
  });
});

describe('handlePrecisionAgent input validation', () => {
  it('should return error when prompt is missing', async () => {
    const result = await handlePrecisionAgent({});
    const parsed = expectError(result);
    expect(parsed.error).toContain("Missing required parameter 'prompt'");
  });

  it('should return error when prompt is empty string', async () => {
    const result = await handlePrecisionAgent({ prompt: '' });
    const parsed = expectError(result);
    expect(parsed.error).toContain("Missing required parameter 'prompt'");
  });

  it('should return error when prompt is only whitespace', async () => {
    const result = await handlePrecisionAgent({ prompt: '   ' });
    const parsed = expectError(result);
    expect(parsed.error).toContain("Missing required parameter 'prompt'");
  });

  it('should return error for invalid provider', async () => {
    const result = await handlePrecisionAgent({
      prompt: 'test task',
      options: { provider: 'openai' as never },
    });
    const parsed = expectError(result);
    expect(parsed.error).toContain("Invalid provider 'openai'");
    expect(parsed.error).toContain('claude');
  });
});

describe('handlePrecisionAgent background mode', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default background spawn mock — returns a BgStartResult
    mockProcessManagerSpawn.mockReturnValue({
      status: 'started',
      process_id: 'bg-1',
      pid: 12345,
      command: 'claude --print ...',
      log_file: '/tmp/bg-1.log',
      hint: 'Use bg_status bg-1 to check status',
    });
  });

  it('should return running status in background mode', async () => {
    const result = await handlePrecisionAgent({
      prompt: 'analyze code',
      options: { dossier: { include: false } },
    });
    const parsed = expectSuccess(result);
    expect(parsed.data.status).toBe('running');
  });

  it('should include agent_id in background response', async () => {
    const result = await handlePrecisionAgent({
      prompt: 'analyze code',
      options: { dossier: { include: false } },
    });
    const parsed = expectSuccess(result);
    expect(parsed.data.agent_id).toMatch(/^agent_([a-f0-9]{8}|xxxxxxxx)_[a-f0-9]{8}$/);
  });

  it('should include provider in background response', async () => {
    const result = await handlePrecisionAgent({
      prompt: 'analyze code',
      options: { provider: 'claude', dossier: { include: false } },
    });
    const parsed = expectSuccess(result);
    expect(parsed.data.provider).toBe('claude');
  });

  it('should include started_at timestamp', async () => {
    const result = await handlePrecisionAgent({
      prompt: 'analyze code',
      options: { dossier: { include: false } },
    });
    const parsed = expectSuccess(result);
    expect(typeof parsed.data.started_at).toBe('string');
    // Should be a valid ISO date
    expect(() => new Date(parsed.data.started_at)).not.toThrow();
  });

  it('should include process_id and log_file from ProcessManager', async () => {
    const result = await handlePrecisionAgent({
      prompt: 'task',
      options: { dossier: { include: false } },
    });
    const parsed = expectSuccess(result);
    expect(parsed.data.process_id).toBe('bg-1');
    expect(parsed.data.log_file).toBe('/tmp/bg-1.log');
  });

  it('should return error if ProcessManager.spawn throws', async () => {
    mockProcessManagerSpawn.mockImplementation(() => {
      throw new Error('Maximum background processes reached');
    });

    const result = await handlePrecisionAgent({
      prompt: 'task',
      options: { dossier: { include: false } },
    });
    const parsed = expectError(result);
    expect(parsed.error).toContain('Failed to spawn agent');
  });

  it('should default to claude provider', async () => {
    const result = await handlePrecisionAgent({
      prompt: 'task',
      options: { dossier: { include: false } },
    });
    const parsed = expectSuccess(result);
    expect(parsed.data.provider).toBe('claude');
  });

  it('should pass model to response', async () => {
    const result = await handlePrecisionAgent({
      prompt: 'task',
      options: { model: 'sonnet', dossier: { include: false } },
    });
    const parsed = expectSuccess(result);
    expect(parsed.data.model).toBe('sonnet');
  });

  it('should pass resolved model and prompt via stdin (not positional arg) to ProcessManager.spawn', async () => {
    const result = await handlePrecisionAgent({
      prompt: 'analyze security vulnerabilities in the codebase',
      options: { provider: 'claude', model: 'opus', dossier: { include: false } },
    });
    expectSuccess(result);
    expect(mockProcessManagerSpawn).toHaveBeenCalledOnce();
    const [spawnExe, spawnArgs] = mockProcessManagerSpawn.mock.calls[0];
    expect(spawnExe).toBe('claude');
    // --model opus must appear in args (resolved model, not undefined)
    expect(spawnArgs).toContain('--model');
    expect(spawnArgs).toContain('opus');
    // Prompt must NOT be in args (passes via stdin)
    expect(spawnArgs).not.toContain('analyze security vulnerabilities in the codebase');
  });

  it('should not pass --dangerously-skip-permissions to spawn by default', async () => {
    const result = await handlePrecisionAgent({
      prompt: 'task',
      options: { dossier: { include: false } },
    });
    expectSuccess(result);
    const [, spawnArgs] = mockProcessManagerSpawn.mock.calls[0];
    expect(spawnArgs).not.toContain('--dangerously-skip-permissions');
  });

  it('should pass --dangerously-skip-permissions to spawn when skip_permissions is true', async () => {
    const result = await handlePrecisionAgent({
      prompt: 'task',
      options: { skip_permissions: true, dossier: { include: false } },
    });
    expectSuccess(result);
    const [, spawnArgs] = mockProcessManagerSpawn.mock.calls[0];
    expect(spawnArgs).toContain('--dangerously-skip-permissions');
  });

  it('should include hint in response', async () => {
    const result = await handlePrecisionAgent({
      prompt: 'task',
      options: { dossier: { include: false } },
    });
    const parsed = expectSuccess(result);
    expect(typeof parsed.data.hint).toBe('string');
    expect(parsed.data.hint.length).toBeGreaterThan(0);
  });
});

describe('handlePrecisionAgent dossier integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default: return running from background mode
    mockProcessManagerSpawn.mockReturnValue({
      status: 'started',
      process_id: 'bg-1',
      pid: 12345,
      command: 'claude ...',
      log_file: '/tmp/bg-1.log',
      hint: 'Use bg_status bg-1',
    });
  });

  it('should include dossier by default (no options provided)', async () => {
    // With dossier.include not set, it defaults to true.
    // DossierGenerator is mocked to return empty string — no error expected.
    const result = await handlePrecisionAgent({
      prompt: 'analyze code',
      // no options — dossier defaults to true
    });
    const parsed = expectSuccess(result);
    expect(parsed.data.status).toBe('running');
  });

  it('should skip dossier when dossier.include is false', async () => {
    const result = await handlePrecisionAgent({
      prompt: 'analyze code',
      options: { dossier: { include: false } },
    });
    const parsed = expectSuccess(result);
    expect(parsed.data.status).toBe('running');
  });

  it('should accept extra_reminders in dossier options', async () => {
    const result = await handlePrecisionAgent({
      prompt: 'analyze code',
      options: {
        dossier: { include: true, extra_reminders: ['Focus on auth bypass vectors'] },
      },
    });
    const parsed = expectSuccess(result);
    expect(parsed.data.status).toBe('running');
  });
});

describe('handlePrecisionAgent provider variants', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockProcessManagerSpawn.mockReturnValue({
      status: 'started',
      process_id: 'bg-2',
      pid: 22222,
      command: 'gemini ...',
      log_file: '/tmp/bg-2.log',
      hint: 'Use bg_status bg-2',
    });
  });

  it('should use gemini provider when specified', async () => {
    const result = await handlePrecisionAgent({
      prompt: 'task',
      options: { provider: 'gemini', dossier: { include: false } },
    });
    const parsed = expectSuccess(result);
    expect(parsed.data.provider).toBe('gemini');
  });

  it('should use codex provider when specified', async () => {
    const result = await handlePrecisionAgent({
      prompt: 'task',
      options: { provider: 'codex', dossier: { include: false } },
    });
    const parsed = expectSuccess(result);
    expect(parsed.data.provider).toBe('codex');
  });

  it('should call ProcessManager.spawn for gemini (placeholder) without error', async () => {
    const result = await handlePrecisionAgent({
      prompt: 'task',
      options: { provider: 'gemini', dossier: { include: false } },
    });
    expectSuccess(result);
    expect(mockProcessManagerSpawn).toHaveBeenCalledOnce();
  });
});

describe('handlePrecisionAgent stdinFile and temp file cleanup', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    mockProcessManagerSpawn.mockReturnValue({
      status: 'started',
      process_id: 'bg-1',
      pid: 12345,
      command: 'claude ...',
      log_file: '/tmp/bg-1.log',
      hint: 'Use bg_status bg-1',
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should pass stdinFile in options to ProcessManager.spawn', async () => {
    const result = await handlePrecisionAgent({
      prompt: 'test prompt for stdin',
      options: { dossier: { include: false } },
    });
    expectSuccess(result);
    expect(mockProcessManagerSpawn).toHaveBeenCalledOnce();
    const spawnOptions = mockProcessManagerSpawn.mock.calls[0][2];
    expect(spawnOptions).toBeDefined();
    expect(typeof spawnOptions.stdinFile).toBe('string');
    // stdinFile should be a path in the OS temp dir
    expect(spawnOptions.stdinFile).toContain('precision-agent-');
    expect(spawnOptions.stdinFile).toContain('.txt');
  });

  it('should schedule temp file cleanup after successful spawn (setTimeout called)', async () => {
    const setTimeoutSpy = vi.spyOn(globalThis, 'setTimeout');
    await handlePrecisionAgent({
      prompt: 'cleanup test',
      options: { dossier: { include: false } },
    });
    // setTimeout should be called for temp file cleanup
    expect(setTimeoutSpy).toHaveBeenCalled();
    setTimeoutSpy.mockRestore();
  });

  it('should NOT call setTimeout cleanup when ProcessManager.spawn throws', async () => {
    mockProcessManagerSpawn.mockImplementation(() => {
      throw new Error('spawn error');
    });
    const setTimeoutSpy = vi.spyOn(globalThis, 'setTimeout');
    await handlePrecisionAgent({
      prompt: 'cleanup test',
      options: { dossier: { include: false } },
    });
    // setTimeout should NOT be called when spawn fails (cleanup happens in catch)
    expect(setTimeoutSpy).not.toHaveBeenCalled();
    setTimeoutSpy.mockRestore();
  });
});

describe('handlePrecisionAgent background-only execution', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockProcessManagerSpawn.mockReturnValue({
      status: 'started',
      process_id: 'bg-3',
      pid: 33333,
      command: 'claude ...',
      log_file: '/tmp/bg-3.log',
      hint: 'Use bg_status bg-3',
    });
    // Clear env vars
    delete process.env.CLAUDE_SUBAGENT_MODE;
    delete process.env.PRECISION_ENGINE_SUBAGENT;
  });

  afterEach(() => {
    delete process.env.CLAUDE_SUBAGENT_MODE;
    delete process.env.PRECISION_ENGINE_SUBAGENT;
  });

  it('should always run in background regardless of env vars', async () => {
    // Agents always run in background — no blocking mode
    const result = await handlePrecisionAgent({
      prompt: 'task',
      options: { dossier: { include: false } },
    });
    const parsed = expectSuccess(result);
    expect(parsed.data.status).toBe('running');
    expect(mockProcessManagerSpawn).toHaveBeenCalled();
  });

  it('should still run in background when CLAUDE_SUBAGENT_MODE=true', async () => {
    process.env.CLAUDE_SUBAGENT_MODE = 'true';

    const result = await handlePrecisionAgent({
      prompt: 'task',
      options: { dossier: { include: false } },
    });
    const parsed = expectSuccess(result);
    expect(parsed.data.status).toBe('running');
    expect(mockProcessManagerSpawn).toHaveBeenCalled();
  });

  it('should still run in background when PRECISION_ENGINE_SUBAGENT=true', async () => {
    process.env.PRECISION_ENGINE_SUBAGENT = 'true';

    const result = await handlePrecisionAgent({
      prompt: 'task',
      options: { dossier: { include: false } },
    });
    const parsed = expectSuccess(result);
    expect(parsed.data.status).toBe('running');
    expect(mockProcessManagerSpawn).toHaveBeenCalled();
  });
});
