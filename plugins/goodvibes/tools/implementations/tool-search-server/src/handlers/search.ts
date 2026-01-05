/**
 * Search handlers for skills, agents, and tools registry
 *
 * Provides fuzzy search functionality using Fuse.js for finding relevant
 * skills, agents, and tools based on user queries.
 *
 * @module handlers/search
 */

import Fuse from 'fuse.js';
import { RegistryEntry, SearchResult } from '../types.js';
import { success } from '../utils.js';

/**
 * Performs a fuzzy search on a Fuse.js index.
 *
 * @param index - The Fuse.js index to search, or null if not initialized
 * @param query - The search query string
 * @param limit - Maximum number of results to return (default: 5)
 * @returns Array of search results with relevance scores
 *
 * @example
 * const results = search(skillsIndex, 'authentication', 10);
 * // Returns: [{ name: 'clerk', path: 'auth/clerk', description: '...', relevance: 0.95 }, ...]
 */
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

/**
 * Handles the search_skills MCP tool call.
 *
 * Searches the skills registry for skills matching the query, optionally
 * filtered by category path prefix.
 *
 * @param skillsIndex - The Fuse.js index of skills
 * @param args - Search arguments
 * @param args.query - The search query string
 * @param args.category - Optional category path prefix to filter results (e.g., 'webdev/auth')
 * @param args.limit - Maximum number of results to return (default: 5)
 * @returns MCP tool response with matching skills
 *
 * @example
 * handleSearchSkills(index, { query: 'database', category: 'webdev', limit: 5 });
 * // Returns: { skills: [...], total_count: 3, query: 'database' }
 */
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

/**
 * Handles the search_agents MCP tool call.
 *
 * Searches the agents registry for agents matching the query.
 *
 * @param agentsIndex - The Fuse.js index of agents
 * @param args - Search arguments
 * @param args.query - The search query string
 * @param args.limit - Maximum number of results to return (default: 5)
 * @returns MCP tool response with matching agents
 *
 * @example
 * handleSearchAgents(index, { query: 'frontend', limit: 3 });
 * // Returns: { agents: [...], total_count: 2, query: 'frontend' }
 */
export function handleSearchAgents(
  agentsIndex: Fuse<RegistryEntry> | null,
  args: { query: string; limit?: number }
) {
  const results = search(agentsIndex, args.query, args.limit || 5);
  return success({ agents: results, total_count: results.length, query: args.query });
}

/**
 * Handles the search_tools MCP tool call.
 *
 * Searches the tools registry for tools matching the query.
 *
 * @param toolsIndex - The Fuse.js index of tools
 * @param args - Search arguments
 * @param args.query - The search query string
 * @param args.limit - Maximum number of results to return (default: 5)
 * @returns MCP tool response with matching tools
 *
 * @example
 * handleSearchTools(index, { query: 'validation', limit: 5 });
 * // Returns: { tools: [...], total_count: 1, query: 'validation' }
 */
export function handleSearchTools(
  toolsIndex: Fuse<RegistryEntry> | null,
  args: { query: string; limit?: number }
) {
  const results = search(toolsIndex, args.query, args.limit || 5);
  return success({ tools: results, total_count: results.length, query: args.query });
}

/**
 * Handles the recommend_skills MCP tool call.
 *
 * Analyzes a task description and recommends relevant skills based on
 * keyword matching and task category detection.
 *
 * @param skillsIndex - The Fuse.js index of skills
 * @param args - Recommendation arguments
 * @param args.task - Description of the task to find skills for
 * @param args.max_results - Maximum number of recommendations (default: 5)
 * @returns MCP tool response with skill recommendations and task analysis
 *
 * @example
 * handleRecommendSkills(index, {
 *   task: 'implement user authentication with OAuth',
 *   max_results: 5
 * });
 * // Returns: {
 * //   recommendations: [{ skill: 'nextauth', path: '...', relevance: 0.85, reason: '...' }],
 * //   task_analysis: { category: 'authentication', keywords: [...], complexity: 'moderate' }
 * // }
 */
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
