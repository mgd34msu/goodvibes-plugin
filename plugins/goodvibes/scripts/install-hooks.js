#!/usr/bin/env node
/**
 * Install GoodVibes plugin hooks into the project's .claude/hooks.json
 *
 * Usage: node plugins/goodvibes/scripts/install-hooks.js
 *
 * This script:
 * 1. Reads the plugin's hooks.json
 * 2. Creates or merges with .claude/hooks.json
 * 3. Updates paths to use CLAUDE_PLUGIN_ROOT
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const PLUGIN_ROOT = join(__dirname, '..');
const PROJECT_ROOT = process.cwd();
const CLAUDE_DIR = join(PROJECT_ROOT, '.claude');
const TARGET_HOOKS = join(CLAUDE_DIR, 'hooks.json');
const SOURCE_HOOKS = join(PLUGIN_ROOT, 'hooks', 'hooks.json');

function main() {
  console.log('Installing GoodVibes hooks...\n');

  // Check source exists
  if (!existsSync(SOURCE_HOOKS)) {
    console.error(`ERROR: Plugin hooks.json not found at ${SOURCE_HOOKS}`);
    process.exit(1);
  }

  // Create .claude directory if needed
  if (!existsSync(CLAUDE_DIR)) {
    mkdirSync(CLAUDE_DIR, { recursive: true });
    console.log(`Created ${CLAUDE_DIR}`);
  }

  // Read plugin hooks
  const pluginHooks = JSON.parse(readFileSync(SOURCE_HOOKS, 'utf-8'));

  // Read existing hooks or create empty structure
  let existingHooks = { hooks: {} };
  if (existsSync(TARGET_HOOKS)) {
    try {
      existingHooks = JSON.parse(readFileSync(TARGET_HOOKS, 'utf-8'));
      console.log(`Found existing hooks.json with ${Object.keys(existingHooks.hooks || {}).length} hook types`);
    } catch (e) {
      console.warn('Warning: Could not parse existing hooks.json, will overwrite');
    }
  }

  // Merge hooks
  const mergedHooks = {
    ...existingHooks,
    hooks: {
      ...existingHooks.hooks,
      ...pluginHooks.hooks
    }
  };

  // Add description if not present
  if (!mergedHooks.description) {
    mergedHooks.description = 'Claude Code hooks (includes GoodVibes plugin hooks)';
  }

  // Write merged hooks
  writeFileSync(TARGET_HOOKS, JSON.stringify(mergedHooks, null, 2) + '\n');

  console.log(`\nInstalled hooks to ${TARGET_HOOKS}`);
  console.log(`\nHook types installed:`);
  for (const hookType of Object.keys(pluginHooks.hooks || {})) {
    const count = pluginHooks.hooks[hookType]?.length || 0;
    console.log(`  - ${hookType}: ${count} matcher(s)`);
  }

  console.log('\nDone! Restart Claude Code for hooks to take effect.');
}

main();
