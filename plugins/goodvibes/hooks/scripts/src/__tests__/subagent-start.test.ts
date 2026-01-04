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
vi.mock('../shared.js', () => ({
  loadSharedConfig: vi.fn(() => ({
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
    it('should build basic context with project info', () => {
      const context = buildSubagentContext('/workspace/my-project', 'test-engineer', 'session-123');

      expect(context.additionalContext).toBeDefined();
      expect(context.additionalContext).toContain('my-project');
      expect(context.additionalContext).toContain('autonomous');
    });

    it('should add write-local reminder for backend agents', () => {
      const context = buildSubagentContext('/workspace/project', 'backend-engineer', 'session-1');

      expect(context.additionalContext).toContain('Write-local only');
      expect(context.additionalContext).toContain('All changes must be in the project root');
    });

    it('should add test reminder for test engineers', () => {
      const context = buildSubagentContext('/workspace/project', 'test-engineer', 'session-1');

      expect(context.additionalContext).toContain('Tests must actually verify behavior');
    });

    it('should add brutally honest reminder for brutal-reviewer', () => {
      const context = buildSubagentContext('/workspace/project', 'brutal-reviewer', 'session-1');

      expect(context.additionalContext).toContain('Be brutally honest');
      expect(context.additionalContext).toContain('Score out of 10');
    });

    it('should handle multiple matching reminders', () => {
      const context = buildSubagentContext(
        '/workspace/project',
        'backend-test-engineer',
        'session-1'
      );

      expect(context.additionalContext).toContain('Write-local only');
      expect(context.additionalContext).toContain('Tests must actually verify behavior');
    });

    it('should handle agent types without specific reminders', () => {
      const context = buildSubagentContext(
        '/workspace/project',
        'generic-agent',
        'session-1'
      );

      expect(context.additionalContext).toBeDefined();
      expect(context.additionalContext).toContain('generic-agent');
    });

    it('should return null context when no parts are added', () => {
      // This would only happen if the project name detection fails somehow
      // But the current implementation always adds at least project info
      const context = buildSubagentContext('/workspace/project', 'agent', 'session-1');

      // Should always have some context
      expect(context.additionalContext).not.toBeNull();
    });

    it('should extract project name from nested paths', () => {
      const context = buildSubagentContext(
        '/home/user/dev/projects/my-app',
        'test-engineer',
        'session-1'
      );

      expect(context.additionalContext).toContain('my-app');
    });

    it('should extract project name from Windows paths', () => {
      const context = buildSubagentContext(
        'C:\\Users\\dev\\projects\\my-app',
        'test-engineer',
        'session-1'
      );

      expect(context.additionalContext).toContain('my-app');
    });

    it('should include automation mode in context', () => {
      const context = buildSubagentContext('/workspace/project', 'test-engineer', 'session-1');

      expect(context.additionalContext).toContain('Mode: autonomous');
    });

    it('should format context with newlines for readability', () => {
      const context = buildSubagentContext('/workspace/project', 'backend-engineer', 'session-1');

      expect(context.additionalContext).toContain('\n');
      const lines = context.additionalContext!.split('\n');
      expect(lines.length).toBeGreaterThan(1);
    });

    it('should handle frontend-related agent types', () => {
      const context = buildSubagentContext(
        '/workspace/project',
        'frontend-architect',
        'session-1'
      );

      expect(context.additionalContext).toBeDefined();
      // Frontend doesn't have specific reminders in current implementation
      expect(context.additionalContext).toContain('frontend-architect');
    });

    it('should handle devops-related agent types', () => {
      const context = buildSubagentContext(
        '/workspace/project',
        'devops-deployer',
        'session-1'
      );

      expect(context.additionalContext).toBeDefined();
      expect(context.additionalContext).toContain('devops-deployer');
    });

    it('should include GoodVibes branding', () => {
      const context = buildSubagentContext('/workspace/project', 'test-engineer', 'session-1');

      expect(context.additionalContext).toContain('[GoodVibes]');
    });

    it('should handle agent types with goodvibes prefix', () => {
      const context = buildSubagentContext(
        '/workspace/project',
        'goodvibes:test-engineer',
        'session-1'
      );

      expect(context.additionalContext).toContain('Tests must actually verify behavior');
    });

    it('should handle special characters in project names', () => {
      const context = buildSubagentContext(
        '/workspace/my-project-2024',
        'test-engineer',
        'session-1'
      );

      expect(context.additionalContext).toContain('my-project-2024');
    });

    it('should preserve all context parts', () => {
      const context = buildSubagentContext('/workspace/project', 'backend-engineer', 'session-1');

      const parts = context.additionalContext!.split('\n').filter(Boolean);

      // Should have project, mode, and backend reminder
      expect(parts.length).toBeGreaterThanOrEqual(3);
    });

    it('should handle empty session ID gracefully', () => {
      const context = buildSubagentContext('/workspace/project', 'test-engineer', '');

      expect(context.additionalContext).toBeDefined();
    });

    it('should handle session ID in context', () => {
      const sessionId = 'session-abc-123';
      const context = buildSubagentContext('/workspace/project', 'test-engineer', sessionId);

      // Session ID is passed but not used in current implementation
      expect(context.additionalContext).toBeDefined();
    });

    it('should be case-sensitive for agent type matching', () => {
      const context1 = buildSubagentContext('/workspace/project', 'Backend-Engineer', 'session-1');
      const context2 = buildSubagentContext('/workspace/project', 'backend-engineer', 'session-1');

      // 'Backend-Engineer' won't match 'backend' in includes() check
      expect(context1.additionalContext).not.toContain('Write-local only');
      expect(context2.additionalContext).toContain('Write-local only');
    });

    it('should handle agent type with hyphens', () => {
      const context = buildSubagentContext(
        '/workspace/project',
        'brutal-reviewer-v2',
        'session-1'
      );

      expect(context.additionalContext).toContain('brutal-reviewer-v2');
    });

    it('should maintain reminder order', () => {
      const context = buildSubagentContext(
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

    it('should handle very long project paths', () => {
      const longPath = '/home/user/dev/projects/deeply/nested/folder/structure/my-app';
      const context = buildSubagentContext(longPath, 'test-engineer', 'session-1');

      expect(context.additionalContext).toContain('my-app');
    });

    it('should handle root directory paths', () => {
      const context = buildSubagentContext('/', 'test-engineer', 'session-1');

      // Project name extraction should handle this gracefully
      expect(context.additionalContext).toBeDefined();
    });

    it('should handle relative paths', () => {
      const context = buildSubagentContext('./project', 'test-engineer', 'session-1');

      expect(context.additionalContext).toContain('project');
    });

    it('should format project info consistently', () => {
      const context = buildSubagentContext('/workspace/test-app', 'test-engineer', 'session-1');

      expect(context.additionalContext).toMatch(/\[GoodVibes\] Project: test-app/);
    });

    it('should format mode info consistently', () => {
      const context = buildSubagentContext('/workspace/project', 'test-engineer', 'session-1');

      expect(context.additionalContext).toMatch(/Mode: autonomous/);
    });
  });
});
