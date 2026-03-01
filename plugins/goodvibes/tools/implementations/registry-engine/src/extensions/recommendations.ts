/**
 * Skill recommendation orchestration.
 *
 * L2 orchestration layer — decomposes recommendation into
 * separate L1 concerns (keyword extraction, category detection,
 * complexity estimation) composed into a recommendation workflow.
 *
 * @module extensions/recommendations
 */

import type Fuse from 'fuse.js';
import { RegistryEntry, RecommendSkillsArgs } from '../core/types.js';
import { query } from '../core/search.js';
import { extractKeywords } from '../core/parsing.js';
import { detectCategory, estimateComplexity } from '../core/classification.js';
import { ok } from '../shared/response.js';
import type { McpResponse } from '../shared/types.js';

/**
 * Recommend skills for a given task description.
 * Orchestrates keyword extraction, category detection, complexity
 * estimation, and result formatting.
 */
export function recommendSkills(
  skillsIndex: Fuse<RegistryEntry> | null,
  args: RecommendSkillsArgs
): McpResponse {
  const keywords = extractKeywords(args.task);
  const results = query(skillsIndex, args.task, args.max_results || 5);
  const category = detectCategory(args.task);
  const complexity = estimateComplexity(keywords);

  const recommendations = results.map(r => ({
    skill: r.name,
    path: r.path,
    relevance: r.relevance,
    reason: `Matches task keywords: ${keywords.slice(0, 3).join(', ')}`,
    prerequisites: [],
    complements: [],
  }));

  return ok({
    recommendations,
    task_analysis: {
      category,
      keywords: keywords.slice(0, 10),
      complexity,
    },
  });
}
