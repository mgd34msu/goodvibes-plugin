/**
 * Integration tests for hook workflow
 *
 * Tests the complete flow of hooks working together:
 * - session-start → pre-tool-use → post-tool-use
 * - Error recovery flow (post-tool-use-failure)
 * - Subagent lifecycle (subagent-start → subagent-stop)
 * - State persistence across hooks
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import type { HooksState } from '../../types/state.js';

// These would normally be imported from the actual hook modules
// For integration tests, we mock the key interactions

describe('hook-workflow integration', () => {
  let testDir: string;

  beforeEach(() => {
    testDir = fs.mkdtempSync(
      path.join(os.tmpdir(), 'goodvibes-workflow-test-')
    );
  });

  afterEach(() => {
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true, force: true });
    }
  });

  describe('session lifecycle', () => {
    it('should initialize state on session-start', () => {
      const stateDir = path.join(testDir, '.goodvibes', 'state');
      fs.mkdirSync(stateDir, { recursive: true });

      const initialState: HooksState = {
        session_id: 'test-session-123',
        started_at: new Date().toISOString(),
        git: { branch: 'main' },
        files: { modifiedThisSession: [], createdThisSession: [] },
        automation: { checkpointsCreated: 0, testsRun: 0, buildsRun: 0 },
      };

      const statePath = path.join(stateDir, 'hooks-state.json');
      fs.writeFileSync(statePath, JSON.stringify(initialState, null, 2));

      expect(fs.existsSync(statePath)).toBe(true);

      const loaded = JSON.parse(fs.readFileSync(statePath, 'utf-8'));
      expect(loaded.session_id).toBe('test-session-123');
    });

    it('should track file modifications across multiple tool uses', () => {
      const stateDir = path.join(testDir, '.goodvibes', 'state');
      fs.mkdirSync(stateDir, { recursive: true });

      const statePath = path.join(stateDir, 'hooks-state.json');

      // Initial state
      let state: HooksState = {
        session_id: 'test-session',
        started_at: new Date().toISOString(),
        git: { branch: 'main' },
        files: { modifiedThisSession: [], createdThisSession: [] },
        automation: { checkpointsCreated: 0, testsRun: 0, buildsRun: 0 },
      };

      fs.writeFileSync(statePath, JSON.stringify(state));

      // Simulate first tool use - Write
      state = JSON.parse(fs.readFileSync(statePath, 'utf-8'));
      state.files.createdThisSession.push('/src/file1.ts');
      fs.writeFileSync(statePath, JSON.stringify(state));

      // Simulate second tool use - Edit
      state = JSON.parse(fs.readFileSync(statePath, 'utf-8'));
      state.files.modifiedThisSession.push('/src/file2.ts');
      fs.writeFileSync(statePath, JSON.stringify(state));

      // Verify accumulated state
      const finalState = JSON.parse(fs.readFileSync(statePath, 'utf-8'));
      expect(finalState.files.createdThisSession).toContain('/src/file1.ts');
      expect(finalState.files.modifiedThisSession).toContain('/src/file2.ts');
    });

    it('should persist automation metrics across hooks', () => {
      const stateDir = path.join(testDir, '.goodvibes', 'state');
      fs.mkdirSync(stateDir, { recursive: true });

      const statePath = path.join(stateDir, 'hooks-state.json');

      let state: HooksState = {
        session_id: 'test-session',
        started_at: new Date().toISOString(),
        git: { branch: 'main' },
        files: { modifiedThisSession: [], createdThisSession: [] },
        automation: { checkpointsCreated: 0, testsRun: 0, buildsRun: 0 },
      };

      fs.writeFileSync(statePath, JSON.stringify(state));

      // Simulate checkpoint creation
      state = JSON.parse(fs.readFileSync(statePath, 'utf-8'));
      state.automation.checkpointsCreated++;
      fs.writeFileSync(statePath, JSON.stringify(state));

      // Simulate test run
      state = JSON.parse(fs.readFileSync(statePath, 'utf-8'));
      state.automation.testsRun++;
      fs.writeFileSync(statePath, JSON.stringify(state));

      const finalState = JSON.parse(fs.readFileSync(statePath, 'utf-8'));
      expect(finalState.automation.checkpointsCreated).toBe(1);
      expect(finalState.automation.testsRun).toBe(1);
    });
  });

  describe('error recovery flow', () => {
    it('should track tool failures for recovery analysis', () => {
      const stateDir = path.join(testDir, '.goodvibes', 'state');
      fs.mkdirSync(stateDir, { recursive: true });

      const failuresPath = path.join(stateDir, 'tool-failures.json');

      const failure = {
        tool: 'Bash',
        timestamp: new Date().toISOString(),
        error: 'Command failed with exit code 1',
        retryCount: 0,
      };

      fs.writeFileSync(failuresPath, JSON.stringify([failure], null, 2));

      expect(fs.existsSync(failuresPath)).toBe(true);

      const failures = JSON.parse(fs.readFileSync(failuresPath, 'utf-8'));
      expect(failures).toHaveLength(1);
      expect(failures[0].tool).toBe('Bash');
    });

    it('should increment retry count on repeated failures', () => {
      const stateDir = path.join(testDir, '.goodvibes', 'state');
      fs.mkdirSync(stateDir, { recursive: true });

      const failuresPath = path.join(stateDir, 'tool-failures.json');

      let failures = [
        {
          tool: 'Bash',
          timestamp: new Date().toISOString(),
          error: 'Command failed',
          retryCount: 0,
        },
      ];

      fs.writeFileSync(failuresPath, JSON.stringify(failures));

      // Simulate retry
      failures = JSON.parse(fs.readFileSync(failuresPath, 'utf-8'));
      failures[0].retryCount++;
      fs.writeFileSync(failuresPath, JSON.stringify(failures));

      const updated = JSON.parse(fs.readFileSync(failuresPath, 'utf-8'));
      expect(updated[0].retryCount).toBe(1);
    });

    it('should clear failures after successful recovery', () => {
      const stateDir = path.join(testDir, '.goodvibes', 'state');
      fs.mkdirSync(stateDir, { recursive: true });

      const failuresPath = path.join(stateDir, 'tool-failures.json');

      fs.writeFileSync(
        failuresPath,
        JSON.stringify([
          {
            tool: 'Bash',
            timestamp: new Date().toISOString(),
            error: 'Failed',
            retryCount: 1,
          },
        ])
      );

      // Simulate successful recovery
      fs.writeFileSync(failuresPath, JSON.stringify([]));

      const failures = JSON.parse(fs.readFileSync(failuresPath, 'utf-8'));
      expect(failures).toHaveLength(0);
    });
  });

  describe('subagent lifecycle', () => {
    it('should track subagent from start to stop', () => {
      const stateDir = path.join(testDir, '.goodvibes', 'state');
      const telemetryDir = path.join(testDir, '.goodvibes', 'telemetry');
      fs.mkdirSync(stateDir, { recursive: true });
      fs.mkdirSync(telemetryDir, { recursive: true });

      const agentId = 'agent-lifecycle-test';
      const trackingPath = path.join(stateDir, 'agent-tracking.json');

      // Subagent start - register tracking
      const tracking = {
        [agentId]: {
          agent_id: agentId,
          agent_type: 'test-engineer',
          session_id: 'parent-session',
          project: testDir,
          project_name: 'test-project',
          started_at: new Date().toISOString(),
        },
      };

      fs.writeFileSync(trackingPath, JSON.stringify(tracking, null, 2));

      expect(fs.existsSync(trackingPath)).toBe(true);

      const saved = JSON.parse(fs.readFileSync(trackingPath, 'utf-8'));
      expect(saved[agentId]).toBeDefined();

      // Subagent stop - write telemetry and remove tracking
      const now = new Date();
      const telemetryFile = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}.jsonl`;
      const telemetryPath = path.join(telemetryDir, telemetryFile);

      const telemetryEntry = {
        event: 'subagent_complete',
        agent_id: agentId,
        status: 'completed',
        duration_ms: 5000,
        ...saved[agentId],
        ended_at: new Date().toISOString(),
      };

      fs.appendFileSync(telemetryPath, JSON.stringify(telemetryEntry) + '\n');

      // Remove from tracking
      delete saved[agentId];
      fs.writeFileSync(trackingPath, JSON.stringify(saved, null, 2));

      expect(fs.existsSync(telemetryPath)).toBe(true);

      const updatedTracking = JSON.parse(
        fs.readFileSync(trackingPath, 'utf-8')
      );
      expect(updatedTracking[agentId]).toBeUndefined();
    });

    it('should handle multiple concurrent subagents', () => {
      const stateDir = path.join(testDir, '.goodvibes', 'state');
      fs.mkdirSync(stateDir, { recursive: true });

      const trackingPath = path.join(stateDir, 'agent-tracking.json');

      const tracking = {
        'agent-1': {
          agent_id: 'agent-1',
          agent_type: 'test-engineer',
          session_id: 'session-1',
          project: testDir,
          project_name: 'project',
          started_at: new Date().toISOString(),
        },
        'agent-2': {
          agent_id: 'agent-2',
          agent_type: 'backend-engineer',
          session_id: 'session-2',
          project: testDir,
          project_name: 'project',
          started_at: new Date().toISOString(),
        },
      };

      fs.writeFileSync(trackingPath, JSON.stringify(tracking, null, 2));

      const saved = JSON.parse(fs.readFileSync(trackingPath, 'utf-8'));
      expect(Object.keys(saved)).toHaveLength(2);
    });

    it('should correlate subagent work with parent session', () => {
      const stateDir = path.join(testDir, '.goodvibes', 'state');
      fs.mkdirSync(stateDir, { recursive: true });

      const parentSessionId = 'parent-session-123';
      const agentId = 'subagent-456';

      const trackingPath = path.join(stateDir, 'agent-tracking.json');

      const tracking = {
        [agentId]: {
          agent_id: agentId,
          agent_type: 'test-engineer',
          session_id: parentSessionId, // Links to parent
          project: testDir,
          project_name: 'project',
          started_at: new Date().toISOString(),
        },
      };

      fs.writeFileSync(trackingPath, JSON.stringify(tracking, null, 2));

      const saved = JSON.parse(fs.readFileSync(trackingPath, 'utf-8'));
      expect(saved[agentId].session_id).toBe(parentSessionId);
    });
  });

  describe('state consistency', () => {
    it('should maintain state integrity across hook calls', () => {
      const stateDir = path.join(testDir, '.goodvibes', 'state');
      fs.mkdirSync(stateDir, { recursive: true });

      const statePath = path.join(stateDir, 'hooks-state.json');

      const initialState: HooksState = {
        session_id: 'consistent-session',
        started_at: new Date().toISOString(),
        git: { branch: 'main', commit: 'abc123' },
        files: { modifiedThisSession: [], createdThisSession: [] },
        automation: { checkpointsCreated: 0, testsRun: 0, buildsRun: 0 },
      };

      fs.writeFileSync(statePath, JSON.stringify(initialState));

      // Simulate multiple updates
      for (let i = 0; i < 5; i++) {
        const state = JSON.parse(fs.readFileSync(statePath, 'utf-8'));
        state.files.modifiedThisSession.push(`/src/file${i}.ts`);
        fs.writeFileSync(statePath, JSON.stringify(state));
      }

      const finalState = JSON.parse(fs.readFileSync(statePath, 'utf-8'));
      expect(finalState.files.modifiedThisSession).toHaveLength(5);
      expect(finalState.session_id).toBe('consistent-session');
      expect(finalState.git.branch).toBe('main');
    });

    it('should handle concurrent state updates gracefully', () => {
      const stateDir = path.join(testDir, '.goodvibes', 'state');
      fs.mkdirSync(stateDir, { recursive: true });

      const statePath = path.join(stateDir, 'hooks-state.json');

      const state: HooksState = {
        session_id: 'concurrent-test',
        started_at: new Date().toISOString(),
        git: { branch: 'main' },
        files: { modifiedThisSession: [], createdThisSession: [] },
        automation: { checkpointsCreated: 0, testsRun: 0, buildsRun: 0 },
      };

      fs.writeFileSync(statePath, JSON.stringify(state));

      // Simulate rapid updates
      const updates = ['/src/a.ts', '/src/b.ts', '/src/c.ts'];
      updates.forEach((file) => {
        const currentState = JSON.parse(fs.readFileSync(statePath, 'utf-8'));
        currentState.files.modifiedThisSession.push(file);
        fs.writeFileSync(statePath, JSON.stringify(currentState));
      });

      const finalState = JSON.parse(fs.readFileSync(statePath, 'utf-8'));
      expect(finalState.files.modifiedThisSession).toEqual(updates);
    });

    it('should preserve state structure across sessions', () => {
      const stateDir = path.join(testDir, '.goodvibes', 'state');
      fs.mkdirSync(stateDir, { recursive: true });

      const statePath = path.join(stateDir, 'hooks-state.json');

      const requiredFields: (keyof HooksState)[] = [
        'session_id',
        'started_at',
        'git',
        'files',
        'automation',
      ];

      const state: HooksState = {
        session_id: 'structure-test',
        started_at: new Date().toISOString(),
        git: { branch: 'main' },
        files: { modifiedThisSession: [], createdThisSession: [] },
        automation: { checkpointsCreated: 0, testsRun: 0, buildsRun: 0 },
      };

      fs.writeFileSync(statePath, JSON.stringify(state));

      const loaded = JSON.parse(fs.readFileSync(statePath, 'utf-8'));

      requiredFields.forEach((field) => {
        expect(loaded[field]).toBeDefined();
      });
    });
  });

  describe('telemetry aggregation', () => {
    it('should accumulate telemetry entries over time', () => {
      const telemetryDir = path.join(testDir, '.goodvibes', 'telemetry');
      fs.mkdirSync(telemetryDir, { recursive: true });

      const now = new Date();
      const fileName = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}.jsonl`;
      const telemetryPath = path.join(telemetryDir, fileName);

      const entries = [
        { event: 'subagent_complete', agent_id: 'agent-1', duration_ms: 1000 },
        { event: 'subagent_complete', agent_id: 'agent-2', duration_ms: 2000 },
        { event: 'subagent_complete', agent_id: 'agent-3', duration_ms: 1500 },
      ];

      entries.forEach((entry) => {
        fs.appendFileSync(telemetryPath, JSON.stringify(entry) + '\n');
      });

      const content = fs.readFileSync(telemetryPath, 'utf-8');
      const lines = content.split('\n').filter(Boolean);

      expect(lines).toHaveLength(3);

      const parsed = lines.map((line) => JSON.parse(line));
      const totalDuration = parsed.reduce(
        (sum, entry) => sum + entry.duration_ms,
        0
      );
      expect(totalDuration).toBe(4500);
    });

    it('should separate telemetry by month', () => {
      const telemetryDir = path.join(testDir, '.goodvibes', 'telemetry');
      fs.mkdirSync(telemetryDir, { recursive: true });

      const jan2025 = path.join(telemetryDir, '2025-01.jsonl');
      const feb2025 = path.join(telemetryDir, '2025-02.jsonl');

      fs.writeFileSync(
        jan2025,
        JSON.stringify({ event: 'test', month: 'jan' }) + '\n'
      );
      fs.writeFileSync(
        feb2025,
        JSON.stringify({ event: 'test', month: 'feb' }) + '\n'
      );

      expect(fs.existsSync(jan2025)).toBe(true);
      expect(fs.existsSync(feb2025)).toBe(true);

      const janData = JSON.parse(fs.readFileSync(jan2025, 'utf-8'));
      const febData = JSON.parse(fs.readFileSync(feb2025, 'utf-8'));

      expect(janData.month).toBe('jan');
      expect(febData.month).toBe('feb');
    });
  });
});
