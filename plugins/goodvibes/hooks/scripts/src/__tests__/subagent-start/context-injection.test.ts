/**
 * Unit tests for subagent-start/context-injection.ts
 *
 * Tests cover:
 * - buildSubagentContext function
 * - Agent type-specific context injection (backend, test, brutal-reviewer)
 * - Combinations of agent types
 * - Project name extraction from cwd
 * - 100% line and branch coverage
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock shared/index.js
const mockLoadSharedConfig = vi.fn();

vi.mock('../../shared/index.js', () => ({
  loadSharedConfig: mockLoadSharedConfig,
}));

// Mock types/config.js
const mockGetDefaultConfig = vi.fn();

vi.mock('../../types/config.js', () => ({
  getDefaultConfig: mockGetDefaultConfig,
}));

describe('context-injection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();

    // Set default mock return values
    mockLoadSharedConfig.mockResolvedValue({
      telemetry: { enabled: false },
    });

    mockGetDefaultConfig.mockReturnValue({
      automation: {
        enabled: true,
        mode: 'default',
        testing: {
          runAfterFileChange: true,
          runBeforeCommit: true,
          runBeforeMerge: true,
          testCommand: 'npm test',
          maxRetries: 3,
        },
        building: {
          runAfterFileThreshold: 5,
          runBeforeCommit: true,
          runBeforeMerge: true,
          buildCommand: 'npm run build',
          typecheckCommand: 'npx tsc --noEmit',
          maxRetries: 3,
        },
        git: {
          autoFeatureBranch: true,
          autoCheckpoint: true,
          autoMerge: true,
          checkpointThreshold: 5,
          mainBranch: 'main',
        },
        recovery: {
          maxRetriesPerError: 3,
          logFailures: true,
          skipAfterMaxRetries: true,
        },
      },
    });
  });

  describe('buildSubagentContext', () => {
    describe('basic functionality', () => {
      it('should return context with project name and mode', async () => {
        const { buildSubagentContext } =
          await import('../../subagent-start/context-injection.js');

        const result = await buildSubagentContext(
          '/test/my-project',
          'generic-agent',
          'session-123'
        );

        expect(result.additionalContext).toContain(
          '[GoodVibes] Project: my-project'
        );
        expect(result.additionalContext).toContain('Mode: default');
      });

      it('should call loadSharedConfig with the correct cwd', async () => {
        const { buildSubagentContext } =
          await import('../../subagent-start/context-injection.js');

        await buildSubagentContext('/custom/path', 'some-agent', 'session-456');

        expect(mockLoadSharedConfig).toHaveBeenCalledWith('/custom/path');
      });

      it('should extract project name from cwd using path.basename', async () => {
        const { buildSubagentContext } =
          await import('../../subagent-start/context-injection.js');

        const result = await buildSubagentContext(
          '/a/b/c/deeply-nested-project',
          'any-agent',
          'session-789'
        );

        expect(result.additionalContext).toContain(
          '[GoodVibes] Project: deeply-nested-project'
        );
      });

      it('should use automation mode from config', async () => {
        mockGetDefaultConfig.mockReturnValue({
          automation: {
            enabled: true,
            mode: 'vibecoding',
            testing: {},
            building: {},
            git: {},
            recovery: {},
          },
        });

        const { buildSubagentContext } =
          await import('../../subagent-start/context-injection.js');

        const result = await buildSubagentContext(
          '/test/project',
          'some-agent',
          'session-abc'
        );

        expect(result.additionalContext).toContain('Mode: vibecoding');
      });
    });

    describe('backend agent type', () => {
      it('should add backend reminder when agentType includes "backend"', async () => {
        const { buildSubagentContext } =
          await import('../../subagent-start/context-injection.js');

        const result = await buildSubagentContext(
          '/test/project',
          'backend-engineer',
          'session-123'
        );

        expect(result.additionalContext).toContain(
          'Remember: Write-local only. All changes must be in the project root.'
        );
      });

      it('should add backend reminder for agent types containing "backend" substring', async () => {
        const { buildSubagentContext } =
          await import('../../subagent-start/context-injection.js');

        const result = await buildSubagentContext(
          '/test/project',
          'senior-backend-developer',
          'session-123'
        );

        expect(result.additionalContext).toContain(
          'Remember: Write-local only. All changes must be in the project root.'
        );
      });
    });

    describe('test agent type', () => {
      it('should add test reminder when agentType includes "test"', async () => {
        const { buildSubagentContext } =
          await import('../../subagent-start/context-injection.js');

        const result = await buildSubagentContext(
          '/test/project',
          'test-engineer',
          'session-123'
        );

        expect(result.additionalContext).toContain(
          'Remember: Tests must actually verify behavior, not just exist.'
        );
      });

      it('should add test reminder for agent types containing "test" substring', async () => {
        const { buildSubagentContext } =
          await import('../../subagent-start/context-injection.js');

        const result = await buildSubagentContext(
          '/test/project',
          'integration-tester',
          'session-123'
        );

        expect(result.additionalContext).toContain(
          'Remember: Tests must actually verify behavior, not just exist.'
        );
      });
    });

    describe('brutal-reviewer agent type', () => {
      it('should add brutal-reviewer reminder when agentType includes "brutal-reviewer"', async () => {
        const { buildSubagentContext } =
          await import('../../subagent-start/context-injection.js');

        const result = await buildSubagentContext(
          '/test/project',
          'brutal-reviewer',
          'session-123'
        );

        expect(result.additionalContext).toContain(
          'Remember: Be brutally honest. Score out of 10.'
        );
      });

      it('should add brutal-reviewer reminder for agent types containing "brutal-reviewer" substring', async () => {
        const { buildSubagentContext } =
          await import('../../subagent-start/context-injection.js');

        const result = await buildSubagentContext(
          '/test/project',
          'my-brutal-reviewer-agent',
          'session-123'
        );

        expect(result.additionalContext).toContain(
          'Remember: Be brutally honest. Score out of 10.'
        );
      });
    });

    describe('combined agent types', () => {
      it('should add both backend and test reminders when both are in agentType', async () => {
        const { buildSubagentContext } =
          await import('../../subagent-start/context-injection.js');

        const result = await buildSubagentContext(
          '/test/project',
          'backend-test-agent',
          'session-123'
        );

        expect(result.additionalContext).toContain(
          'Remember: Write-local only. All changes must be in the project root.'
        );
        expect(result.additionalContext).toContain(
          'Remember: Tests must actually verify behavior, not just exist.'
        );
      });

      it('should add all three reminders when all agent types are present', async () => {
        const { buildSubagentContext } =
          await import('../../subagent-start/context-injection.js');

        const result = await buildSubagentContext(
          '/test/project',
          'backend-test-brutal-reviewer',
          'session-123'
        );

        expect(result.additionalContext).toContain(
          'Remember: Write-local only. All changes must be in the project root.'
        );
        expect(result.additionalContext).toContain(
          'Remember: Tests must actually verify behavior, not just exist.'
        );
        expect(result.additionalContext).toContain(
          'Remember: Be brutally honest. Score out of 10.'
        );
      });

      it('should add backend and brutal-reviewer reminders when both are in agentType', async () => {
        const { buildSubagentContext } =
          await import('../../subagent-start/context-injection.js');

        const result = await buildSubagentContext(
          '/test/project',
          'backend-brutal-reviewer',
          'session-123'
        );

        expect(result.additionalContext).toContain(
          'Remember: Write-local only. All changes must be in the project root.'
        );
        expect(result.additionalContext).toContain(
          'Remember: Be brutally honest. Score out of 10.'
        );
        expect(result.additionalContext).not.toContain(
          'Remember: Tests must actually verify behavior, not just exist.'
        );
      });

      it('should add test and brutal-reviewer reminders when both are in agentType', async () => {
        const { buildSubagentContext } =
          await import('../../subagent-start/context-injection.js');

        const result = await buildSubagentContext(
          '/test/project',
          'test-brutal-reviewer',
          'session-123'
        );

        expect(result.additionalContext).toContain(
          'Remember: Tests must actually verify behavior, not just exist.'
        );
        expect(result.additionalContext).toContain(
          'Remember: Be brutally honest. Score out of 10.'
        );
        expect(result.additionalContext).not.toContain(
          'Remember: Write-local only. All changes must be in the project root.'
        );
      });
    });

    describe('no matching agent type', () => {
      it('should return only project context when agent type has no special reminders', async () => {
        const { buildSubagentContext } =
          await import('../../subagent-start/context-injection.js');

        const result = await buildSubagentContext(
          '/test/project',
          'frontend-designer',
          'session-123'
        );

        expect(result.additionalContext).toContain(
          '[GoodVibes] Project: project'
        );
        expect(result.additionalContext).toContain('Mode: default');
        expect(result.additionalContext).not.toContain('Remember:');
      });

      it('should return context for unrecognized agent type', async () => {
        const { buildSubagentContext } =
          await import('../../subagent-start/context-injection.js');

        const result = await buildSubagentContext(
          '/test/project',
          'random-agent-xyz',
          'session-123'
        );

        expect(result.additionalContext).toContain('[GoodVibes] Project:');
        expect(result.additionalContext).toContain('Mode:');
      });
    });

    describe('edge cases', () => {
      it('should handle empty agentType string', async () => {
        const { buildSubagentContext } =
          await import('../../subagent-start/context-injection.js');

        const result = await buildSubagentContext(
          '/test/project',
          '',
          'session-123'
        );

        expect(result.additionalContext).toContain(
          '[GoodVibes] Project: project'
        );
        expect(result.additionalContext).not.toContain('Remember:');
      });

      it('should handle cwd that is just a folder name', async () => {
        const { buildSubagentContext } =
          await import('../../subagent-start/context-injection.js');

        const result = await buildSubagentContext(
          'my-folder',
          'generic-agent',
          'session-123'
        );

        expect(result.additionalContext).toContain(
          '[GoodVibes] Project: my-folder'
        );
      });

      it('should handle Windows-style paths', async () => {
        const { buildSubagentContext } =
          await import('../../subagent-start/context-injection.js');

        const result = await buildSubagentContext(
          'C:\\Users\\test\\my-project',
          'generic-agent',
          'session-123'
        );

        expect(result.additionalContext).toContain(
          '[GoodVibes] Project: my-project'
        );
      });

      it('should always return string additionalContext since project info is always added', async () => {
        const { buildSubagentContext } =
          await import('../../subagent-start/context-injection.js');

        const result = await buildSubagentContext(
          '/any/path',
          'any-agent',
          'session-123'
        );

        // The context is always a string because we always push project info
        expect(typeof result.additionalContext).toBe('string');
        expect(result.additionalContext.length).toBeGreaterThan(0);
      });

      it('should correctly join multiple context parts with newlines', async () => {
        const { buildSubagentContext } =
          await import('../../subagent-start/context-injection.js');

        const result = await buildSubagentContext(
          '/test/project',
          'backend-agent',
          'session-123'
        );

        const lines = result.additionalContext.split('\n');
        expect(lines.length).toBeGreaterThanOrEqual(3);
        expect(lines[0]).toContain('[GoodVibes] Project:');
        expect(lines[1]).toContain('Mode:');
        expect(lines[2]).toContain('Remember:');
      });

      it('should handle session ID parameter (unused but accepted)', async () => {
        const { buildSubagentContext } =
          await import('../../subagent-start/context-injection.js');

        // Session ID is currently unused but accepted as a parameter
        const result = await buildSubagentContext(
          '/test/project',
          'generic-agent',
          'unique-session-id-12345'
        );

        expect(typeof result.additionalContext).toBe('string');
      });
    });

    describe('SubagentContext interface', () => {
      it('should return object matching SubagentContext interface', async () => {
        const { buildSubagentContext } =
          await import('../../subagent-start/context-injection.js');

        const result = await buildSubagentContext(
          '/test/project',
          'test-agent',
          'session-123'
        );

        expect(result).toHaveProperty('additionalContext');
        expect(typeof result.additionalContext).toBe('string');
      });
    });

    describe('async behavior', () => {
      it('should properly await loadSharedConfig', async () => {
        let resolved = false;
        mockLoadSharedConfig.mockImplementation(async () => {
          await new Promise((resolve) => setTimeout(resolve, 10));
          resolved = true;
          return { telemetry: { enabled: false } };
        });

        const { buildSubagentContext } =
          await import('../../subagent-start/context-injection.js');

        await buildSubagentContext('/test/project', 'agent', 'session-123');

        expect(resolved).toBe(true);
      });

      it('should handle loadSharedConfig rejection gracefully if it throws', async () => {
        mockLoadSharedConfig.mockRejectedValue(new Error('Config load failed'));

        const { buildSubagentContext } =
          await import('../../subagent-start/context-injection.js');

        // The function awaits loadSharedConfig but doesn't use it currently
        // so rejection should propagate
        await expect(
          buildSubagentContext('/test/project', 'agent', 'session-123')
        ).rejects.toThrow('Config load failed');
      });
    });

    describe('different automation modes', () => {
      it('should handle justvibes mode', async () => {
        mockGetDefaultConfig.mockReturnValue({
          automation: {
            enabled: true,
            mode: 'justvibes',
            testing: {},
            building: {},
            git: {},
            recovery: {},
          },
        });

        const { buildSubagentContext } =
          await import('../../subagent-start/context-injection.js');

        const result = await buildSubagentContext(
          '/test/project',
          'agent',
          'session-123'
        );

        expect(result.additionalContext).toContain('Mode: justvibes');
      });

      it('should handle vibecoding mode', async () => {
        mockGetDefaultConfig.mockReturnValue({
          automation: {
            enabled: true,
            mode: 'vibecoding',
            testing: {},
            building: {},
            git: {},
            recovery: {},
          },
        });

        const { buildSubagentContext } =
          await import('../../subagent-start/context-injection.js');

        const result = await buildSubagentContext(
          '/test/project',
          'agent',
          'session-123'
        );

        expect(result.additionalContext).toContain('Mode: vibecoding');
      });
    });
  });
});
