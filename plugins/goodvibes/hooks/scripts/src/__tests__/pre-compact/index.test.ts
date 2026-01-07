/**
 * Tests for pre-compact/index.ts
 *
 * Validates that all exports are properly re-exported from the barrel file.
 * This file contains only re-exports, no executable code.
 */

import { describe, it, expect } from 'vitest';

import {
  // state-preservation exports
  createPreCompactCheckpoint,
  saveSessionSummary,
  getFilesModifiedThisSession,
} from '../../pre-compact/index.js';

describe('pre-compact/index', () => {
  describe('re-exports from state-preservation.ts', () => {
    it('should export createPreCompactCheckpoint', () => {
      expect(createPreCompactCheckpoint).toBeDefined();
      expect(typeof createPreCompactCheckpoint).toBe('function');
    });

    it('should export saveSessionSummary', () => {
      expect(saveSessionSummary).toBeDefined();
      expect(typeof saveSessionSummary).toBe('function');
    });

    it('should export getFilesModifiedThisSession', () => {
      expect(getFilesModifiedThisSession).toBeDefined();
      expect(typeof getFilesModifiedThisSession).toBe('function');
    });
  });
});
