/**
 * Search operations for skills, agents, and tools.
 *
 * L2 orchestration layer — wraps core search with business formatting.
 *
 * @module extensions/search
 */

import type Fuse from 'fuse.js';
import { RegistryEntry, SearchSkillsArgs, SearchArgs } from '../core/types.js';
import { query } from '../core/search.js';
import { ok } from '../shared/response.js';
import type { McpResponse } from '../shared/types.js';

/**
 * Search skills by query with optional category filter.
 */
export function searchSkills(
  skillsIndex: Fuse<RegistryEntry> | null,
  args: SearchSkillsArgs
): McpResponse {
  const results = query(skillsIndex, args.query, args.limit || 5);
  const filtered = args.category
    ? results.filter((r) => r.path.startsWith(args.category!))
    : results;
  return ok({ skills: filtered, total_count: filtered.length, query: args.query });
}

/**
 * Search agents by query.
 */
export function searchAgents(
  agentsIndex: Fuse<RegistryEntry> | null,
  args: SearchArgs
): McpResponse {
  const results = query(agentsIndex, args.query, args.limit || 5);
  return ok({ agents: results, total_count: results.length, query: args.query });
}

/**
 * Search tools by query.
 */
export function searchTools(
  toolsIndex: Fuse<RegistryEntry> | null,
  args: SearchArgs
): McpResponse {
  const results = query(toolsIndex, args.query, args.limit || 5);
  return ok({ tools: results, total_count: results.length, query: args.query });
}
