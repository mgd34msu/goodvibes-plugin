/**
 * Plugin Validation Script
 *
 * Validates the plugin structure and content.
 *
 * Usage: npx tsx scripts/validate.ts
 */

import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'js-yaml';

const PLUGIN_ROOT = path.resolve(__dirname, '..');

interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  stats: {
    agents: number;
    skills: number;
    tools: number;
    commands: number;
  };
}

function validateManifest(): string[] {
  const errors: string[] = [];
  const manifestPath = path.join(PLUGIN_ROOT, '.claude-plugin', 'plugin.json');

  if (!fs.existsSync(manifestPath)) {
    errors.push('Missing .claude-plugin/plugin.json');
    return errors;
  }

  try {
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));

    if (!manifest.name) errors.push('Manifest missing "name" field');
    if (!manifest.version) errors.push('Manifest missing "version" field');
    if (!manifest.description) errors.push('Manifest missing "description" field');
  } catch (e) {
    errors.push(`Invalid manifest JSON: ${e}`);
  }

  return errors;
}

function validateRegistries(): { errors: string[]; stats: { agents: number; skills: number; tools: number } } {
  const errors: string[] = [];
  const stats = { agents: 0, skills: 0, tools: 0 };

  const registries = [
    { name: 'agents', path: 'agents/_registry.yaml' },
    { name: 'skills', path: 'skills/_registry.yaml' },
    { name: 'tools', path: 'tools/_registry.yaml' },
  ];

  for (const reg of registries) {
    const regPath = path.join(PLUGIN_ROOT, reg.path);

    if (!fs.existsSync(regPath)) {
      errors.push(`Missing registry: ${reg.path}`);
      continue;
    }

    try {
      const content = yaml.load(fs.readFileSync(regPath, 'utf-8')) as any;

      if (!content.version) {
        errors.push(`Registry ${reg.name} missing version`);
      }

      if (content.search_index) {
        stats[reg.name as keyof typeof stats] = content.search_index.length;
      } else if (content.total) {
        stats[reg.name as keyof typeof stats] = content.total;
      }
    } catch (e) {
      errors.push(`Invalid registry ${reg.name}: ${e}`);
    }
  }

  return { errors, stats };
}

function validateMCP(): string[] {
  const errors: string[] = [];
  const mcpPath = path.join(PLUGIN_ROOT, '.mcp.json');

  if (!fs.existsSync(mcpPath)) {
    errors.push('Missing .mcp.json');
    return errors;
  }

  try {
    const mcp = JSON.parse(fs.readFileSync(mcpPath, 'utf-8'));

    if (!mcp.mcpServers) {
      errors.push('.mcp.json missing mcpServers');
    }
  } catch (e) {
    errors.push(`Invalid .mcp.json: ${e}`);
  }

  return errors;
}

function countCommands(): number {
  const commandsDir = path.join(PLUGIN_ROOT, 'commands');
  if (!fs.existsSync(commandsDir)) return 0;

  return fs.readdirSync(commandsDir).filter((f) => f.endsWith('.md')).length;
}

function main() {
  console.log('Validating GoodVibes Plugin...\n');

  const result: ValidationResult = {
    valid: true,
    errors: [],
    warnings: [],
    stats: { agents: 0, skills: 0, tools: 0, commands: 0 },
  };

  // Validate manifest
  const manifestErrors = validateManifest();
  result.errors.push(...manifestErrors);

  // Validate registries
  const { errors: regErrors, stats } = validateRegistries();
  result.errors.push(...regErrors);
  result.stats = { ...result.stats, ...stats };

  // Validate MCP
  const mcpErrors = validateMCP();
  result.errors.push(...mcpErrors);

  // Count commands
  result.stats.commands = countCommands();

  // Check for empty registries
  if (stats.agents === 0) result.warnings.push('Agents registry is empty');
  if (stats.skills === 0) result.warnings.push('Skills registry is empty');
  if (stats.tools === 0) result.warnings.push('Tools registry is empty');

  // Output results
  result.valid = result.errors.length === 0;

  console.log('Statistics:');
  console.log(`  Agents: ${result.stats.agents}`);
  console.log(`  Skills: ${result.stats.skills}`);
  console.log(`  Tools: ${result.stats.tools}`);
  console.log(`  Commands: ${result.stats.commands}`);
  console.log();

  if (result.errors.length > 0) {
    console.log('Errors:');
    result.errors.forEach((e) => console.log(`  ❌ ${e}`));
    console.log();
  }

  if (result.warnings.length > 0) {
    console.log('Warnings:');
    result.warnings.forEach((w) => console.log(`  ⚠️  ${w}`));
    console.log();
  }

  if (result.valid) {
    console.log('✅ Plugin is valid');
  } else {
    console.log('❌ Plugin has errors');
    process.exit(1);
  }
}

main();
