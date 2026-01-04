/**
 * Decisions memory module - stores architectural decisions with rationale.
 */

import * as fs from 'fs';
import * as path from 'path';
import { ensureGoodVibesDir } from '../shared.js';
import type { MemoryDecision } from '../types/memory.js';

/** Reads all project decisions from the memory file. */
export function readDecisions(cwd: string): MemoryDecision[] {
  const filePath = path.join(cwd, '.goodvibes', 'memory', 'decisions.md');

  if (!fs.existsSync(filePath)) {
    return [];
  }

  const content = fs.readFileSync(filePath, 'utf-8');
  return parseDecisions(content);
}

/** Appends a new decision to the decisions memory file. */
export async function writeDecision(cwd: string, decision: MemoryDecision): Promise<void> {
  await ensureGoodVibesDir(cwd);
  const filePath = path.join(cwd, '.goodvibes', 'memory', 'decisions.md');

  let content = '';
  if (fs.existsSync(filePath)) {
    content = fs.readFileSync(filePath, 'utf-8');
  } else {
    content = '# Project Decisions\n\n';
  }

  const entry = formatDecision(decision);
  content += entry;

  fs.writeFileSync(filePath, content);
}

function parseDecisions(content: string): MemoryDecision[] {
  const decisions: MemoryDecision[] = [];
  const sections = content.split(/^## /m).slice(1);

  for (const section of sections) {
    const lines = section.split('\n');
    const titleLine = lines[0];
    const dateMatch = titleLine.match(/^(\d{4}-\d{2}-\d{2}):\s*(.+)/);

    if (dateMatch) {
      const decision: MemoryDecision = {
        date: dateMatch[1],
        title: dateMatch[2],
        decision: '',
        rationale: '',
      };

      for (const line of lines.slice(1)) {
        if (line.startsWith('**Decision:**')) {
          decision.decision = line.replace('**Decision:**', '').trim();
        } else if (line.startsWith('**Alternatives Considered:**')) {
          decision.alternatives = line.replace('**Alternatives Considered:**', '').trim().split(', ');
        } else if (line.startsWith('**Rationale:**')) {
          decision.rationale = line.replace('**Rationale:**', '').trim();
        } else if (line.startsWith('**Agent:**')) {
          decision.agent = line.replace('**Agent:**', '').trim();
        }
      }

      decisions.push(decision);
    }
  }

  return decisions;
}

function formatDecision(decision: MemoryDecision): string {
  let entry = `## ${decision.date}: ${decision.title}\n`;
  entry += `**Decision:** ${decision.decision}\n`;
  if (decision.alternatives && decision.alternatives.length > 0) {
    entry += `**Alternatives Considered:** ${decision.alternatives.join(', ')}\n`;
  }
  entry += `**Rationale:** ${decision.rationale}\n`;
  if (decision.agent) {
    entry += `**Agent:** ${decision.agent}\n`;
  }
  entry += '\n';
  return entry;
}
