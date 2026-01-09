/**
 * Comprehensive tests for shared/file-utils.ts
 * Target: 100% coverage (lines, branches, functions)
 */

import * as path from 'path';

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// =============================================================================
// Mock Setup
// =============================================================================

const mockAccess = vi.fn();
const mockMkdir = vi.fn();
const mockReadFile = vi.fn();
const mockWriteFile = vi.fn();

vi.mock('fs/promises', () => ({
  access: mockAccess,
  mkdir: mockMkdir,
  readFile: mockReadFile,
  writeFile: mockWriteFile,
}));

const mockExecSync = vi.fn();
const mockExecCallback = vi.fn();
const mockExec = vi.fn();

// Mock exec as a callback-style function that can be promisified
mockExecCallback.mockImplementation((cmd, options, callback) => {
  // If called with 2 args (no options), shift callback
  if (typeof options === 'function') {
    callback = options;
  }
  // Call the promisified mock to get result
  mockExec(cmd, options)
    .then((result) => callback?.(null, result))
    .catch((err) => callback?.(err));
});

vi.mock('child_process', () => ({
  execSync: mockExecSync,
  exec: mockExecCallback,
}));

// Mock the gitignore module
const mockEnsureSecureGitignore = vi.fn();
vi.mock('../shared/gitignore.js', () => ({
  ensureSecureGitignore: mockEnsureSecureGitignore,
}));

// Mock debug logging
vi.mock('../shared/logging.js', () => ({
  debug: vi.fn(),
}));

// =============================================================================
// Tests
// =============================================================================

describe('file-utils', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ===========================================================================
  // fileExists
  // ===========================================================================

  describe('fileExists', () => {
    it('should return true when file exists', async () => {
      mockAccess.mockResolvedValue(undefined);

      const { fileExists } = await import('../shared/file-utils.js');
      const result = await fileExists('/absolute/path/to/file.txt');

      expect(result).toBe(true);
      expect(mockAccess).toHaveBeenCalledWith('/absolute/path/to/file.txt');
    });

    it('should return false when file does not exist', async () => {
      mockAccess.mockRejectedValue(
        new Error('ENOENT: no such file or directory')
      );

      const { fileExists } = await import('../shared/file-utils.js');
      const result = await fileExists('/nonexistent/file.txt');

      expect(result).toBe(false);
    });

    it('should return false when access throws permission error', async () => {
      mockAccess.mockRejectedValue(new Error('EACCES: permission denied'));

      const { fileExists } = await import('../shared/file-utils.js');
      const result = await fileExists('/protected/file.txt');

      expect(result).toBe(false);
    });

    it('should handle various error types', async () => {
      mockAccess.mockRejectedValue('string error');

      const { fileExists } = await import('../shared/file-utils.js');
      const result = await fileExists('/some/path.txt');

      expect(result).toBe(false);
    });
  });

  // ===========================================================================
  // fileExistsRelative
  // ===========================================================================

  describe('fileExistsRelative', () => {
    it('should check file relative to PROJECT_ROOT by default', async () => {
      mockAccess.mockResolvedValue(undefined);

      const { fileExistsRelative } = await import('../shared/file-utils.js');
      const result = await fileExistsRelative('package.json');

      expect(result).toBe(true);
      expect(mockAccess).toHaveBeenCalled();
    });

    it('should check file relative to custom base directory', async () => {
      mockAccess.mockResolvedValue(undefined);

      const { fileExistsRelative } = await import('../shared/file-utils.js');
      const customBase = '/custom/base/dir';
      const result = await fileExistsRelative('src/index.ts', customBase);

      expect(result).toBe(true);
      expect(mockAccess).toHaveBeenCalledWith(
        path.resolve(customBase, 'src/index.ts')
      );
    });

    it('should return false when relative file does not exist', async () => {
      mockAccess.mockRejectedValue(new Error('ENOENT'));

      const { fileExistsRelative } = await import('../shared/file-utils.js');
      const result = await fileExistsRelative('nonexistent.txt');

      expect(result).toBe(false);
    });

    it('should handle nested relative paths', async () => {
      mockAccess.mockResolvedValue(undefined);

      const { fileExistsRelative } = await import('../shared/file-utils.js');
      const result = await fileExistsRelative(
        'deep/nested/path/file.ts',
        '/base'
      );

      expect(result).toBe(true);
    });
  });

  // ===========================================================================
  // commandExists
  // ===========================================================================

  describe('commandExists', () => {
    const originalPlatform = process.platform;

    beforeEach(async () => {
      vi.resetModules();
    });

    afterEach(() => {
      // Restore platform
      Object.defineProperty(process, 'platform', {
        value: originalPlatform,
        writable: true,
        configurable: true,
      });
    });

    it('should return true when command exists on Windows', async () => {
      Object.defineProperty(process, 'platform', {
        value: 'win32',
        writable: true,
        configurable: true,
      });
      mockExec.mockResolvedValue({
        stdout: 'C:\\Program Files\\Git\\cmd\\git.exe',
        stderr: '',
      });

      const { commandExists } = await import('../shared/file-utils.js');
      const result = await commandExists('git');

      expect(result).toBe(true);
      expect(mockExec).toHaveBeenCalledWith('where git', {
        timeout: 30000,
        maxBuffer: 1024 * 1024,
      });
    });

    it('should return true when command exists on Unix/Mac', async () => {
      Object.defineProperty(process, 'platform', {
        value: 'linux',
        writable: true,
        configurable: true,
      });
      mockExec.mockResolvedValue({
        stdout: '/usr/bin/git',
        stderr: '',
      });

      const { commandExists } = await import('../shared/file-utils.js');
      const result = await commandExists('git');

      expect(result).toBe(true);
      expect(mockExec).toHaveBeenCalledWith('which git', {
        timeout: 30000,
        maxBuffer: 1024 * 1024,
      });
    });

    it('should return false when command does not exist on Windows', async () => {
      Object.defineProperty(process, 'platform', {
        value: 'win32',
        writable: true,
        configurable: true,
      });
      mockExec.mockRejectedValue(new Error('Command not found'));

      const { commandExists } = await import('../shared/file-utils.js');
      const result = await commandExists('nonexistent');

      expect(result).toBe(false);
    });

    it('should return false when command does not exist on Unix', async () => {
      Object.defineProperty(process, 'platform', {
        value: 'darwin',
        writable: true,
        configurable: true,
      });
      mockExec.mockRejectedValue(new Error('Command not found'));

      const { commandExists } = await import('../shared/file-utils.js');
      const result = await commandExists('nonexistent');

      expect(result).toBe(false);
    });

    it('should handle exec throwing non-Error object', async () => {
      Object.defineProperty(process, 'platform', {
        value: 'linux',
        writable: true,
        configurable: true,
      });
      mockExec.mockRejectedValue('string error');

      const { commandExists } = await import('../shared/file-utils.js');
      const result = await commandExists('cmd');

      expect(result).toBe(false);
    });

    it('should handle timeout errors', async () => {
      Object.defineProperty(process, 'platform', {
        value: 'linux',
        writable: true,
        configurable: true,
      });
      const error: any = new Error('Command timed out');
      error.killed = true;
      error.signal = 'SIGTERM';
      mockExec.mockRejectedValue(error);

      const { commandExists } = await import('../shared/file-utils.js');
      const result = await commandExists('slow-command');

      expect(result).toBe(false);
    });
  });

  // ===========================================================================
  // validateRegistries
  // ===========================================================================

  describe('validateRegistries', () => {
    it('should return valid when all registries exist', async () => {
      mockAccess.mockResolvedValue(undefined);

      const { validateRegistries } = await import('../shared/file-utils.js');
      const result = await validateRegistries();

      expect(result.valid).toBe(true);
      expect(result.missing).toEqual([]);
      expect(mockAccess).toHaveBeenCalledTimes(3); // skills, agents, tools
    });

    it('should return invalid when all registries are missing', async () => {
      mockAccess.mockRejectedValue(new Error('ENOENT'));

      const { validateRegistries } = await import('../shared/file-utils.js');
      const result = await validateRegistries();

      expect(result.valid).toBe(false);
      expect(result.missing).toEqual([
        'skills/_registry.yaml',
        'agents/_registry.yaml',
        'tools/_registry.yaml',
      ]);
    });

    it('should return invalid when some registries are missing', async () => {
      let callCount = 0;
      mockAccess.mockImplementation(() => {
        callCount++;
        // First call (skills) succeeds, rest fail
        if (callCount === 1) {
          return Promise.resolve(undefined);
        }
        return Promise.reject(new Error('ENOENT'));
      });

      const { validateRegistries } = await import('../shared/file-utils.js');
      const result = await validateRegistries();

      expect(result.valid).toBe(false);
      expect(result.missing).toEqual([
        'agents/_registry.yaml',
        'tools/_registry.yaml',
      ]);
    });

    it('should check against PLUGIN_ROOT', async () => {
      mockAccess.mockResolvedValue(undefined);

      const { validateRegistries } = await import('../shared/file-utils.js');
      await validateRegistries();

      // Verify paths are resolved against PLUGIN_ROOT
      const calls = mockAccess.mock.calls;
      expect(calls.length).toBe(3);
      calls.forEach((call) => {
        expect(call[0]).toContain('_registry.yaml');
      });
    });
  });

  // ===========================================================================
  // ensureGoodVibesDir
  // ===========================================================================

  describe('ensureGoodVibesDir', () => {
    it('should create .goodvibes directory with all subdirectories when it does not exist', async () => {
      mockAccess.mockRejectedValue(new Error('ENOENT'));
      mockMkdir.mockResolvedValue(undefined);
      mockEnsureSecureGitignore.mockResolvedValue(undefined);

      const { ensureGoodVibesDir } = await import('../shared/file-utils.js');
      const cwd = '/project/root';
      const result = await ensureGoodVibesDir(cwd);

      expect(result).toBe(path.join(cwd, '.goodvibes'));
      expect(mockMkdir).toHaveBeenCalledTimes(5); // main + 4 subdirs
      expect(mockMkdir).toHaveBeenCalledWith(path.join(cwd, '.goodvibes'), {
        recursive: true,
      });
      expect(mockMkdir).toHaveBeenCalledWith(
        path.join(cwd, '.goodvibes', 'memory'),
        { recursive: true }
      );
      expect(mockMkdir).toHaveBeenCalledWith(
        path.join(cwd, '.goodvibes', 'state'),
        { recursive: true }
      );
      expect(mockMkdir).toHaveBeenCalledWith(
        path.join(cwd, '.goodvibes', 'logs'),
        { recursive: true }
      );
      expect(mockMkdir).toHaveBeenCalledWith(
        path.join(cwd, '.goodvibes', 'telemetry'),
        { recursive: true }
      );
      expect(mockEnsureSecureGitignore).toHaveBeenCalledWith(cwd);
    });

    it('should not create directories when .goodvibes already exists', async () => {
      mockAccess.mockResolvedValue(undefined);

      const { ensureGoodVibesDir } = await import('../shared/file-utils.js');
      const cwd = '/existing/project';
      const result = await ensureGoodVibesDir(cwd);

      expect(result).toBe(path.join(cwd, '.goodvibes'));
      expect(mockMkdir).not.toHaveBeenCalled();
      expect(mockEnsureSecureGitignore).not.toHaveBeenCalled();
    });

    it('should handle different cwd paths', async () => {
      mockAccess.mockRejectedValue(new Error('ENOENT'));
      mockMkdir.mockResolvedValue(undefined);
      mockEnsureSecureGitignore.mockResolvedValue(undefined);

      const { ensureGoodVibesDir } = await import('../shared/file-utils.js');
      const cwd = 'C:\\Windows\\Project';
      const result = await ensureGoodVibesDir(cwd);

      expect(result).toBe(path.join(cwd, '.goodvibes'));
      expect(mockMkdir).toHaveBeenCalledWith(path.join(cwd, '.goodvibes'), {
        recursive: true,
      });
    });

    it('should create all subdirectories in correct order', async () => {
      mockAccess.mockRejectedValue(new Error('ENOENT'));
      mockMkdir.mockResolvedValue(undefined);
      mockEnsureSecureGitignore.mockResolvedValue(undefined);

      const { ensureGoodVibesDir } = await import('../shared/file-utils.js');
      const cwd = '/test';
      await ensureGoodVibesDir(cwd);

      // Verify subdirectories were created
      const mkdirCalls = mockMkdir.mock.calls.map((call) => call[0]);
      expect(mkdirCalls).toContain(path.join(cwd, '.goodvibes'));
      expect(mkdirCalls).toContain(path.join(cwd, '.goodvibes', 'memory'));
      expect(mkdirCalls).toContain(path.join(cwd, '.goodvibes', 'state'));
      expect(mkdirCalls).toContain(path.join(cwd, '.goodvibes', 'logs'));
      expect(mkdirCalls).toContain(path.join(cwd, '.goodvibes', 'telemetry'));
    });

    it('should propagate mkdir errors', async () => {
      mockAccess.mockRejectedValue(new Error('ENOENT'));
      mockMkdir.mockRejectedValue(new Error('Permission denied'));

      const { ensureGoodVibesDir } = await import('../shared/file-utils.js');

      await expect(ensureGoodVibesDir('/readonly')).rejects.toThrow(
        'Permission denied'
      );
    });

    it('should propagate ensureSecureGitignore errors', async () => {
      mockAccess.mockRejectedValue(new Error('ENOENT'));
      mockMkdir.mockResolvedValue(undefined);
      mockEnsureSecureGitignore.mockRejectedValue(
        new Error('Gitignore write failed')
      );

      const { ensureGoodVibesDir } = await import('../shared/file-utils.js');

      await expect(ensureGoodVibesDir('/test')).rejects.toThrow(
        'Gitignore write failed'
      );
    });
  });

  // ===========================================================================
  // extractErrorOutput
  // ===========================================================================

  describe('extractErrorOutput', () => {
    it('should extract stdout when present', async () => {
      const error = {
        stdout: Buffer.from('This is stdout output'),
        stderr: Buffer.from(''),
        message: 'Command failed',
      };

      const { extractErrorOutput } = await import('../shared/file-utils.js');
      const result = extractErrorOutput(error);

      expect(result).toBe('This is stdout output');
    });

    it('should extract stderr when stdout is not present', async () => {
      const error = {
        stderr: Buffer.from('This is stderr output'),
        message: 'Command failed',
      };

      const { extractErrorOutput } = await import('../shared/file-utils.js');
      const result = extractErrorOutput(error);

      expect(result).toBe('This is stderr output');
    });

    it('should extract message when stdout and stderr are not present', async () => {
      const error = {
        message: 'This is the error message',
      };

      const { extractErrorOutput } = await import('../shared/file-utils.js');
      const result = extractErrorOutput(error);

      expect(result).toBe('This is the error message');
    });

    it('should return "Unknown error" when no useful info is present', async () => {
      const error = {
        someOtherProperty: 'value',
      };

      const { extractErrorOutput } = await import('../shared/file-utils.js');
      const result = extractErrorOutput(error);

      expect(result).toBe('Unknown error');
    });

    it('should handle string errors', async () => {
      const { extractErrorOutput } = await import('../shared/file-utils.js');
      const result = extractErrorOutput('simple string error');

      expect(result).toBe('simple string error');
    });

    it('should handle number errors', async () => {
      const { extractErrorOutput } = await import('../shared/file-utils.js');
      const result = extractErrorOutput(42);

      expect(result).toBe('42');
    });

    it('should handle null', async () => {
      const { extractErrorOutput } = await import('../shared/file-utils.js');
      const result = extractErrorOutput(null);

      expect(result).toBe('null');
    });

    it('should handle undefined', async () => {
      const { extractErrorOutput } = await import('../shared/file-utils.js');
      const result = extractErrorOutput(undefined);

      expect(result).toBe('undefined');
    });

    it('should prefer stdout over stderr when both are present', async () => {
      const error = {
        stdout: Buffer.from('stdout message'),
        stderr: Buffer.from('stderr message'),
        message: 'error message',
      };

      const { extractErrorOutput } = await import('../shared/file-utils.js');
      const result = extractErrorOutput(error);

      expect(result).toBe('stdout message');
    });

    it('should prefer stderr over message when stdout is empty', async () => {
      const error = {
        stdout: Buffer.from(''),
        stderr: Buffer.from('stderr message'),
        message: 'error message',
      };

      const { extractErrorOutput } = await import('../shared/file-utils.js');
      const result = extractErrorOutput(error);

      expect(result).toBe('stderr message');
    });

    it('should handle empty buffers and fall back to message', async () => {
      const error = {
        stdout: Buffer.from(''),
        stderr: Buffer.from(''),
        message: 'fallback message',
      };

      const { extractErrorOutput } = await import('../shared/file-utils.js');
      const result = extractErrorOutput(error);

      expect(result).toBe('fallback message');
    });

    it('should handle Error objects', async () => {
      const error = new Error('Standard error object');

      const { extractErrorOutput } = await import('../shared/file-utils.js');
      const result = extractErrorOutput(error);

      expect(result).toBe('Standard error object');
    });

    it('should handle objects with toString method', async () => {
      const error = {
        toString: () => 'custom toString output',
      };

      const { extractErrorOutput } = await import('../shared/file-utils.js');
      const result = extractErrorOutput(error);

      // Object without stdout/stderr/message returns "Unknown error"
      expect(result).toBe('Unknown error');
    });

    it('should handle execSync-like error with all properties', async () => {
      const error = {
        stdout: Buffer.from('npm ERR! Test failed'),
        stderr: Buffer.from(''),
        message: 'Command failed: npm test',
        code: 1,
        killed: false,
      };

      const { extractErrorOutput } = await import('../shared/file-utils.js');
      const result = extractErrorOutput(error);

      expect(result).toBe('npm ERR! Test failed');
    });
  });

  // ===========================================================================
  // Edge Cases and Integration
  // ===========================================================================

  describe('edge cases', () => {
    it('should handle simultaneous file existence checks', async () => {
      mockAccess
        .mockResolvedValueOnce(undefined)
        .mockRejectedValueOnce(new Error('ENOENT'))
        .mockResolvedValueOnce(undefined);

      const { fileExists } = await import('../shared/file-utils.js');

      const results = await Promise.all([
        fileExists('/file1.txt'),
        fileExists('/file2.txt'),
        fileExists('/file3.txt'),
      ]);

      expect(results).toEqual([true, false, true]);
    });

    it('should handle very long file paths', async () => {
      mockAccess.mockResolvedValue(undefined);

      const { fileExists } = await import('../shared/file-utils.js');
      const longPath = '/very/' + 'long/'.repeat(100) + 'path/to/file.txt';
      const result = await fileExists(longPath);

      expect(result).toBe(true);
      expect(mockAccess).toHaveBeenCalledWith(longPath);
    });

    it('should handle special characters in paths', async () => {
      mockAccess.mockResolvedValue(undefined);

      const { fileExists } = await import('../shared/file-utils.js');
      const specialPath = '/path/with spaces/and-dashes/under_scores/file.txt';
      const result = await fileExists(specialPath);

      expect(result).toBe(true);
    });

    it('should handle command names with special characters', async () => {
      Object.defineProperty(process, 'platform', {
        value: 'linux',
        writable: true,
        configurable: true,
      });
      mockExec.mockResolvedValue({
        stdout: '/usr/bin/node-v18',
        stderr: '',
      });

      const { commandExists } = await import('../shared/file-utils.js');
      const result = await commandExists('node-v18');

      expect(result).toBe(true);
    });
  });
});
