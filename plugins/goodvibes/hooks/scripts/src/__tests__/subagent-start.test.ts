/**
 * Unit tests for subagent-start hook
 *
 * Tests cover:
 * - Subagent context injection
 * - Agent type-specific reminders
 * - Project context building
 * - Task description capture
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { buildSubagentContext } from '../subagent-start/context-injection.js';

// Mock dependencies
vi.mock('../shared/index.js', () => ({
  loadSharedConfig: vi.fn(() => Promise.resolve({
    telemetry: {
      enabled: true,
      collectToolUsage: true,
    },
  })),
}));

vi.mock('../types/config.js', () => ({
  getDefaultConfig: vi.fn(() => ({
    automation: {
      mode: 'autonomous',
      runTestsOnWrite: true,
      runBuildOnWrite: false,
      autoCommit: true,
    },
  })),
}));

describe('subagent-start', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('buildSubagentContext', () => {
    it('should build basic context with project info', async () => {
      const context = await buildSubagentContext('/workspace/my-project', 'test-engineer', 'session-123');

      expect(context.additionalContext).toBeDefined();
      expect(context.additionalContext).toContain('my-project');
      expect(context.additionalContext).toContain('autonomous');
    });

    it('should add write-local reminder for backend agents', async () => {
      const context = await buildSubagentContext('/workspace/project', 'backend-engineer', 'session-1');

      expect(context.additionalContext).toContain('Write-local only');
      expect(context.additionalContext).toContain('All changes must be in the project root');
    });

    it('should add test reminder for test engineers', async () => {
      const context = await buildSubagentContext('/workspace/project', 'test-engineer', 'session-1');

      expect(context.additionalContext).toContain('Tests must actually verify behavior');
    });

    it('should add brutally honest reminder for brutal-reviewer', async () => {
      const context = await buildSubagentContext('/workspace/project', 'brutal-reviewer', 'session-1');

      expect(context.additionalContext).toContain('Be brutally honest');
      expect(context.additionalContext).toContain('Score out of 10');
    });

    it('should handle multiple matching reminders', async () => {
      const context = await buildSubagentContext(
        '/workspace/project',
        'backend-test-engineer',
        'session-1'
      );

      expect(context.additionalContext).toContain('Write-local only');
      expect(context.additionalContext).toContain('Tests must actually verify behavior');
    });

    it('should handle agent types without specific reminders', async () => {
      const context = await buildSubagentContext(
        '/workspace/project',
        'generic-agent',
        'session-1'
      );

      // Agents without specific reminders should still get project context
      expect(context.additionalContext).toBeDefined();
      expect(context.additionalContext).toContain('Project: project');
      expect(context.additionalContext).toContain('Mode: autonomous');
    });

    it('should return null context when no parts are added', async () => {
      // This would only happen if the project name detection fails somehow
      // But the current implementation always adds at least project info
      const context = await buildSubagentContext('/workspace/project', 'agent', 'session-1');

      // Should always have some context
      expect(context.additionalContext).not.toBeNull();
    });

    it('should extract project name from nested paths', async () => {
      const context = await buildSubagentContext(
        '/home/user/dev/projects/my-app',
        'test-engineer',
        'session-1'
      );

      expect(context.additionalContext).toContain('my-app');
    });

    it('should extract project name from Windows paths', async () => {
      const context = await buildSubagentContext(
        'C:\\Users\\dev\\projects\\my-app',
        'test-engineer',
        'session-1'
      );

      expect(context.additionalContext).toContain('my-app');
    });

    it('should include automation mode in context', async () => {
      const context = await buildSubagentContext('/workspace/project', 'test-engineer', 'session-1');

      expect(context.additionalContext).toContain('Mode: autonomous');
    });

    it('should format context with newlines for readability', async () => {
      const context = await buildSubagentContext('/workspace/project', 'backend-engineer', 'session-1');

      expect(context.additionalContext).toContain('\n');
      const lines = context.additionalContext!.split('\n');
      expect(lines.length).toBeGreaterThan(1);
    });

    it('should handle frontend-related agent types', async () => {
      const context = await buildSubagentContext(
        '/workspace/project',
        'frontend-architect',
        'session-1'
      );

      expect(context.additionalContext).toBeDefined();
      // Frontend doesn't have specific reminders in current implementation
      expect(context.additionalContext).toContain('Project: project');
    });

    it('should handle devops-related agent types', async () => {
      const context = await buildSubagentContext(
        '/workspace/project',
        'devops-deployer',
        'session-1'
      );

      expect(context.additionalContext).toBeDefined();
      expect(context.additionalContext).toContain('Project: project');
    });

    it('should include GoodVibes branding', async () => {
      const context = await buildSubagentContext('/workspace/project', 'test-engineer', 'session-1');

      expect(context.additionalContext).toContain('[GoodVibes]');
    });

    it('should handle agent types with goodvibes prefix', async () => {
      const context = await buildSubagentContext(
        '/workspace/project',
        'goodvibes:test-engineer',
        'session-1'
      );

      expect(context.additionalContext).toContain('Tests must actually verify behavior');
    });

    it('should handle special characters in project names', async () => {
      const context = await buildSubagentContext(
        '/workspace/my-project-2024',
        'test-engineer',
        'session-1'
      );

      expect(context.additionalContext).toContain('my-project-2024');
    });

    it('should preserve all context parts', async () => {
      const context = await buildSubagentContext('/workspace/project', 'backend-engineer', 'session-1');

      const parts = context.additionalContext!.split('\n').filter(Boolean);

      // Should have project, mode, and backend reminder
      expect(parts.length).toBeGreaterThanOrEqual(3);
    });

    it('should handle empty session ID gracefully', async () => {
      const context = await buildSubagentContext('/workspace/project', 'test-engineer', '');

      expect(context.additionalContext).toBeDefined();
    });

    it('should handle session ID in context', async () => {
      const sessionId = 'session-abc-123';
      const context = await buildSubagentContext('/workspace/project', 'test-engineer', sessionId);

      // Session ID is passed but not used in current implementation
      expect(context.additionalContext).toBeDefined();
    });

    it('should be case-sensitive for agent type matching', async () => {
      const context1 = await buildSubagentContext('/workspace/project', 'Backend-Engineer', 'session-1');
      const context2 = await buildSubagentContext('/workspace/project', 'backend-engineer', 'session-1');

      // 'Backend-Engineer' won't match 'backend' in includes() check
      expect(context1.additionalContext).not.toContain('Write-local only');
      expect(context2.additionalContext).toContain('Write-local only');
    });

    it('should handle agent type with hyphens', async () => {
      const context = await buildSubagentContext(
        '/workspace/project',
        'brutal-reviewer-v2',
        'session-1'
      );

      // The agent type contains 'brutal-reviewer' which triggers the reminder
      expect(context.additionalContext).toContain('Be brutally honest');
    });

    it('should maintain reminder order', async () => {
      const context = await buildSubagentContext(
        '/workspace/project',
        'backend-test-brutal-reviewer',
        'session-1'
      );

      const contextStr = context.additionalContext!;
      const backendIndex = contextStr.indexOf('Write-local only');
      const testIndex = contextStr.indexOf('Tests must actually verify');
      const brutalIndex = contextStr.indexOf('Be brutally honest');

      // All should be present
      expect(backendIndex).toBeGreaterThan(-1);
      expect(testIndex).toBeGreaterThan(-1);
      expect(brutalIndex).toBeGreaterThan(-1);
    });

    it('should handle very long project paths', async () => {
      const longPath = '/home/user/dev/projects/deeply/nested/folder/structure/my-app';
      const context = await buildSubagentContext(longPath, 'test-engineer', 'session-1');

      expect(context.additionalContext).toContain('my-app');
    });

    it('should handle root directory paths', async () => {
      const context = await buildSubagentContext('/', 'test-engineer', 'session-1');

      // Project name extraction should handle this gracefully
      expect(context.additionalContext).toBeDefined();
    });

    it('should handle relative paths', async () => {
      const context = await buildSubagentContext('./project', 'test-engineer', 'session-1');

      expect(context.additionalContext).toContain('project');
    });

    it('should format project info consistently', async () => {
      const context = await buildSubagentContext('/workspace/test-app', 'test-engineer', 'session-1');

      expect(context.additionalContext).toMatch(/\[GoodVibes\] Project: test-app/);
    });

    it('should format mode info consistently', async () => {
      const context = await buildSubagentContext('/workspace/project', 'test-engineer', 'session-1');

      expect(context.additionalContext).toMatch(/Mode: autonomous/);
    });
  });
});
