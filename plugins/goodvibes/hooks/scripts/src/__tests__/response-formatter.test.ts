/**
 * Unit tests for response-formatter module
 *
 * Tests cover:
 * - System message building with all context variations
 * - Recovery mode indicator
 * - Empty project detection
 * - Context summary formatting
 * - Performance metrics display
 * - Session ID truncation
 * - Edge cases and boundary conditions
 */

import { describe, it, expect } from 'vitest';

import { buildSystemMessage } from '../session-start/response-formatter.js';

import type { ContextGatheringResult } from '../session-start/context-builder.js';

describe('response-formatter', () => {
  describe('buildSystemMessage', () => {
    describe('base message components', () => {
      it('should include plugin version', () => {
        const context: ContextGatheringResult = {
          additionalContext: '',
          summary: '',
          isEmptyProject: false,
          hasIssues: false,
          issueCount: 0,
          gatherTimeMs: 0,
          needsRecovery: false,
        };

        const message = buildSystemMessage('test-session-id', context);

        expect(message).toContain('GoodVibes plugin v2.1.0 initialized.');
      });

      it('should include tools count', () => {
        const context: ContextGatheringResult = {
          additionalContext: '',
          summary: '',
          isEmptyProject: false,
          hasIssues: false,
          issueCount: 0,
          gatherTimeMs: 0,
          needsRecovery: false,
        };

        const message = buildSystemMessage('test-session-id', context);

        expect(message).toContain('17 tools available.');
      });

      it('should truncate session ID to last 8 characters', () => {
        const context: ContextGatheringResult = {
          additionalContext: '',
          summary: '',
          isEmptyProject: false,
          hasIssues: false,
          issueCount: 0,
          gatherTimeMs: 0,
          needsRecovery: false,
        };

        const longSessionId = 'session_1234567890abcdef';
        const message = buildSystemMessage(longSessionId, context);

        expect(message).toContain('Session: 90abcdef');
        expect(message).not.toContain('session_1234567890abcdef');
      });

      it('should handle session ID shorter than 8 characters', () => {
        const context: ContextGatheringResult = {
          additionalContext: '',
          summary: '',
          isEmptyProject: false,
          hasIssues: false,
          issueCount: 0,
          gatherTimeMs: 0,
          needsRecovery: false,
        };

        const shortSessionId = 'short';
        const message = buildSystemMessage(shortSessionId, context);

        expect(message).toContain('Session: short');
      });

      it('should handle exactly 8 character session ID', () => {
        const context: ContextGatheringResult = {
          additionalContext: '',
          summary: '',
          isEmptyProject: false,
          hasIssues: false,
          issueCount: 0,
          gatherTimeMs: 0,
          needsRecovery: false,
        };

        const exactSessionId = '12345678';
        const message = buildSystemMessage(exactSessionId, context);

        expect(message).toContain('Session: 12345678');
      });
    });

    describe('recovery mode indicator', () => {
      it('should include recovery mode indicator when needsRecovery is true', () => {
        const context: ContextGatheringResult = {
          additionalContext: '',
          summary: '',
          isEmptyProject: false,
          hasIssues: false,
          issueCount: 0,
          gatherTimeMs: 0,
          needsRecovery: true,
        };

        const message = buildSystemMessage('test-session', context);

        expect(message).toContain('| RECOVERY MODE');
      });

      it('should not include recovery mode indicator when needsRecovery is false', () => {
        const context: ContextGatheringResult = {
          additionalContext: '',
          summary: '',
          isEmptyProject: false,
          hasIssues: false,
          issueCount: 0,
          gatherTimeMs: 0,
          needsRecovery: false,
        };

        const message = buildSystemMessage('test-session', context);

        expect(message).not.toContain('| RECOVERY MODE');
        expect(message).not.toContain('RECOVERY');
      });
    });

    describe('empty project detection', () => {
      it('should show empty project message when isEmptyProject is true', () => {
        const context: ContextGatheringResult = {
          additionalContext: '',
          summary: '',
          isEmptyProject: true,
          hasIssues: false,
          issueCount: 0,
          gatherTimeMs: 0,
          needsRecovery: false,
        };

        const message = buildSystemMessage('test-session', context);

        expect(message).toContain(
          '| Empty project detected - scaffolding tools available.'
        );
      });

      it('should not show empty project message when isEmptyProject is false', () => {
        const context: ContextGatheringResult = {
          additionalContext: '',
          summary: '',
          isEmptyProject: false,
          hasIssues: false,
          issueCount: 0,
          gatherTimeMs: 0,
          needsRecovery: false,
        };

        const message = buildSystemMessage('test-session', context);

        expect(message).not.toContain('Empty project detected');
        expect(message).not.toContain('scaffolding tools available');
      });
    });

    describe('context summary', () => {
      it('should include summary when provided and not empty project', () => {
        const context: ContextGatheringResult = {
          additionalContext: '',
          summary: 'React, Next.js on main | 3 uncommitted | 2 issues',
          isEmptyProject: false,
          hasIssues: true,
          issueCount: 2,
          gatherTimeMs: 0,
          needsRecovery: false,
        };

        const message = buildSystemMessage('test-session', context);

        expect(message).toContain(
          '| React, Next.js on main | 3 uncommitted | 2 issues'
        );
      });

      it('should not include summary when isEmptyProject is true', () => {
        const context: ContextGatheringResult = {
          additionalContext: '',
          summary: 'This summary should not appear',
          isEmptyProject: true,
          hasIssues: false,
          issueCount: 0,
          gatherTimeMs: 0,
          needsRecovery: false,
        };

        const message = buildSystemMessage('test-session', context);

        expect(message).not.toContain('This summary should not appear');
        expect(message).toContain('Empty project detected');
      });

      it('should handle empty summary string', () => {
        const context: ContextGatheringResult = {
          additionalContext: '',
          summary: '',
          isEmptyProject: false,
          hasIssues: false,
          issueCount: 0,
          gatherTimeMs: 0,
          needsRecovery: false,
        };

        const message = buildSystemMessage('test-session', context);

        // Should not have double pipes or extra separators
        expect(message).not.toMatch(/\|\s*\|/);
      });

      it('should not include summary separator when summary is empty and not empty project', () => {
        const context: ContextGatheringResult = {
          additionalContext: '',
          summary: '',
          isEmptyProject: false,
          hasIssues: false,
          issueCount: 0,
          gatherTimeMs: 0,
          needsRecovery: false,
        };

        const message = buildSystemMessage('test-session', context);

        // Count the number of pipe characters - should only have them in the base message parts
        const pipeCount = (message.match(/\|/g) ?? []).length;
        expect(pipeCount).toBe(0); // No context summary or recovery, so no pipes
      });
    });

    describe('performance metrics', () => {
      it('should include performance metrics when gatherTimeMs is greater than 0', () => {
        const context: ContextGatheringResult = {
          additionalContext: '',
          summary: 'React on main',
          isEmptyProject: false,
          hasIssues: false,
          issueCount: 0,
          gatherTimeMs: 125,
          needsRecovery: false,
        };

        const message = buildSystemMessage('test-session', context);

        expect(message).toContain('(context: 125ms)');
      });

      it('should not include performance metrics when gatherTimeMs is 0', () => {
        const context: ContextGatheringResult = {
          additionalContext: '',
          summary: 'React on main',
          isEmptyProject: false,
          hasIssues: false,
          issueCount: 0,
          gatherTimeMs: 0,
          needsRecovery: false,
        };

        const message = buildSystemMessage('test-session', context);

        expect(message).not.toContain('context:');
        expect(message).not.toContain('ms)');
      });

      it('should not include performance metrics when gatherTimeMs is negative', () => {
        const context: ContextGatheringResult = {
          additionalContext: '',
          summary: 'React on main',
          isEmptyProject: false,
          hasIssues: false,
          issueCount: 0,
          gatherTimeMs: -50,
          needsRecovery: false,
        };

        const message = buildSystemMessage('test-session', context);

        expect(message).not.toContain('context:');
        expect(message).not.toContain('ms)');
      });

      it('should handle large performance times', () => {
        const context: ContextGatheringResult = {
          additionalContext: '',
          summary: 'React on main',
          isEmptyProject: false,
          hasIssues: false,
          issueCount: 0,
          gatherTimeMs: 9999,
          needsRecovery: false,
        };

        const message = buildSystemMessage('test-session', context);

        expect(message).toContain('(context: 9999ms)');
      });
    });

    describe('combined scenarios', () => {
      it('should format message with recovery and summary', () => {
        const context: ContextGatheringResult = {
          additionalContext: '',
          summary: 'React, TypeScript on feature-branch',
          isEmptyProject: false,
          hasIssues: false,
          issueCount: 0,
          gatherTimeMs: 100,
          needsRecovery: true,
        };

        const message = buildSystemMessage('session_12345678', context);

        expect(message).toContain('GoodVibes plugin v2.1.0 initialized.');
        expect(message).toContain('17 tools available.');
        expect(message).toContain('Session: 12345678');
        expect(message).toContain('| RECOVERY MODE');
        expect(message).toContain('| React, TypeScript on feature-branch');
        expect(message).toContain('(context: 100ms)');
      });

      it('should format message with empty project and recovery', () => {
        const context: ContextGatheringResult = {
          additionalContext: '',
          summary: 'This should not appear',
          isEmptyProject: true,
          hasIssues: false,
          issueCount: 0,
          gatherTimeMs: 50,
          needsRecovery: true,
        };

        const message = buildSystemMessage('short-id', context);

        expect(message).toContain('GoodVibes plugin v2.1.0 initialized.');
        expect(message).toContain('17 tools available.');
        expect(message).toContain('Session: short-id');
        expect(message).toContain('| RECOVERY MODE');
        expect(message).toContain(
          '| Empty project detected - scaffolding tools available.'
        );
        expect(message).not.toContain('This should not appear');
        expect(message).toContain('(context: 50ms)');
      });

      it('should format minimal message with no optional fields', () => {
        const context: ContextGatheringResult = {
          additionalContext: '',
          summary: '',
          isEmptyProject: false,
          hasIssues: false,
          issueCount: 0,
          gatherTimeMs: 0,
          needsRecovery: false,
        };

        const message = buildSystemMessage('test-session', context);

        // Should only have base components
        expect(message).toContain('GoodVibes plugin v2.1.0 initialized.');
        expect(message).toContain('17 tools available.');
        expect(message).toContain('Session: -session'); // Last 8 chars of "test-session"
        expect(message).not.toContain('RECOVERY');
        expect(message).not.toContain('Empty project');
        expect(message).not.toContain('ms)');
      });

      it('should format full message with all optional fields', () => {
        const context: ContextGatheringResult = {
          additionalContext: 'Full context here',
          summary: 'Vue, Vite on main | 5 issues',
          isEmptyProject: false,
          hasIssues: true,
          issueCount: 5,
          gatherTimeMs: 250,
          needsRecovery: true,
        };

        const message = buildSystemMessage('session_abcdefghijk', context);

        expect(message).toContain('GoodVibes plugin v2.1.0 initialized.');
        expect(message).toContain('17 tools available.');
        expect(message).toContain('Session: defghijk'); // Last 8 chars of "session_abcdefghijk"
        expect(message).toContain('| RECOVERY MODE');
        expect(message).toContain('| Vue, Vite on main | 5 issues');
        expect(message).toContain('(context: 250ms)');
      });
    });

    describe('edge cases', () => {
      it('should handle empty session ID', () => {
        const context: ContextGatheringResult = {
          additionalContext: '',
          summary: '',
          isEmptyProject: false,
          hasIssues: false,
          issueCount: 0,
          gatherTimeMs: 0,
          needsRecovery: false,
        };

        const message = buildSystemMessage('', context);

        expect(message).toContain('Session: ');
        // Should still be valid message format
        expect(message).toContain('GoodVibes plugin v2.1.0 initialized.');
      });

      it('should handle very long summary', () => {
        const context: ContextGatheringResult = {
          additionalContext: '',
          summary:
            'React, Next.js, TypeScript, TailwindCSS, Redux, React Query, Jest, Playwright, ESLint, Prettier on feature/very-long-branch-name | 25 uncommitted files | 10 issues detected | health checks failing',
          isEmptyProject: false,
          hasIssues: true,
          issueCount: 10,
          gatherTimeMs: 500,
          needsRecovery: false,
        };

        const message = buildSystemMessage('session_id', context);

        // Should include the entire summary without truncation
        expect(message).toContain(
          'React, Next.js, TypeScript, TailwindCSS, Redux, React Query, Jest, Playwright, ESLint, Prettier'
        );
        expect(message).toContain('feature/very-long-branch-name');
      });

      it('should handle special characters in summary', () => {
        const context: ContextGatheringResult = {
          additionalContext: '',
          summary: 'React (v18.2) on main/staging | 3 files | "test" & more',
          isEmptyProject: false,
          hasIssues: false,
          issueCount: 0,
          gatherTimeMs: 0,
          needsRecovery: false,
        };

        const message = buildSystemMessage('session_id', context);

        expect(message).toContain(
          'React (v18.2) on main/staging | 3 files | "test" & more'
        );
      });

      it('should handle context with only whitespace in summary', () => {
        const context: ContextGatheringResult = {
          additionalContext: '',
          summary: '   ',
          isEmptyProject: false,
          hasIssues: false,
          issueCount: 0,
          gatherTimeMs: 0,
          needsRecovery: false,
        };

        const message = buildSystemMessage('session_id', context);

        // Whitespace-only summary should still be added
        expect(message).toMatch(/\|\s+/);
      });

      it('should maintain correct spacing between components', () => {
        const context: ContextGatheringResult = {
          additionalContext: '',
          summary: 'Project info',
          isEmptyProject: false,
          hasIssues: false,
          issueCount: 0,
          gatherTimeMs: 100,
          needsRecovery: true,
        };

        const message = buildSystemMessage('session_12345678', context);

        // All components should be separated by single space
        const parts = message.split(' ');
        expect(parts).not.toContain(''); // No empty strings from double spaces
      });

      it('should handle zero timing with summary and recovery', () => {
        const context: ContextGatheringResult = {
          additionalContext: '',
          summary: 'Angular on main',
          isEmptyProject: false,
          hasIssues: false,
          issueCount: 0,
          gatherTimeMs: 0,
          needsRecovery: true,
        };

        const message = buildSystemMessage('session_id', context);

        expect(message).toContain('| RECOVERY MODE');
        expect(message).toContain('| Angular on main');
        expect(message).not.toContain('context:');
      });
    });

    describe('message structure validation', () => {
      it('should always start with plugin initialization', () => {
        const context: ContextGatheringResult = {
          additionalContext: '',
          summary: 'Test',
          isEmptyProject: false,
          hasIssues: false,
          issueCount: 0,
          gatherTimeMs: 100,
          needsRecovery: true,
        };

        const message = buildSystemMessage('test-session', context);

        expect(message.startsWith('GoodVibes plugin v2.1.0 initialized.')).toBe(
          true
        );
      });

      it('should include tools count as second component', () => {
        const context: ContextGatheringResult = {
          additionalContext: '',
          summary: '',
          isEmptyProject: false,
          hasIssues: false,
          issueCount: 0,
          gatherTimeMs: 0,
          needsRecovery: false,
        };

        const message = buildSystemMessage('test-session', context);

        // Message format: "GoodVibes plugin v2.1.0 initialized. 17 tools available. Session: -session"
        expect(message).toContain(' 17 tools available.');
      });

      it('should end with performance metrics when present', () => {
        const context: ContextGatheringResult = {
          additionalContext: '',
          summary: 'Test',
          isEmptyProject: false,
          hasIssues: false,
          issueCount: 0,
          gatherTimeMs: 123,
          needsRecovery: false,
        };

        const message = buildSystemMessage('test-session', context);

        expect(message.endsWith('(context: 123ms)')).toBe(true);
      });

      it('should not end with performance metrics when not present', () => {
        const context: ContextGatheringResult = {
          additionalContext: '',
          summary: 'Test',
          isEmptyProject: false,
          hasIssues: false,
          issueCount: 0,
          gatherTimeMs: 0,
          needsRecovery: false,
        };

        const message = buildSystemMessage('test-session', context);

        expect(message.endsWith('| Test')).toBe(true);
      });
    });
  });
});
