/**
 * Tests for subagent-stop/telemetry module
 *
 * Tests cover:
 * - saveAgentTracking: persist tracking data to disk
 * - getAgentTracking: retrieve tracking data for a specific agent
 * - removeAgentTracking: remove tracking data for a specific agent
 * - writeTelemetryEntry: append telemetry entries to monthly log files
 * - buildTelemetryEntry: build telemetry entry from tracking data and transcript
 */

import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import type {
  TelemetryEntry,
  TelemetryTracking,
} from '../../types/telemetry.js';

// Mock dependencies
const mockEnsureGoodVibesDir = vi.fn();
const mockParseTranscript = vi.fn();
const mockExtractKeywords = vi.fn();
const mockFileExists = vi.fn();
const mockDebug = vi.fn();

// Mock shared/index.js
vi.mock('../../shared/index.js', () => ({
  ensureGoodVibesDir: (...args: unknown[]) => mockEnsureGoodVibesDir(...args),
  parseTranscript: (...args: unknown[]) => mockParseTranscript(...args),
  extractKeywords: (...args: unknown[]) => mockExtractKeywords(...args),
  fileExists: (...args: unknown[]) => mockFileExists(...args),
  isTestEnvironment: () => false,
}));

// Mock shared/logging.js
vi.mock('../../shared/logging.js', () => ({
  debug: (...args: unknown[]) => mockDebug(...args),
}));

describe('subagent-stop/telemetry', () => {
  let testDir: string;
  let goodvibesDir: string;

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.resetModules();

    // Create a fresh temp directory for each test
    testDir = await fs.mkdtemp(
      path.join(os.tmpdir(), 'goodvibes-telemetry-test-')
    );
    goodvibesDir = path.join(testDir, '.goodvibes');

    // Create required directories
    await fs.mkdir(path.join(goodvibesDir, 'state'), { recursive: true });
    await fs.mkdir(path.join(goodvibesDir, 'telemetry'), { recursive: true });

    // Default mock implementations
    mockEnsureGoodVibesDir.mockResolvedValue(goodvibesDir);
  });

  afterEach(async () => {
    // Clean up temp directory
    try {
      await fs.rm(testDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  // ============================================================================
  // saveAgentTracking tests
  // ============================================================================
  describe('saveAgentTracking', () => {
    it('should create new tracking file when none exists', async () => {
      mockFileExists.mockResolvedValue(false);

      const tracking: TelemetryTracking = {
        agent_id: 'agent-123',
        agent_type: 'test-engineer',
        session_id: 'session-456',
        project: testDir,
        project_name: 'test-project',
        started_at: '2025-01-01T00:00:00Z',
      };

      const { saveAgentTracking } =
        await import('../../subagent-stop/telemetry.js');
      await saveAgentTracking(testDir, tracking);

      // Verify file was written
      const trackingPath = path.join(
        goodvibesDir,
        'state',
        'agent-tracking.json'
      );
      const content = await fs.readFile(trackingPath, 'utf-8');
      const saved = JSON.parse(content);

      expect(saved['agent-123']).toBeDefined();
      expect(saved['agent-123'].agent_type).toBe('test-engineer');
      expect(mockEnsureGoodVibesDir).toHaveBeenCalledWith(testDir);
    });

    it('should append to existing tracking file', async () => {
      // Create existing tracking file
      const trackingPath = path.join(
        goodvibesDir,
        'state',
        'agent-tracking.json'
      );
      const existingData = {
        'existing-agent': {
          agent_id: 'existing-agent',
          agent_type: 'backend-engineer',
          session_id: 'session-existing',
          project: testDir,
          project_name: 'existing-project',
          started_at: '2025-01-01T00:00:00Z',
        },
      };
      await fs.writeFile(trackingPath, JSON.stringify(existingData));
      mockFileExists.mockResolvedValue(true);

      const tracking: TelemetryTracking = {
        agent_id: 'new-agent',
        agent_type: 'test-engineer',
        session_id: 'session-new',
        project: testDir,
        project_name: 'new-project',
        started_at: '2025-01-01T01:00:00Z',
      };

      const { saveAgentTracking } =
        await import('../../subagent-stop/telemetry.js');
      await saveAgentTracking(testDir, tracking);

      // Verify both agents are in file
      const content = await fs.readFile(trackingPath, 'utf-8');
      const saved = JSON.parse(content);

      expect(saved['existing-agent']).toBeDefined();
      expect(saved['new-agent']).toBeDefined();
    });

    it('should handle corrupted JSON file gracefully', async () => {
      // Create corrupted tracking file
      const trackingPath = path.join(
        goodvibesDir,
        'state',
        'agent-tracking.json'
      );
      await fs.writeFile(trackingPath, 'invalid json {{{');
      mockFileExists.mockResolvedValue(true);

      const tracking: TelemetryTracking = {
        agent_id: 'agent-recovery',
        agent_type: 'test-engineer',
        session_id: 'session-recovery',
        project: testDir,
        project_name: 'recovery-project',
        started_at: '2025-01-01T00:00:00Z',
      };

      const { saveAgentTracking } =
        await import('../../subagent-stop/telemetry.js');
      await saveAgentTracking(testDir, tracking);

      // Verify debug was called for the error
      expect(mockDebug).toHaveBeenCalledWith(
        'telemetry operation failed',
        expect.any(Object)
      );

      // Verify new tracking was still saved (starts fresh)
      const content = await fs.readFile(trackingPath, 'utf-8');
      const saved = JSON.parse(content);
      expect(saved['agent-recovery']).toBeDefined();
    });

    it('should overwrite existing agent with same ID', async () => {
      const trackingPath = path.join(
        goodvibesDir,
        'state',
        'agent-tracking.json'
      );
      const existingData = {
        'agent-update': {
          agent_id: 'agent-update',
          agent_type: 'old-type',
          session_id: 'old-session',
          project: testDir,
          project_name: 'old-project',
          started_at: '2025-01-01T00:00:00Z',
        },
      };
      await fs.writeFile(trackingPath, JSON.stringify(existingData));
      mockFileExists.mockResolvedValue(true);

      const tracking: TelemetryTracking = {
        agent_id: 'agent-update',
        agent_type: 'new-type',
        session_id: 'new-session',
        project: testDir,
        project_name: 'new-project',
        started_at: '2025-01-01T02:00:00Z',
      };

      const { saveAgentTracking } =
        await import('../../subagent-stop/telemetry.js');
      await saveAgentTracking(testDir, tracking);

      const content = await fs.readFile(trackingPath, 'utf-8');
      const saved = JSON.parse(content);

      expect(saved['agent-update'].agent_type).toBe('new-type');
      expect(saved['agent-update'].session_id).toBe('new-session');
    });

    it('should include optional git fields', async () => {
      mockFileExists.mockResolvedValue(false);

      const tracking: TelemetryTracking = {
        agent_id: 'agent-git',
        agent_type: 'backend-engineer',
        session_id: 'session-git',
        project: testDir,
        project_name: 'git-project',
        git_branch: 'feature/new-feature',
        git_commit: 'abc1234',
        started_at: '2025-01-01T00:00:00Z',
      };

      const { saveAgentTracking } =
        await import('../../subagent-stop/telemetry.js');
      await saveAgentTracking(testDir, tracking);

      const trackingPath = path.join(
        goodvibesDir,
        'state',
        'agent-tracking.json'
      );
      const content = await fs.readFile(trackingPath, 'utf-8');
      const saved = JSON.parse(content);

      expect(saved['agent-git'].git_branch).toBe('feature/new-feature');
      expect(saved['agent-git'].git_commit).toBe('abc1234');
    });
  });

  // ============================================================================
  // getAgentTracking tests
  // ============================================================================
  describe('getAgentTracking', () => {
    it('should return null when tracking file does not exist', async () => {
      mockFileExists.mockResolvedValue(false);

      const { getAgentTracking } =
        await import('../../subagent-stop/telemetry.js');
      const result = await getAgentTracking(testDir, 'non-existent');

      expect(result).toBeNull();
    });

    it('should return tracking data for existing agent', async () => {
      const trackingPath = path.join(
        goodvibesDir,
        'state',
        'agent-tracking.json'
      );
      const trackingData: TelemetryTracking = {
        agent_id: 'agent-find',
        agent_type: 'test-engineer',
        session_id: 'session-find',
        project: testDir,
        project_name: 'find-project',
        started_at: '2025-01-01T00:00:00Z',
      };
      await fs.writeFile(
        trackingPath,
        JSON.stringify({ 'agent-find': trackingData })
      );
      mockFileExists.mockResolvedValue(true);

      const { getAgentTracking } =
        await import('../../subagent-stop/telemetry.js');
      const result = await getAgentTracking(testDir, 'agent-find');

      expect(result).toEqual(trackingData);
    });

    it('should return null when agent ID not found in tracking file', async () => {
      const trackingPath = path.join(
        goodvibesDir,
        'state',
        'agent-tracking.json'
      );
      const trackingData = {
        'other-agent': {
          agent_id: 'other-agent',
          agent_type: 'backend-engineer',
          session_id: 'session-other',
          project: testDir,
          project_name: 'other-project',
          started_at: '2025-01-01T00:00:00Z',
        },
      };
      await fs.writeFile(trackingPath, JSON.stringify(trackingData));
      mockFileExists.mockResolvedValue(true);

      const { getAgentTracking } =
        await import('../../subagent-stop/telemetry.js');
      const result = await getAgentTracking(testDir, 'missing-agent');

      expect(result).toBeNull();
    });

    it('should handle corrupted JSON file gracefully', async () => {
      const trackingPath = path.join(
        goodvibesDir,
        'state',
        'agent-tracking.json'
      );
      await fs.writeFile(trackingPath, 'corrupted json data {{{');
      mockFileExists.mockResolvedValue(true);

      const { getAgentTracking } =
        await import('../../subagent-stop/telemetry.js');
      const result = await getAgentTracking(testDir, 'any-agent');

      expect(result).toBeNull();
      expect(mockDebug).toHaveBeenCalledWith(
        'getAgentTracking failed',
        expect.any(Object)
      );
    });

    it('should handle type guard returning false when parsed is not a record (line 75)', async () => {
      const trackingPath = path.join(
        goodvibesDir,
        'state',
        'agent-tracking.json'
      );
      // Create a file with an array (not a record)
      await fs.writeFile(trackingPath, JSON.stringify(['not', 'a', 'record']));
      mockFileExists.mockResolvedValue(true);

      const { getAgentTracking } =
        await import('../../subagent-stop/telemetry.js');
      const result = await getAgentTracking(testDir, 'any-agent');

      // Should return null when type guard fails (line 75 returns null)
      expect(result).toBeNull();
    });

    it('should handle null JSON in getAgentTracking (line 75)', async () => {
      const trackingPath = path.join(
        goodvibesDir,
        'state',
        'agent-tracking.json'
      );
      await fs.writeFile(trackingPath, 'null');
      mockFileExists.mockResolvedValue(true);

      const { getAgentTracking } =
        await import('../../subagent-stop/telemetry.js');
      const result = await getAgentTracking(testDir, 'test');

      // Should return null when JSON is null
      expect(result).toBeNull();
    });
  });

  // ============================================================================
  // removeAgentTracking tests
  // ============================================================================
  describe('removeAgentTracking', () => {
    it('should do nothing when tracking file does not exist', async () => {
      mockFileExists.mockResolvedValue(false);

      const { removeAgentTracking } =
        await import('../../subagent-stop/telemetry.js');
      await removeAgentTracking(testDir, 'non-existent');

      // Should complete without error
      expect(mockDebug).not.toHaveBeenCalled();
    });

    it('should remove agent from tracking file', async () => {
      const trackingPath = path.join(
        goodvibesDir,
        'state',
        'agent-tracking.json'
      );
      const trackingData = {
        'agent-keep': {
          agent_id: 'agent-keep',
          agent_type: 'backend-engineer',
          session_id: 'session-keep',
          project: testDir,
          project_name: 'keep-project',
          started_at: '2025-01-01T00:00:00Z',
        },
        'agent-remove': {
          agent_id: 'agent-remove',
          agent_type: 'test-engineer',
          session_id: 'session-remove',
          project: testDir,
          project_name: 'remove-project',
          started_at: '2025-01-01T01:00:00Z',
        },
      };
      await fs.writeFile(trackingPath, JSON.stringify(trackingData));
      mockFileExists.mockResolvedValue(true);

      const { removeAgentTracking } =
        await import('../../subagent-stop/telemetry.js');
      await removeAgentTracking(testDir, 'agent-remove');

      const content = await fs.readFile(trackingPath, 'utf-8');
      const saved = JSON.parse(content);

      expect(saved['agent-keep']).toBeDefined();
      expect(saved['agent-remove']).toBeUndefined();
    });

    it('should handle removing non-existent agent ID gracefully', async () => {
      const trackingPath = path.join(
        goodvibesDir,
        'state',
        'agent-tracking.json'
      );
      const trackingData = {
        'agent-existing': {
          agent_id: 'agent-existing',
          agent_type: 'test-engineer',
          session_id: 'session-existing',
          project: testDir,
          project_name: 'existing-project',
          started_at: '2025-01-01T00:00:00Z',
        },
      };
      await fs.writeFile(trackingPath, JSON.stringify(trackingData));
      mockFileExists.mockResolvedValue(true);

      const { removeAgentTracking } =
        await import('../../subagent-stop/telemetry.js');
      await removeAgentTracking(testDir, 'non-existent-agent');

      // Original data should remain intact
      const content = await fs.readFile(trackingPath, 'utf-8');
      const saved = JSON.parse(content);
      expect(saved['agent-existing']).toBeDefined();
    });

    it('should handle corrupted JSON file gracefully', async () => {
      const trackingPath = path.join(
        goodvibesDir,
        'state',
        'agent-tracking.json'
      );
      await fs.writeFile(trackingPath, 'invalid json {{{');
      mockFileExists.mockResolvedValue(true);

      const { removeAgentTracking } =
        await import('../../subagent-stop/telemetry.js');
      await removeAgentTracking(testDir, 'any-agent');

      // Should log debug message and not throw
      expect(mockDebug).toHaveBeenCalledWith(
        'telemetry operation failed',
        expect.any(Object)
      );
    });
  });

  // ============================================================================
  // writeTelemetryEntry tests
  // ============================================================================
  describe('writeTelemetryEntry', () => {
    it('should write telemetry entry to monthly JSONL file', async () => {
      const entry: TelemetryEntry = {
        event: 'subagent_complete',
        agent_id: 'agent-telemetry',
        agent_type: 'test-engineer',
        session_id: 'session-telemetry',
        project: testDir,
        project_name: 'telemetry-project',
        started_at: '2025-01-01T00:00:00Z',
        ended_at: '2025-01-01T01:00:00Z',
        duration_ms: 3600000,
        status: 'completed',
        keywords: ['typescript', 'testing'],
        files_modified: ['/src/test.ts'],
        tools_used: ['Write', 'Bash'],
        summary: 'Test completed successfully',
      };

      const { writeTelemetryEntry } =
        await import('../../subagent-stop/telemetry.js');
      await writeTelemetryEntry(testDir, entry);

      // Verify file was created with correct name format
      const now = new Date();
      const fileName = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}.jsonl`;
      const telemetryPath = path.join(goodvibesDir, 'telemetry', fileName);

      const content = await fs.readFile(telemetryPath, 'utf-8');
      const lines = content.trim().split('\n');
      const parsed = JSON.parse(lines[0]);

      expect(parsed.event).toBe('subagent_complete');
      expect(parsed.agent_id).toBe('agent-telemetry');
      expect(mockEnsureGoodVibesDir).toHaveBeenCalledWith(testDir);
    });

    it('should append multiple entries to same monthly file', async () => {
      const entry1: TelemetryEntry = {
        event: 'subagent_complete',
        agent_id: 'agent-1',
        agent_type: 'test-engineer',
        session_id: 'session-1',
        project: testDir,
        project_name: 'project',
        started_at: '2025-01-01T00:00:00Z',
        ended_at: '2025-01-01T00:30:00Z',
        duration_ms: 1800000,
        status: 'completed',
        keywords: [],
        files_modified: [],
        tools_used: [],
        summary: 'First entry',
      };

      const entry2: TelemetryEntry = {
        event: 'subagent_complete',
        agent_id: 'agent-2',
        agent_type: 'backend-engineer',
        session_id: 'session-2',
        project: testDir,
        project_name: 'project',
        started_at: '2025-01-01T01:00:00Z',
        ended_at: '2025-01-01T01:30:00Z',
        duration_ms: 1800000,
        status: 'failed',
        keywords: [],
        files_modified: [],
        tools_used: [],
        summary: 'Second entry',
      };

      const { writeTelemetryEntry } =
        await import('../../subagent-stop/telemetry.js');
      await writeTelemetryEntry(testDir, entry1);
      await writeTelemetryEntry(testDir, entry2);

      const now = new Date();
      const fileName = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}.jsonl`;
      const telemetryPath = path.join(goodvibesDir, 'telemetry', fileName);

      const content = await fs.readFile(telemetryPath, 'utf-8');
      const lines = content.trim().split('\n');

      expect(lines).toHaveLength(2);
      expect(JSON.parse(lines[0]).agent_id).toBe('agent-1');
      expect(JSON.parse(lines[1]).agent_id).toBe('agent-2');
    });

    it('should include optional git fields in entry', async () => {
      const entry: TelemetryEntry = {
        event: 'subagent_complete',
        agent_id: 'agent-git',
        agent_type: 'backend-engineer',
        session_id: 'session-git',
        project: testDir,
        project_name: 'git-project',
        git_branch: 'feature/test',
        git_commit: 'def5678',
        started_at: '2025-01-01T00:00:00Z',
        ended_at: '2025-01-01T01:00:00Z',
        duration_ms: 3600000,
        status: 'completed',
        keywords: ['git'],
        files_modified: [],
        tools_used: [],
        summary: 'Git test',
      };

      const { writeTelemetryEntry } =
        await import('../../subagent-stop/telemetry.js');
      await writeTelemetryEntry(testDir, entry);

      const now = new Date();
      const fileName = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}.jsonl`;
      const telemetryPath = path.join(goodvibesDir, 'telemetry', fileName);

      const content = await fs.readFile(telemetryPath, 'utf-8');
      const parsed = JSON.parse(content.trim());

      expect(parsed.git_branch).toBe('feature/test');
      expect(parsed.git_commit).toBe('def5678');
    });
  });

  // ============================================================================
  // buildTelemetryEntry tests
  // ============================================================================
  describe('buildTelemetryEntry', () => {
    beforeEach(() => {
      mockParseTranscript.mockResolvedValue({
        toolsUsed: ['Write', 'Bash'],
        filesModified: ['/src/index.ts'],
        summary: 'Completed the task successfully',
      });
      mockExtractKeywords.mockReturnValue(['typescript', 'nodejs']);
    });

    it('should build complete telemetry entry from tracking and transcript', async () => {
      const tracking: TelemetryTracking = {
        agent_id: 'agent-build',
        agent_type: 'test-engineer',
        session_id: 'session-build',
        project: testDir,
        project_name: 'build-project',
        started_at: '2025-01-01T00:00:00Z',
      };

      const { buildTelemetryEntry } =
        await import('../../subagent-stop/telemetry.js');
      const entry = await buildTelemetryEntry(
        tracking,
        '/path/to/transcript.jsonl',
        'completed'
      );

      expect(entry.event).toBe('subagent_complete');
      expect(entry.agent_id).toBe('agent-build');
      expect(entry.agent_type).toBe('test-engineer');
      expect(entry.session_id).toBe('session-build');
      expect(entry.project).toBe(testDir);
      expect(entry.project_name).toBe('build-project');
      expect(entry.status).toBe('completed');
      expect(entry.tools_used).toEqual(['Write', 'Bash']);
      expect(entry.files_modified).toEqual(['/src/index.ts']);
      expect(entry.summary).toBe('Completed the task successfully');
      expect(mockParseTranscript).toHaveBeenCalledWith(
        '/path/to/transcript.jsonl'
      );
    });

    it('should calculate duration correctly', async () => {
      const startTime = '2025-01-01T10:00:00.000Z';
      const tracking: TelemetryTracking = {
        agent_id: 'agent-duration',
        agent_type: 'backend-engineer',
        session_id: 'session-duration',
        project: testDir,
        project_name: 'duration-project',
        started_at: startTime,
      };

      const { buildTelemetryEntry } =
        await import('../../subagent-stop/telemetry.js');
      const entry = await buildTelemetryEntry(
        tracking,
        '/path/to/transcript.jsonl',
        'completed'
      );

      expect(entry.started_at).toBe(startTime);
      expect(entry.ended_at).toBeDefined();
      expect(entry.duration_ms).toBeGreaterThan(0);
      // Verify ended_at is a valid ISO string
      expect(new Date(entry.ended_at).toISOString()).toBe(entry.ended_at);
    });

    it('should add agent name as keyword when not already present', async () => {
      mockExtractKeywords.mockReturnValue(['typescript', 'nodejs']);

      const tracking: TelemetryTracking = {
        agent_id: 'agent-keyword',
        agent_type: 'goodvibes:test-engineer',
        session_id: 'session-keyword',
        project: testDir,
        project_name: 'keyword-project',
        started_at: '2025-01-01T00:00:00Z',
      };

      const { buildTelemetryEntry } =
        await import('../../subagent-stop/telemetry.js');
      const entry = await buildTelemetryEntry(
        tracking,
        '/path/to/transcript.jsonl',
        'completed'
      );

      // Agent name 'test-engineer' should be added at the beginning
      expect(entry.keywords[0]).toBe('test-engineer');
      expect(entry.keywords).toContain('typescript');
      expect(entry.keywords).toContain('nodejs');
    });

    it('should not duplicate agent name when already in keywords', async () => {
      mockExtractKeywords.mockReturnValue(['test-engineer', 'typescript']);

      const tracking: TelemetryTracking = {
        agent_id: 'agent-no-dup',
        agent_type: 'goodvibes:test-engineer',
        session_id: 'session-no-dup',
        project: testDir,
        project_name: 'no-dup-project',
        started_at: '2025-01-01T00:00:00Z',
      };

      const { buildTelemetryEntry } =
        await import('../../subagent-stop/telemetry.js');
      const entry = await buildTelemetryEntry(
        tracking,
        '/path/to/transcript.jsonl',
        'completed'
      );

      // Count occurrences of test-engineer
      const count = entry.keywords.filter((k) => k === 'test-engineer').length;
      expect(count).toBe(1);
    });

    it('should handle agent type without colon prefix', async () => {
      mockExtractKeywords.mockReturnValue(['typescript']);

      const tracking: TelemetryTracking = {
        agent_id: 'agent-simple-type',
        agent_type: 'backend-engineer',
        session_id: 'session-simple-type',
        project: testDir,
        project_name: 'simple-type-project',
        started_at: '2025-01-01T00:00:00Z',
      };

      const { buildTelemetryEntry } =
        await import('../../subagent-stop/telemetry.js');
      const entry = await buildTelemetryEntry(
        tracking,
        '/path/to/transcript.jsonl',
        'completed'
      );

      // Agent name should be extracted correctly
      expect(entry.keywords[0]).toBe('backend-engineer');
    });

    it('should fallback to full agent_type when split returns empty string', async () => {
      mockExtractKeywords.mockReturnValue(['typescript']);

      // Agent type ending with colon - split(':').pop() returns ''
      const tracking: TelemetryTracking = {
        agent_id: 'agent-trailing-colon',
        agent_type: 'goodvibes:',
        session_id: 'session-trailing-colon',
        project: testDir,
        project_name: 'trailing-colon-project',
        started_at: '2025-01-01T00:00:00Z',
      };

      const { buildTelemetryEntry } =
        await import('../../subagent-stop/telemetry.js');
      const entry = await buildTelemetryEntry(
        tracking,
        '/path/to/transcript.jsonl',
        'completed'
      );

      // Should fallback to full agent_type when pop() returns empty string
      expect(entry.keywords[0]).toBe('goodvibes:');
    });

    it('should include optional git fields in entry', async () => {
      const tracking: TelemetryTracking = {
        agent_id: 'agent-git-entry',
        agent_type: 'test-engineer',
        session_id: 'session-git-entry',
        project: testDir,
        project_name: 'git-entry-project',
        git_branch: 'feature/telemetry',
        git_commit: 'xyz9876',
        started_at: '2025-01-01T00:00:00Z',
      };

      const { buildTelemetryEntry } =
        await import('../../subagent-stop/telemetry.js');
      const entry = await buildTelemetryEntry(
        tracking,
        '/path/to/transcript.jsonl',
        'completed'
      );

      expect(entry.git_branch).toBe('feature/telemetry');
      expect(entry.git_commit).toBe('xyz9876');
    });

    it('should handle failed status', async () => {
      const tracking: TelemetryTracking = {
        agent_id: 'agent-failed',
        agent_type: 'test-engineer',
        session_id: 'session-failed',
        project: testDir,
        project_name: 'failed-project',
        started_at: '2025-01-01T00:00:00Z',
      };

      const { buildTelemetryEntry } =
        await import('../../subagent-stop/telemetry.js');
      const entry = await buildTelemetryEntry(
        tracking,
        '/path/to/transcript.jsonl',
        'failed'
      );

      expect(entry.status).toBe('failed');
    });

    it('should extract keywords from transcript summary and files modified', async () => {
      mockParseTranscript.mockResolvedValue({
        toolsUsed: ['Write'],
        filesModified: ['/src/api/users.ts', '/src/models/user.ts'],
        summary: 'Implemented user authentication with JWT tokens',
      });
      mockExtractKeywords.mockReturnValue(['jwt', 'auth', 'typescript']);

      const tracking: TelemetryTracking = {
        agent_id: 'agent-extract',
        agent_type: 'backend-engineer',
        session_id: 'session-extract',
        project: testDir,
        project_name: 'extract-project',
        started_at: '2025-01-01T00:00:00Z',
      };

      const { buildTelemetryEntry } =
        await import('../../subagent-stop/telemetry.js');
      await buildTelemetryEntry(
        tracking,
        '/path/to/transcript.jsonl',
        'completed'
      );

      // Verify extractKeywords was called with combined text
      expect(mockExtractKeywords).toHaveBeenCalledWith(
        'Implemented user authentication with JWT tokens /src/api/users.ts /src/models/user.ts'
      );
    });
  });
});
