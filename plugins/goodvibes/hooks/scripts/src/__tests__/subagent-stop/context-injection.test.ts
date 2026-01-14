/**
 * Tests for SubagentStop context injection
 *
 * Tests cover:
 * - Orchestrator context building
 * - Delegation reminders
 * - GoodVibes state/memory reminders
 * - Agent chaining reminders based on agent type
 * - Success vs failure handling
 */

import { describe, it, expect } from 'vitest';

import { buildOrchestratorContext } from '../../subagent-stop/context-injection.js';

describe('subagent-stop/context-injection', () => {
  describe('buildOrchestratorContext', () => {
    const cwd = '/test/project';
    const agentId = 'abc123';

    describe('header formatting', () => {
      it('should include agent type and ID in header for successful completion', () => {
        const result = buildOrchestratorContext(cwd, 'backend-engineer', agentId, true);

        expect(result.systemMessage).toContain('[GoodVibes] Agent backend-engineer (abc123) completed');
      });

      it('should include "finished with issues" for failed agents', () => {
        const result = buildOrchestratorContext(cwd, 'backend-engineer', agentId, false);

        expect(result.systemMessage).toContain('[GoodVibes] Agent backend-engineer (abc123) finished with issues');
      });
    });

    describe('orchestrator delegation reminder', () => {
      it('should always include orchestrator delegation reminder', () => {
        const result = buildOrchestratorContext(cwd, 'test-engineer', agentId, true);

        expect(result.systemMessage).toContain('ORCHESTRATOR REMINDER');
        expect(result.systemMessage).toContain('You are the orchestrator');
        expect(result.systemMessage).toContain('Delegate ALL project work to specialist agents');
        expect(result.systemMessage).toContain('Never do coding, file editing, testing');
        expect(result.systemMessage).toContain('main context is sacred');
      });
    });

    describe('GoodVibes state reminder', () => {
      it('should always include GoodVibes state reminder', () => {
        const result = buildOrchestratorContext(cwd, 'frontend-architect', agentId, true);

        expect(result.systemMessage).toContain('GOODVIBES STATE');
        expect(result.systemMessage).toContain('.goodvibes/');
      });

      it('should mention hooks-state.json', () => {
        const result = buildOrchestratorContext(cwd, 'frontend-architect', agentId, true);

        expect(result.systemMessage).toContain('.goodvibes/state/hooks-state.json');
        expect(result.systemMessage).toContain('Session state');
      });

      it('should mention agent-tracking.json', () => {
        const result = buildOrchestratorContext(cwd, 'frontend-architect', agentId, true);

        expect(result.systemMessage).toContain('.goodvibes/state/agent-tracking.json');
        expect(result.systemMessage).toContain('Active agent tracking');
      });

      it('should mention justvibes-log.md', () => {
        const result = buildOrchestratorContext(cwd, 'frontend-architect', agentId, true);

        expect(result.systemMessage).toContain('.goodvibes/logs/justvibes-log.md');
        expect(result.systemMessage).toContain('Activity logging');
      });

      it('should mention justvibes-errors.md', () => {
        const result = buildOrchestratorContext(cwd, 'frontend-architect', agentId, true);

        expect(result.systemMessage).toContain('.goodvibes/logs/justvibes-errors.md');
        expect(result.systemMessage).toContain('Error logging');
      });

      it('should mention telemetry files', () => {
        const result = buildOrchestratorContext(cwd, 'frontend-architect', agentId, true);

        expect(result.systemMessage).toContain('.goodvibes/telemetry/');
        expect(result.systemMessage).toContain('Agent telemetry');
      });

      it('should mention reading files to recover context', () => {
        const result = buildOrchestratorContext(cwd, 'frontend-architect', agentId, true);

        expect(result.systemMessage).toContain('Read these files to recover context');
      });
    });

    describe('MCP tools reminder', () => {
      it('should include MCP tools reminder', () => {
        const result = buildOrchestratorContext(cwd, 'backend-engineer', agentId, true);

        expect(result.systemMessage).toContain('MCP TOOLS');
        expect(result.systemMessage).toContain('mcp-cli');
      });
    });

    describe('agent chaining reminders', () => {
      describe('on failure', () => {
        it('should suggest investigating issues when agent fails', () => {
          const result = buildOrchestratorContext(cwd, 'backend-engineer', agentId, false);

          expect(result.systemMessage).toContain('CHAIN');
          expect(result.systemMessage).toContain('Agent had issues');
          expect(result.systemMessage).toContain('fix agent');
        });
      });

      describe('backend agents', () => {
        it('should suggest reviewer, frontend, or test after backend work', () => {
          const result = buildOrchestratorContext(cwd, 'backend-engineer', agentId, true);

          expect(result.systemMessage).toContain('CHAIN');
          expect(result.systemMessage).toContain('Backend work done');
          expect(result.systemMessage).toContain('brutal-reviewer');
          expect(result.systemMessage).toContain('frontend-architect');
          expect(result.systemMessage).toContain('test-engineer');
        });

        it('should match goodvibes:backend-engineer type', () => {
          const result = buildOrchestratorContext(cwd, 'goodvibes:backend-engineer', agentId, true);

          expect(result.systemMessage).toContain('Backend work done');
        });
      });

      describe('frontend agents', () => {
        it('should suggest reviewer, tests, or integrator after frontend work', () => {
          const result = buildOrchestratorContext(cwd, 'frontend-architect', agentId, true);

          expect(result.systemMessage).toContain('CHAIN');
          expect(result.systemMessage).toContain('Frontend work done');
          expect(result.systemMessage).toContain('brutal-reviewer');
          expect(result.systemMessage).toContain('test-engineer');
          expect(result.systemMessage).toContain('fullstack-integrator');
        });

        it('should match goodvibes:frontend-architect type', () => {
          const result = buildOrchestratorContext(cwd, 'goodvibes:frontend-architect', agentId, true);

          expect(result.systemMessage).toContain('Frontend work done');
        });
      });

      describe('test agents', () => {
        it('should suggest reviewer or devops after tests written', () => {
          const result = buildOrchestratorContext(cwd, 'test-engineer', agentId, true);

          expect(result.systemMessage).toContain('CHAIN');
          expect(result.systemMessage).toContain('Tests written');
          expect(result.systemMessage).toContain('brutal-reviewer');
          expect(result.systemMessage).toContain('devops-deployer');
        });

        it('should match goodvibes:test-engineer type', () => {
          const result = buildOrchestratorContext(cwd, 'goodvibes:test-engineer', agentId, true);

          expect(result.systemMessage).toContain('Tests written');
        });
      });

      describe('reviewer agents', () => {
        it('should suggest fixing issues or continuing after review', () => {
          const result = buildOrchestratorContext(cwd, 'brutal-reviewer', agentId, true);

          expect(result.systemMessage).toContain('CHAIN');
          expect(result.systemMessage).toContain('Review complete');
          expect(result.systemMessage).toContain('issues found');
        });

        it('should match goodvibes:brutally-honest-reviewer type', () => {
          const result = buildOrchestratorContext(cwd, 'goodvibes:brutally-honest-reviewer', agentId, true);

          expect(result.systemMessage).toContain('Review complete');
        });
      });

      describe('architect agents', () => {
        it('should suggest tests or review after architecture work', () => {
          const result = buildOrchestratorContext(cwd, 'code-architect', agentId, true);

          expect(result.systemMessage).toContain('CHAIN');
          expect(result.systemMessage).toContain('Architecture/refactoring done');
          expect(result.systemMessage).toContain('test-engineer');
          expect(result.systemMessage).toContain('brutal-reviewer');
        });

        it('should match refactor in agent type', () => {
          const result = buildOrchestratorContext(cwd, 'refactor-agent', agentId, true);

          expect(result.systemMessage).toContain('Architecture/refactoring done');
        });
      });

      describe('fullstack/integrator agents', () => {
        it('should suggest tests or review after integration work', () => {
          const result = buildOrchestratorContext(cwd, 'fullstack-integrator', agentId, true);

          expect(result.systemMessage).toContain('CHAIN');
          expect(result.systemMessage).toContain('Integration done');
          expect(result.systemMessage).toContain('test-engineer');
          expect(result.systemMessage).toContain('brutal-reviewer');
        });

        it('should match goodvibes:fullstack-integrator type', () => {
          const result = buildOrchestratorContext(cwd, 'goodvibes:fullstack-integrator', agentId, true);

          expect(result.systemMessage).toContain('Integration done');
        });
      });

      describe('devops/deploy agents', () => {
        it('should suggest verification after deployment', () => {
          const result = buildOrchestratorContext(cwd, 'devops-deployer', agentId, true);

          expect(result.systemMessage).toContain('CHAIN');
          expect(result.systemMessage).toContain('Deployment task done');
          expect(result.systemMessage).toContain('Verify deployment');
        });

        it('should match deploy in agent type', () => {
          const result = buildOrchestratorContext(cwd, 'deploy-agent', agentId, true);

          expect(result.systemMessage).toContain('Deployment task done');
        });
      });

      describe('unknown agent types', () => {
        it('should not include chain reminder for unknown agent types', () => {
          const result = buildOrchestratorContext(cwd, 'custom-agent', agentId, true);

          // Should have all other parts but no CHAIN section after the core reminders
          expect(result.systemMessage).toContain('ORCHESTRATOR REMINDER');
          expect(result.systemMessage).toContain('GOODVIBES STATE');
          expect(result.systemMessage).toContain('MCP TOOLS');
          // Count CHAIN occurrences - should only appear in header/project name context, not as a section
          const chainMatches = result.systemMessage.match(/CHAIN:/g);
          expect(chainMatches).toBeNull();
        });
      });
    });

    describe('message structure', () => {
      it('should separate sections with double newlines', () => {
        const result = buildOrchestratorContext(cwd, 'backend-engineer', agentId, true);

        // Check that sections are separated by double newlines
        expect(result.systemMessage).toContain('\n\n');
      });

      it('should have systemMessage as a string', () => {
        const result = buildOrchestratorContext(cwd, 'backend-engineer', agentId, true);

        expect(typeof result.systemMessage).toBe('string');
        expect(result.systemMessage.length).toBeGreaterThan(100);
      });
    });
  });
});
