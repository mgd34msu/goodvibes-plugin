/**
 * Handler registry for registry-engine tools.
 * Maps tool names to their handler functions.
 */

import { HandlerContext, ToolResponse } from '../types.js';
import {
  handleSearchSkills,
  handleSearchAgents,
  handleSearchTools,
  handleRecommendSkills,
} from './search.js';
import { handleGetSkillContent, handleGetAgentContent } from './content.js';
import { handleSkillDependencies } from './dependencies.js';

/**
 * Tool handler function signature.
 */
export type ToolHandler = (context: HandlerContext, args: unknown) => Promise<ToolResponse>;

/**
 * Registry mapping tool names to handlers.
 */
export const TOOL_HANDLERS: Record<string, ToolHandler> = {
  search_skills: async (ctx, args: any) => handleSearchSkills(ctx.skillsIndex, args),
  search_agents: async (ctx, args: any) => handleSearchAgents(ctx.agentsIndex, args),
  search_tools: async (ctx, args: any) => handleSearchTools(ctx.toolsIndex, args),
  recommend_skills: async (ctx, args: any) => handleRecommendSkills(ctx.skillsIndex, args),
  get_skill_content: async (ctx, args: any) => handleGetSkillContent(args),
  get_agent_content: async (ctx, args: any) => handleGetAgentContent(args),
  skill_dependencies: async (ctx, args: any) =>
    handleSkillDependencies(ctx.skillsIndex, ctx.skillsRegistry, args),
};

/**
 * Get handler for a tool name.
 */
export function getHandler(name: string): ToolHandler | undefined {
  return TOOL_HANDLERS[name];
}

/**
 * Check if a handler exists for a tool name.
 */
export function hasHandler(name: string): boolean {
  return name in TOOL_HANDLERS;
}

/**
 * List all registered tool names.
 */
export function listHandlers(): string[] {
  return Object.keys(TOOL_HANDLERS);
}
