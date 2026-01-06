/**
 * Tests for session-start/index.ts
 *
 * Validates that all exports are properly re-exported from the barrel file.
 * This file contains only re-exports, no executable code.
 */

import { describe, it, expect } from 'vitest';
import {
  // context-builder exports
  gatherProjectContext,
  createFailedContextResult,
  type ContextGatheringResult,
  // context-injection exports
  gatherAndFormatContext,
  type ContextInjectionResult,
  // crash-recovery exports
  checkCrashRecovery,
  formatRecoveryContext,
  type RecoveryInfo,
  // response-formatter exports
  buildSystemMessage,
} from '../../session-start/index.js';

describe('session-start/index', () => {
  describe('re-exports from context-builder.ts', () => {
    it('should export gatherProjectContext', () => {
      expect(gatherProjectContext).toBeDefined();
      expect(typeof gatherProjectContext).toBe('function');
    });

    it('should export createFailedContextResult', () => {
      expect(createFailedContextResult).toBeDefined();
      expect(typeof createFailedContextResult).toBe('function');
    });

    it('should export ContextGatheringResult type (via function return)', () => {
      const result: ContextGatheringResult = createFailedContextResult(0);
      expect(result).toBeDefined();
      expect(result.additionalContext).toBe('');
    });
  });

  describe('re-exports from context-injection.ts', () => {
    it('should export gatherAndFormatContext', () => {
      expect(gatherAndFormatContext).toBeDefined();
      expect(typeof gatherAndFormatContext).toBe('function');
    });

    it('should export ContextInjectionResult type (via object)', () => {
      const result: ContextInjectionResult = {
        systemMessage: '',
        context: createFailedContextResult(0),
      };
      expect(result.systemMessage).toBe('');
    });
  });

  describe('re-exports from crash-recovery.ts', () => {
    it('should export checkCrashRecovery', () => {
      expect(checkCrashRecovery).toBeDefined();
      expect(typeof checkCrashRecovery).toBe('function');
    });

    it('should export formatRecoveryContext', () => {
      expect(formatRecoveryContext).toBeDefined();
      expect(typeof formatRecoveryContext).toBe('function');
    });

    it('should export RecoveryInfo type (via object)', () => {
      const info: RecoveryInfo = {
        needsRecovery: false,
        previousFeature: null,
        onBranch: null,
        uncommittedFiles: [],
        pendingIssues: [],
        lastCheckpoint: null,
      };
      expect(info.needsRecovery).toBe(false);
    });
  });

  describe('re-exports from response-formatter.ts', () => {
    it('should export buildSystemMessage', () => {
      expect(buildSystemMessage).toBeDefined();
      expect(typeof buildSystemMessage).toBe('function');
    });
  });
});
