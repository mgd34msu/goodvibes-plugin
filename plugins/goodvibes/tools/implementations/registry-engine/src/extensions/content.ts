/**
 * Content retrieval for skills and agents.
 *
 * L2 orchestration layer — provides async path resolution
 * via core/resolution (no blocking existsSync).
 *
 * @module extensions/content
 */

import * as fs from 'node:fs/promises';
import type { McpResponse } from '../shared/types.js';
import { ok } from '../shared/response.js';
import type { ContentArgs } from '../core/types.js';
import { resolveSkillPath, resolveAgentPath } from '../core/resolution.js';

/**
 * Retrieve the full content of a skill file.
 */
export async function getSkillContent(args: ContentArgs): Promise<McpResponse> {
  const resolved = await resolveSkillPath(args.path);
  if (!resolved) {
    throw new Error(`Skill not found: ${args.path}`);
  }
  const content = await fs.readFile(resolved, 'utf-8');
  return ok(content);
}

/**
 * Retrieve the full content of an agent file.
 */
export async function getAgentContent(args: ContentArgs): Promise<McpResponse> {
  const resolved = await resolveAgentPath(args.path);
  if (!resolved) {
    throw new Error(`Agent not found: ${args.path}`);
  }
  const content = await fs.readFile(resolved, 'utf-8');
  return ok(content);
}
