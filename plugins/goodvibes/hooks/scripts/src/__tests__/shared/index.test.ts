/**
 * Tests for shared/index.ts
 *
 * Validates that all exports are properly re-exported from the barrel file.
 * This file contains only re-exports, no executable code.
 */

import { describe, it, expect } from 'vitest';
import {
  // hook-io exports
  readHookInput,
  allowTool,
  blockTool,
  formatResponse,
  respond,
  createResponse,
  createPermissionResponse,
  type HookInput,
  type HookResponse,
  type HookSpecificOutput,
  type CreateResponseOptions,
  type ExtendedHookResponse,
  type PermissionDecision,
  // logging exports
  debug,
  logError,
  // config exports
  STDIN_TIMEOUT_MS,
  CHECKPOINT_TRIGGERS,
  QUALITY_GATES,
  getDefaultSharedConfig,
  loadSharedConfig,
  type SharedConfig,
  // gitignore exports
  SECURITY_GITIGNORE_ENTRIES,
  ensureSecureGitignore,
  // security-patterns exports
  SECURITY_GITIGNORE_PATTERNS,
  // constants exports
  LOCKFILES,
  PLUGIN_ROOT,
  PROJECT_ROOT,
  CACHE_DIR,
  ANALYTICS_FILE,
  // analytics exports
  ensureCacheDir,
  loadAnalytics,
  saveAnalytics,
  getSessionId,
  logToolUsage,
  type ToolUsage,
  type ToolFailure,
  type SubagentSpawn,
  type SessionAnalytics,
  // file-utils exports
  fileExists,
  fileExistsRelative,
  commandExists,
  validateRegistries,
  ensureGoodVibesDir,
  extractErrorOutput,
  // transcript exports
  parseTranscript,
  type TranscriptData,
  // keywords exports
  KEYWORD_CATEGORIES,
  ALL_KEYWORDS,
  STACK_KEYWORD_CATEGORIES,
  TRANSCRIPT_KEYWORD_CATEGORIES,
  ALL_STACK_KEYWORDS,
  ALL_TRANSCRIPT_KEYWORDS,
  extractStackKeywords,
  extractKeywords,
  extractTranscriptKeywords,
} from '../../shared/index.js';

describe('shared/index', () => {
  describe('re-exports from hook-io.ts', () => {
    it('should export readHookInput', () => {
      expect(readHookInput).toBeDefined();
      expect(typeof readHookInput).toBe('function');
    });

    it('should export allowTool', () => {
      expect(allowTool).toBeDefined();
      expect(typeof allowTool).toBe('function');
    });

    it('should export blockTool', () => {
      expect(blockTool).toBeDefined();
      expect(typeof blockTool).toBe('function');
    });

    it('should export formatResponse', () => {
      expect(formatResponse).toBeDefined();
      expect(typeof formatResponse).toBe('function');
    });

    it('should export respond', () => {
      expect(respond).toBeDefined();
      expect(typeof respond).toBe('function');
    });

    it('should export createResponse', () => {
      expect(createResponse).toBeDefined();
      expect(typeof createResponse).toBe('function');
    });

    it('should export createPermissionResponse', () => {
      expect(createPermissionResponse).toBeDefined();
      expect(typeof createPermissionResponse).toBe('function');
    });

    it('should export HookResponse type (via object)', () => {
      const response: HookResponse = {};
      expect(response).toBeDefined();
    });

    it('should export PermissionDecision type (via object)', () => {
      const decision: PermissionDecision = { decision: 'allow' };
      expect(decision.decision).toBe('allow');
    });
  });

  describe('re-exports from logging.ts', () => {
    it('should export debug', () => {
      expect(debug).toBeDefined();
      expect(typeof debug).toBe('function');
    });

    it('should export logError', () => {
      expect(logError).toBeDefined();
      expect(typeof logError).toBe('function');
    });
  });

  describe('re-exports from config.ts', () => {
    it('should export STDIN_TIMEOUT_MS', () => {
      expect(STDIN_TIMEOUT_MS).toBeDefined();
      expect(typeof STDIN_TIMEOUT_MS).toBe('number');
    });

    it('should export CHECKPOINT_TRIGGERS', () => {
      expect(CHECKPOINT_TRIGGERS).toBeDefined();
    });

    it('should export QUALITY_GATES', () => {
      expect(QUALITY_GATES).toBeDefined();
    });

    it('should export getDefaultSharedConfig', () => {
      expect(getDefaultSharedConfig).toBeDefined();
      expect(typeof getDefaultSharedConfig).toBe('function');
    });

    it('should export loadSharedConfig', () => {
      expect(loadSharedConfig).toBeDefined();
      expect(typeof loadSharedConfig).toBe('function');
    });

    it('should export SharedConfig type (via function return)', () => {
      const config: SharedConfig = getDefaultSharedConfig();
      expect(config).toBeDefined();
    });
  });

  describe('re-exports from gitignore.ts', () => {
    it('should export SECURITY_GITIGNORE_ENTRIES', () => {
      expect(SECURITY_GITIGNORE_ENTRIES).toBeDefined();
      expect(typeof SECURITY_GITIGNORE_ENTRIES).toBe('object');
      // SECURITY_GITIGNORE_ENTRIES is a Record<string, string[]>
      expect(SECURITY_GITIGNORE_ENTRIES['GoodVibes plugin state']).toContain(
        '.goodvibes/'
      );
    });

    it('should export ensureSecureGitignore', () => {
      expect(ensureSecureGitignore).toBeDefined();
      expect(typeof ensureSecureGitignore).toBe('function');
    });
  });

  describe('re-exports from security-patterns.ts', () => {
    it('should export SECURITY_GITIGNORE_PATTERNS', () => {
      expect(SECURITY_GITIGNORE_PATTERNS).toBeDefined();
      // SECURITY_GITIGNORE_PATTERNS is a template string
      expect(typeof SECURITY_GITIGNORE_PATTERNS).toBe('string');
      expect(SECURITY_GITIGNORE_PATTERNS).toContain('.env');
    });
  });

  describe('re-exports from constants.ts', () => {
    it('should export LOCKFILES', () => {
      expect(LOCKFILES).toBeDefined();
      expect(Array.isArray(LOCKFILES)).toBe(true);
    });

    it('should export PLUGIN_ROOT', () => {
      expect(PLUGIN_ROOT).toBeDefined();
      expect(typeof PLUGIN_ROOT).toBe('string');
    });

    it('should export PROJECT_ROOT', () => {
      expect(PROJECT_ROOT).toBeDefined();
      expect(typeof PROJECT_ROOT).toBe('string');
    });

    it('should export CACHE_DIR', () => {
      expect(CACHE_DIR).toBeDefined();
      expect(typeof CACHE_DIR).toBe('string');
    });

    it('should export ANALYTICS_FILE', () => {
      expect(ANALYTICS_FILE).toBeDefined();
      expect(typeof ANALYTICS_FILE).toBe('string');
    });
  });

  describe('re-exports from analytics.ts', () => {
    it('should export ensureCacheDir', () => {
      expect(ensureCacheDir).toBeDefined();
      expect(typeof ensureCacheDir).toBe('function');
    });

    it('should export loadAnalytics', () => {
      expect(loadAnalytics).toBeDefined();
      expect(typeof loadAnalytics).toBe('function');
    });

    it('should export saveAnalytics', () => {
      expect(saveAnalytics).toBeDefined();
      expect(typeof saveAnalytics).toBe('function');
    });

    it('should export getSessionId', () => {
      expect(getSessionId).toBeDefined();
      expect(typeof getSessionId).toBe('function');
    });

    it('should export logToolUsage', () => {
      expect(logToolUsage).toBeDefined();
      expect(typeof logToolUsage).toBe('function');
    });

    it('should export SessionAnalytics type (via object)', () => {
      const analytics: SessionAnalytics = {
        sessionId: 'test',
        startTime: new Date().toISOString(),
        toolUsage: [],
        failures: [],
        subagents: [],
      };
      expect(analytics.sessionId).toBe('test');
    });
  });

  describe('re-exports from file-utils.ts', () => {
    it('should export fileExists', () => {
      expect(fileExists).toBeDefined();
      expect(typeof fileExists).toBe('function');
    });

    it('should export fileExistsRelative', () => {
      expect(fileExistsRelative).toBeDefined();
      expect(typeof fileExistsRelative).toBe('function');
    });

    it('should export commandExists', () => {
      expect(commandExists).toBeDefined();
      expect(typeof commandExists).toBe('function');
    });

    it('should export validateRegistries', () => {
      expect(validateRegistries).toBeDefined();
      expect(typeof validateRegistries).toBe('function');
    });

    it('should export ensureGoodVibesDir', () => {
      expect(ensureGoodVibesDir).toBeDefined();
      expect(typeof ensureGoodVibesDir).toBe('function');
    });

    it('should export extractErrorOutput', () => {
      expect(extractErrorOutput).toBeDefined();
      expect(typeof extractErrorOutput).toBe('function');
    });
  });

  describe('re-exports from transcript.ts', () => {
    it('should export parseTranscript', () => {
      expect(parseTranscript).toBeDefined();
      expect(typeof parseTranscript).toBe('function');
    });

    it('should export TranscriptData type (via object)', () => {
      const data: TranscriptData = {
        messages: [],
        toolCalls: [],
        filesModified: [],
        summary: '',
      };
      expect(data.messages).toEqual([]);
    });
  });

  describe('re-exports from keywords.ts', () => {
    it('should export KEYWORD_CATEGORIES', () => {
      expect(KEYWORD_CATEGORIES).toBeDefined();
    });

    it('should export ALL_KEYWORDS', () => {
      expect(ALL_KEYWORDS).toBeDefined();
      expect(Array.isArray(ALL_KEYWORDS)).toBe(true);
    });

    it('should export STACK_KEYWORD_CATEGORIES', () => {
      expect(STACK_KEYWORD_CATEGORIES).toBeDefined();
    });

    it('should export TRANSCRIPT_KEYWORD_CATEGORIES', () => {
      expect(TRANSCRIPT_KEYWORD_CATEGORIES).toBeDefined();
    });

    it('should export ALL_STACK_KEYWORDS', () => {
      expect(ALL_STACK_KEYWORDS).toBeDefined();
      expect(Array.isArray(ALL_STACK_KEYWORDS)).toBe(true);
    });

    it('should export ALL_TRANSCRIPT_KEYWORDS', () => {
      expect(ALL_TRANSCRIPT_KEYWORDS).toBeDefined();
      expect(Array.isArray(ALL_TRANSCRIPT_KEYWORDS)).toBe(true);
    });

    it('should export extractStackKeywords', () => {
      expect(extractStackKeywords).toBeDefined();
      expect(typeof extractStackKeywords).toBe('function');
    });

    it('should export extractKeywords (alias)', () => {
      expect(extractKeywords).toBeDefined();
      expect(typeof extractKeywords).toBe('function');
      // extractKeywords is an alias for extractStackKeywords
      expect(extractKeywords).toBe(extractStackKeywords);
    });

    it('should export extractTranscriptKeywords', () => {
      expect(extractTranscriptKeywords).toBeDefined();
      expect(typeof extractTranscriptKeywords).toBe('function');
    });
  });
});
