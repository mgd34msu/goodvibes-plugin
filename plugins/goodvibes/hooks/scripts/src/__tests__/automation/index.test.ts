/**
 * Tests for automation/index.ts
 *
 * Validates that all exports are properly re-exported from the barrel file.
 * This file contains only re-exports, no executable code.
 */

import { describe, it, expect } from 'vitest';

import {
  // test-runner exports
  findTestsForFile,
  runTests,
  runFullTestSuite,
  type TestResult,
  // build-runner exports
  detectBuildCommand,
  runBuild,
  runTypeCheck,
  BUILD_COMMANDS,
  TYPECHECK_COMMAND,
  type BuildResult,
  // git-operations exports
  execGit,
  isGitRepo,
  detectMainBranch,
  getCurrentBranch,
  hasUncommittedChanges,
  getUncommittedFiles,
  createCheckpoint,
  createFeatureBranch,
  mergeFeatureBranch,
  // fix-loop exports
  generateErrorSignature,
  shouldEscalatePhase,
  escalatePhase,
  hasExhaustedRetries,
  categorizeError,
  createErrorState,
  buildFixContext,
} from '../../automation/index.js';

describe('automation/index', () => {
  describe('re-exports from test-runner.ts', () => {
    it('should export findTestsForFile', () => {
      expect(findTestsForFile).toBeDefined();
      expect(typeof findTestsForFile).toBe('function');
    });

    it('should export runTests', () => {
      expect(runTests).toBeDefined();
      expect(typeof runTests).toBe('function');
    });

    it('should export runFullTestSuite', () => {
      expect(runFullTestSuite).toBeDefined();
      expect(typeof runFullTestSuite).toBe('function');
    });

    it('should export TestResult type (via function return type)', () => {
      // Type check - if this compiles, TestResult is exported
      const result: TestResult = { passed: true, summary: 'ok', failures: [] };
      expect(result.passed).toBe(true);
    });
  });

  describe('re-exports from build-runner.ts', () => {
    it('should export detectBuildCommand', () => {
      expect(detectBuildCommand).toBeDefined();
      expect(typeof detectBuildCommand).toBe('function');
    });

    it('should export runBuild', () => {
      expect(runBuild).toBeDefined();
      expect(typeof runBuild).toBe('function');
    });

    it('should export runTypeCheck', () => {
      expect(runTypeCheck).toBeDefined();
      expect(typeof runTypeCheck).toBe('function');
    });

    it('should export BUILD_COMMANDS', () => {
      expect(BUILD_COMMANDS).toBeDefined();
      expect(BUILD_COMMANDS.next).toBe('npm run build');
    });

    it('should export TYPECHECK_COMMAND', () => {
      expect(TYPECHECK_COMMAND).toBeDefined();
      expect(TYPECHECK_COMMAND).toBe('npx tsc --noEmit');
    });

    it('should export BuildResult type (via object)', () => {
      const result: BuildResult = { passed: true, summary: 'ok', errors: [] };
      expect(result.passed).toBe(true);
    });
  });

  describe('re-exports from git-operations.ts', () => {
    it('should export execGit', () => {
      expect(execGit).toBeDefined();
      expect(typeof execGit).toBe('function');
    });

    it('should export isGitRepo', () => {
      expect(isGitRepo).toBeDefined();
      expect(typeof isGitRepo).toBe('function');
    });

    it('should export detectMainBranch', () => {
      expect(detectMainBranch).toBeDefined();
      expect(typeof detectMainBranch).toBe('function');
    });

    it('should export getCurrentBranch', () => {
      expect(getCurrentBranch).toBeDefined();
      expect(typeof getCurrentBranch).toBe('function');
    });

    it('should export hasUncommittedChanges', () => {
      expect(hasUncommittedChanges).toBeDefined();
      expect(typeof hasUncommittedChanges).toBe('function');
    });

    it('should export getUncommittedFiles', () => {
      expect(getUncommittedFiles).toBeDefined();
      expect(typeof getUncommittedFiles).toBe('function');
    });

    it('should export createCheckpoint', () => {
      expect(createCheckpoint).toBeDefined();
      expect(typeof createCheckpoint).toBe('function');
    });

    it('should export createFeatureBranch', () => {
      expect(createFeatureBranch).toBeDefined();
      expect(typeof createFeatureBranch).toBe('function');
    });

    it('should export mergeFeatureBranch', () => {
      expect(mergeFeatureBranch).toBeDefined();
      expect(typeof mergeFeatureBranch).toBe('function');
    });
  });

  describe('re-exports from fix-loop.ts', () => {
    it('should export generateErrorSignature', () => {
      expect(generateErrorSignature).toBeDefined();
      expect(typeof generateErrorSignature).toBe('function');
    });

    it('should export shouldEscalatePhase', () => {
      expect(shouldEscalatePhase).toBeDefined();
      expect(typeof shouldEscalatePhase).toBe('function');
    });

    it('should export escalatePhase', () => {
      expect(escalatePhase).toBeDefined();
      expect(typeof escalatePhase).toBe('function');
    });

    it('should export hasExhaustedRetries', () => {
      expect(hasExhaustedRetries).toBeDefined();
      expect(typeof hasExhaustedRetries).toBe('function');
    });

    it('should export categorizeError', () => {
      expect(categorizeError).toBeDefined();
      expect(typeof categorizeError).toBe('function');
    });

    it('should export createErrorState', () => {
      expect(createErrorState).toBeDefined();
      expect(typeof createErrorState).toBe('function');
    });

    it('should export buildFixContext', () => {
      expect(buildFixContext).toBeDefined();
      expect(typeof buildFixContext).toBe('function');
    });
  });
});
