/**
 * Memory module - aggregates all memory subsystems.
 */

export * from './decisions.js';
export * from './patterns.js';
export * from './failures.js';
export * from './preferences.js';

import type { ProjectMemory } from '../types/memory.js';
import { readDecisions } from './decisions.js';
import { readPatterns } from './patterns.js';
import { readFailures } from './failures.js';
import { readPreferences } from './preferences.js';

/** Loads all project memory (decisions, patterns, failures, preferences). */
export function loadProjectMemory(cwd: string): ProjectMemory {
  return {
    decisions: readDecisions(cwd),
    patterns: readPatterns(cwd),
    failures: readFailures(cwd),
    preferences: readPreferences(cwd),
  };
}

/** Formats project memory into a human-readable context string. */
export function formatMemoryContext(memory: ProjectMemory): string {
  const parts: string[] = [];

  if (memory.decisions.length > 0) {
    parts.push('Previous Decisions:');
    for (const d of memory.decisions.slice(-5)) {
      parts.push(`- ${d.decision} (${d.rationale})`);
    }
  }

  if (memory.patterns.length > 0) {
    parts.push('\nEstablished Patterns:');
    for (const p of memory.patterns.slice(-3)) {
      parts.push(`- ${p.category}: ${p.patterns.slice(0, 2).join(', ')}`);
    }
  }

  if (memory.failures.length > 0) {
    parts.push('\nKnown Failures (avoid):');
    for (const f of memory.failures.slice(-3)) {
      parts.push(`- ${f.what}: ${f.why_failed}`);
    }
  }

  return parts.join('\n');
}
