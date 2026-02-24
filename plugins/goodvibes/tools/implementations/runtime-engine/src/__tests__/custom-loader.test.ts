/**
 * Custom Workflow Loader Tests
 *
 * Tests for loadCustomWorkflows, validateWorkflowDefinition, and isValidWorkflowDefinition.
 * Uses a tmp directory with a fake goodvibes.json to avoid touching real files.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  loadCustomWorkflows,
  validateWorkflowDefinition,
  isValidWorkflowDefinition,
} from '../workflow/definitions/custom-loader.js';

// ─── Helpers ───────────────────────────────────────────────────────────────────

function makeValidDef(overrides: Record<string, unknown> = {}) {
  return {
    id: 'my_workflow',
    name: 'My Workflow',
    version: 1,
    initial_state: 'IDLE',
    terminal_states: ['DONE'],
    states: {
      IDLE: { name: 'IDLE', transitions: [{ event: 'go', target: 'DONE' }] },
      DONE: { name: 'DONE', transitions: [] },
    },
    ...overrides,
  };
}

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(join(tmpdir(), 'custom-loader-test-'));
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

// ─── isValidWorkflowDefinition ────────────────────────────────────────────────

describe('isValidWorkflowDefinition', () => {
  it('returns true for a valid definition', () => {
    expect(isValidWorkflowDefinition(makeValidDef())).toBe(true);
  });

  it('returns false for null', () => {
    expect(isValidWorkflowDefinition(null)).toBe(false);
  });

  it('returns false for non-objects', () => {
    expect(isValidWorkflowDefinition('string')).toBe(false);
    expect(isValidWorkflowDefinition(42)).toBe(false);
    expect(isValidWorkflowDefinition([])).toBe(false);
  });

  it('returns false when id is missing', () => {
    const { id: _, ...rest } = makeValidDef();
    expect(isValidWorkflowDefinition(rest)).toBe(false);
  });

  it('returns false when version is not a number', () => {
    expect(isValidWorkflowDefinition(makeValidDef({ version: '1' }))).toBe(false);
  });
});

// ─── validateWorkflowDefinition ───────────────────────────────────────────────

describe('validateWorkflowDefinition', () => {
  it('returns no errors for a valid definition', () => {
    expect(validateWorkflowDefinition(makeValidDef())).toEqual([]);
  });

  it('returns error for non-object input', () => {
    const errors = validateWorkflowDefinition('not an object');
    expect(errors.length).toBeGreaterThan(0);
  });

  it('rejects builtin_ prefix', () => {
    const errors = validateWorkflowDefinition(makeValidDef({ id: 'builtin_something' }));
    expect(errors.some((e) => e.includes('builtin_'))).toBe(true);
  });

  it('rejects missing initial_state from states', () => {
    const errors = validateWorkflowDefinition(makeValidDef({ initial_state: 'NONEXISTENT' }));
    expect(errors.some((e) => e.includes('initial_state'))).toBe(true);
  });

  it('rejects terminal_state not in states', () => {
    const errors = validateWorkflowDefinition(makeValidDef({ terminal_states: ['MISSING'] }));
    expect(errors.some((e) => e.includes('terminal_state'))).toBe(true);
  });

  it('rejects transition target not in states', () => {
    const def = makeValidDef();
    (def.states as Record<string, unknown>)['IDLE'] = {
      name: 'IDLE',
      transitions: [{ event: 'go', target: 'NOWHERE' }],
    };
    const errors = validateWorkflowDefinition(def);
    expect(errors.some((e) => e.includes('NOWHERE'))).toBe(true);
  });
});

// ─── loadCustomWorkflows ───────────────────────────────────────────────────────

describe('loadCustomWorkflows', () => {
  it('returns empty array when goodvibes.json does not exist', async () => {
    const result = await loadCustomWorkflows(tmpDir);
    expect(result).toEqual([]);
  });

  it('returns empty array when runtime.workflows is missing', async () => {
    await fs.writeFile(join(tmpDir, 'goodvibes.json'), JSON.stringify({ name: 'test' }));
    const result = await loadCustomWorkflows(tmpDir);
    expect(result).toEqual([]);
  });

  it('loads valid workflow definitions', async () => {
    const config = {
      runtime: {
        workflows: [makeValidDef()],
      },
    };
    await fs.writeFile(join(tmpDir, 'goodvibes.json'), JSON.stringify(config));
    const result = await loadCustomWorkflows(tmpDir);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('my_workflow');
  });

  it('skips invalid workflow definitions and loads valid ones', async () => {
    const config = {
      runtime: {
        workflows: [
          makeValidDef({ id: 'valid_one' }),
          { id: 'builtin_bad', name: 'bad' }, // invalid: uses builtin_ prefix
          makeValidDef({ id: 'valid_two', name: 'Valid Two' }),
        ],
      },
    };
    await fs.writeFile(join(tmpDir, 'goodvibes.json'), JSON.stringify(config));
    const result = await loadCustomWorkflows(tmpDir);
    expect(result).toHaveLength(2);
    expect(result.map((d) => d.id)).toContain('valid_one');
    expect(result.map((d) => d.id)).toContain('valid_two');
  });

  it('returns empty array when goodvibes.json is invalid JSON', async () => {
    await fs.writeFile(join(tmpDir, 'goodvibes.json'), '{ invalid json }');
    const result = await loadCustomWorkflows(tmpDir);
    expect(result).toEqual([]);
  });

  it('returns empty array when runtime.workflows is not an array', async () => {
    await fs.writeFile(
      join(tmpDir, 'goodvibes.json'),
      JSON.stringify({ runtime: { workflows: 'not-an-array' } }),
    );
    const result = await loadCustomWorkflows(tmpDir);
    expect(result).toEqual([]);
  });
});
