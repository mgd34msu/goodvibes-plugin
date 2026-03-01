/**
 * Content retrieval for skills and agents.
 *
 * L2 orchestration layer — replaces handlers/content.ts with:
 * - Async path resolution via core/resolution (no blocking existsSync)
 * - Cleaner function names without handle prefix
 *
 * @module extensions/content
 */

import * as fs from 'node:fs/promises';
import { McpResponse } from '../shared/types.js';
import { ok } from '../shared/response.js';
import { ContentArgs } from '../core/types.js';
import { resolveSkillPath, resolveAgentPath } from '../core/resolution.js';

/**
 * Retrieve the full content of a skill file.
 * Renamed from handleGetSkillContent. Uses async resolveSkillPath instead
 * of blocking fs.existsSync.
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
 * Renamed from handleGetAgentContent. Uses async resolveAgentPath instead
 * of blocking fs.existsSync.
 */
export async function getAgentContent(args: ContentArgs): Promise<McpResponse> {
  const resolved = await resolveAgentPath(args.path);
  if (!resolved) {
    throw new Error(`Agent not found: ${args.path}`);
  }
  const content = await fs.readFile(resolved, 'utf-8');
  return ok(content);
}
