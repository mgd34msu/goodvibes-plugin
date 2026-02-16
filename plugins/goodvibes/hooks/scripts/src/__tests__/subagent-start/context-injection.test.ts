/**
 * Unit tests for subagent-start/context-injection.ts
 *
 * Tests cover:
 * - buildSubagentContext function
 * - Universal skills/MCP tools reminder (injected for ALL agents)
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
  isTestEnvironment: () => false,
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

      it('should always include universal skills/MCP tools reminder', async () => {
        const { buildSubagentContext } =
          await import('../../subagent-start/context-injection.js');

        const result = await buildSubagentContext(
          '/test/my-project',
          'generic-agent',
          'session-123'
        );

        expect(result.additionalContext).toContain(
          'MANDATORY: Always prefer GoodVibes skills and MCP tools over raw bash/shell commands.'
        );
        expect(result.additionalContext).toContain(
          'Only use commands outside of MCP tools or skills when there is absolutely no other way'
        );
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

    describe('universal skills/MCP tools reminder', () => {
      it('should include reminder about preferring skills and MCP tools', async () => {
        const { buildSubagentContext } =
          await import('../../subagent-start/context-injection.js');

        const result = await buildSubagentContext(
          '/test/project',
          'any-agent-type',
          'session-123'
        );

        expect(result.additionalContext).toContain('MANDATORY:');
        expect(result.additionalContext).toContain('GoodVibes skills and MCP tools');
        expect(result.additionalContext).toContain('raw bash/shell commands');
      });

      it('should emphasize using tools for each part of task even if whole task cannot be done with tools', async () => {
        const { buildSubagentContext } =
          await import('../../subagent-start/context-injection.js');

        const result = await buildSubagentContext(
          '/test/project',
          'generic-agent',
          'session-123'
        );

        expect(result.additionalContext).toContain(
          'Even if the entire task cannot be completed with skills/MCP tools, use them for every part where they apply'
        );
      });

      it('should include reminder for all GoodVibes agent types', async () => {
        const { buildSubagentContext } =
          await import('../../subagent-start/context-injection.js');

        const goodvibesAgentTypes = [
          'goodvibes:backend-engineer',
          'goodvibes:frontend-architect',
          'goodvibes:test-engineer',
          'goodvibes:workflow-planner',
        ];

        for (const agentType of goodvibesAgentTypes) {
          const result = await buildSubagentContext(
            '/test/project',
            agentType,
            'session-123'
          );

          expect(result.additionalContext).toContain('MANDATORY: Always prefer GoodVibes skills');
        }
      });

      it('should include reminder for non-GoodVibes agent types', async () => {
        const { buildSubagentContext } =
          await import('../../subagent-start/context-injection.js');

        const result = await buildSubagentContext(
          '/test/project',
          'custom-external-agent',
          'session-123'
        );

        expect(result.additionalContext).toContain('MANDATORY: Always prefer GoodVibes skills');
      });
    });

    describe('batch processing reminder', () => {
      it('should include batch processing section', async () => {
        const { buildSubagentContext } =
          await import('../../subagent-start/context-injection.js');

        const result = await buildSubagentContext(
          '/test/project',
          'generic-agent',
          'session-123'
        );

        expect(result.additionalContext).toContain('MANDATORY: If multiple tool uses');
      });

      it('should mention discover for batch operations', async () => {
        const { buildSubagentContext } =
          await import('../../subagent-start/context-injection.js');

        const result = await buildSubagentContext(
          '/test/project',
          'backend-engineer',
          'session-123'
        );

        expect(result.additionalContext).toContain('discover');
        expect(result.additionalContext).toContain('mcp__plugin_goodvibes_precision-engine__discover');
      });

      it('should mention batch for batch operations', async () => {
        const { buildSubagentContext } =
          await import('../../subagent-start/context-injection.js');

        const result = await buildSubagentContext(
          '/test/project',
          'backend-engineer',
          'session-123'
        );

        expect(result.additionalContext).toContain('batch');
        expect(result.additionalContext).toContain('mcp__plugin_goodvibes_batch-engine__batch');
      });





      it('should include batch processing reminder for all agent types', async () => {
        const { buildSubagentContext } =
          await import('../../subagent-start/context-injection.js');

        const agentTypes = [
          'backend-engineer',
          'frontend-architect',
          'test-engineer',
          'custom-agent',
        ];

        for (const agentType of agentTypes) {
          const result = await buildSubagentContext(
            '/test/project',
            agentType,
            'session-123'
          );

          expect(result.additionalContext).toContain('MANDATORY: If multiple tool uses');
        }
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
          'Remember: Write-local only. All changes must be in the project root or directories within the project root.'
        );
      });

      it('should add backend reminder for agent types containing "engineer" substring', async () => {
        const { buildSubagentContext } =
          await import('../../subagent-start/context-injection.js');

        const result = await buildSubagentContext(
          '/test/project',
          'senior-engineer',
          'session-123'
        );

        expect(result.additionalContext).toContain(
          'Remember: Write-local only. All changes must be in the project root or directories within the project root.'
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
          'Remember: Be completely honest, regardless of how harsh'
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
          'Remember: Be completely honest, regardless of how harsh'
        );
      });
    });

    describe('combined agent types', () => {
      it('should add both engineer and test reminders when both are in agentType', async () => {
        const { buildSubagentContext } =
          await import('../../subagent-start/context-injection.js');

        const result = await buildSubagentContext(
          '/test/project',
          'engineer-test-agent',
          'session-123'
        );

        expect(result.additionalContext).toContain(
          'Remember: Write-local only. All changes must be in the project root or directories within the project root.'
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
          'engineer-test-brutal-reviewer',
          'session-123'
        );

        expect(result.additionalContext).toContain(
          'Remember: Write-local only. All changes must be in the project root or directories within the project root.'
        );
        expect(result.additionalContext).toContain(
          'Remember: Tests must actually verify behavior, not just exist.'
        );
        expect(result.additionalContext).toContain(
          'Remember: Be completely honest, regardless of how harsh'
        );
      });

      it('should add engineer and brutal-reviewer reminders when both are in agentType', async () => {
        const { buildSubagentContext } =
          await import('../../subagent-start/context-injection.js');

        const result = await buildSubagentContext(
          '/test/project',
          'engineer-brutal-reviewer',
          'session-123'
        );

        expect(result.additionalContext).toContain(
          'Remember: Write-local only. All changes must be in the project root or directories within the project root.'
        );
        expect(result.additionalContext).toContain(
          'Remember: Be completely honest, regardless of how harsh'
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
          'Remember: Be completely honest, regardless of how harsh'
        );
        expect(result.additionalContext).not.toContain(
          'Remember: Write-local only. All changes must be in the project root or directories within the project root.'
        );
      });
    });

    describe('no matching agent type', () => {
      it('should return project context and universal reminder when agent type has no special reminders', async () => {
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
        expect(result.additionalContext).toContain('MANDATORY: Always prefer GoodVibes skills');
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
        expect(result.additionalContext).toContain('MANDATORY: Always prefer GoodVibes skills');
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

        // On Linux, path.basename() doesn't parse Windows paths, so just verify it contains project info
        expect(result.additionalContext).toContain('[GoodVibes] Project:');
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
          'engineer-agent',
          'session-123'
        );

        const lines = result.additionalContext.split('\n');
        expect(lines.length).toBeGreaterThanOrEqual(5);
        expect(lines[0]).toContain('[GoodVibes] Project:');
        expect(lines[1]).toContain('Mode:');
        expect(result.additionalContext).toContain('MANDATORY:');
        expect(result.additionalContext).toContain('MANDATORY: If multiple');
        // Agent-specific reminder (e.g., "Remember: Write-local only") comes after batch processing section
        expect(result.additionalContext).toContain('Remember:');
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

    describe('skill injection', () => {
      it('should include protocol skills for all agents', async () => {
        const { buildSubagentContext } =
          await import('../../subagent-start/context-injection.js');

        const result = await buildSubagentContext(
          '/test/project',
          'goodvibes:engineer',
          'session-123'
        );

        expect(result.additionalContext).toContain(
          'Available protocol skills'
        );
        expect(result.additionalContext).toContain('precision-mastery');
        expect(result.additionalContext).toContain('review-scoring');
        expect(result.additionalContext).toContain('discover-plan-batch');
        expect(result.additionalContext).toContain('goodvibes-memory');
        expect(result.additionalContext).toContain('error-recovery');
      });

      it('should inject engineer skills for goodvibes:engineer', async () => {
        const { buildSubagentContext } =
          await import('../../subagent-start/context-injection.js');

        const result = await buildSubagentContext(
          '/test/project',
          'goodvibes:engineer',
          'session-123'
        );

        expect(result.additionalContext).toContain('authentication');
        expect(result.additionalContext).toContain('database-layer');
        expect(result.additionalContext).toContain('api-design');
        expect(result.additionalContext).toContain(
          'component-architecture'
        );
      });

      it('should inject reviewer skills for goodvibes:reviewer', async () => {
        const { buildSubagentContext } =
          await import('../../subagent-start/context-injection.js');

        const result = await buildSubagentContext(
          '/test/project',
          'goodvibes:reviewer',
          'session-123'
        );

        expect(result.additionalContext).toContain('code-review');
        expect(result.additionalContext).toContain('security-audit');
        expect(result.additionalContext).toContain('performance-audit');
        expect(result.additionalContext).toContain('accessibility-audit');
      });

      it('should inject tester skills for goodvibes:tester', async () => {
        const { buildSubagentContext } =
          await import('../../subagent-start/context-injection.js');

        const result = await buildSubagentContext(
          '/test/project',
          'goodvibes:tester',
          'session-123'
        );

        expect(result.additionalContext).toContain('testing-strategy');
      });

      it('should inject architect skills for goodvibes:architect', async () => {
        const { buildSubagentContext } =
          await import('../../subagent-start/context-injection.js');

        const result = await buildSubagentContext(
          '/test/project',
          'goodvibes:architect',
          'session-123'
        );

        expect(result.additionalContext).toContain('project-onboarding');
      });

      it('should inject deployer skills for goodvibes:deployer', async () => {
        const { buildSubagentContext } =
          await import('../../subagent-start/context-injection.js');

        const result = await buildSubagentContext(
          '/test/project',
          'goodvibes:deployer',
          'session-123'
        );

        expect(result.additionalContext).toContain('deployment');
      });

      it('should inject generic integrator skills for goodvibes:integrator', async () => {
        const { buildSubagentContext } =
          await import('../../subagent-start/context-injection.js');

        const result = await buildSubagentContext(
          '/test/project',
          'goodvibes:integrator',
          'session-123'
        );

        expect(result.additionalContext).toContain('ai-integration');
        expect(result.additionalContext).toContain('payment-integration');
        expect(result.additionalContext).toContain('service-integration');
        expect(result.additionalContext).toContain('state-management');
        expect(result.additionalContext).toContain('authentication');
      });

      it('should inject planner skills for goodvibes:planner', async () => {
        const { buildSubagentContext } =
          await import('../../subagent-start/context-injection.js');

        const result = await buildSubagentContext(
          '/test/project',
          'goodvibes:planner',
          'session-123'
        );

        expect(result.additionalContext).toContain('task-orchestration');
        expect(result.additionalContext).toContain('fullstack-feature');
      });

      it('should show fallback for meta-agents (agent-factory)', async () => {
        const { buildSubagentContext } =
          await import('../../subagent-start/context-injection.js');

        const result = await buildSubagentContext(
          '/test/project',
          'goodvibes:agent-factory',
          'session-123'
        );

        expect(result.additionalContext).toContain('none — load as needed');
      });

      it('should show fallback for meta-agents (skill-factory)', async () => {
        const { buildSubagentContext } =
          await import('../../subagent-start/context-injection.js');

        const result = await buildSubagentContext(
          '/test/project',
          'goodvibes:skill-factory',
          'session-123'
        );

        expect(result.additionalContext).toContain('none — load as needed');
      });

      it('should show fallback for unknown agent types', async () => {
        const { buildSubagentContext } =
          await import('../../subagent-start/context-injection.js');

        const result = await buildSubagentContext(
          '/test/project',
          'unknown-agent',
          'session-123'
        );

        expect(result.additionalContext).toContain('none — load as needed');
      });

      it('should include skill loading instructions', async () => {
        const { buildSubagentContext } =
          await import('../../subagent-start/context-injection.js');

        const result = await buildSubagentContext(
          '/test/project',
          'goodvibes:engineer',
          'session-123'
        );

        expect(result.additionalContext).toContain(
          'Load skills with: search_skills or get_skill_content from the registry engine'
        );
      });
    });
  });
});
