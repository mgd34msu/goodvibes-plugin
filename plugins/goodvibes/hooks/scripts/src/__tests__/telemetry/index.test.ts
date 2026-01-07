/**
 * Tests for telemetry/index.ts
 *
 * Validates that all exports are properly re-exported from the barrel file.
 * This file contains only re-exports, no executable code.
 */

import { describe, it, expect } from 'vitest';

import {
  // agents exports
  STALE_AGENT_MAX_AGE_MS,
  getActiveAgentsFilePath,
  getGitInfo,
  deriveProjectName,
  loadActiveAgents,
  saveActiveAgents,
  registerActiveAgent,
  popActiveAgent,
  cleanupStaleAgents,
  type ActiveAgentEntry,
  type ActiveAgentsState,
  type GitInfo,
  // transcript exports
  MAX_OUTPUT_LENGTH,
  KEYWORD_CATEGORIES,
  parseTranscript,
  extractKeywords,
  type ParsedTranscript,
  // records exports
  ensureGoodVibesDirs,
  writeTelemetryRecord,
  createTelemetryRecord,
  type TelemetryRecord,
} from '../../telemetry/index.js';

describe('telemetry/index', () => {
  describe('re-exports from agents.ts', () => {
    it('should export STALE_AGENT_MAX_AGE_MS', () => {
      expect(STALE_AGENT_MAX_AGE_MS).toBeDefined();
      expect(typeof STALE_AGENT_MAX_AGE_MS).toBe('number');
    });

    it('should export getActiveAgentsFilePath', () => {
      expect(getActiveAgentsFilePath).toBeDefined();
      expect(typeof getActiveAgentsFilePath).toBe('function');
    });

    it('should export getGitInfo', () => {
      expect(getGitInfo).toBeDefined();
      expect(typeof getGitInfo).toBe('function');
    });

    it('should export deriveProjectName', () => {
      expect(deriveProjectName).toBeDefined();
      expect(typeof deriveProjectName).toBe('function');
    });

    it('should export loadActiveAgents', () => {
      expect(loadActiveAgents).toBeDefined();
      expect(typeof loadActiveAgents).toBe('function');
    });

    it('should export saveActiveAgents', () => {
      expect(saveActiveAgents).toBeDefined();
      expect(typeof saveActiveAgents).toBe('function');
    });

    it('should export registerActiveAgent', () => {
      expect(registerActiveAgent).toBeDefined();
      expect(typeof registerActiveAgent).toBe('function');
    });

    it('should export popActiveAgent', () => {
      expect(popActiveAgent).toBeDefined();
      expect(typeof popActiveAgent).toBe('function');
    });

    it('should export cleanupStaleAgents', () => {
      expect(cleanupStaleAgents).toBeDefined();
      expect(typeof cleanupStaleAgents).toBe('function');
    });

    it('should export ActiveAgentEntry type (via object)', () => {
      const entry: ActiveAgentEntry = {
        agent_id: 'test',
        agent_type: 'test-type',
        session_id: 'session-123',
        project: '/test',
        project_name: 'test-project',
        started_at: new Date().toISOString(),
      };
      expect(entry.agent_id).toBe('test');
    });

    it('should export ActiveAgentsState type (via object)', () => {
      const state: ActiveAgentsState = {
        agents: [],
      };
      expect(state.agents).toEqual([]);
    });

    it('should export GitInfo type (via object)', () => {
      const info: GitInfo = {
        branch: 'main',
        commit: 'abc123',
        remote: 'origin',
      };
      expect(info.branch).toBe('main');
    });
  });

  describe('re-exports from transcript.ts', () => {
    it('should export MAX_OUTPUT_LENGTH', () => {
      expect(MAX_OUTPUT_LENGTH).toBeDefined();
      expect(typeof MAX_OUTPUT_LENGTH).toBe('number');
    });

    it('should export KEYWORD_CATEGORIES', () => {
      expect(KEYWORD_CATEGORIES).toBeDefined();
    });

    it('should export parseTranscript', () => {
      expect(parseTranscript).toBeDefined();
      expect(typeof parseTranscript).toBe('function');
    });

    it('should export extractKeywords', () => {
      expect(extractKeywords).toBeDefined();
      expect(typeof extractKeywords).toBe('function');
    });

    it('should export ParsedTranscript type (via object)', () => {
      const transcript: ParsedTranscript = {
        output: '',
        filesModified: [],
        toolsUsed: [],
        summary: '',
        keywords: [],
      };
      expect(transcript.output).toBe('');
    });
  });

  describe('re-exports from records.ts', () => {
    it('should export ensureGoodVibesDirs', () => {
      expect(ensureGoodVibesDirs).toBeDefined();
      expect(typeof ensureGoodVibesDirs).toBe('function');
    });

    it('should export writeTelemetryRecord', () => {
      expect(writeTelemetryRecord).toBeDefined();
      expect(typeof writeTelemetryRecord).toBe('function');
    });

    it('should export createTelemetryRecord', () => {
      expect(createTelemetryRecord).toBeDefined();
      expect(typeof createTelemetryRecord).toBe('function');
    });

    it('should export TelemetryRecord type (via object)', () => {
      const record: TelemetryRecord = {
        event: 'subagent_complete',
        agent_id: 'test',
        agent_type: 'test-type',
        session_id: 'session-123',
        project: '/test',
        project_name: 'test-project',
        started_at: new Date().toISOString(),
        ended_at: new Date().toISOString(),
        duration_ms: 1000,
        status: 'completed',
        keywords: [],
        files_modified: [],
        tools_used: [],
        summary: '',
      };
      expect(record.event).toBe('subagent_complete');
    });
  });
});
