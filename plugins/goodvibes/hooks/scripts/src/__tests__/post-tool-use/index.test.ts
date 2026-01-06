/**
 * Tests for post-tool-use/index.ts
 *
 * Validates that all exports are properly re-exported from the barrel file.
 * This file contains only re-exports, no executable code.
 */

import { describe, it, expect } from 'vitest';
import {
  // file-tracker exports
  trackFileModification,
  trackFileCreation,
  clearCheckpointTracking,
  getModifiedFileCount,
  // checkpoint-manager exports
  shouldCheckpoint,
  createCheckpointIfNeeded,
  type CheckpointTrigger,
  // git-branch-manager exports
  shouldCreateFeatureBranch,
  maybeCreateFeatureBranch,
  shouldMergeFeature,
  maybeMergeFeature,
  // dev-server-monitor exports
  isDevServerCommand,
  registerDevServer,
  unregisterDevServer,
  recordDevServerError,
  parseDevServerErrors,
  // response exports
  createResponse,
  combineMessages,
  type AutomationMessages,
  // mcp-handlers exports
  handleDetectStack,
  handleRecommendSkills,
  handleSearch,
  handleValidateImplementation,
  handleRunSmokeTest,
  handleCheckTypes,
  // automation-runners exports
  maybeRunTests,
  maybeRunBuild,
  maybeCreateCheckpoint,
  maybeCreateBranch,
  // file-automation exports
  handleFileModification,
  processFileAutomation,
  // bash-handler exports
  handleBashTool,
} from '../../post-tool-use/index.js';

describe('post-tool-use/index', () => {
  describe('re-exports from file-tracker.ts', () => {
    it('should export trackFileModification', () => {
      expect(trackFileModification).toBeDefined();
      expect(typeof trackFileModification).toBe('function');
    });

    it('should export trackFileCreation', () => {
      expect(trackFileCreation).toBeDefined();
      expect(typeof trackFileCreation).toBe('function');
    });

    it('should export clearCheckpointTracking', () => {
      expect(clearCheckpointTracking).toBeDefined();
      expect(typeof clearCheckpointTracking).toBe('function');
    });

    it('should export getModifiedFileCount', () => {
      expect(getModifiedFileCount).toBeDefined();
      expect(typeof getModifiedFileCount).toBe('function');
    });
  });

  describe('re-exports from checkpoint-manager.ts', () => {
    it('should export shouldCheckpoint', () => {
      expect(shouldCheckpoint).toBeDefined();
      expect(typeof shouldCheckpoint).toBe('function');
    });

    it('should export createCheckpointIfNeeded', () => {
      expect(createCheckpointIfNeeded).toBeDefined();
      expect(typeof createCheckpointIfNeeded).toBe('function');
    });

    it('should export CheckpointTrigger type (via function return)', () => {
      const trigger: CheckpointTrigger = {
        shouldCheckpoint: false,
        reason: null,
      };
      expect(trigger.shouldCheckpoint).toBe(false);
    });
  });

  describe('re-exports from git-branch-manager.ts', () => {
    it('should export shouldCreateFeatureBranch', () => {
      expect(shouldCreateFeatureBranch).toBeDefined();
      expect(typeof shouldCreateFeatureBranch).toBe('function');
    });

    it('should export maybeCreateFeatureBranch', () => {
      expect(maybeCreateFeatureBranch).toBeDefined();
      expect(typeof maybeCreateFeatureBranch).toBe('function');
    });

    it('should export shouldMergeFeature', () => {
      expect(shouldMergeFeature).toBeDefined();
      expect(typeof shouldMergeFeature).toBe('function');
    });

    it('should export maybeMergeFeature', () => {
      expect(maybeMergeFeature).toBeDefined();
      expect(typeof maybeMergeFeature).toBe('function');
    });
  });

  describe('re-exports from dev-server-monitor.ts', () => {
    it('should export isDevServerCommand', () => {
      expect(isDevServerCommand).toBeDefined();
      expect(typeof isDevServerCommand).toBe('function');
    });

    it('should export registerDevServer', () => {
      expect(registerDevServer).toBeDefined();
      expect(typeof registerDevServer).toBe('function');
    });

    it('should export unregisterDevServer', () => {
      expect(unregisterDevServer).toBeDefined();
      expect(typeof unregisterDevServer).toBe('function');
    });

    it('should export recordDevServerError', () => {
      expect(recordDevServerError).toBeDefined();
      expect(typeof recordDevServerError).toBe('function');
    });

    it('should export parseDevServerErrors', () => {
      expect(parseDevServerErrors).toBeDefined();
      expect(typeof parseDevServerErrors).toBe('function');
    });
  });

  describe('re-exports from response.ts', () => {
    it('should export createResponse', () => {
      expect(createResponse).toBeDefined();
      expect(typeof createResponse).toBe('function');
    });

    it('should export combineMessages', () => {
      expect(combineMessages).toBeDefined();
      expect(typeof combineMessages).toBe('function');
    });

    it('should export AutomationMessages type (via object)', () => {
      const messages: AutomationMessages = {
        tests: null,
        build: null,
        checkpoint: null,
        branch: null,
      };
      expect(messages.tests).toBeNull();
    });
  });

  describe('re-exports from mcp-handlers.ts', () => {
    it('should export handleDetectStack', () => {
      expect(handleDetectStack).toBeDefined();
      expect(typeof handleDetectStack).toBe('function');
    });

    it('should export handleRecommendSkills', () => {
      expect(handleRecommendSkills).toBeDefined();
      expect(typeof handleRecommendSkills).toBe('function');
    });

    it('should export handleSearch', () => {
      expect(handleSearch).toBeDefined();
      expect(typeof handleSearch).toBe('function');
    });

    it('should export handleValidateImplementation', () => {
      expect(handleValidateImplementation).toBeDefined();
      expect(typeof handleValidateImplementation).toBe('function');
    });

    it('should export handleRunSmokeTest', () => {
      expect(handleRunSmokeTest).toBeDefined();
      expect(typeof handleRunSmokeTest).toBe('function');
    });

    it('should export handleCheckTypes', () => {
      expect(handleCheckTypes).toBeDefined();
      expect(typeof handleCheckTypes).toBe('function');
    });
  });

  describe('re-exports from automation-runners.ts', () => {
    it('should export maybeRunTests', () => {
      expect(maybeRunTests).toBeDefined();
      expect(typeof maybeRunTests).toBe('function');
    });

    it('should export maybeRunBuild', () => {
      expect(maybeRunBuild).toBeDefined();
      expect(typeof maybeRunBuild).toBe('function');
    });

    it('should export maybeCreateCheckpoint', () => {
      expect(maybeCreateCheckpoint).toBeDefined();
      expect(typeof maybeCreateCheckpoint).toBe('function');
    });

    it('should export maybeCreateBranch', () => {
      expect(maybeCreateBranch).toBeDefined();
      expect(typeof maybeCreateBranch).toBe('function');
    });
  });

  describe('re-exports from file-automation.ts', () => {
    it('should export handleFileModification', () => {
      expect(handleFileModification).toBeDefined();
      expect(typeof handleFileModification).toBe('function');
    });

    it('should export processFileAutomation', () => {
      expect(processFileAutomation).toBeDefined();
      expect(typeof processFileAutomation).toBe('function');
    });
  });

  describe('re-exports from bash-handler.ts', () => {
    it('should export handleBashTool', () => {
      expect(handleBashTool).toBeDefined();
      expect(typeof handleBashTool).toBe('function');
    });
  });
});
