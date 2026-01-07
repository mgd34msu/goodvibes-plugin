/**
 * Tests for context/index.ts
 *
 * Validates that all exports are properly re-exported from the barrel file.
 * This file contains only re-exports, no executable code.
 */

import { describe, it, expect } from 'vitest';

import {
  // stack-detector exports
  clearStackCache,
  detectStack,
  formatStackInfo,
  type StackInfo,
  // git-context exports
  getGitContext,
  formatGitContext,
  type GitContext,
  // environment exports (consolidated module)
  checkEnvStatus,
  analyzeEnvironment,
  formatEnvStatus,
  formatEnvironment,
  type EnvStatus,
  type EnvironmentContext,
  // todo-scanner exports
  scanTodos,
  formatTodos,
  type TodoItem,
  // health-checker exports
  checkProjectHealth,
  formatHealthStatus,
  type HealthCheck,
  type HealthStatus,
  // folder-analyzer exports
  analyzeFolderStructure,
  formatFolderAnalysis,
  type FolderAnalysis,
  // empty-project exports
  isEmptyProject,
  formatEmptyProjectContext,
  // port-checker exports
  checkPorts,
  formatPortStatus,
  COMMON_DEV_PORTS,
  type PortInfo,
} from '../../context/index.js';

describe('context/index', () => {
  describe('re-exports from stack-detector.ts', () => {
    it('should export clearStackCache', () => {
      expect(clearStackCache).toBeDefined();
      expect(typeof clearStackCache).toBe('function');
    });

    it('should export detectStack', () => {
      expect(detectStack).toBeDefined();
      expect(typeof detectStack).toBe('function');
    });

    it('should export formatStackInfo', () => {
      expect(formatStackInfo).toBeDefined();
      expect(typeof formatStackInfo).toBe('function');
    });

    it('should export StackInfo type (via object)', () => {
      const info: StackInfo = {
        packageManager: 'npm',
        lockfile: 'package-lock.json',
        frameworks: [],
        hasTypeScript: false,
        testRunner: null,
        linter: null,
        formatter: null,
        monorepo: null,
        bundler: null,
        orm: null,
        cicd: [],
        containerization: null,
        keywords: [],
      };
      expect(info.packageManager).toBe('npm');
    });
  });

  describe('re-exports from git-context.ts', () => {
    it('should export getGitContext', () => {
      expect(getGitContext).toBeDefined();
      expect(typeof getGitContext).toBe('function');
    });

    it('should export formatGitContext', () => {
      expect(formatGitContext).toBeDefined();
      expect(typeof formatGitContext).toBe('function');
    });

    it('should export GitContext type (via object)', () => {
      const context: GitContext = {
        branch: 'main',
        status: 'clean',
        isRepo: true,
        recentCommits: [],
      };
      expect(context.branch).toBe('main');
    });
  });

  describe('re-exports from environment.ts', () => {
    it('should export checkEnvStatus', () => {
      expect(checkEnvStatus).toBeDefined();
      expect(typeof checkEnvStatus).toBe('function');
    });

    it('should export analyzeEnvironment', () => {
      expect(analyzeEnvironment).toBeDefined();
      expect(typeof analyzeEnvironment).toBe('function');
    });

    it('should export formatEnvStatus', () => {
      expect(formatEnvStatus).toBeDefined();
      expect(typeof formatEnvStatus).toBe('function');
    });

    it('should export formatEnvironment', () => {
      expect(formatEnvironment).toBeDefined();
      expect(typeof formatEnvironment).toBe('function');
    });

    it('should export EnvStatus type (via object)', () => {
      const status: EnvStatus = {
        hasEnvFile: false,
        hasEnvExample: false,
        missingVars: [],
      };
      expect(status.hasEnvFile).toBe(false);
    });

    it('should export EnvironmentContext type (via object)', () => {
      const ctx: EnvironmentContext = {
        hasEnvFile: false,
        hasEnvExample: false,
        hasMissingVars: false,
        missingVars: [],
        envVarsCount: 0,
      };
      expect(ctx.hasMissingVars).toBe(false);
    });
  });

  describe('re-exports from todo-scanner.ts', () => {
    it('should export scanTodos', () => {
      expect(scanTodos).toBeDefined();
      expect(typeof scanTodos).toBe('function');
    });

    it('should export formatTodos', () => {
      expect(formatTodos).toBeDefined();
      expect(typeof formatTodos).toBe('function');
    });

    it('should export TodoItem type (via object)', () => {
      const todo: TodoItem = {
        file: 'test.ts',
        line: 1,
        text: 'TODO: fix this',
        type: 'TODO',
      };
      expect(todo.type).toBe('TODO');
    });
  });

  describe('re-exports from health-checker.ts', () => {
    it('should export checkProjectHealth', () => {
      expect(checkProjectHealth).toBeDefined();
      expect(typeof checkProjectHealth).toBe('function');
    });

    it('should export formatHealthStatus', () => {
      expect(formatHealthStatus).toBeDefined();
      expect(typeof formatHealthStatus).toBe('function');
    });

    it('should export HealthCheck type (via object)', () => {
      const check: HealthCheck = {
        name: 'test',
        passed: true,
      };
      expect(check.passed).toBe(true);
    });

    it('should export HealthStatus type (via object)', () => {
      const status: HealthStatus = {
        healthy: true,
        checks: [],
      };
      expect(status.healthy).toBe(true);
    });
  });

  describe('re-exports from folder-analyzer.ts', () => {
    it('should export analyzeFolderStructure', () => {
      expect(analyzeFolderStructure).toBeDefined();
      expect(typeof analyzeFolderStructure).toBe('function');
    });

    it('should export formatFolderAnalysis', () => {
      expect(formatFolderAnalysis).toBeDefined();
      expect(typeof formatFolderAnalysis).toBe('function');
    });

    it('should export FolderAnalysis type (via object)', () => {
      const analysis: FolderAnalysis = {
        totalFiles: 0,
        totalDirs: 0,
        topLevelDirs: [],
        sourceDir: null,
        hasTests: false,
        hasConfig: false,
      };
      expect(analysis.totalFiles).toBe(0);
    });
  });

  describe('re-exports from empty-project.ts', () => {
    it('should export isEmptyProject', () => {
      expect(isEmptyProject).toBeDefined();
      expect(typeof isEmptyProject).toBe('function');
    });

    it('should export formatEmptyProjectContext', () => {
      expect(formatEmptyProjectContext).toBeDefined();
      expect(typeof formatEmptyProjectContext).toBe('function');
    });
  });

  describe('re-exports from port-checker.ts', () => {
    it('should export checkPorts', () => {
      expect(checkPorts).toBeDefined();
      expect(typeof checkPorts).toBe('function');
    });

    it('should export formatPortStatus', () => {
      expect(formatPortStatus).toBeDefined();
      expect(typeof formatPortStatus).toBe('function');
    });

    it('should export COMMON_DEV_PORTS', () => {
      expect(COMMON_DEV_PORTS).toBeDefined();
      expect(Array.isArray(COMMON_DEV_PORTS)).toBe(true);
      expect(COMMON_DEV_PORTS).toContain(3000);
    });

    it('should export PortInfo type (via object)', () => {
      const port: PortInfo = {
        port: 3000,
        inUse: false,
      };
      expect(port.port).toBe(3000);
    });
  });
});
