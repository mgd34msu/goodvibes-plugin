import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AgentWorkflowMap } from '../agent-workflow-map.js';

// Mock the logger so tests run without I/O side-effects
vi.mock('../../../shared/logger.js', () => ({
  createLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

describe('AgentWorkflowMap.consumePendingBindsForWorkflow', () => {
  let map: AgentWorkflowMap;

  beforeEach(() => {
    map = new AgentWorkflowMap();
  });

  it('returns 0 and does not crash on an empty pending queue', () => {
    const removed = map.consumePendingBindsForWorkflow('wf-123');
    expect(removed).toBe(0);
  });

  it('removes a single matching entry and returns 1', () => {
    map.addPendingBind('reviewer', 'wf-abc');
    const removed = map.consumePendingBindsForWorkflow('wf-abc');
    expect(removed).toBe(1);
    // Queue should be empty; resolving that type now returns null
    expect(map.resolvePendingBind('reviewer')).toBeNull();
  });

  it('removes multiple entries for the same workflow and returns the count', () => {
    map.addPendingBind('reviewer', 'wf-multi');
    map.addPendingBind('engineer', 'wf-multi');
    map.addPendingBind('goodvibes:reviewer', 'wf-multi');
    const removed = map.consumePendingBindsForWorkflow('wf-multi');
    expect(removed).toBe(3);
  });

  it('preserves entries that belong to a different workflow', () => {
    map.addPendingBind('reviewer', 'wf-other');
    const removed = map.consumePendingBindsForWorkflow('wf-target');
    expect(removed).toBe(0);
    // The other-workflow entry is still resolvable
    expect(map.resolvePendingBind('reviewer')).toBe('wf-other');
  });

  it('removes only matching entries from a mixed queue', () => {
    map.addPendingBind('reviewer', 'wf-A');
    map.addPendingBind('engineer', 'wf-B');
    map.addPendingBind('goodvibes:reviewer', 'wf-A');
    map.addPendingBind('fixer', 'wf-C');

    const removed = map.consumePendingBindsForWorkflow('wf-A');
    expect(removed).toBe(2);

    // Entries for wf-B and wf-C must still be present
    expect(map.resolvePendingBind('engineer')).toBe('wf-B');
    expect(map.resolvePendingBind('fixer')).toBe('wf-C');

    // Entries for wf-A must be gone
    expect(map.resolvePendingBind('reviewer')).toBeNull();
    expect(map.resolvePendingBind('goodvibes:reviewer')).toBeNull();
  });
});
