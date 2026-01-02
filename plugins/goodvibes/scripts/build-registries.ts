/**
 * Registry Builder Script
 *
 * Scans agents/, skills/, and tools/ directories to generate
 * searchable _registry.yaml index files.
 *
 * Usage: npx tsx scripts/build-registries.ts
 */

import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'js-yaml';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

interface RegistryEntry {
  name: string;
  path: string;
  description: string;
  triggers?: string[];
  tags?: string[];
  category?: string;
}

interface Registry {
  version: string;
  generated: string;
  total: number;
  categories: Record<string, any>;
  search_index: Array<{
    name: string;
    keywords: string[];
    path: string;
    description: string;
  }>;
}

const PLUGIN_ROOT = path.resolve(__dirname, '..');

/**
 * Extract frontmatter from markdown file
 */
function extractFrontmatter(content: string): Record<string, any> | null {
  // Normalize line endings
  const normalized = content.replace(/\r\n/g, '\n');
  const match = normalized.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return null;
  try {
    return yaml.load(match[1]) as Record<string, any>;
  } catch {
    return null;
  }
}

/**
 * Extract keywords from description
 */
function extractKeywords(description: string, name: string): string[] {
  const words = new Set<string>();

  // Add name parts
  name.split(/[-_]/).forEach(w => words.add(w.toLowerCase()));

  // Extract meaningful words from description
  const descWords = description
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 2 && !['the', 'and', 'for', 'use', 'when', 'with'].includes(w));

  descWords.forEach(w => words.add(w));

  return Array.from(words);
}

/**
 * Build nested category structure from flat entries
 */
function buildCategoryTree(entries: RegistryEntry[]): Record<string, any> {
  const tree: Record<string, any> = {};

  for (const entry of entries) {
    const parts = entry.path.split('/');
    let current = tree;

    for (let i = 0; i < parts.length - 1; i++) {
      const part = parts[i];
      if (!current[part]) {
        current[part] = {};
      }
      current = current[part];
    }

    // Add entry to leaf
    const leafKey = parts[parts.length - 1];
    if (!current._items) {
      current._items = [];
    }
    current._items.push({
      name: entry.name,
      path: entry.path,
      description: entry.description,
      triggers: entry.triggers || []
    });
  }

  return tree;
}

/**
 * Scan agents directory
 */
function scanAgents(): RegistryEntry[] {
  const agentsDir = path.join(PLUGIN_ROOT, 'agents');
  const entries: RegistryEntry[] = [];

  function scanDir(dir: string, relativePath: string = '') {
    if (!fs.existsSync(dir)) return;

    const items = fs.readdirSync(dir);
    for (const item of items) {
      if (item.startsWith('_')) continue; // Skip registry files

      const fullPath = path.join(dir, item);
      const stat = fs.statSync(fullPath);

      if (stat.isDirectory()) {
        scanDir(fullPath, relativePath ? `${relativePath}/${item}` : item);
      } else if (item.endsWith('.md')) {
        const content = fs.readFileSync(fullPath, 'utf-8');
        const frontmatter = extractFrontmatter(content);

        if (frontmatter) {
          const name = frontmatter.name || item.replace('.md', '');
          const description = frontmatter.description || '';

          entries.push({
            name,
            path: relativePath ? `${relativePath}/${item.replace('.md', '')}` : item.replace('.md', ''),
            description,
            triggers: extractKeywords(description, name),
            category: relativePath.split('/')[0] || 'general'
          });
        }
      }
    }
  }

  scanDir(agentsDir);
  return entries;
}

/**
 * Scan skills directory
 */
function scanSkills(): RegistryEntry[] {
  const skillsDir = path.join(PLUGIN_ROOT, 'skills');
  const entries: RegistryEntry[] = [];

  function scanDir(dir: string, relativePath: string = '') {
    if (!fs.existsSync(dir)) return;

    const items = fs.readdirSync(dir);

    // Check if this is a skill directory (has SKILL.md)
    if (items.includes('SKILL.md')) {
      const skillPath = path.join(dir, 'SKILL.md');
      const content = fs.readFileSync(skillPath, 'utf-8');
      const frontmatter = extractFrontmatter(content);

      if (frontmatter) {
        const name = frontmatter.name || path.basename(dir);
        const description = frontmatter.description || '';

        entries.push({
          name,
          path: relativePath,
          description,
          triggers: extractKeywords(description, name),
          category: relativePath.split('/')[0] || 'general'
        });
      }
      return; // Don't recurse into skill subdirectories
    }

    // Recurse into subdirectories
    for (const item of items) {
      if (item.startsWith('_') || item.startsWith('.')) continue;

      const fullPath = path.join(dir, item);
      const stat = fs.statSync(fullPath);

      if (stat.isDirectory()) {
        scanDir(fullPath, relativePath ? `${relativePath}/${item}` : item);
      }
    }
  }

  scanDir(skillsDir);
  return entries;
}

/**
 * Scan tools directory
 */
function scanTools(): RegistryEntry[] {
  const toolsDir = path.join(PLUGIN_ROOT, 'tools', 'definitions');
  const entries: RegistryEntry[] = [];

  if (!fs.existsSync(toolsDir)) return entries;

  const items = fs.readdirSync(toolsDir);
  for (const item of items) {
    if (!item.endsWith('.yaml') && !item.endsWith('.yml')) continue;

    const fullPath = path.join(toolsDir, item);
    const content = fs.readFileSync(fullPath, 'utf-8');

    try {
      const tool = yaml.load(content) as any;
      entries.push({
        name: tool.name,
        path: `definitions/${item}`,
        description: tool.description || '',
        triggers: extractKeywords(tool.description || '', tool.name),
        tags: tool.mcp?.defer_loading ? ['deferred'] : ['core']
      });
    } catch (e) {
      console.error(`Error parsing ${item}:`, e);
    }
  }

  return entries;
}

/**
 * Write registry file
 */
function writeRegistry(name: string, entries: RegistryEntry[]) {
  const registry: Registry = {
    version: '1.0.0',
    generated: new Date().toISOString(),
    total: entries.length,
    categories: buildCategoryTree(entries),
    search_index: entries.map(e => ({
      name: e.name,
      keywords: e.triggers || [],
      path: e.path,
      description: e.description
    }))
  };

  const outputPath = path.join(PLUGIN_ROOT, name, '_registry.yaml');
  fs.writeFileSync(outputPath, yaml.dump(registry, { lineWidth: 120 }));
  console.log(`Written ${outputPath} (${entries.length} entries)`);
}

/**
 * Main
 */
function main() {
  console.log('Building registries...\n');

  const agents = scanAgents();
  writeRegistry('agents', agents);

  const skills = scanSkills();
  writeRegistry('skills', skills);

  const tools = scanTools();
  // Tools registry goes in tools/ directory
  const toolsRegistry: Registry = {
    version: '1.0.0',
    generated: new Date().toISOString(),
    total: tools.length,
    categories: {},
    search_index: tools.map(e => ({
      name: e.name,
      keywords: e.triggers || [],
      path: e.path,
      description: e.description
    }))
  };

  // Separate core and deferred tools
  const core = tools.filter(t => t.tags?.includes('core'));
  const deferred = tools.filter(t => t.tags?.includes('deferred'));

  const toolsOutput = {
    ...toolsRegistry,
    core_tools: core.map(t => ({ name: t.name, path: t.path, description: t.description })),
    deferred_tools: deferred.map(t => ({ name: t.name, path: t.path, description: t.description }))
  };

  const toolsPath = path.join(PLUGIN_ROOT, 'tools', '_registry.yaml');
  fs.writeFileSync(toolsPath, yaml.dump(toolsOutput, { lineWidth: 120 }));
  console.log(`Written ${toolsPath} (${tools.length} entries)`);

  console.log('\nDone!');
}

main();
