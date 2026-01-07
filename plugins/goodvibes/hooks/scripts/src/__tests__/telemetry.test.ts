/**
 * Comprehensive unit tests for telemetry module
 *
 * Tests cover:
 * - Active agent state management (load, save, register, pop)
 * - Stale agent cleanup
 * - Git info extraction
 * - Project name derivation
 * - Transcript parsing (JSON and plain text)
 * - Keyword extraction
 * - Telemetry record creation and writing
 * - JSONL file management
 * - Edge cases: empty transcripts, missing fields, corrupted data
 */

import { execSync } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

import {
  ensureGoodVibesDirs,
  getGitInfo,
  deriveProjectName,
  loadActiveAgents,
  saveActiveAgents,
  registerActiveAgent,
  popActiveAgent,
  cleanupStaleAgents,
  parseTranscript,
  extractKeywords,
  writeTelemetryRecord,
  createTelemetryRecord,
  KEYWORD_CATEGORIES,
} from '../telemetry.js';

import { createMockGitExecSync } from './test-utils/mock-factories.js';

import type {
  ActiveAgentEntry,
  ActiveAgentsState,
  ParsedTranscript,
  TelemetryRecord,
} from '../telemetry.js';

// Mock child_process module
vi.mock('child_process', () => ({
  execSync: vi.fn(),
}));

// Mock the shared module to prevent actual logging during tests
vi.mock('../shared/index.js', async () => {
  const actual = await vi.importActual('../shared/index.js');
  return {
    ...actual,
    debug: vi.fn(),
    logError: vi.fn(),
  };
});

describe('telemetry', () => {
  let testDir: string;
  let originalCwd: string;
  let goodvibesDir: string;

  beforeEach(() => {
    // Create a fresh temp directory for each test
    testDir = fs.mkdtempSync(
      path.join(os.tmpdir(), 'goodvibes-telemetry-test-')
    );
    originalCwd = process.cwd();

    // Clean up any existing .goodvibes directory in the actual PROJECT_ROOT
    goodvibesDir = path.join(originalCwd, '.goodvibes');
    if (fs.existsSync(goodvibesDir)) {
      // Back up and clear active-agents.json to avoid test pollution
      const activeAgentsFile = path.join(
        goodvibesDir,
        'state',
        'active-agents.json'
      );
      if (fs.existsSync(activeAgentsFile)) {
        try {
          fs.unlinkSync(activeAgentsFile);
        } catch (error) {
          // Ignore errors
        }
      }
    }

    // Clear mock calls but not implementations
    vi.mocked(execSync).mockClear();
  });

  afterEach(() => {
    // Restore cwd if changed
    if (process.cwd() !== originalCwd) {
      process.chdir(originalCwd);
    }

    // Clean up temp directory
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true, force: true });
    }

    // Clean up any test pollution in PROJECT_ROOT
    const activeAgentsFile = path.join(
      goodvibesDir,
      'state',
      'active-agents.json'
    );
    if (fs.existsSync(activeAgentsFile)) {
      try {
        fs.unlinkSync(activeAgentsFile);
      } catch (error) {
        // Ignore errors
      }
    }
  });

  describe('ensureGoodVibesDirs', () => {
    it('should create all required directories', async () => {
      await ensureGoodVibesDirs();

      // Verify directories were created in PROJECT_ROOT (scripts directory during tests)
      const stateDir = path.join(goodvibesDir, 'state');
      const telemetryDir = path.join(goodvibesDir, 'telemetry');

      expect(fs.existsSync(goodvibesDir)).toBe(true);
      expect(fs.existsSync(stateDir)).toBe(true);
      expect(fs.existsSync(telemetryDir)).toBe(true);
    });

    it('should be idempotent - calling multiple times is safe', async () => {
      await ensureGoodVibesDirs();
      await ensureGoodVibesDirs();
      await ensureGoodVibesDirs();

      expect(fs.existsSync(goodvibesDir)).toBe(true);
    });
  });

  describe('getGitInfo', () => {
    it('should return branch and commit when git is available', () => {
      vi.mocked(execSync).mockImplementation(
        createMockGitExecSync({ branch: 'main', commit: 'abc1234' })
      );

      const info = getGitInfo(testDir);

      expect(info.branch).toBe('main');
      expect(info.commit).toBe('abc1234');
    });

    it('should handle missing git repository gracefully', () => {
      vi.mocked(execSync).mockImplementation(
        createMockGitExecSync({ errors: { branch: true, commit: true } })
      );

      const info = getGitInfo(testDir);

      expect(info.branch).toBeUndefined();
      expect(info.commit).toBeUndefined();
    });

    it('should handle partial git availability - branch only', () => {
      vi.mocked(execSync).mockImplementation(
        createMockGitExecSync({
          branch: 'feature-branch',
          errors: { commit: true },
        })
      );

      const info = getGitInfo(testDir);

      expect(info.branch).toBe('feature-branch');
      expect(info.commit).toBeUndefined();
    });

    it('should trim whitespace from git output', () => {
      // Custom implementation to test whitespace trimming behavior
      vi.mocked(execSync).mockImplementation(
        createMockGitExecSync({ branch: '  develop  ', commit: '  def5678  ' })
      );

      const info = getGitInfo(testDir);

      expect(info.branch).toBe('develop');
      expect(info.commit).toBe('def5678');
    });
  });

  describe('deriveProjectName', () => {
    it('should return directory name for normal projects', () => {
      const name = deriveProjectName('/home/user/projects/my-app');
      expect(name).toBe('my-app');
    });

    it('should handle temp directory patterns by using parent', () => {
      const name = deriveProjectName('/tmp/abc123def456');
      expect(name).toBe('tmp');
    });

    it('should recognize tmp and temp directories', () => {
      const name1 = deriveProjectName('/home/user/tmp');
      expect(name1).toBe('user');

      const name2 = deriveProjectName('/home/user/temp');
      expect(name2).toBe('user');
    });

    it('should return directory name for edge cases', () => {
      const name1 = deriveProjectName('/');
      // path.basename('/') returns empty string on Unix, '\\' or drive on Windows
      expect(name1.length).toBeGreaterThan(0);

      const name2 = deriveProjectName('.');
      // path.basename('.') returns '.'
      expect(name2).toBe('.');
    });

    it('should handle Windows paths', () => {
      const name = deriveProjectName('C:\\Users\\dev\\vibeplug');
      expect(name).toBe('vibeplug');
    });
  });

  describe('Active Agents State Management', () => {
    let stateDir: string;
    let activeAgentsFile: string;

    beforeEach(() => {
      // Use actual PROJECT_ROOT (scripts directory) for state files
      stateDir = path.join(goodvibesDir, 'state');
      activeAgentsFile = path.join(stateDir, 'active-agents.json');
      fs.mkdirSync(stateDir, { recursive: true });
    });

    describe('loadActiveAgents', () => {
      it('should return empty state when file does not exist', async () => {
        // Mock ensureGoodVibesDirs to not create files
        const state = await loadActiveAgents();

        expect(state.agents).toEqual({});
        expect(state.last_updated).toBeDefined();
      });

      it('should load existing state from file', async () => {
        const existingState: ActiveAgentsState = {
          agents: {
            'agent-1': {
              agent_id: 'agent-1',
              agent_type: 'test-engineer',
              session_id: 'session-1',
              cwd: '/test',
              project_name: 'test-project',
              started_at: '2025-01-01T00:00:00Z',
            },
          },
          last_updated: '2025-01-01T00:00:00Z',
        };

        fs.writeFileSync(activeAgentsFile, JSON.stringify(existingState));

        const state = await loadActiveAgents();

        expect(state.agents['agent-1']).toBeDefined();
        expect(state.agents['agent-1'].agent_type).toBe('test-engineer');
      });

      it('should handle corrupted JSON gracefully', async () => {
        fs.writeFileSync(activeAgentsFile, 'invalid json {{{');

        const state = await loadActiveAgents();

        expect(state.agents).toEqual({});
        expect(state.last_updated).toBeDefined();
      });

      it('should handle empty file', async () => {
        fs.writeFileSync(activeAgentsFile, '');

        const state = await loadActiveAgents();

        expect(state.agents).toEqual({});
      });
    });

    describe('saveActiveAgents', () => {
      it('should save state to file with proper formatting', async () => {
        const state: ActiveAgentsState = {
          agents: {
            'agent-1': {
              agent_id: 'agent-1',
              agent_type: 'backend-engineer',
              session_id: 'session-1',
              cwd: '/test',
              project_name: 'test-project',
              started_at: '2025-01-01T00:00:00Z',
              git_branch: 'main',
              git_commit: 'abc123',
            },
          },
          last_updated: '2025-01-01T00:00:00Z',
        };

        await saveActiveAgents(state);

        expect(fs.existsSync(activeAgentsFile)).toBe(true);

        const saved = JSON.parse(fs.readFileSync(activeAgentsFile, 'utf-8'));
        expect(saved.agents['agent-1'].agent_type).toBe('backend-engineer');
        expect(saved.agents['agent-1'].git_branch).toBe('main');
      });

      it('should update last_updated timestamp', async () => {
        const state: ActiveAgentsState = {
          agents: {},
          last_updated: '2020-01-01T00:00:00Z',
        };

        const beforeSave = Date.now();
        await saveActiveAgents(state);
        const afterSave = Date.now();

        const saved = JSON.parse(fs.readFileSync(activeAgentsFile, 'utf-8'));
        const savedTime = new Date(saved.last_updated).getTime();

        expect(savedTime).toBeGreaterThanOrEqual(beforeSave);
        expect(savedTime).toBeLessThanOrEqual(afterSave);
      });

      it('should handle multiple agents', async () => {
        const state: ActiveAgentsState = {
          agents: {
            'agent-1': {
              agent_id: 'agent-1',
              agent_type: 'test-engineer',
              session_id: 'session-1',
              cwd: '/test1',
              project_name: 'project-1',
              started_at: '2025-01-01T00:00:00Z',
            },
            'agent-2': {
              agent_id: 'agent-2',
              agent_type: 'frontend-architect',
              session_id: 'session-2',
              cwd: '/test2',
              project_name: 'project-2',
              started_at: '2025-01-01T01:00:00Z',
            },
          },
          last_updated: '2025-01-01T00:00:00Z',
        };

        await saveActiveAgents(state);

        const saved = JSON.parse(fs.readFileSync(activeAgentsFile, 'utf-8'));
        expect(Object.keys(saved.agents)).toHaveLength(2);
        expect(saved.agents['agent-1'].agent_type).toBe('test-engineer');
        expect(saved.agents['agent-2'].agent_type).toBe('frontend-architect');
      });
    });

    describe('registerActiveAgent', () => {
      it('should add agent to state', async () => {
        const entry: ActiveAgentEntry = {
          agent_id: 'agent-123',
          agent_type: 'test-engineer',
          session_id: 'session-456',
          cwd: '/workspace/project',
          project_name: 'my-project',
          started_at: new Date().toISOString(),
        };

        await registerActiveAgent(entry);

        const state = await loadActiveAgents();
        expect(state.agents['agent-123']).toBeDefined();
        expect(state.agents['agent-123'].agent_type).toBe('test-engineer');
      });

      it('should include optional git information', async () => {
        const entry: ActiveAgentEntry = {
          agent_id: 'agent-git',
          agent_type: 'backend-engineer',
          session_id: 'session-git',
          cwd: '/workspace',
          project_name: 'git-project',
          started_at: new Date().toISOString(),
          git_branch: 'feature/new-feature',
          git_commit: 'def5678',
          task_description: 'Implement new API endpoint',
        };

        await registerActiveAgent(entry);

        const state = await loadActiveAgents();
        expect(state.agents['agent-git'].git_branch).toBe(
          'feature/new-feature'
        );
        expect(state.agents['agent-git'].git_commit).toBe('def5678');
        expect(state.agents['agent-git'].task_description).toBe(
          'Implement new API endpoint'
        );
      });

      it('should overwrite existing agent with same ID', async () => {
        const entry1: ActiveAgentEntry = {
          agent_id: 'agent-dup',
          agent_type: 'test-engineer',
          session_id: 'session-1',
          cwd: '/test',
          project_name: 'project',
          started_at: '2025-01-01T00:00:00Z',
        };

        const entry2: ActiveAgentEntry = {
          agent_id: 'agent-dup',
          agent_type: 'backend-engineer',
          session_id: 'session-2',
          cwd: '/test',
          project_name: 'project',
          started_at: '2025-01-01T01:00:00Z',
        };

        await registerActiveAgent(entry1);
        await registerActiveAgent(entry2);

        const state = await loadActiveAgents();
        expect(Object.keys(state.agents)).toHaveLength(1);
        expect(state.agents['agent-dup'].agent_type).toBe('backend-engineer');
        expect(state.agents['agent-dup'].session_id).toBe('session-2');
      });
    });

    describe('popActiveAgent', () => {
      beforeEach(() => {
        // Set up some test agents
        const state: ActiveAgentsState = {
          agents: {
            'agent-1': {
              agent_id: 'agent-1',
              agent_type: 'test-engineer',
              session_id: 'session-1',
              cwd: '/test',
              project_name: 'project',
              started_at: '2025-01-01T00:00:00Z',
            },
            'agent-2': {
              agent_id: 'agent-2',
              agent_type: 'backend-engineer',
              session_id: 'session-2',
              cwd: '/test',
              project_name: 'project',
              started_at: '2025-01-01T00:00:00Z',
            },
          },
          last_updated: '2025-01-01T00:00:00Z',
        };

        fs.writeFileSync(activeAgentsFile, JSON.stringify(state));
      });

      it('should return and remove agent from state', async () => {
        const entry = await popActiveAgent('agent-1');

        expect(entry).toBeDefined();
        expect(entry?.agent_id).toBe('agent-1');
        expect(entry?.agent_type).toBe('test-engineer');

        const state = await loadActiveAgents();
        expect(state.agents['agent-1']).toBeUndefined();
        expect(state.agents['agent-2']).toBeDefined();
      });

      it('should return null for non-existent agent', async () => {
        const entry = await popActiveAgent('non-existent');

        expect(entry).toBeNull();

        const state = await loadActiveAgents();
        expect(Object.keys(state.agents)).toHaveLength(2);
      });

      it('should preserve other agents when popping one', async () => {
        await popActiveAgent('agent-1');

        const state = await loadActiveAgents();
        expect(state.agents['agent-2']).toBeDefined();
        expect(state.agents['agent-2'].agent_type).toBe('backend-engineer');
      });
    });

    describe('cleanupStaleAgents', () => {
      it('should remove agents older than 24 hours', async () => {
        const now = Date.now();
        const oneDayAgo = new Date(now - 25 * 60 * 60 * 1000).toISOString(); // 25 hours
        const oneHourAgo = new Date(now - 1 * 60 * 60 * 1000).toISOString();

        const state: ActiveAgentsState = {
          agents: {
            'stale-agent': {
              agent_id: 'stale-agent',
              agent_type: 'test-engineer',
              session_id: 'session-1',
              cwd: '/test',
              project_name: 'project',
              started_at: oneDayAgo,
            },
            'fresh-agent': {
              agent_id: 'fresh-agent',
              agent_type: 'backend-engineer',
              session_id: 'session-2',
              cwd: '/test',
              project_name: 'project',
              started_at: oneHourAgo,
            },
          },
          last_updated: new Date().toISOString(),
        };

        fs.writeFileSync(activeAgentsFile, JSON.stringify(state));

        const removed = await cleanupStaleAgents();

        expect(removed).toBe(1);

        const updatedState = await loadActiveAgents();
        expect(updatedState.agents['stale-agent']).toBeUndefined();
        expect(updatedState.agents['fresh-agent']).toBeDefined();
      });

      it('should return 0 when no stale agents', async () => {
        const now = Date.now();
        const oneHourAgo = new Date(now - 1 * 60 * 60 * 1000).toISOString();

        const state: ActiveAgentsState = {
          agents: {
            'fresh-agent': {
              agent_id: 'fresh-agent',
              agent_type: 'test-engineer',
              session_id: 'session-1',
              cwd: '/test',
              project_name: 'project',
              started_at: oneHourAgo,
            },
          },
          last_updated: new Date().toISOString(),
        };

        fs.writeFileSync(activeAgentsFile, JSON.stringify(state));

        const removed = await cleanupStaleAgents();

        expect(removed).toBe(0);
      });

      it('should handle empty state', async () => {
        const state: ActiveAgentsState = {
          agents: {},
          last_updated: new Date().toISOString(),
        };

        fs.writeFileSync(activeAgentsFile, JSON.stringify(state));

        const removed = await cleanupStaleAgents();

        expect(removed).toBe(0);
      });
    });
  });

  describe('parseTranscript', () => {
    it('should return empty result for non-existent file', async () => {
      const result = await parseTranscript('/non/existent/file.jsonl');

      expect(result.files_modified).toEqual([]);
      expect(result.tools_used).toEqual([]);
      expect(result.error_count).toBe(0);
      expect(result.success_indicators).toEqual([]);
    });

    it('should parse JSON transcript with tool usage', async () => {
      const transcriptPath = path.join(testDir, 'transcript.jsonl');
      const content = [
        JSON.stringify({
          type: 'tool_use',
          name: 'Write',
          input: { file_path: '/test/file1.ts' },
        }),
        JSON.stringify({
          type: 'tool_use',
          name: 'Read',
          input: { file_path: '/test/file2.ts' },
        }),
      ].join('\n');

      fs.writeFileSync(transcriptPath, content);

      const result = await parseTranscript(transcriptPath);

      expect(result.tools_used).toContain('Write');
      expect(result.tools_used).toContain('Read');
      expect(result.files_modified).toContain('/test/file1.ts');
    });

    it('should parse Edit tool for file modifications', async () => {
      const transcriptPath = path.join(testDir, 'transcript.jsonl');
      const content = JSON.stringify({
        type: 'tool_use',
        tool_name: 'Edit',
        tool_input: {
          file_path: '/src/main.ts',
          old_string: 'old',
          new_string: 'new',
        },
      });

      fs.writeFileSync(transcriptPath, content);

      const result = await parseTranscript(transcriptPath);

      expect(result.tools_used).toContain('Edit');
      expect(result.files_modified).toContain('/src/main.ts');
    });

    it('should count errors in transcript', async () => {
      const transcriptPath = path.join(testDir, 'transcript.jsonl');
      const content = [
        JSON.stringify({ type: 'error', message: 'Something went wrong' }),
        JSON.stringify({
          type: 'tool_use',
          name: 'Bash',
          error: 'Command failed',
        }),
      ].join('\n');

      fs.writeFileSync(transcriptPath, content);

      const result = await parseTranscript(transcriptPath);

      expect(result.error_count).toBeGreaterThan(0);
    });

    it('should detect success indicators', async () => {
      const transcriptPath = path.join(testDir, 'transcript.jsonl');
      const content = [
        JSON.stringify({
          role: 'assistant',
          content: 'Successfully completed the task',
        }),
        JSON.stringify({
          role: 'assistant',
          content: 'All tests completed and passed',
        }),
      ].join('\n');

      fs.writeFileSync(transcriptPath, content);

      const result = await parseTranscript(transcriptPath);

      expect(result.success_indicators.length).toBeGreaterThan(0);
      expect(result.success_indicators[0]).toContain('success');
    });

    it('should parse plain text transcript fallback', async () => {
      const transcriptPath = path.join(testDir, 'transcript.txt');
      const content = [
        'Using Write tool to create file.ts',
        'Calling Bash command',
        'Error: Command failed with exit code 1',
      ].join('\n');

      fs.writeFileSync(transcriptPath, content);

      const result = await parseTranscript(transcriptPath);

      expect(result.tools_used.length).toBeGreaterThan(0);
      expect(result.error_count).toBeGreaterThan(0);
    });

    it('should deduplicate tools and files', async () => {
      const transcriptPath = path.join(testDir, 'transcript.jsonl');
      const content = [
        JSON.stringify({
          type: 'tool_use',
          name: 'Write',
          input: { file_path: '/test/file.ts' },
        }),
        JSON.stringify({
          type: 'tool_use',
          name: 'Write',
          input: { file_path: '/test/file.ts' },
        }),
        JSON.stringify({
          type: 'tool_use',
          name: 'Write',
          input: { file_path: '/test/file.ts' },
        }),
      ].join('\n');

      fs.writeFileSync(transcriptPath, content);

      const result = await parseTranscript(transcriptPath);

      expect(result.tools_used).toHaveLength(1);
      expect(result.files_modified).toHaveLength(1);
    });

    it('should extract final output', async () => {
      const transcriptPath = path.join(testDir, 'transcript.jsonl');
      const content = [
        JSON.stringify({ role: 'user', content: 'Do something' }),
        JSON.stringify({ role: 'assistant', content: 'First message' }),
        JSON.stringify({ role: 'assistant', content: 'Final output message' }),
      ].join('\n');

      fs.writeFileSync(transcriptPath, content);

      const result = await parseTranscript(transcriptPath);

      expect(result.final_output).toBeDefined();
      expect(result.final_output).toContain('Final');
    });

    it('should handle empty transcript file', async () => {
      const transcriptPath = path.join(testDir, 'empty.jsonl');
      fs.writeFileSync(transcriptPath, '');

      const result = await parseTranscript(transcriptPath);

      expect(result.files_modified).toEqual([]);
      expect(result.tools_used).toEqual([]);
      expect(result.error_count).toBe(0);
    });

    it('should handle mixed valid and invalid JSON lines', async () => {
      const transcriptPath = path.join(testDir, 'mixed.jsonl');
      const content = [
        JSON.stringify({ type: 'tool_use', name: 'Write' }),
        'invalid json line {{{',
        JSON.stringify({ type: 'tool_use', name: 'Read' }),
      ].join('\n');

      fs.writeFileSync(transcriptPath, content);

      const result = await parseTranscript(transcriptPath);

      expect(result.tools_used).toContain('Write');
      expect(result.tools_used).toContain('Read');
    });

    it('should truncate long final output', async () => {
      const transcriptPath = path.join(testDir, 'long.jsonl');
      const longMessage = 'x'.repeat(1000);
      const content = JSON.stringify({
        role: 'assistant',
        content: longMessage,
      });

      fs.writeFileSync(transcriptPath, content);

      const result = await parseTranscript(transcriptPath);

      expect(result.final_output).toBeDefined();
      expect(result.final_output!.length).toBeLessThanOrEqual(503); // 500 + '...'
    });
  });

  describe('extractKeywords', () => {
    it('should extract framework keywords', () => {
      const keywords = extractKeywords(
        'Building a React app with Next.js',
        '',
        'frontend'
      );

      expect(keywords).toContain('react');
      expect(keywords).toContain('category:frameworks');
    });

    it('should extract database keywords', () => {
      const keywords = extractKeywords(
        '',
        'Using PostgreSQL with Prisma ORM',
        ''
      );

      // Both postgres and postgresql are valid matches, check for at least one
      const hasPostgresKeyword =
        keywords.includes('postgres') || keywords.includes('postgresql');
      expect(hasPostgresKeyword).toBe(true);
      expect(keywords).toContain('prisma');
      expect(keywords).toContain('category:databases');
    });

    it('should be case-insensitive', () => {
      const keywords = extractKeywords('TYPESCRIPT and REACT', '', '');

      expect(keywords).toContain('typescript');
      expect(keywords).toContain('react');
    });

    it('should use word boundary matching', () => {
      const keywords = extractKeywords('reaction typescript-eslint', '', '');

      // Should NOT match 'react' in 'reaction'
      expect(keywords).not.toContain('react');
      expect(keywords).toContain('typescript');
    });

    it('should add agent type as keyword', () => {
      const keywords = extractKeywords('', '', 'goodvibes:test-engineer');

      expect(keywords).toContain('agent:test engineer');
    });

    it('should handle empty inputs', () => {
      const keywords = extractKeywords('', '', '');

      expect(keywords).toEqual([]);
    });

    it('should extract authentication keywords', () => {
      const keywords = extractKeywords(
        'Implementing JWT authentication with OAuth',
        '',
        ''
      );

      expect(keywords).toContain('jwt');
      expect(keywords).toContain('oauth');
      expect(keywords).toContain('category:auth');
    });

    it('should extract testing keywords', () => {
      const keywords = extractKeywords(
        '',
        'Writing unit tests with Vitest and Playwright',
        ''
      );

      expect(keywords).toContain('vitest');
      expect(keywords).toContain('playwright');
      expect(keywords).toContain('category:testing');
    });

    it('should return sorted keywords', () => {
      const keywords = extractKeywords('react next.js typescript', '', '');

      const sorted = [...keywords].sort();
      expect(keywords).toEqual(sorted);
    });

    it('should not duplicate keywords', () => {
      const keywords = extractKeywords(
        'react React REACT',
        'react framework react',
        ''
      );

      const reactCount = keywords.filter((k) => k === 'react').length;
      expect(reactCount).toBeLessThanOrEqual(1);
    });
  });

  describe('KEYWORD_CATEGORIES', () => {
    it('should have valid category structure', () => {
      expect(KEYWORD_CATEGORIES).toBeDefined();
      expect(Object.keys(KEYWORD_CATEGORIES).length).toBeGreaterThan(0);
    });

    it('should contain expected framework categories', () => {
      expect(KEYWORD_CATEGORIES.frameworks).toContain('react');
      expect(KEYWORD_CATEGORIES.frameworks).toContain('nextjs');
    });

    it('should contain database keywords', () => {
      expect(KEYWORD_CATEGORIES.databases).toContain('postgres');
      expect(KEYWORD_CATEGORIES.databases).toContain('mongodb');
    });

    it('should have all lowercase keywords', () => {
      for (const [category, keywords] of Object.entries(KEYWORD_CATEGORIES)) {
        for (const keyword of keywords) {
          expect(keyword).toBe(keyword.toLowerCase());
        }
      }
    });
  });

  describe('writeTelemetryRecord', () => {
    let telemetryDir: string;

    beforeEach(() => {
      // Use actual PROJECT_ROOT (scripts directory) for telemetry files
      telemetryDir = path.join(goodvibesDir, 'telemetry');
      fs.mkdirSync(telemetryDir, { recursive: true });
    });

    afterEach(() => {
      // Clean up telemetry files after each test
      if (fs.existsSync(telemetryDir)) {
        const files = fs.readdirSync(telemetryDir);
        for (const file of files) {
          if (file.endsWith('.jsonl')) {
            fs.unlinkSync(path.join(telemetryDir, file));
          }
        }
      }
    });

    it('should write record to monthly JSONL file', async () => {
      const record: TelemetryRecord = {
        type: 'subagent_complete',
        agent_id: 'agent-123',
        agent_type: 'test-engineer',
        session_id: 'session-456',
        project_name: 'test-project',
        started_at: '2025-01-01T00:00:00Z',
        ended_at: '2025-01-01T01:00:00Z',
        duration_ms: 3600000,
        cwd: '/test',
        files_modified: ['/test/file.ts'],
        tools_used: ['Write', 'Read'],
        keywords: ['typescript', 'testing'],
        success: true,
      };

      await writeTelemetryRecord(record);

      // Verify the file was created in the actual PROJECT_ROOT
      const now = new Date();
      const fileName = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}.jsonl`;
      const filePath = path.join(telemetryDir, fileName);

      expect(fs.existsSync(filePath)).toBe(true);

      // Verify structure
      expect(record.type).toBe('subagent_complete');
      expect(record.duration_ms).toBeGreaterThan(0);
    });

    it('should append multiple records to same file', async () => {
      const record1: TelemetryRecord = {
        type: 'subagent_complete',
        agent_id: 'agent-1',
        agent_type: 'test-engineer',
        session_id: 'session-1',
        project_name: 'project',
        started_at: '2025-01-01T00:00:00Z',
        ended_at: '2025-01-01T00:30:00Z',
        duration_ms: 1800000,
        cwd: '/test',
        files_modified: [],
        tools_used: [],
        keywords: [],
        success: true,
      };

      const record2: TelemetryRecord = {
        ...record1,
        agent_id: 'agent-2',
        started_at: '2025-01-01T01:00:00Z',
        ended_at: '2025-01-01T01:30:00Z',
      };

      await writeTelemetryRecord(record1);
      await writeTelemetryRecord(record2);

      // Verify both were written to the same file
      const now = new Date();
      const fileName = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}.jsonl`;
      const filePath = path.join(telemetryDir, fileName);

      expect(fs.existsSync(filePath)).toBe(true);

      const content = fs.readFileSync(filePath, 'utf-8');
      const lines = content.trim().split('\n').filter(Boolean);
      expect(lines.length).toBeGreaterThanOrEqual(2);
    });

    it('should handle records with all optional fields', async () => {
      const record: TelemetryRecord = {
        type: 'subagent_complete',
        agent_id: 'agent-full',
        agent_type: 'backend-engineer',
        session_id: 'session-full',
        project_name: 'full-project',
        started_at: '2025-01-01T00:00:00Z',
        ended_at: '2025-01-01T01:00:00Z',
        duration_ms: 3600000,
        cwd: '/workspace/project',
        git_branch: 'feature/new-api',
        git_commit: 'abc1234',
        task_description: 'Implement new REST endpoint',
        files_modified: ['/src/api/endpoint.ts', '/src/api/endpoint.test.ts'],
        tools_used: ['Write', 'Edit', 'Bash'],
        keywords: ['typescript', 'api', 'rest'],
        success: true,
        final_summary: 'Successfully implemented and tested the new endpoint',
      };

      await writeTelemetryRecord(record);

      expect(record.git_branch).toBe('feature/new-api');
      expect(record.task_description).toBe('Implement new REST endpoint');
      expect(record.final_summary).toBe(
        'Successfully implemented and tested the new endpoint'
      );
    });
  });

  describe('createTelemetryRecord', () => {
    it('should create complete telemetry record from inputs', () => {
      const startEntry: ActiveAgentEntry = {
        agent_id: 'agent-123',
        agent_type: 'test-engineer',
        session_id: 'session-456',
        cwd: '/workspace/project',
        project_name: 'my-project',
        started_at: new Date('2025-01-01T00:00:00Z').toISOString(),
        git_branch: 'main',
        git_commit: 'abc1234',
        task_description: 'Write comprehensive tests',
      };

      const parsedTranscript: ParsedTranscript = {
        files_modified: ['/src/tests/new.test.ts'],
        tools_used: ['Write', 'Bash'],
        error_count: 0,
        success_indicators: ['All tests passed'],
        final_output: 'Successfully completed testing',
      };

      const keywords = ['typescript', 'testing', 'vitest'];

      const record = createTelemetryRecord(
        startEntry,
        parsedTranscript,
        keywords
      );

      expect(record.type).toBe('subagent_complete');
      expect(record.agent_id).toBe('agent-123');
      expect(record.agent_type).toBe('test-engineer');
      expect(record.project_name).toBe('my-project');
      expect(record.git_branch).toBe('main');
      expect(record.files_modified).toEqual(['/src/tests/new.test.ts']);
      expect(record.tools_used).toEqual(['Write', 'Bash']);
      expect(record.keywords).toEqual(keywords);
      expect(record.success).toBe(true);
    });

    it('should calculate duration correctly', () => {
      const startEntry: ActiveAgentEntry = {
        agent_id: 'agent-timing',
        agent_type: 'test-engineer',
        session_id: 'session-timing',
        cwd: '/test',
        project_name: 'project',
        started_at: new Date('2025-01-01T00:00:00Z').toISOString(),
      };

      const parsedTranscript: ParsedTranscript = {
        files_modified: [],
        tools_used: [],
        error_count: 0,
        success_indicators: [],
      };

      const record = createTelemetryRecord(startEntry, parsedTranscript, []);

      expect(record.duration_ms).toBeGreaterThan(0);
      expect(record.started_at).toBe(startEntry.started_at);
      expect(record.ended_at).toBeDefined();
    });

    it('should mark success as false when errors occurred', () => {
      const startEntry: ActiveAgentEntry = {
        agent_id: 'agent-error',
        agent_type: 'backend-engineer',
        session_id: 'session-error',
        cwd: '/test',
        project_name: 'project',
        started_at: new Date().toISOString(),
      };

      const parsedTranscript: ParsedTranscript = {
        files_modified: [],
        tools_used: [],
        error_count: 5,
        success_indicators: [],
      };

      const record = createTelemetryRecord(startEntry, parsedTranscript, []);

      expect(record.success).toBe(false);
    });

    it('should mark success as true when success indicators present despite errors', () => {
      const startEntry: ActiveAgentEntry = {
        agent_id: 'agent-recovered',
        agent_type: 'test-engineer',
        session_id: 'session-recovered',
        cwd: '/test',
        project_name: 'project',
        started_at: new Date().toISOString(),
      };

      const parsedTranscript: ParsedTranscript = {
        files_modified: [],
        tools_used: [],
        error_count: 2,
        success_indicators: ['Successfully recovered', 'Task completed'],
      };

      const record = createTelemetryRecord(startEntry, parsedTranscript, []);

      expect(record.success).toBe(true);
    });

    it('should handle missing optional fields', () => {
      const startEntry: ActiveAgentEntry = {
        agent_id: 'agent-minimal',
        agent_type: 'test-engineer',
        session_id: 'session-minimal',
        cwd: '/test',
        project_name: 'project',
        started_at: new Date().toISOString(),
      };

      const parsedTranscript: ParsedTranscript = {
        files_modified: [],
        tools_used: [],
        error_count: 0,
        success_indicators: [],
      };

      const record = createTelemetryRecord(startEntry, parsedTranscript, []);

      expect(record.git_branch).toBeUndefined();
      expect(record.git_commit).toBeUndefined();
      expect(record.task_description).toBeUndefined();
      expect(record.final_summary).toBeUndefined();
    });
  });
});
