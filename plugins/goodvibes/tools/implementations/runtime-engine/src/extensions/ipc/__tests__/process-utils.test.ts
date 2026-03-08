/**
 * Tests for process-utils — isPidAlive.
 */

import { describe, it, expect } from 'vitest';
import { isPidAlive } from '../process-utils.js';

describe('isPidAlive', () => {
  it('returns true for the current process PID', () => {
    expect(isPidAlive(process.pid)).toBe(true);
  });

  it('returns false for a very large PID that does not exist', () => {
    // PID 2^31 - 1 is beyond the OS max PID on any platform
    expect(isPidAlive(2147483647)).toBe(false);
  });

  it('returns true for PID 0 (process group signal — EPERM means group exists)', () => {
    // process.kill(0, 0) sends to the whole process group. On Linux this
    // throws EPERM (not ESRCH), which means the OS confirmed the group exists.
    // isPidAlive treats EPERM as alive, so this returns true on Linux.
    expect(isPidAlive(0)).toBe(true);
  });

  it('returns true for PID -1 (broadcast signal — EPERM means processes exist)', () => {
    // process.kill(-1, 0) broadcasts to all processes the user can signal.
    // On Linux this throws EPERM (not ESRCH), meaning processes were found.
    // isPidAlive treats EPERM as alive, so this returns true on Linux.
    expect(isPidAlive(-1)).toBe(true);
  });
});
