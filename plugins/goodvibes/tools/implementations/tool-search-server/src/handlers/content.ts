/**
 * Content retrieval handlers
 *
 * Provides MCP tools for retrieving the full content of skills and agents
 * from the GoodVibes plugin registry.
 *
 * @module handlers/content
 */

import * as fs from 'fs';
import * as path from 'path';
import { PLUGIN_ROOT } from '../config.js';

/**
 * Handles the get_skill_content MCP tool call.
 *
 * Retrieves the full content of a skill file by path. Searches for the
 * skill in multiple locations: as a directory with SKILL.md, as a .md file,
 * or as a direct path.
 *
 * @param args - The get_skill_content tool arguments
 * @param args.path - The skill path (e.g., 'webdev/databases-orms/prisma')
 * @returns MCP tool response with the skill file content
 * @throws Error if the skill is not found
 *
 * @example
 * await handleGetSkillContent({ path: 'webdev/databases-orms/prisma' });
 * // Returns: { content: [{ type: 'text', text: '# Prisma...' }] }
 */
export async function handleGetSkillContent(args: { path: string }): Promise<{ content: Array<{ type: string; text: string }> }> {
  const attempts = [
    path.join(PLUGIN_ROOT, 'skills', args.path, 'SKILL.md'),
    path.join(PLUGIN_ROOT, 'skills', args.path + '.md'),
    path.join(PLUGIN_ROOT, 'skills', args.path),
  ];

  for (const skillPath of attempts) {
    if (fs.existsSync(skillPath)) {
      const content = await fs.promises.readFile(skillPath, 'utf-8');
      return { content: [{ type: 'text', text: content }] };
    }
  }

  throw new Error(`Skill not found: ${args.path}`);
}

/**
 * Handles the get_agent_content MCP tool call.
 *
 * Retrieves the full content of an agent definition file by path.
 * Searches for the agent as a .md file, direct path, or directory with index.md.
 *
 * @param args - The get_agent_content tool arguments
 * @param args.path - The agent path (e.g., 'backend-engineer')
 * @returns MCP tool response with the agent file content
 * @throws Error if the agent is not found
 *
 * @example
 * await handleGetAgentContent({ path: 'backend-engineer' });
 * // Returns: { content: [{ type: 'text', text: '# Backend Engineer...' }] }
 */
export async function handleGetAgentContent(args: { path: string }): Promise<{ content: Array<{ type: string; text: string }> }> {
  const attempts = [
    path.join(PLUGIN_ROOT, 'agents', `${args.path}.md`),
    path.join(PLUGIN_ROOT, 'agents', args.path),
    path.join(PLUGIN_ROOT, 'agents', args.path, 'index.md'),
  ];

  for (const agentPath of attempts) {
    if (fs.existsSync(agentPath)) {
      const content = await fs.promises.readFile(agentPath, 'utf-8');
      return { content: [{ type: 'text', text: content }] };
    }
  }

  throw new Error(`Agent not found: ${args.path}`);
}
