/**
 * Tests for project-health-types.ts
 *
 * This file contains only type definitions (interfaces), so we test that:
 * 1. The types can be imported without errors
 * 2. Objects conforming to the interfaces are valid
 * 3. The exported types match the expected structure
 *
 * Target: 100% line and branch coverage
 */

import { describe, it, expect } from 'vitest';

import {
  PROJECT_HEALTH_TYPES_MODULE,
  type ProjectHealth,
  type TypeScriptHealth,
  type HealthWarning,
} from '../../context/project-health-types.js';

describe('project-health-types', () => {
  describe('module marker', () => {
    it('should export module marker constant', () => {
      expect(PROJECT_HEALTH_TYPES_MODULE).toBe('project-health-types');
    });
  });

  describe('ProjectHealth interface', () => {
    it('should allow creating a minimal ProjectHealth object', () => {
      const health: ProjectHealth = {
        hasNodeModules: false,
        lockfiles: [],
        hasMultipleLockfiles: false,
        typescript: null,
        packageManager: null,
        scripts: [],
        warnings: [],
        suggestions: [],
      };

      expect(health.hasNodeModules).toBe(false);
      expect(health.lockfiles).toEqual([]);
      expect(health.hasMultipleLockfiles).toBe(false);
      expect(health.typescript).toBeNull();
      expect(health.packageManager).toBeNull();
      expect(health.scripts).toEqual([]);
      expect(health.warnings).toEqual([]);
      expect(health.suggestions).toEqual([]);
    });

    it('should allow creating a full ProjectHealth object with all fields populated', () => {
      const tsHealth: TypeScriptHealth = {
        hasConfig: true,
        strict: true,
        strictNullChecks: true,
        noImplicitAny: true,
        target: 'ES2022',
      };

      const warning: HealthWarning = {
        type: 'warning',
        message: 'Missing test configuration',
      };

      const health: ProjectHealth = {
        hasNodeModules: true,
        lockfiles: ['package-lock.json', 'yarn.lock'],
        hasMultipleLockfiles: true,
        typescript: tsHealth,
        packageManager: 'npm',
        scripts: ['build', 'test', 'lint'],
        warnings: [warning],
        suggestions: ['Add TypeScript strict mode'],
      };

      expect(health.hasNodeModules).toBe(true);
      expect(health.lockfiles).toHaveLength(2);
      expect(health.hasMultipleLockfiles).toBe(true);
      expect(health.typescript).not.toBeNull();
      expect(health.typescript?.hasConfig).toBe(true);
      expect(health.packageManager).toBe('npm');
      expect(health.scripts).toContain('build');
      expect(health.warnings).toHaveLength(1);
      expect(health.suggestions).toContain('Add TypeScript strict mode');
    });
  });

  describe('TypeScriptHealth interface', () => {
    it('should allow creating a TypeScriptHealth with all false/null values', () => {
      const tsHealth: TypeScriptHealth = {
        hasConfig: false,
        strict: false,
        strictNullChecks: false,
        noImplicitAny: false,
        target: null,
      };

      expect(tsHealth.hasConfig).toBe(false);
      expect(tsHealth.strict).toBe(false);
      expect(tsHealth.strictNullChecks).toBe(false);
      expect(tsHealth.noImplicitAny).toBe(false);
      expect(tsHealth.target).toBeNull();
    });

    it('should allow creating a TypeScriptHealth with all true values', () => {
      const tsHealth: TypeScriptHealth = {
        hasConfig: true,
        strict: true,
        strictNullChecks: true,
        noImplicitAny: true,
        target: 'ESNext',
      };

      expect(tsHealth.hasConfig).toBe(true);
      expect(tsHealth.strict).toBe(true);
      expect(tsHealth.strictNullChecks).toBe(true);
      expect(tsHealth.noImplicitAny).toBe(true);
      expect(tsHealth.target).toBe('ESNext');
    });

    it('should allow various target values', () => {
      const targets = ['ES5', 'ES6', 'ES2015', 'ES2020', 'ES2022', 'ESNext'];

      for (const target of targets) {
        const tsHealth: TypeScriptHealth = {
          hasConfig: true,
          strict: false,
          strictNullChecks: false,
          noImplicitAny: false,
          target,
        };

        expect(tsHealth.target).toBe(target);
      }
    });
  });

  describe('HealthWarning interface', () => {
    it('should allow creating an error type warning', () => {
      const warning: HealthWarning = {
        type: 'error',
        message: 'Critical configuration error',
      };

      expect(warning.type).toBe('error');
      expect(warning.message).toBe('Critical configuration error');
    });

    it('should allow creating a warning type warning', () => {
      const warning: HealthWarning = {
        type: 'warning',
        message: 'Potential issue detected',
      };

      expect(warning.type).toBe('warning');
      expect(warning.message).toBe('Potential issue detected');
    });

    it('should allow creating an info type warning', () => {
      const warning: HealthWarning = {
        type: 'info',
        message: 'Configuration suggestion',
      };

      expect(warning.type).toBe('info');
      expect(warning.message).toBe('Configuration suggestion');
    });

    it('should handle various message content', () => {
      const messages = [
        '',
        'Short message',
        'A very long message that contains a lot of detail about the warning including specific file paths and line numbers that might be relevant to debugging',
        'Message with special chars: <>&"\' and unicode: ',
      ];

      for (const message of messages) {
        const warning: HealthWarning = {
          type: 'info',
          message,
        };

        expect(warning.message).toBe(message);
      }
    });
  });

  describe('type usage patterns', () => {
    it('should work with arrays of warnings', () => {
      const warnings: HealthWarning[] = [
        { type: 'error', message: 'Error 1' },
        { type: 'warning', message: 'Warning 1' },
        { type: 'info', message: 'Info 1' },
      ];

      expect(warnings).toHaveLength(3);
      expect(warnings.filter((w) => w.type === 'error')).toHaveLength(1);
      expect(warnings.filter((w) => w.type === 'warning')).toHaveLength(1);
      expect(warnings.filter((w) => w.type === 'info')).toHaveLength(1);
    });

    it('should allow ProjectHealth with null typescript', () => {
      const health: ProjectHealth = {
        hasNodeModules: false,
        lockfiles: [],
        hasMultipleLockfiles: false,
        typescript: null,
        packageManager: null,
        scripts: [],
        warnings: [],
        suggestions: [],
      };

      // TypeScript null check pattern
      if (health.typescript !== null) {
        expect(health.typescript.hasConfig).toBeDefined();
      } else {
        expect(health.typescript).toBeNull();
      }
    });

    it('should allow spread operator on ProjectHealth', () => {
      const baseHealth: ProjectHealth = {
        hasNodeModules: false,
        lockfiles: [],
        hasMultipleLockfiles: false,
        typescript: null,
        packageManager: null,
        scripts: [],
        warnings: [],
        suggestions: [],
      };

      const updatedHealth: ProjectHealth = {
        ...baseHealth,
        hasNodeModules: true,
        packageManager: 'pnpm',
      };

      expect(updatedHealth.hasNodeModules).toBe(true);
      expect(updatedHealth.packageManager).toBe('pnpm');
      expect(updatedHealth.lockfiles).toEqual([]);
    });
  });
});
