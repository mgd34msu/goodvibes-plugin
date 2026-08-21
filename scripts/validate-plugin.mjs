#!/usr/bin/env node
/**
 * validate-plugin.mjs
 *
 * Structural gate on the shipped marketplace tree at plugins/goodvibes/.
 *
 *   node scripts/validate-plugin.mjs
 *
 * Users install this plugin by pulling the repo's main branch, so whatever is
 * committed under plugins/goodvibes/ is what runs on their machine. This script
 * asserts the tree is installable before that happens: the manifest points at
 * real files, every MCP server entry names a bundle that exists, every hook
 * command names a script that exists, every declared command/skill/agent file
 * is present, the runtime manifests ship with their lockfiles, the WASM assets
 * the servers load at runtime are all there, the artifact manifest is present,
 * and nothing that must never ship (a source map, a symlink) is in the tree.
 *
 * Exits non-zero on the first failure with the reason.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pluginRoot = path.join(root, 'plugins', 'goodvibes');
const readJson = (relativePath) => JSON.parse(fs.readFileSync(path.join(root, relativePath), 'utf8'));
const fail = (message) => {
  console.error(`validate-plugin: ${message}`);
  process.exit(1);
};
const exists = (relativeToPlugin) => fs.existsSync(path.join(pluginRoot, relativeToPlugin));

// --- plugin manifest --------------------------------------------------------

const manifest = readJson('plugins/goodvibes/.claude-plugin/plugin.json');
if (manifest.name !== 'goodvibes') fail('plugin name must be goodvibes');
if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/.test(String(manifest.version))) {
  fail(`plugin version is not semver: ${manifest.version}`);
}
for (const key of ['description', 'author', 'homepage', 'repository', 'license', 'mcpServers', 'commands', 'skills']) {
  if (!manifest[key]) fail(`plugin manifest is missing ${key}`);
}
if (manifest.mcpServers !== './.mcp.json') fail('mcpServers must point to ./.mcp.json');
if (manifest.commands !== './commands/') fail('commands must point to ./commands/');
if (manifest.skills !== './skills/') fail('skills must point to ./skills/');

// --- MCP servers ------------------------------------------------------------

const EXPECTED_SERVERS = ['analytics', 'connect', 'intel'];
const mcpDocument = readJson('plugins/goodvibes/.mcp.json');
const servers = mcpDocument.mcpServers ?? {};
const serverNames = Object.keys(servers).sort();
if (JSON.stringify(serverNames) !== JSON.stringify(EXPECTED_SERVERS)) {
  fail(`unexpected MCP server keys: ${serverNames.join(', ')}`);
}
for (const [name, config] of Object.entries(servers)) {
  if (config.command !== 'node') fail(`${name} must launch with node`);
  const entry = config.args?.[0];
  if (typeof entry !== 'string' || !entry.includes('${CLAUDE_PLUGIN_ROOT}')) {
    fail(`${name} entry point must be plugin-root relative: ${entry}`);
  }
  const relative = entry.replace('${CLAUDE_PLUGIN_ROOT}/', '');
  if (!exists(relative)) fail(`${name} entry point does not exist: ${relative}`);
}

// --- hooks ------------------------------------------------------------------

if (!exists('hooks/hooks.json')) fail('hooks/hooks.json is missing');
const hooks = readJson('plugins/goodvibes/hooks/hooks.json').hooks ?? {};
if (Object.keys(hooks).length === 0) fail('hooks.json registers no hook events');
for (const [event, registrations] of Object.entries(hooks)) {
  for (const registration of registrations) {
    for (const hook of registration.hooks ?? []) {
      const command = hook.command ?? '';
      if (!command.includes('${CLAUDE_PLUGIN_ROOT}')) {
        fail(`${event} hook command is not plugin-root relative: ${command}`);
      }
      const match = command.match(/\$\{CLAUDE_PLUGIN_ROOT\}\/([^"']+)/);
      if (!match) fail(`${event} hook command has no resolvable script path: ${command}`);
      if (!exists(match[1])) fail(`${event} hook script does not exist: ${match[1]}`);
    }
  }
}

// --- commands, skills, agents ----------------------------------------------

const EXPECTED_COMMANDS = ['analytics', 'codebase-review', 'plugin', 'services', 'setup'];
const commandFiles = fs
  .readdirSync(path.join(pluginRoot, 'commands'), { withFileTypes: true })
  .filter((entry) => entry.isFile() && entry.name.endsWith('.md'))
  .map((entry) => entry.name.replace(/\.md$/, ''))
  .sort();
if (JSON.stringify(commandFiles) !== JSON.stringify(EXPECTED_COMMANDS)) {
  fail(`unexpected command set: ${commandFiles.join(', ')}`);
}

const EXPECTED_SKILLS = [
  'goodvibes-memory',
  'intel-mastery',
  'project-onboarding',
  'review-scoring',
  'service-integration',
  'task-orchestration',
];
const skillRoot = path.join(pluginRoot, 'skills');
const actualSkills = fs
  .readdirSync(skillRoot, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .sort();
if (JSON.stringify(actualSkills) !== JSON.stringify(EXPECTED_SKILLS)) {
  fail(`unexpected skill set: ${actualSkills.join(', ')}`);
}
for (const skill of actualSkills) {
  if (!exists(path.join('skills', skill, 'SKILL.md'))) fail(`skills/${skill}/SKILL.md is missing`);
}

const EXPECTED_AGENTS = ['architect', 'engineer', 'refutation-reviewer', 'tester'];
const agentFiles = fs
  .readdirSync(path.join(pluginRoot, 'agents'), { withFileTypes: true })
  .filter((entry) => entry.isFile() && entry.name.endsWith('.md'))
  .map((entry) => entry.name.replace(/\.md$/, ''))
  .sort();
if (JSON.stringify(agentFiles) !== JSON.stringify(EXPECTED_AGENTS)) {
  fail(`unexpected agent set: ${agentFiles.join(', ')}`);
}

// --- shipped server payloads ------------------------------------------------

for (const server of EXPECTED_SERVERS) {
  for (const file of ['index.cjs', 'package.json', 'package-lock.json']) {
    if (!exists(path.join('server', server, file))) fail(`server/${server}/${file} is missing`);
  }
  const runtime = readJson(`plugins/goodvibes/server/${server}/package.json`);
  const lock = readJson(`plugins/goodvibes/server/${server}/package-lock.json`);
  if (runtime.version !== manifest.version || lock.version !== manifest.version) {
    fail(`server/${server} runtime version does not match the plugin (${manifest.version})`);
  }
}

// The WASM assets each bundle loads at runtime. intel resolves tree-sitter
// grammars and web-tree-sitter's runtime module from its own wasm/ directory;
// all three servers reach core/telemetry, which loads sql.js.
for (const asset of [
  'server/intel/wasm/tree-sitter-typescript.wasm',
  'server/intel/wasm/tree-sitter-javascript.wasm',
  'server/intel/wasm/tree-sitter-python.wasm',
  'server/intel/wasm/tree-sitter-rust.wasm',
  'server/intel/wasm/tree-sitter-go.wasm',
  'server/intel/wasm/web-tree-sitter.wasm',
  'server/intel/wasm/sql-wasm.wasm',
  'server/analytics/wasm/sql-wasm.wasm',
  'server/connect/wasm/sql-wasm.wasm',
]) {
  if (!exists(asset)) fail(`${asset} is missing`);
}

if (!exists('ARTIFACTS.json')) fail('ARTIFACTS.json is missing; run npm run build');

// --- marketplace entry ------------------------------------------------------

const marketplace = readJson('.claude-plugin/marketplace.json');
const entry = (marketplace.plugins ?? []).find((candidate) => candidate.name === 'goodvibes');
if (!entry) fail('marketplace entry is missing');
if (entry.source !== './plugins/goodvibes') fail(`marketplace source is invalid: ${entry.source}`);
if (entry.version !== manifest.version) fail('marketplace version does not match the plugin manifest');

// --- nothing that must never ship -------------------------------------------

const pending = [pluginRoot];
let shippedFiles = 0;
while (pending.length) {
  const current = pending.pop();
  for (const dirent of fs.readdirSync(current, { withFileTypes: true })) {
    const full = path.join(current, dirent.name);
    // Symlink first, then the node_modules skip: the plugin's own runtime
    // creates server/<name>/node_modules as a symlink into the user's home,
    // and .gitignore's "node_modules/" rule does not ignore a symlink, so it
    // could be committed as a mode 120000 entry. Skipping by name first would
    // step right over the case this check exists for.
    if (dirent.isSymbolicLink()) fail(`plugin artifact contains a symlink: ${full}`);
    if (dirent.name === 'node_modules' || dirent.name === '.goodvibes') continue;
    if (dirent.isDirectory()) pending.push(full);
    else if (dirent.name.endsWith('.map')) fail(`source map must not ship: ${full}`);
    else shippedFiles += 1;
  }
}

process.stdout.write(
  `Validated GoodVibes plugin ${manifest.version}: ${shippedFiles} shipped files, ` +
    `${EXPECTED_SERVERS.length} servers, ${actualSkills.length} skills, ${commandFiles.length} commands.\n`,
);
