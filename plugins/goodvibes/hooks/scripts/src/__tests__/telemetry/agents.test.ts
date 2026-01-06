/**
 * Unit tests for telemetry/agents.ts
 *
 * Tests cover:
 * - Active agent state management (load, save, register, pop)
 * - Stale agent cleanup
 * - Git info extraction with error handling
 * - Project name derivation with edge cases
 * - Path utilities
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'fs/promises';
import * as path from 'path';
import { execSync } from 'child_process';
import {
  STALE_AGENT_MAX_AGE_MS,
  getActiveAgentsFilePath,
  getGitInfo,
  deriveProjectName,
  loadActiveAgents,
  saveActiveAgents,
  registerActiveAgent,
  popActiveAgent,
  cleanupStaleAgents,
  ActiveAgentEntry,
  ActiveAgentsState,
} from '../../telemetry/agents.js';
import { createMockGitExecSync, createMockActiveAgentEntry } from '../test-utils/mock-factories.js';

// Mock child_process module
vi.mock('child_process', () => ({
  execSync: vi.fn(),
}));

// Mock fs/promises module
vi.mock('fs/promises', () => ({
  readFile: vi.fn(),
  writeFile: vi.fn(),
}));

// Mock shared utilities
vi.mock('../../shared/index.js', async () => {
  const actual = await vi.importActual('../../shared/index.js');
  return {
    ...actual,
    debug: vi.fn(),
    logError: vi.fn(),
    fileExists: vi.fn(),
  };
});

// Import mocked functions for test assertions
import { debug, logError, fileExists } from '../../shared/index.js';

describe('telemetry/agents', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('STALE_AGENT_MAX_AGE_MS', () => {
    it('should be set to 24 hours in milliseconds', () => {
      expect(STALE_AGENT_MAX_AGE_MS).toBe(24 * 60 * 60 * 1000);
    });
  });

  describe('getActiveAgentsFilePath', () => {
    it('should return the correct path joining goodVibesDir, stateDir, and filename', () => {
      const result = getActiveAgentsFilePath('/home/user/.goodvibes', 'state');
      expect(result).toBe(path.join('/home/user/.goodvibes', 'state', 'active-agents.json'));
    });

    it('should handle Windows-style paths', () => {
      const result = getActiveAgentsFilePath('C:\\Users\\dev\\.goodvibes', 'state');
      expect(result).toBe(path.join('C:\\Users\\dev\\.goodvibes', 'state', 'active-agents.json'));
    });

    it('should handle relative paths', () => {
      const result = getActiveAgentsFilePath('.goodvibes', 'state');
      expect(result).toBe(path.join('.goodvibes', 'state', 'active-agents.json'));
    });
  });

  describe('getGitInfo', () => {
    it('should return branch and commit when git commands succeed', () => {
      vi.mocked(execSync).mockImplementation(
        createMockGitExecSync({ branch: 'main', commit: 'abc1234' })
      );

      const info = getGitInfo('/test/project');

      expect(info.branch).toBe('main');
      expect(info.commit).toBe('abc1234');
    });

    it('should return empty object when both git commands fail', () => {
      vi.mocked(execSync).mockImplementation(
        createMockGitExecSync({ errors: { branch: true, commit: true } })
      );

      const info = getGitInfo('/test/project');

      expect(info.branch).toBeUndefined();
      expect(info.commit).toBeUndefined();
      expect(debug).toHaveBeenCalledTimes(2);
    });

    it('should return only branch when commit command fails', () => {
      vi.mocked(execSync).mockImplementation(
        createMockGitExecSync({ branch: 'feature-branch', errors: { commit: true } })
      );

      const info = getGitInfo('/test/project');

      expect(info.branch).toBe('feature-branch');
      expect(info.commit).toBeUndefined();
    });

    it('should return only commit when branch command fails', () => {
      vi.mocked(execSync).mockImplementation((command: string) => {
        if (String(command).includes('--abbrev-ref HEAD')) {
          throw new Error('not a git repository');
        }
        if (String(command).includes('--short HEAD')) {
          return 'def5678\n';
        }
        throw new Error('Unknown command');
      });

      const info = getGitInfo('/test/project');

      expect(info.branch).toBeUndefined();
      expect(info.commit).toBe('def5678');
    });

    it('should trim whitespace from git output', () => {
      vi.mocked(execSync).mockImplementation(
        createMockGitExecSync({ branch: '  develop  ', commit: '  def5678  ' })
      );

      const info = getGitInfo('/test/project');

      expect(info.branch).toBe('develop');
      expect(info.commit).toBe('def5678');
    });

    it('should handle non-Error exceptions for branch command', () => {
      vi.mocked(execSync).mockImplementation((command: string) => {
        if (String(command).includes('--abbrev-ref HEAD')) {
          throw 'string error'; // Non-Error exception
        }
        if (String(command).includes('--short HEAD')) {
          return 'abc1234\n';
        }
        throw new Error('Unknown command');
      });

      const info = getGitInfo('/test/project');

      expect(info.branch).toBeUndefined();
      expect(info.commit).toBe('abc1234');
      expect(debug).toHaveBeenCalledWith('Git branch unavailable:', 'unknown');
    });

    it('should handle non-Error exceptions for commit command', () => {
      vi.mocked(execSync).mockImplementation((command: string) => {
        if (String(command).includes('--abbrev-ref HEAD')) {
          return 'main\n';
        }
        if (String(command).includes('--short HEAD')) {
          throw { message: 'object error' }; // Non-Error exception without Error instance
        }
        throw new Error('Unknown command');
      });

      const info = getGitInfo('/test/project');

      expect(info.branch).toBe('main');
      expect(info.commit).toBeUndefined();
      expect(debug).toHaveBeenCalledWith('Git commit unavailable:', 'unknown');
    });
  });

  describe('deriveProjectName', () => {
    it('should return directory name for normal project paths', () => {
      expect(deriveProjectName('/home/user/projects/my-app')).toBe('my-app');
    });

    it('should return parent directory for hex-like temp directory names', () => {
      // 8+ character hex string pattern
      expect(deriveProjectName('/tmp/abc123def456')).toBe('tmp');
      expect(deriveProjectName('/projects/abcdef12')).toBe('projects');
    });

    it('should return parent directory for tmp directory', () => {
      expect(deriveProjectName('/home/user/tmp')).toBe('user');
    });

    it('should return parent directory for temp directory', () => {
      expect(deriveProjectName('/home/user/temp')).toBe('user');
    });

    it('should return directory name if parent is empty', () => {
      // This tests the edge case where parent is falsy
      expect(deriveProjectName('/tmp')).toBe('tmp');
    });

    it('should return directory name if parent is dot', () => {
      // path.dirname('.') returns '.'
      // path.basename('.') returns '.'
      expect(deriveProjectName('tmp')).toBe('tmp');
    });

    it('should handle Windows paths', () => {
      expect(deriveProjectName('C:\\Users\\dev\\vibeplug')).toBe('vibeplug');
    });

    it('should return unknown-project for empty directory name', () => {
      // Test the || 'unknown-project' fallback
      // This is an edge case where path.basename returns empty string
      expect(deriveProjectName('')).toBe('unknown-project');
    });

    it('should return dot for current directory path', () => {
      expect(deriveProjectName('.')).toBe('.');
    });

    it('should handle root path edge case', () => {
      // path.basename('/') returns empty string on Unix
      const result = deriveProjectName('/');
      // Result will be 'unknown-project' since basename('/') is ''
      expect(result.length).toBeGreaterThan(0);
    });

    it('should not treat short hex strings as temp directories', () => {
      // Less than 8 hex characters should not trigger parent fallback
      expect(deriveProjectName('/projects/abc123')).toBe('abc123');
    });

    it('should handle mixed case temp detection', () => {
      // Hex pattern is case-insensitive
      expect(deriveProjectName('/projects/ABCDEF123456')).toBe('projects');
    });
  });

  describe('loadActiveAgents', () => {
    it('should return empty state when file does not exist', async () => {
      vi.mocked(fileExists).mockResolvedValue(false);

      const state = await loadActiveAgents('/test/active-agents.json');

      expect(state.agents).toEqual({});
      expect(state.last_updated).toBeDefined();
      expect(new Date(state.last_updated).getTime()).toBeLessThanOrEqual(Date.now());
    });

    it('should load existing state from file', async () => {
      const existingState: ActiveAgentsState = {
        agents: {
          'agent-1': createMockActiveAgentEntry({ agent_id: 'agent-1', agent_type: 'test-engineer' }),
        },
        last_updated: '2025-01-01T00:00:00Z',
      };

      vi.mocked(fileExists).mockResolvedValue(true);
      vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify(existingState));

      const state = await loadActiveAgents('/test/active-agents.json');

      expect(state.agents['agent-1']).toBeDefined();
      expect(state.agents['agent-1'].agent_type).toBe('test-engineer');
    });

    it('should handle corrupted JSON gracefully', async () => {
      vi.mocked(fileExists).mockResolvedValue(true);
      vi.mocked(fs.readFile).mockResolvedValue('invalid json {{{');

      const state = await loadActiveAgents('/test/active-agents.json');

      expect(state.agents).toEqual({});
      expect(logError).toHaveBeenCalledWith('loadActiveAgents', expect.any(Error));
    });

    it('should handle file read errors gracefully', async () => {
      vi.mocked(fileExists).mockResolvedValue(true);
      vi.mocked(fs.readFile).mockRejectedValue(new Error('EACCES: permission denied'));

      const state = await loadActiveAgents('/test/active-agents.json');

      expect(state.agents).toEqual({});
      expect(logError).toHaveBeenCalled();
    });
  });

  describe('saveActiveAgents', () => {
    it('should save state to file with updated timestamp', async () => {
      vi.mocked(fs.writeFile).mockResolvedValue(undefined);

      const state: ActiveAgentsState = {
        agents: {
          'agent-1': createMockActiveAgentEntry({ agent_id: 'agent-1' }),
        },
        last_updated: '2020-01-01T00:00:00Z',
      };

      const beforeSave = Date.now();
      await saveActiveAgents('/test/active-agents.json', state);
      const afterSave = Date.now();

      expect(fs.writeFile).toHaveBeenCalled();
      const [filePath, content] = vi.mocked(fs.writeFile).mock.calls[0];
      expect(filePath).toBe('/test/active-agents.json');

      const savedState = JSON.parse(content as string);
      const savedTime = new Date(savedState.last_updated).getTime();
      expect(savedTime).toBeGreaterThanOrEqual(beforeSave);
      expect(savedTime).toBeLessThanOrEqual(afterSave);
    });

    it('should handle file write errors gracefully', async () => {
      vi.mocked(fs.writeFile).mockRejectedValue(new Error('ENOSPC: no space left'));

      const state: ActiveAgentsState = {
        agents: {},
        last_updated: new Date().toISOString(),
      };

      // Should not throw
      await saveActiveAgents('/test/active-agents.json', state);

      expect(logError).toHaveBeenCalledWith('saveActiveAgents', expect.any(Error));
    });

    it('should write formatted JSON', async () => {
      vi.mocked(fs.writeFile).mockResolvedValue(undefined);

      const state: ActiveAgentsState = {
        agents: {},
        last_updated: new Date().toISOString(),
      };

      await saveActiveAgents('/test/active-agents.json', state);

      const [, content] = vi.mocked(fs.writeFile).mock.calls[0];
      // Check that it's formatted with 2-space indentation
      expect(content).toContain('\n');
    });
  });

  describe('registerActiveAgent', () => {
    it('should add agent to state and save', async () => {
      vi.mocked(fileExists).mockResolvedValue(false);
      vi.mocked(fs.writeFile).mockResolvedValue(undefined);

      const entry = createMockActiveAgentEntry({
        agent_id: 'agent-123',
        agent_type: 'test-engineer',
      });

      await registerActiveAgent('/test/active-agents.json', entry);

      expect(fs.writeFile).toHaveBeenCalled();
      const [, content] = vi.mocked(fs.writeFile).mock.calls[0];
      const savedState = JSON.parse(content as string);
      expect(savedState.agents['agent-123']).toBeDefined();
      expect(savedState.agents['agent-123'].agent_type).toBe('test-engineer');
      expect(debug).toHaveBeenCalledWith(expect.stringContaining('Registered active agent'));
    });

    it('should overwrite existing agent with same ID', async () => {
      const existingState: ActiveAgentsState = {
        agents: {
          'agent-dup': createMockActiveAgentEntry({ agent_id: 'agent-dup', agent_type: 'old-type' }),
        },
        last_updated: new Date().toISOString(),
      };

      vi.mocked(fileExists).mockResolvedValue(true);
      vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify(existingState));
      vi.mocked(fs.writeFile).mockResolvedValue(undefined);

      const newEntry = createMockActiveAgentEntry({
        agent_id: 'agent-dup',
        agent_type: 'new-type',
      });

      await registerActiveAgent('/test/active-agents.json', newEntry);

      const [, content] = vi.mocked(fs.writeFile).mock.calls[0];
      const savedState = JSON.parse(content as string);
      expect(savedState.agents['agent-dup'].agent_type).toBe('new-type');
    });
  });

  describe('popActiveAgent', () => {
    it('should return and remove agent from state', async () => {
      const existingState: ActiveAgentsState = {
        agents: {
          'agent-1': createMockActiveAgentEntry({ agent_id: 'agent-1', agent_type: 'test-engineer' }),
          'agent-2': createMockActiveAgentEntry({ agent_id: 'agent-2', agent_type: 'backend-engineer' }),
        },
        last_updated: new Date().toISOString(),
      };

      vi.mocked(fileExists).mockResolvedValue(true);
      vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify(existingState));
      vi.mocked(fs.writeFile).mockResolvedValue(undefined);

      const entry = await popActiveAgent('/test/active-agents.json', 'agent-1');

      expect(entry).not.toBeNull();
      expect(entry?.agent_id).toBe('agent-1');
      expect(entry?.agent_type).toBe('test-engineer');

      const [, content] = vi.mocked(fs.writeFile).mock.calls[0];
      const savedState = JSON.parse(content as string);
      expect(savedState.agents['agent-1']).toBeUndefined();
      expect(savedState.agents['agent-2']).toBeDefined();
      expect(debug).toHaveBeenCalledWith(expect.stringContaining('Popped active agent'));
    });

    it('should return null for non-existent agent', async () => {
      const existingState: ActiveAgentsState = {
        agents: {
          'agent-1': createMockActiveAgentEntry({ agent_id: 'agent-1' }),
        },
        last_updated: new Date().toISOString(),
      };

      vi.mocked(fileExists).mockResolvedValue(true);
      vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify(existingState));

      const entry = await popActiveAgent('/test/active-agents.json', 'non-existent');

      expect(entry).toBeNull();
      expect(fs.writeFile).not.toHaveBeenCalled();
      expect(debug).toHaveBeenCalledWith(expect.stringContaining('Agent not found'));
    });

    it('should handle empty state', async () => {
      vi.mocked(fileExists).mockResolvedValue(false);

      const entry = await popActiveAgent('/test/active-agents.json', 'any-agent');

      expect(entry).toBeNull();
    });
  });

  describe('cleanupStaleAgents', () => {
    it('should remove agents older than 24 hours', async () => {
      const now = Date.now();
      const staleTime = new Date(now - STALE_AGENT_MAX_AGE_MS - 1000).toISOString(); // 25 hours ago
      const freshTime = new Date(now - 60 * 60 * 1000).toISOString(); // 1 hour ago

      const existingState: ActiveAgentsState = {
        agents: {
          'stale-agent': createMockActiveAgentEntry({ agent_id: 'stale-agent', started_at: staleTime }),
          'fresh-agent': createMockActiveAgentEntry({ agent_id: 'fresh-agent', started_at: freshTime }),
        },
        last_updated: new Date().toISOString(),
      };

      vi.mocked(fileExists).mockResolvedValue(true);
      vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify(existingState));
      vi.mocked(fs.writeFile).mockResolvedValue(undefined);

      const removed = await cleanupStaleAgents('/test/active-agents.json');

      expect(removed).toBe(1);
      expect(fs.writeFile).toHaveBeenCalled();

      const [, content] = vi.mocked(fs.writeFile).mock.calls[0];
      const savedState = JSON.parse(content as string);
      expect(savedState.agents['stale-agent']).toBeUndefined();
      expect(savedState.agents['fresh-agent']).toBeDefined();
      expect(debug).toHaveBeenCalledWith(expect.stringContaining('Cleaned up 1 stale agent'));
    });

    it('should return 0 when no stale agents exist', async () => {
      const freshTime = new Date(Date.now() - 60 * 60 * 1000).toISOString();

      const existingState: ActiveAgentsState = {
        agents: {
          'fresh-agent': createMockActiveAgentEntry({ agent_id: 'fresh-agent', started_at: freshTime }),
        },
        last_updated: new Date().toISOString(),
      };

      vi.mocked(fileExists).mockResolvedValue(true);
      vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify(existingState));

      const removed = await cleanupStaleAgents('/test/active-agents.json');

      expect(removed).toBe(0);
      expect(fs.writeFile).not.toHaveBeenCalled();
    });

    it('should handle empty state', async () => {
      vi.mocked(fileExists).mockResolvedValue(false);

      const removed = await cleanupStaleAgents('/test/active-agents.json');

      expect(removed).toBe(0);
      expect(fs.writeFile).not.toHaveBeenCalled();
    });

    it('should remove multiple stale agents', async () => {
      const now = Date.now();
      const staleTime1 = new Date(now - STALE_AGENT_MAX_AGE_MS - 1000).toISOString();
      const staleTime2 = new Date(now - STALE_AGENT_MAX_AGE_MS - 2 * 60 * 60 * 1000).toISOString(); // 26 hours ago

      const existingState: ActiveAgentsState = {
        agents: {
          'stale-1': createMockActiveAgentEntry({ agent_id: 'stale-1', started_at: staleTime1 }),
          'stale-2': createMockActiveAgentEntry({ agent_id: 'stale-2', started_at: staleTime2 }),
        },
        last_updated: new Date().toISOString(),
      };

      vi.mocked(fileExists).mockResolvedValue(true);
      vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify(existingState));
      vi.mocked(fs.writeFile).mockResolvedValue(undefined);

      const removed = await cleanupStaleAgents('/test/active-agents.json');

      expect(removed).toBe(2);
      expect(debug).toHaveBeenCalledWith(expect.stringContaining('Cleaned up 2 stale agent'));
    });

    it('should handle agents exactly at the threshold', async () => {
      const now = Date.now();
      // Exactly at threshold should NOT be removed
      const exactThreshold = new Date(now - STALE_AGENT_MAX_AGE_MS).toISOString();

      const existingState: ActiveAgentsState = {
        agents: {
          'threshold-agent': createMockActiveAgentEntry({ agent_id: 'threshold-agent', started_at: exactThreshold }),
        },
        last_updated: new Date().toISOString(),
      };

      vi.mocked(fileExists).mockResolvedValue(true);
      vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify(existingState));

      const removed = await cleanupStaleAgents('/test/active-agents.json');

      expect(removed).toBe(0);
    });
  });
});
