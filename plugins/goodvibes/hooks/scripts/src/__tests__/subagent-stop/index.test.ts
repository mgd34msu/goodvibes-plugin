/**
 * Tests for subagent-stop/index.ts
 *
 * Validates that all exports are properly re-exported from the barrel file.
 * This file contains only re-exports, no executable code.
 */

import { describe, it, expect } from 'vitest';
import {
  // telemetry exports
  saveAgentTracking,
  getAgentTracking,
  removeAgentTracking,
  writeTelemetryEntry,
  buildTelemetryEntry,
  // output-validation exports
  validateAgentOutput,
  type ValidationResult,
  // test-verification exports
  verifyAgentTests,
  type TestVerificationResult,
} from '../../subagent-stop/index.js';

describe('subagent-stop/index', () => {
  describe('re-exports from telemetry.ts', () => {
    it('should export saveAgentTracking', () => {
      expect(saveAgentTracking).toBeDefined();
      expect(typeof saveAgentTracking).toBe('function');
    });

    it('should export getAgentTracking', () => {
      expect(getAgentTracking).toBeDefined();
      expect(typeof getAgentTracking).toBe('function');
    });

    it('should export removeAgentTracking', () => {
      expect(removeAgentTracking).toBeDefined();
      expect(typeof removeAgentTracking).toBe('function');
    });

    it('should export writeTelemetryEntry', () => {
      expect(writeTelemetryEntry).toBeDefined();
      expect(typeof writeTelemetryEntry).toBe('function');
    });

    it('should export buildTelemetryEntry', () => {
      expect(buildTelemetryEntry).toBeDefined();
      expect(typeof buildTelemetryEntry).toBe('function');
    });
  });

  describe('re-exports from output-validation.ts', () => {
    it('should export validateAgentOutput', () => {
      expect(validateAgentOutput).toBeDefined();
      expect(typeof validateAgentOutput).toBe('function');
    });

    it('should export ValidationResult type (via object)', () => {
      const result: ValidationResult = {
        valid: true,
        errors: [],
        warnings: [],
      };
      expect(result.valid).toBe(true);
    });
  });

  describe('re-exports from test-verification.ts', () => {
    it('should export verifyAgentTests', () => {
      expect(verifyAgentTests).toBeDefined();
      expect(typeof verifyAgentTests).toBe('function');
    });

    it('should export TestVerificationResult type (via object)', () => {
      const result: TestVerificationResult = {
        passed: true,
        testsRan: true,
        testCount: 0,
        failures: [],
      };
      expect(result.passed).toBe(true);
    });
  });
});
