/**
 * Path resolution for registry-engine core layer (L1).
 * Resolves skill and agent paths to absolute filesystem locations.
 */

import * as path from 'node:path';
import { PLUGIN_ROOT } from '../shared/config.js';
import { fileExists } from '../shared/utils.js';

/**
 * Resolve a skill path to an absolute file path by trying multiple conventions.
 * Tries:
 *   1. PLUGIN_ROOT/skills/{skillPath}/SKILL.md  (directory with SKILL.md)
 *   2. PLUGIN_ROOT/skills/{skillPath}.md         (flat .md file)
 *   3. PLUGIN_ROOT/skills/{skillPath}            (exact path)
 *
 * @param skillPath - Relative skill path (e.g. "outcome/api-design")
 * @returns Absolute path if found, null otherwise
 */
export async function resolveSkillPath(skillPath: string): Promise<string | null> {
  const attempts = [
    path.join(PLUGIN_ROOT, 'skills', skillPath, 'SKILL.md'),
    path.join(PLUGIN_ROOT, 'skills', skillPath + '.md'),
    path.join(PLUGIN_ROOT, 'skills', skillPath),
  ];

  const results = await Promise.all(attempts.map(p => fileExists(p)));
  const idx = results.indexOf(true);
  return idx >= 0 ? attempts[idx] : null;
}

/**
 * Resolve an agent path to an absolute file path by trying multiple conventions.
 * Tries:
 *   1. PLUGIN_ROOT/agents/{agentPath}.md         (flat .md file)
 *   2. PLUGIN_ROOT/agents/{agentPath}            (exact path)
 *   3. PLUGIN_ROOT/agents/{agentPath}/index.md   (directory with index.md)
 *
 * @param agentPath - Relative agent path (e.g. "orchestrator")
 * @returns Absolute path if found, null otherwise
 */
export async function resolveAgentPath(agentPath: string): Promise<string | null> {
  const attempts = [
    path.join(PLUGIN_ROOT, 'agents', agentPath + '.md'),
    path.join(PLUGIN_ROOT, 'agents', agentPath),
    path.join(PLUGIN_ROOT, 'agents', agentPath, 'index.md'),
  ];

  const results = await Promise.all(attempts.map(p => fileExists(p)));
  const idx = results.indexOf(true);
  return idx >= 0 ? attempts[idx] : null;
}
