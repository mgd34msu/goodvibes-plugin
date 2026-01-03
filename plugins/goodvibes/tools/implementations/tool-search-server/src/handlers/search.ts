/**
 * Search handlers
 */

import Fuse from 'fuse.js';
import { RegistryEntry, SearchResult } from '../types.js';

function search(
  index: Fuse<RegistryEntry> | null,
  query: string,
  limit: number = 5
): SearchResult[] {
  if (!index) return [];
  const results = index.search(query, { limit });
  return results.map((r) => ({
    name: r.item.name,
    path: r.item.path,
    description: r.item.description,
    relevance: Math.round((1 - (r.score || 0)) * 100) / 100,
  }));
}

function success(data: unknown) {
  return {
    content: [{
      type: 'text',
      text: JSON.stringify(data, null, 2),
    }],
  };
}

export function handleSearchSkills(
  skillsIndex: Fuse<RegistryEntry> | null,
  args: { query: string; category?: string; limit?: number }
) {
  const results = search(skillsIndex, args.query, args.limit || 5);
  const filtered = args.category
    ? results.filter((r) => r.path.startsWith(args.category!))
    : results;
  return success({ skills: filtered, total_count: filtered.length, query: args.query });
}

export function handleSearchAgents(
  agentsIndex: Fuse<RegistryEntry> | null,
  args: { query: string; limit?: number }
) {
  const results = search(agentsIndex, args.query, args.limit || 5);
  return success({ agents: results, total_count: results.length, query: args.query });
}

export function handleSearchTools(
  toolsIndex: Fuse<RegistryEntry> | null,
  args: { query: string; limit?: number }
) {
  const results = search(toolsIndex, args.query, args.limit || 5);
  return success({ tools: results, total_count: results.length, query: args.query });
}

export function handleRecommendSkills(
  skillsIndex: Fuse<RegistryEntry> | null,
  args: { task: string; max_results?: number }
) {
  const keywords = args.task.toLowerCase().split(/\s+/).filter(w => w.length > 3);
  const results = search(skillsIndex, args.task, args.max_results || 5);

  const taskLower = args.task.toLowerCase();
  let category = 'general';
  if (taskLower.includes('auth') || taskLower.includes('login')) category = 'authentication';
  else if (taskLower.includes('database') || taskLower.includes('prisma') || taskLower.includes('sql')) category = 'database';
  else if (taskLower.includes('api') || taskLower.includes('endpoint')) category = 'api';
  else if (taskLower.includes('style') || taskLower.includes('css') || taskLower.includes('tailwind')) category = 'styling';
  else if (taskLower.includes('test')) category = 'testing';
  else if (taskLower.includes('deploy') || taskLower.includes('build')) category = 'deployment';

  const recommendations = results.map(r => ({
    skill: r.name,
    path: r.path,
    relevance: r.relevance,
    reason: `Matches task keywords: ${keywords.slice(0, 3).join(', ')}`,
    prerequisites: [],
    complements: [],
  }));

  return success({
    recommendations,
    task_analysis: {
      category,
      keywords: keywords.slice(0, 10),
      complexity: keywords.length > 10 ? 'complex' : keywords.length > 5 ? 'moderate' : 'simple',
    },
  });
}
