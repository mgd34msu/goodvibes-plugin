/**
 * Decisions memory module - stores architectural decisions with rationale.
 */

import * as path from 'path';
import type { MemoryDecision } from '../types/memory.js';
import {
  parseMemoryFile,
  ensureMemoryFile,
  appendMemoryEntry,
} from './parser.js';

const DECISIONS_HEADER = `# Architectural Decisions

This file records architectural decisions made for this project.
Each decision includes the date, alternatives considered, rationale, and the agent that made it.

---

`;

/**
 * Reads all project decisions from the memory file.
 *
 * Parses the decisions.md file and returns an array of structured decision objects.
 * Returns an empty array if the file doesn't exist or is empty.
 *
 * @param cwd - The current working directory (project root)
 * @returns Promise resolving to array of MemoryDecision objects parsed from the file
 *
 * @example
 * const decisions = await readDecisions('/path/to/project');
 * for (const decision of decisions) {
 *   console.log(`${decision.title}: ${decision.rationale}`);
 * }
 */
export async function readDecisions(cwd: string): Promise<MemoryDecision[]> {
  const filePath = path.join(cwd, '.goodvibes', 'memory', 'decisions.md');

  return parseMemoryFile<MemoryDecision>(filePath, {
    primaryField: 'title',
    fields: {
      date: 'inline',
      agent: 'inline',
      alternatives: 'list',
      rationale: 'text',
      context: 'text',
    },
    validate: (entry) => !!(entry.title && entry.date && entry.rationale),
    transform: (entry) => ({
      title: entry.title!,
      date: entry.date!,
      alternatives: entry.alternatives || [],
      rationale: entry.rationale!,
      agent: entry.agent,
      context: entry.context,
    }),
  });
}

/**
 * Appends a new decision to the decisions memory file.
 *
 * Creates the decisions.md file with a header if it doesn't exist,
 * then appends the decision in a structured markdown format.
 *
 * @param cwd - The current working directory (project root)
 * @param decision - The decision object to write
 *
 * @example
 * await writeDecision('/path/to/project', {
 *   title: 'Use tRPC for API',
 *   date: '2024-01-04',
 *   rationale: 'End-to-end type safety with minimal boilerplate',
 *   alternatives: ['REST', 'GraphQL']
 * });
 */
export async function writeDecision(
  cwd: string,
  decision: MemoryDecision
): Promise<void> {
  const filePath = path.join(cwd, '.goodvibes', 'memory', 'decisions.md');

  await ensureMemoryFile(filePath, DECISIONS_HEADER);

  const entry = formatDecision(decision);
  await appendMemoryEntry(filePath, entry);
}

function formatDecision(decision: MemoryDecision): string {
  let md = `\n## ${decision.title}\n\n`;
  md += `**Date:** ${decision.date}\n`;
  if (decision.agent) {
    md += `**Agent:** ${decision.agent}\n`;
  }
  md += '\n**Alternatives:**\n';
  for (const alt of decision.alternatives) {
    md += `- ${alt}\n`;
  }
  md += '\n**Rationale:**\n';
  md += `${decision.rationale}\n`;
  if (decision.context) {
    md += '\n**Context:**\n';
    md += `${decision.context}\n`;
  }
  md += '\n---\n';
  return md;
}
