/**
 * Registry Builder Script
 *
 * Scans agents/, skills/, and tools/ directories to generate
 * searchable _registry.yaml index files.
 *
 * Registry files use an underscore prefix (_registry.yaml) by convention:
 * - Excluded from content scanning (files/dirs starting with _ are skipped)
 * - Visually distinct as generated/metadata files
 * - Appear first in alphabetical directory listings
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

interface ToolDefinition {
  name: string;
  description?: string;
  mcp?: {
    defer_loading?: boolean;
  };
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
 * MCP Server configurations for the 5 focused servers
 */
const MCP_SERVERS = [
  'precision-engine',
  'registry-engine',
  'analytics-engine',
  'project-engine',
  'frontend-engine',
] as const;

/**
 * Parse TypeScript schema files to extract tool definitions from all MCP servers.
 * Handles multi-line descriptions properly.
 */
function parseTypeScriptSchemas(): Map<string, { name: string; description: string; server: string }> {
  const tools = new Map<string, { name: string; description: string; server: string }>();

  for (const server of MCP_SERVERS) {
    const schemasDir = path.join(PLUGIN_ROOT, 'tools', 'implementations', server, 'src', 'schemas');
    const handlersIndexPath = path.join(PLUGIN_ROOT, 'tools', 'implementations', server, 'src', 'handlers', 'index.ts');

    let schemaFiles: string[] = [];
    let baseDir = schemasDir;

    if (fs.existsSync(schemasDir)) {
      schemaFiles = fs.readdirSync(schemasDir).filter(f => f.endsWith('.ts'));
    } else if (fs.existsSync(handlersIndexPath)) {
      // Some servers define schemas in handlers/index.ts
      schemaFiles = ['index.ts'];
      baseDir = path.dirname(handlersIndexPath);
    } else {
      console.warn(`  No schemas found for: ${server}`);
      continue;
    }

    for (const file of schemaFiles) {
      const filePath = path.join(baseDir, file);
      const content = fs.readFileSync(filePath, 'utf-8');

      // Parse tool definitions from the schema file
      // The structure is: { name: 'tool_name', description: '...', inputSchema: {...} }
      // We need to handle multi-line descriptions with template literals or string concatenation

      // Use a more robust approach: find all object literals that have name and description
      const toolObjectRegex = /\{\s*name:\s*['"`]([^'"`]+)['"`]\s*,\s*description:\s*(['"`])([\s\S]*?)\2\s*,/g;
      let match;

      while ((match = toolObjectRegex.exec(content)) !== null) {
        const name = match[1];
        // The description may contain escaped quotes, handle them
        const description = match[3]
          .replace(/\\'/g, "'")
          .replace(/\\"/g, '"')
          .replace(/\\n/g, ' ')
          .replace(/\s+/g, ' ')
          .trim();

        tools.set(name, { name, description, server });
      }

      // Also try template literals for multi-line descriptions
      // Pattern: { name: 'tool_name', description: `...`, inputSchema: {...} }
      const templateRegex = /\{\s*name:\s*['"]([^'"]+)['"]\s*,\s*description:\s*`([^`]*)`\s*,/g;
      while ((match = templateRegex.exec(content)) !== null) {
        const name = match[1];
        const description = match[2].replace(/\s+/g, ' ').trim();
        if (!tools.has(name)) {
          tools.set(name, { name, description, server });
        }
      }
    }

    console.log(`  ${server}: ${Array.from(tools.values()).filter(t => t.server === server).length} tools`);
  }

  return tools;
}

/**
 * Scan YAML definitions and build a map of tool metadata (for enrichment).
 * YAML definitions are now organized by server: registry-engine/, analytics-engine/, etc.
 */
function scanYamlDefinitions(): Map<string, { path: string; description: string; deferLoading: boolean; server: string }> {
  const toolsDir = path.join(PLUGIN_ROOT, 'tools', 'definitions');
  const yamlTools = new Map<string, { path: string; description: string; deferLoading: boolean; server: string }>();

  function scanDir(dir: string, relativePath: string = '', server: string = '') {
    if (!fs.existsSync(dir)) return;

    const items = fs.readdirSync(dir);
    for (const item of items) {
      if (item.startsWith('_') || item.startsWith('.')) continue;

      const fullPath = path.join(dir, item);
      const stat = fs.statSync(fullPath);

      if (stat.isDirectory()) {
        // Check if this is a server directory
        const isServerDir = item.endsWith('-engine');
        const newServer = isServerDir ? item : server;
        const newRelativePath = relativePath ? `${relativePath}/${item}` : item;
        scanDir(fullPath, newRelativePath, newServer);
      } else if (item.endsWith('.yaml') || item.endsWith('.yml')) {
        const content = fs.readFileSync(fullPath, 'utf-8');

        try {
          const tool = yaml.load(content) as ToolDefinition;
          yamlTools.set(tool.name, {
            path: `${relativePath}/${item}`,
            description: tool.description || '',
            deferLoading: tool.mcp?.defer_loading || false,
            server: server || 'unknown'
          });
        } catch (e) {
          console.error(`Error parsing ${item}:`, e);
        }
      }
    }
  }

  scanDir(toolsDir);
  return yamlTools;
}

/**
 * Scan tools - TypeScript schemas are PRIMARY, YAML definitions provide enrichment.
 *
 * Tagging:
 * - 'core': Tools with YAML definitions (rich metadata)
 * - 'mcp': Tools with only TypeScript schemas (basic metadata)
 * - 'deferred': Tools marked as defer_loading in YAML
 */
function scanTools(): (RegistryEntry & { server: string })[] {
  const entries: (RegistryEntry & { server: string })[] = [];

  // PRIMARY: Parse all TypeScript schema files from all 6 MCP servers
  const tsTools = parseTypeScriptSchemas();
  console.log(`  Found ${tsTools.size} tools total from TypeScript schemas`);

  // SECONDARY: Get YAML definitions for enrichment
  const yamlTools = scanYamlDefinitions();
  console.log(`  Found ${yamlTools.size} YAML definitions for enrichment`);

  // Build entries: TypeScript is source of truth for what tools exist
  for (const [name, tsTool] of tsTools) {
    const yamlMeta = yamlTools.get(name);

    // Use TypeScript description as primary, but can fallback to YAML if richer
    let description = tsTool.description;

    // Determine path and tags based on YAML presence
    let toolPath: string;
    let tags: string[];

    if (yamlMeta) {
      toolPath = yamlMeta.path;
      tags = yamlMeta.deferLoading ? ['deferred'] : ['core'];
      // If YAML description is significantly longer, it might be richer
      if (yamlMeta.description.length > description.length * 1.5) {
        description = yamlMeta.description;
      }
    } else {
      toolPath = `${tsTool.server}/${name}`;
      tags = ['mcp'];
    }

    entries.push({
      name,
      path: toolPath,
      description,
      triggers: extractKeywords(description, name),
      tags,
      server: tsTool.server
    });
  }

  return entries;
}

/**
 * Template definition interface
 */
interface TemplateDefinition {
  name: string;
  version?: string;
  description: string;
  stack?: Record<string, string>;
  features?: string[];
}

/**
 * Scan templates directory
 */
function scanTemplates(): Array<{
  name: string;
  path: string;
  description: string;
  category: string;
  stack: string[];
  keywords: string[];
}> {
  const templatesDir = path.join(PLUGIN_ROOT, 'templates');
  const entries: Array<{
    name: string;
    path: string;
    description: string;
    category: string;
    stack: string[];
    keywords: string[];
  }> = [];

  function scanDir(dir: string, category: string = '') {
    if (!fs.existsSync(dir)) return;

    const items = fs.readdirSync(dir);

    // Check if this is a template directory (has template.yaml)
    if (items.includes('template.yaml')) {
      const templatePath = path.join(dir, 'template.yaml');
      const content = fs.readFileSync(templatePath, 'utf-8');

      try {
        const template = yaml.load(content) as TemplateDefinition;
        const name = template.name || path.basename(dir);
        const description = template.description || '';

        // Extract stack values as array
        const stack = template.stack ? Object.values(template.stack) : [];

        // Build keywords from name, description, stack, and features
        const keywords = new Set<string>();
        name.split(/[-_]/).forEach(w => keywords.add(w.toLowerCase()));
        stack.forEach(s => keywords.add(s.toLowerCase()));
        if (template.features) {
          template.features.forEach(f => {
            f.toLowerCase().split(/\s+/).forEach(w => {
              if (w.length > 2) keywords.add(w);
            });
          });
        }

        entries.push({
          name,
          path: category ? `${category}/${path.basename(dir)}` : path.basename(dir),
          description,
          category: category || 'general',
          stack,
          keywords: Array.from(keywords)
        });
      } catch (e) {
        console.error(`Error parsing template.yaml in ${dir}:`, e);
      }
      return; // Don't recurse into template subdirectories
    }

    // Recurse into subdirectories
    for (const item of items) {
      if (item.startsWith('_') || item.startsWith('.')) continue;

      const fullPath = path.join(dir, item);
      const stat = fs.statSync(fullPath);

      if (stat.isDirectory()) {
        scanDir(fullPath, category || item);
      }
    }
  }

  scanDir(templatesDir);
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

  console.log('\nScanning tools from 6 MCP servers...');
  const tools = scanTools();

  // Organize tools by server
  const byServer: Record<string, typeof tools> = {};
  for (const server of MCP_SERVERS) {
    byServer[server] = tools.filter(t => t.server === server);
  }

  // Build registry with server-based organization
  const toolsRegistry = {
    version: '2.0.0',
    generated: new Date().toISOString(),
    total: tools.length,
    servers: MCP_SERVERS.map(server => ({
      name: server,
      count: byServer[server].length,
      tools: byServer[server].map(t => ({
        name: t.name,
        path: t.path,
        description: t.description
      }))
    })),
    search_index: tools.map(e => ({
      name: e.name,
      keywords: e.triggers || [],
      path: e.path,
      description: e.description,
      server: e.server
    }))
  };

  console.log(`\n  Tool breakdown by server:`);
  for (const server of MCP_SERVERS) {
    console.log(`    ${server}: ${byServer[server].length} tools`);
  }

  const toolsPath = path.join(PLUGIN_ROOT, 'tools', '_registry.yaml');
  fs.writeFileSync(toolsPath, yaml.dump(toolsRegistry, { lineWidth: 120 }));
  console.log(`\nWritten ${toolsPath} (${tools.length} entries)`);

  // Scan and write templates registry
  console.log('\nScanning templates...');
  const templates = scanTemplates();

  // Group templates by category
  const byCategory: Record<string, typeof templates> = {};
  for (const t of templates) {
    if (!byCategory[t.category]) byCategory[t.category] = [];
    byCategory[t.category].push(t);
  }

  const templatesRegistry = {
    version: '1.0.0',
    generated: new Date().toISOString(),
    total: templates.length,
    categories: Object.fromEntries(
      Object.entries(byCategory).map(([cat, temps]) => [
        cat,
        {
          description: cat === 'minimal' ? 'Bare-bones starters with essential setup' :
                       cat === 'full' ? 'Full-featured starters with auth, database, and more' :
                       `${cat} templates`,
          templates: temps.map(t => t.name)
        }
      ])
    ),
    templates: templates.map(t => ({
      name: t.name,
      path: t.path,
      description: t.description,
      category: t.category,
      stack: t.stack,
      complexity: t.category === 'minimal' ? 'simple' : 'complex'
    })),
    search_index: templates.map(t => ({
      name: t.name,
      keywords: t.keywords,
      path: t.path,
      description: t.description
    }))
  };

  const templatesPath = path.join(PLUGIN_ROOT, 'templates', '_registry.yaml');
  fs.writeFileSync(templatesPath, yaml.dump(templatesRegistry, { lineWidth: 120 }));
  console.log(`Written ${templatesPath} (${templates.length} entries)`);

  console.log('\nDone!');
}

main();
