/**
 * Unit tests for subagent-stop hook
 *
 * Tests cover:
 * - Telemetry completion recording
 * - Agent tracking persistence
 * - Duration calculation
 * - Outcome recording (completed/failed)
 * - Keyword extraction from agent output
 * - Files touched tracking
 * - Correlation with start entries
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import {
  saveAgentTracking,
  getAgentTracking,
  removeAgentTracking,
  writeTelemetryEntry,
  buildTelemetryEntry,
} from '../subagent-stop/telemetry.js';
import type { TelemetryTracking, TelemetryEntry } from '../types/telemetry.js';

// Mock dependencies
vi.mock('../shared.js', () => ({
  ensureGoodVibesDir: vi.fn(),
  parseTranscript: vi.fn(),
  extractKeywords: vi.fn(),
}));

describe('subagent-stop', () => {
  let testDir: string;

  beforeEach(() => {
    testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'goodvibes-subagent-stop-test-'));
    vi.clearAllMocks();
  });

  afterEach(() => {
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true, force: true });
    }
  });

  describe('saveAgentTracking', () => {
    it('should save tracking data to file', async () => {
      const { ensureGoodVibesDir } = await import('../shared.js');
      const trackingDir = path.join(testDir, '.goodvibes');

      vi.mocked(ensureGoodVibesDir).mockImplementation(async (cwd) => {
        const goodvibesDir = path.join(cwd, '.goodvibes');
        fs.mkdirSync(goodvibesDir, { recursive: true });
        return goodvibesDir;
      });

      const tracking: TelemetryTracking = {
        agent_id: 'agent-123',
        agent_type: 'test-engineer',
        session_id: 'session-456',
        project: '/workspace/project',
        project_name: 'my-project',
        started_at: new Date().toISOString(),
      };

      await saveAgentTracking(testDir, tracking);

      const trackingPath = path.join(trackingDir, 'state', 'agent-tracking.json');
      expect(fs.existsSync(trackingPath)).toBe(true);

      const saved = JSON.parse(fs.readFileSync(trackingPath, 'utf-8'));
      expect(saved['agent-123']).toBeDefined();
      expect(saved['agent-123'].agent_type).toBe('test-engineer');
    });

    it('should include optional git information', async () => {
      const { ensureGoodVibesDir } = await import('../shared.js');
      const trackingDir = path.join(testDir, '.goodvibes');

      vi.mocked(ensureGoodVibesDir).mockImplementation(async (cwd) => {
        const goodvibesDir = path.join(cwd, '.goodvibes');
        fs.mkdirSync(goodvibesDir, { recursive: true });
        return goodvibesDir;
      });

      const tracking: TelemetryTracking = {
        agent_id: 'agent-git',
        agent_type: 'backend-engineer',
        session_id: 'session-git',
        project: '/workspace',
        project_name: 'git-project',
        started_at: new Date().toISOString(),
        git_branch: 'feature/new-feature',
        git_commit: 'abc1234',
      };

      await saveAgentTracking(testDir, tracking);

      const trackingPath = path.join(trackingDir, 'state', 'agent-tracking.json');
      const saved = JSON.parse(fs.readFileSync(trackingPath, 'utf-8'));

      expect(saved['agent-git'].git_branch).toBe('feature/new-feature');
      expect(saved['agent-git'].git_commit).toBe('abc1234');
    });

    it('should append to existing tracking data', async () => {
      const { ensureGoodVibesDir } = await import('../shared.js');
      const trackingDir = path.join(testDir, '.goodvibes');

      vi.mocked(ensureGoodVibesDir).mockImplementation(async (cwd) => {
        const goodvibesDir = path.join(cwd, '.goodvibes');
        fs.mkdirSync(goodvibesDir, { recursive: true });
        return goodvibesDir;
      });

      const tracking1: TelemetryTracking = {
        agent_id: 'agent-1',
        agent_type: 'test-engineer',
        session_id: 'session-1',
        project: '/test',
        project_name: 'project',
        started_at: new Date().toISOString(),
      };

      const tracking2: TelemetryTracking = {
        agent_id: 'agent-2',
        agent_type: 'backend-engineer',
        session_id: 'session-2',
        project: '/test',
        project_name: 'project',
        started_at: new Date().toISOString(),
      };

      await saveAgentTracking(testDir, tracking1);
      await saveAgentTracking(testDir, tracking2);

      const trackingPath = path.join(trackingDir, 'state', 'agent-tracking.json');
      const saved = JSON.parse(fs.readFileSync(trackingPath, 'utf-8'));

      expect(Object.keys(saved)).toHaveLength(2);
      expect(saved['agent-1']).toBeDefined();
      expect(saved['agent-2']).toBeDefined();
    });

    it('should overwrite existing agent tracking', async () => {
      const { ensureGoodVibesDir } = await import('../shared.js');
      const trackingDir = path.join(testDir, '.goodvibes');

      vi.mocked(ensureGoodVibesDir).mockImplementation(async (cwd) => {
        const goodvibesDir = path.join(cwd, '.goodvibes');
        fs.mkdirSync(goodvibesDir, { recursive: true });
        return goodvibesDir;
      });

      const tracking1: TelemetryTracking = {
        agent_id: 'agent-dup',
        agent_type: 'test-engineer',
        session_id: 'session-1',
        project: '/test',
        project_name: 'project',
        started_at: '2025-01-01T00:00:00Z',
      };

      const tracking2: TelemetryTracking = {
        agent_id: 'agent-dup',
        agent_type: 'backend-engineer',
        session_id: 'session-2',
        project: '/test',
        project_name: 'project',
        started_at: '2025-01-01T01:00:00Z',
      };

      await saveAgentTracking(testDir, tracking1);
      await saveAgentTracking(testDir, tracking2);

      const trackingPath = path.join(trackingDir, 'state', 'agent-tracking.json');
      const saved = JSON.parse(fs.readFileSync(trackingPath, 'utf-8'));

      expect(Object.keys(saved)).toHaveLength(1);
      expect(saved['agent-dup'].agent_type).toBe('backend-engineer');
    });

    it('should handle corrupted tracking file gracefully', async () => {
      const { ensureGoodVibesDir } = await import('../shared.js');
      const trackingDir = path.join(testDir, '.goodvibes', 'state');

      vi.mocked(ensureGoodVibesDir).mockImplementation(async (cwd) => {
        const goodvibesDir = path.join(cwd, '.goodvibes');
        fs.mkdirSync(path.join(goodvibesDir, 'state'), { recursive: true });
        return goodvibesDir;
      });

      // Create corrupted file
      const trackingPath = path.join(trackingDir, 'agent-tracking.json');
      fs.writeFileSync(trackingPath, 'invalid json {{{');

      const tracking: TelemetryTracking = {
        agent_id: 'agent-new',
        agent_type: 'test-engineer',
        session_id: 'session-new',
        project: '/test',
        project_name: 'project',
        started_at: new Date().toISOString(),
      };

      await saveAgentTracking(testDir, tracking);

      const saved = JSON.parse(fs.readFileSync(trackingPath, 'utf-8'));
      expect(saved['agent-new']).toBeDefined();
    });
  });

  describe('getAgentTracking', () => {
    it('should retrieve existing tracking data', async () => {
      const { ensureGoodVibesDir } = await import('../shared.js');
      const trackingDir = path.join(testDir, '.goodvibes', 'state');

      vi.mocked(ensureGoodVibesDir).mockImplementation(async (cwd) => {
        const goodvibesDir = path.join(cwd, '.goodvibes');
        fs.mkdirSync(path.join(goodvibesDir, 'state'), { recursive: true });
        return goodvibesDir;
      });

      const tracking: TelemetryTracking = {
        agent_id: 'agent-123',
        agent_type: 'test-engineer',
        session_id: 'session-456',
        project: '/test',
        project_name: 'project',
        started_at: new Date().toISOString(),
      };

      await saveAgentTracking(testDir, tracking);

      const retrieved = await getAgentTracking(testDir, 'agent-123');

      expect(retrieved).toBeDefined();
      expect(retrieved?.agent_id).toBe('agent-123');
      expect(retrieved?.agent_type).toBe('test-engineer');
    });

    it('should return null for non-existent agent', async () => {
      const { ensureGoodVibesDir } = await import('../shared.js');

      vi.mocked(ensureGoodVibesDir).mockImplementation(async (cwd) => {
        const goodvibesDir = path.join(cwd, '.goodvibes');
        fs.mkdirSync(goodvibesDir, { recursive: true });
        return goodvibesDir;
      });

      const retrieved = await getAgentTracking(testDir, 'non-existent');

      expect(retrieved).toBeNull();
    });

    it('should return null when tracking file does not exist', async () => {
      const retrieved = await getAgentTracking(testDir, 'agent-123');

      expect(retrieved).toBeNull();
    });

    it('should handle corrupted tracking file', async () => {
      const trackingDir = path.join(testDir, '.goodvibes', 'state');
      fs.mkdirSync(trackingDir, { recursive: true });

      const trackingPath = path.join(trackingDir, 'agent-tracking.json');
      fs.writeFileSync(trackingPath, 'invalid json');

      const retrieved = await getAgentTracking(testDir, 'agent-123');

      expect(retrieved).toBeNull();
    });
  });

  describe('removeAgentTracking', () => {
    it('should remove specific agent from tracking', async () => {
      const { ensureGoodVibesDir } = await import('../shared.js');
      const trackingDir = path.join(testDir, '.goodvibes', 'state');

      vi.mocked(ensureGoodVibesDir).mockImplementation(async (cwd) => {
        const goodvibesDir = path.join(cwd, '.goodvibes');
        fs.mkdirSync(path.join(goodvibesDir, 'state'), { recursive: true });
        return goodvibesDir;
      });

      const tracking1: TelemetryTracking = {
        agent_id: 'agent-1',
        agent_type: 'test-engineer',
        session_id: 'session-1',
        project: '/test',
        project_name: 'project',
        started_at: new Date().toISOString(),
      };

      const tracking2: TelemetryTracking = {
        agent_id: 'agent-2',
        agent_type: 'backend-engineer',
        session_id: 'session-2',
        project: '/test',
        project_name: 'project',
        started_at: new Date().toISOString(),
      };

      await saveAgentTracking(testDir, tracking1);
      await saveAgentTracking(testDir, tracking2);

      await removeAgentTracking(testDir, 'agent-1');

      const trackingPath = path.join(trackingDir, 'agent-tracking.json');
      const saved = JSON.parse(fs.readFileSync(trackingPath, 'utf-8'));

      expect(saved['agent-1']).toBeUndefined();
      expect(saved['agent-2']).toBeDefined();
    });

    it('should handle removing non-existent agent gracefully', async () => {
      const { ensureGoodVibesDir } = await import('../shared.js');

      vi.mocked(ensureGoodVibesDir).mockImplementation(async (cwd) => {
        const goodvibesDir = path.join(cwd, '.goodvibes');
        fs.mkdirSync(goodvibesDir, { recursive: true });
        return goodvibesDir;
      });

      await expect(removeAgentTracking(testDir, 'non-existent')).resolves.toBeUndefined();
    });

    it('should handle missing tracking file', async () => {
      await expect(removeAgentTracking(testDir, 'agent-123')).resolves.toBeUndefined();
    });
  });

  describe('writeTelemetryEntry', () => {
    it('should write entry to monthly JSONL file', async () => {
      const { ensureGoodVibesDir } = await import('../shared.js');
      const telemetryDir = path.join(testDir, '.goodvibes', 'telemetry');

      vi.mocked(ensureGoodVibesDir).mockImplementation(async (cwd) => {
        const goodvibesDir = path.join(cwd, '.goodvibes');
        fs.mkdirSync(path.join(goodvibesDir, 'telemetry'), { recursive: true });
        return goodvibesDir;
      });

      const entry: TelemetryEntry = {
        event: 'subagent_complete',
        agent_id: 'agent-123',
        agent_type: 'test-engineer',
        session_id: 'session-456',
        project: '/workspace/project',
        project_name: 'my-project',
        started_at: '2025-01-01T00:00:00Z',
        ended_at: '2025-01-01T01:00:00Z',
        duration_ms: 3600000,
        status: 'completed',
        keywords: ['typescript', 'testing'],
        files_modified: ['/src/test.ts'],
        tools_used: ['Write', 'Bash'],
        summary: 'Completed testing',
      };

      await writeTelemetryEntry(testDir, entry);

      const now = new Date();
      const fileName = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}.jsonl`;
      const telemetryPath = path.join(telemetryDir, fileName);

      expect(fs.existsSync(telemetryPath)).toBe(true);

      const content = fs.readFileSync(telemetryPath, 'utf-8');
      const lines = content.split('\n').filter(Boolean);

      expect(lines).toHaveLength(1);
      const parsed = JSON.parse(lines[0]);
      expect(parsed.agent_id).toBe('agent-123');
    });

    it('should append multiple entries to same file', async () => {
      const { ensureGoodVibesDir } = await import('../shared.js');
      const telemetryDir = path.join(testDir, '.goodvibes', 'telemetry');

      vi.mocked(ensureGoodVibesDir).mockImplementation(async (cwd) => {
        const goodvibesDir = path.join(cwd, '.goodvibes');
        fs.mkdirSync(path.join(goodvibesDir, 'telemetry'), { recursive: true });
        return goodvibesDir;
      });

      const entry1: TelemetryEntry = {
        event: 'subagent_complete',
        agent_id: 'agent-1',
        agent_type: 'test-engineer',
        session_id: 'session-1',
        project: '/test',
        project_name: 'project',
        started_at: '2025-01-01T00:00:00Z',
        ended_at: '2025-01-01T00:30:00Z',
        duration_ms: 1800000,
        status: 'completed',
        keywords: [],
        files_modified: [],
        tools_used: [],
        summary: 'Done',
      };

      const entry2: TelemetryEntry = {
        ...entry1,
        agent_id: 'agent-2',
        started_at: '2025-01-01T01:00:00Z',
        ended_at: '2025-01-01T01:30:00Z',
      };

      await writeTelemetryEntry(testDir, entry1);
      await writeTelemetryEntry(testDir, entry2);

      const now = new Date();
      const fileName = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}.jsonl`;
      const telemetryPath = path.join(telemetryDir, fileName);

      const content = fs.readFileSync(telemetryPath, 'utf-8');
      const lines = content.split('\n').filter(Boolean);

      expect(lines).toHaveLength(2);
    });
  });

  describe('buildTelemetryEntry', () => {
    it('should build complete telemetry entry', async () => {
      const { parseTranscript, extractKeywords } = await import('../shared.js');

      vi.mocked(parseTranscript).mockReturnValue({
        toolsUsed: ['Write', 'Bash'],
        filesModified: ['/src/test.ts', '/src/utils.ts'],
        summary: 'Implemented new feature',
      });

      vi.mocked(extractKeywords).mockReturnValue(['typescript', 'testing', 'vitest']);

      const tracking: TelemetryTracking = {
        agent_id: 'agent-123',
        agent_type: 'test-engineer',
        session_id: 'session-456',
        project: '/workspace/project',
        project_name: 'my-project',
        started_at: new Date('2025-01-01T00:00:00Z').toISOString(),
        git_branch: 'main',
        git_commit: 'abc1234',
      };

      const entry = await buildTelemetryEntry(tracking, '/path/to/transcript.jsonl', 'completed');

      expect(entry.event).toBe('subagent_complete');
      expect(entry.agent_id).toBe('agent-123');
      expect(entry.status).toBe('completed');
      expect(entry.tools_used).toEqual(['Write', 'Bash']);
      expect(entry.files_modified).toEqual(['/src/test.ts', '/src/utils.ts']);
      expect(entry.keywords).toContain('typescript');
      expect(entry.keywords).toContain('test-engineer');
    });

    it('should calculate duration correctly', async () => {
      const { parseTranscript, extractKeywords } = await import('../shared.js');

      vi.mocked(parseTranscript).mockReturnValue({
        toolsUsed: [],
        filesModified: [],
        summary: '',
      });

      vi.mocked(extractKeywords).mockReturnValue([]);

      const tracking: TelemetryTracking = {
        agent_id: 'agent-timing',
        agent_type: 'test-engineer',
        session_id: 'session-timing',
        project: '/test',
        project_name: 'project',
        started_at: new Date('2025-01-01T00:00:00Z').toISOString(),
      };

      const entry = await buildTelemetryEntry(tracking, '/path/to/transcript.jsonl', 'completed');

      expect(entry.duration_ms).toBeGreaterThan(0);
    });

    it('should add agent name as first keyword', async () => {
      const { parseTranscript, extractKeywords } = await import('../shared.js');

      vi.mocked(parseTranscript).mockReturnValue({
        toolsUsed: [],
        filesModified: [],
        summary: '',
      });

      vi.mocked(extractKeywords).mockReturnValue(['typescript', 'react']);

      const tracking: TelemetryTracking = {
        agent_id: 'agent-123',
        agent_type: 'goodvibes:frontend-architect',
        session_id: 'session-123',
        project: '/test',
        project_name: 'project',
        started_at: new Date().toISOString(),
      };

      const entry = await buildTelemetryEntry(tracking, '/path/to/transcript.jsonl', 'completed');

      expect(entry.keywords[0]).toBe('frontend-architect');
    });

    it('should not duplicate agent name in keywords', async () => {
      const { parseTranscript, extractKeywords } = await import('../shared.js');

      vi.mocked(parseTranscript).mockReturnValue({
        toolsUsed: [],
        filesModified: [],
        summary: '',
      });

      vi.mocked(extractKeywords).mockReturnValue(['test-engineer', 'typescript']);

      const tracking: TelemetryTracking = {
        agent_id: 'agent-123',
        agent_type: 'goodvibes:test-engineer',
        session_id: 'session-123',
        project: '/test',
        project_name: 'project',
        started_at: new Date().toISOString(),
      };

      const entry = await buildTelemetryEntry(tracking, '/path/to/transcript.jsonl', 'completed');

      const engineerCount = entry.keywords.filter(k => k === 'test-engineer').length;
      expect(engineerCount).toBe(1);
    });

    it('should handle failed status', async () => {
      const { parseTranscript, extractKeywords } = await import('../shared.js');

      vi.mocked(parseTranscript).mockReturnValue({
        toolsUsed: [],
        filesModified: [],
        summary: 'Error occurred',
      });

      vi.mocked(extractKeywords).mockReturnValue([]);

      const tracking: TelemetryTracking = {
        agent_id: 'agent-fail',
        agent_type: 'test-engineer',
        session_id: 'session-fail',
        project: '/test',
        project_name: 'project',
        started_at: new Date().toISOString(),
      };

      const entry = await buildTelemetryEntry(tracking, '/path/to/transcript.jsonl', 'failed');

      expect(entry.status).toBe('failed');
    });

    it('should include git information', async () => {
      const { parseTranscript, extractKeywords } = await import('../shared.js');

      vi.mocked(parseTranscript).mockReturnValue({
        toolsUsed: [],
        filesModified: [],
        summary: '',
      });

      vi.mocked(extractKeywords).mockReturnValue([]);

      const tracking: TelemetryTracking = {
        agent_id: 'agent-git',
        agent_type: 'backend-engineer',
        session_id: 'session-git',
        project: '/workspace',
        project_name: 'git-project',
        started_at: new Date().toISOString(),
        git_branch: 'feature/new-api',
        git_commit: 'def5678',
      };

      const entry = await buildTelemetryEntry(tracking, '/path/to/transcript.jsonl', 'completed');

      expect(entry.git_branch).toBe('feature/new-api');
      expect(entry.git_commit).toBe('def5678');
    });

    it('should extract keywords from transcript summary', async () => {
      const { parseTranscript, extractKeywords } = await import('../shared.js');

      vi.mocked(parseTranscript).mockReturnValue({
        toolsUsed: [],
        filesModified: [],
        summary: 'Implemented React components with TypeScript',
      });

      vi.mocked(extractKeywords).mockReturnValue(['react', 'typescript']);

      const tracking: TelemetryTracking = {
        agent_id: 'agent-123',
        agent_type: 'frontend-architect',
        session_id: 'session-123',
        project: '/test',
        project_name: 'project',
        started_at: new Date().toISOString(),
      };

      const entry = await buildTelemetryEntry(tracking, '/path/to/transcript.jsonl', 'completed');

      expect(entry.keywords).toContain('react');
      expect(entry.keywords).toContain('typescript');
    });
  });
});
