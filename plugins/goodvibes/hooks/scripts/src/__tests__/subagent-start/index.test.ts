/**
 * Tests for subagent-start/index.ts
 *
 * Validates that all exports are properly re-exported from the barrel file.
 * This file contains only re-exports, no executable code.
 */

import { describe, it, expect } from 'vitest';

import {
  // context-injection exports
  buildSubagentContext,
  type SubagentContext,
} from '../../subagent-start/index.js';

describe('subagent-start/index', () => {
  describe('re-exports from context-injection.ts', () => {
    it('should export buildSubagentContext', () => {
      expect(buildSubagentContext).toBeDefined();
      expect(typeof buildSubagentContext).toBe('function');
    });

    it('should export SubagentContext type (via object)', () => {
      const context: SubagentContext = {
        agentId: 'test',
        agentType: 'test-type',
        parentSessionId: 'parent-123',
        projectContext: '',
        memoryContext: null,
        activeErrors: [],
      };
      expect(context.agentId).toBe('test');
    });
  });
});
