/**
 * Search operations for skills, agents, and tools.
 *
 * L2 orchestration layer — wraps core search with business formatting.
 * Renamed from handleSearch* — L2 is business logic, not dispatch.
 *
 * @module extensions/search
 */

import Fuse from 'fuse.js';
import { RegistryEntry, SearchSkillsArgs, SearchArgs } from '../core/types.js';
import { query } from '../core/search.js';
import { ok } from '../shared/response.js';
import type { McpResponse } from '../shared/types.js';

/**
 * Search skills by query with optional category filter.
 * Renamed from handleSearchSkills.
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
 * Renamed from handleSearchAgents.
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
 * Renamed from handleSearchTools.
 */
export function searchTools(
  toolsIndex: Fuse<RegistryEntry> | null,
  args: SearchArgs
): McpResponse {
  const results = query(toolsIndex, args.query, args.limit || 5);
  return ok({ tools: results, total_count: results.length, query: args.query });
}
