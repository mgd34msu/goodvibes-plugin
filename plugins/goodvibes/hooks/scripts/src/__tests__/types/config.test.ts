/**
 * Tests for types/config.ts
 *
 * Tests cover:
 * - GoodVibesConfig interface structure validation
 * - getDefaultConfig function
 */

import { describe, it, expect } from 'vitest';
import { getDefaultConfig, type GoodVibesConfig } from '../../types/config.js';

describe('types/config', () => {
  describe('getDefaultConfig', () => {
    it('should return a valid GoodVibesConfig object', () => {
      const config = getDefaultConfig();

      expect(config).toBeDefined();
      expect(config.automation).toBeDefined();
    });

    it('should return automation enabled by default', () => {
      const config = getDefaultConfig();

      expect(config.automation.enabled).toBe(true);
    });

    it('should return default mode', () => {
      const config = getDefaultConfig();

      expect(config.automation.mode).toBe('default');
    });

    describe('testing configuration', () => {
      it('should include all testing settings', () => {
        const config = getDefaultConfig();
        const { testing } = config.automation;

        expect(testing).toBeDefined();
        expect(testing.runAfterFileChange).toBe(true);
        expect(testing.runBeforeCommit).toBe(true);
        expect(testing.runBeforeMerge).toBe(true);
        expect(testing.testCommand).toBe('npm test');
        expect(testing.maxRetries).toBe(3);
      });

      it('should have correct types for testing properties', () => {
        const config = getDefaultConfig();
        const { testing } = config.automation;

        expect(typeof testing.runAfterFileChange).toBe('boolean');
        expect(typeof testing.runBeforeCommit).toBe('boolean');
        expect(typeof testing.runBeforeMerge).toBe('boolean');
        expect(typeof testing.testCommand).toBe('string');
        expect(typeof testing.maxRetries).toBe('number');
      });
    });

    describe('building configuration', () => {
      it('should include all building settings', () => {
        const config = getDefaultConfig();
        const { building } = config.automation;

        expect(building).toBeDefined();
        expect(building.runAfterFileThreshold).toBe(5);
        expect(building.runBeforeCommit).toBe(true);
        expect(building.runBeforeMerge).toBe(true);
        expect(building.buildCommand).toBe('npm run build');
        expect(building.typecheckCommand).toBe('npx tsc --noEmit');
        expect(building.maxRetries).toBe(3);
      });

      it('should have correct types for building properties', () => {
        const config = getDefaultConfig();
        const { building } = config.automation;

        expect(typeof building.runAfterFileThreshold).toBe('number');
        expect(typeof building.runBeforeCommit).toBe('boolean');
        expect(typeof building.runBeforeMerge).toBe('boolean');
        expect(typeof building.buildCommand).toBe('string');
        expect(typeof building.typecheckCommand).toBe('string');
        expect(typeof building.maxRetries).toBe('number');
      });
    });

    describe('git configuration', () => {
      it('should include all git settings', () => {
        const config = getDefaultConfig();
        const { git } = config.automation;

        expect(git).toBeDefined();
        expect(git.autoFeatureBranch).toBe(true);
        expect(git.autoCheckpoint).toBe(true);
        expect(git.autoMerge).toBe(true);
        expect(git.checkpointThreshold).toBe(5);
        expect(git.mainBranch).toBe('main');
      });

      it('should have correct types for git properties', () => {
        const config = getDefaultConfig();
        const { git } = config.automation;

        expect(typeof git.autoFeatureBranch).toBe('boolean');
        expect(typeof git.autoCheckpoint).toBe('boolean');
        expect(typeof git.autoMerge).toBe('boolean');
        expect(typeof git.checkpointThreshold).toBe('number');
        expect(typeof git.mainBranch).toBe('string');
      });
    });

    describe('recovery configuration', () => {
      it('should include all recovery settings', () => {
        const config = getDefaultConfig();
        const { recovery } = config.automation;

        expect(recovery).toBeDefined();
        expect(recovery.maxRetriesPerError).toBe(3);
        expect(recovery.logFailures).toBe(true);
        expect(recovery.skipAfterMaxRetries).toBe(true);
      });

      it('should have correct types for recovery properties', () => {
        const config = getDefaultConfig();
        const { recovery } = config.automation;

        expect(typeof recovery.maxRetriesPerError).toBe('number');
        expect(typeof recovery.logFailures).toBe('boolean');
        expect(typeof recovery.skipAfterMaxRetries).toBe('boolean');
      });
    });

    it('should return a new object each time (no shared state)', () => {
      const config1 = getDefaultConfig();
      const config2 = getDefaultConfig();

      expect(config1).not.toBe(config2);
      expect(config1.automation).not.toBe(config2.automation);
      expect(config1.automation.testing).not.toBe(config2.automation.testing);
    });

    it('should satisfy GoodVibesConfig type', () => {
      const config: GoodVibesConfig = getDefaultConfig();

      // Type assertion - if this compiles, the type is satisfied
      expect(config).toBeDefined();
    });
  });
});
