/**
 * Tests for pre-tool-use/index.ts
 *
 * Validates that all exports are properly re-exported from the barrel file.
 * This file contains only re-exports, no executable code.
 */

import { describe, it, expect } from 'vitest';
import {
  // quality-gates exports
  QUALITY_GATES,
  runQualityGates,
  isCommitCommand,
  formatGateResults,
  type QualityGate,
  type GateResult,
  // git-guards exports
  checkBranchGuard,
  checkMergeReadiness,
  isGitCommand,
  isMergeCommand,
  type GitGuardResult,
} from '../../pre-tool-use/index.js';

describe('pre-tool-use/index', () => {
  describe('re-exports from quality-gates.ts', () => {
    it('should export QUALITY_GATES', () => {
      expect(QUALITY_GATES).toBeDefined();
      expect(Array.isArray(QUALITY_GATES)).toBe(true);
    });

    it('should export runQualityGates', () => {
      expect(runQualityGates).toBeDefined();
      expect(typeof runQualityGates).toBe('function');
    });

    it('should export isCommitCommand', () => {
      expect(isCommitCommand).toBeDefined();
      expect(typeof isCommitCommand).toBe('function');
    });

    it('should export formatGateResults', () => {
      expect(formatGateResults).toBeDefined();
      expect(typeof formatGateResults).toBe('function');
    });

    it('should export QualityGate type (via array elements)', () => {
      const gate: QualityGate = QUALITY_GATES[0];
      expect(gate).toBeDefined();
      expect(gate.name).toBeDefined();
    });

    it('should export GateResult type (via object)', () => {
      const result: GateResult = {
        gate: 'test',
        passed: true,
      };
      expect(result.passed).toBe(true);
    });
  });

  describe('re-exports from git-guards.ts', () => {
    it('should export checkBranchGuard', () => {
      expect(checkBranchGuard).toBeDefined();
      expect(typeof checkBranchGuard).toBe('function');
    });

    it('should export checkMergeReadiness', () => {
      expect(checkMergeReadiness).toBeDefined();
      expect(typeof checkMergeReadiness).toBe('function');
    });

    it('should export isGitCommand', () => {
      expect(isGitCommand).toBeDefined();
      expect(typeof isGitCommand).toBe('function');
    });

    it('should export isMergeCommand', () => {
      expect(isMergeCommand).toBeDefined();
      expect(typeof isMergeCommand).toBe('function');
    });

    it('should export GitGuardResult type (via object)', () => {
      const result: GitGuardResult = {
        allowed: true,
        reason: null,
      };
      expect(result.allowed).toBe(true);
    });
  });
});
