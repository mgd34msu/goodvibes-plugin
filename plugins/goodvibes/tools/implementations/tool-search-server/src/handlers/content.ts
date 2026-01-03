/**
 * Content retrieval handlers
 */

import * as fs from 'fs';
import * as path from 'path';
import { PLUGIN_ROOT } from '../config.js';

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
