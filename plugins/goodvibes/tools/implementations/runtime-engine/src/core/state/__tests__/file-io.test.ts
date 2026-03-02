/**
 * Tests for core/state/file-io.ts
 *
 * This module is a re-export barrel that proxies writeAtomicSync, writeJsonSync,
 * and readJsonSync from shared/file-io.ts. These tests verify that:
 *  1. All three exports are present and are functions.
 *  2. Each re-exported function is the same reference as the shared implementation
 *     (i.e. it is a true re-export, not a wrapper).
 */

import { describe, it, expect } from 'vitest';
import * as coreFileIo from '../file-io.js';
import * as sharedFileIo from '../../../shared/file-io.js';

describe('core/state/file-io re-exports', () => {
  it('exports writeAtomicSync as a function', () => {
    expect(typeof coreFileIo.writeAtomicSync).toBe('function');
  });

  it('exports writeJsonSync as a function', () => {
    expect(typeof coreFileIo.writeJsonSync).toBe('function');
  });

  it('exports readJsonSync as a function', () => {
    expect(typeof coreFileIo.readJsonSync).toBe('function');
  });

  it('writeAtomicSync is the same reference as the shared implementation', () => {
    expect(coreFileIo.writeAtomicSync).toBe(sharedFileIo.writeAtomicSync);
  });

  it('writeJsonSync is the same reference as the shared implementation', () => {
    expect(coreFileIo.writeJsonSync).toBe(sharedFileIo.writeJsonSync);
  });

  it('readJsonSync is the same reference as the shared implementation', () => {
    expect(coreFileIo.readJsonSync).toBe(sharedFileIo.readJsonSync);
  });
});
