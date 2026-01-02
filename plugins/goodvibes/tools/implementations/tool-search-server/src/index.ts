/**
 * GoodVibes MCP Server
 *
 * Comprehensive tool server providing:
 * - Search capabilities (skills, agents, tools)
 * - Context gathering (detect stack, check versions, scan patterns)
 * - Live data (fetch docs, get schema, read config)
 * - Validation (validate implementation, smoke test, type check)
 * - Meta tools (recommend skills, skill dependencies)
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import Fuse, { IFuseOptions } from 'fuse.js';
import * as yaml from 'js-yaml';
import * as fs from 'fs';
import * as path from 'path';
import { execSync, exec } from 'child_process';
import { promisify } from 'util';
import * as https from 'https';
import * as http from 'http';

const execAsync = promisify(exec);

// Types
interface RegistryEntry {
  name: string;
  path: string;
  description: string;
  keywords?: string[];
  category?: string;
}

interface Registry {
  version: string;
  search_index: RegistryEntry[];
}

interface SearchResult {
  name: string;
  path: string;
  description: string;
  relevance: number;
}

interface StackInfo {
  frontend: {
    framework?: string;
    ui_library?: string;
    styling?: string;
    state_management?: string;
  };
  backend: {
    runtime?: string;
    framework?: string;
    database?: string;
    orm?: string;
  };
  build: {
    bundler?: string;
    package_manager?: string;
    typescript: boolean;
  };
  detected_configs: string[];
  recommended_skills: string[];
}

interface PackageInfo {
  name: string;
  installed: string;
  latest?: string;
  wanted?: string;
  outdated: boolean;
  breaking_changes?: boolean;
}

// Configuration
const PLUGIN_ROOT = process.env.PLUGIN_ROOT || path.resolve(__dirname, '../../..');
const PROJECT_ROOT = process.env.PROJECT_ROOT || process.cwd();

// Fuse.js options for fuzzy search
const FUSE_OPTIONS: IFuseOptions<RegistryEntry> = {
  keys: [
    { name: 'name', weight: 0.3 },
    { name: 'description', weight: 0.4 },
    { name: 'keywords', weight: 0.3 },
  ],
  threshold: 0.4,
  includeScore: true,
  ignoreLocation: true,
};

/**
 * Load registry from YAML file
 */
function loadRegistry(registryPath: string): Registry | null {
  try {
    const fullPath = path.join(PLUGIN_ROOT, registryPath);
    if (!fs.existsSync(fullPath)) {
      console.error(`Registry not found: ${fullPath}`);
      return null;
    }
    const content = fs.readFileSync(fullPath, 'utf-8');
    return yaml.load(content) as Registry;
  } catch (error) {
    console.error(`Error loading registry ${registryPath}:`, error);
    return null;
  }
}

/**
 * Create Fuse index from registry
 */
function createIndex(registry: Registry | null): Fuse<RegistryEntry> | null {
  if (!registry || !registry.search_index) return null;
  return new Fuse(registry.search_index, FUSE_OPTIONS);
}

/**
 * Perform search and return formatted results
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
 * Safely read JSON file
 */
function readJsonFile(filePath: string): Record<string, unknown> | null {
  try {
    if (!fs.existsSync(filePath)) return null;
    const content = fs.readFileSync(filePath, 'utf-8');
    return JSON.parse(content);
  } catch {
    return null;
  }
}

/**
 * Execute command safely with timeout
 */
async function safeExec(
  command: string,
  cwd: string,
  timeout: number = 30000
): Promise<{ stdout: string; stderr: string; error?: string }> {
  try {
    const { stdout, stderr } = await execAsync(command, { cwd, timeout });
    return { stdout: stdout.trim(), stderr: stderr.trim() };
  } catch (error: unknown) {
    const err = error as { stdout?: string; stderr?: string; message?: string };
    return {
      stdout: err.stdout || '',
      stderr: err.stderr || '',
      error: err.message || 'Command failed',
    };
  }
}

/**
 * Detect package manager in use
 */
function detectPackageManager(projectPath: string): string {
  if (fs.existsSync(path.join(projectPath, 'pnpm-lock.yaml'))) return 'pnpm';
  if (fs.existsSync(path.join(projectPath, 'yarn.lock'))) return 'yarn';
  if (fs.existsSync(path.join(projectPath, 'bun.lockb'))) return 'bun';
  return 'npm';
}

/**
 * Main server class
 */
class GoodVibesServer {
  private server: Server;
  private skillsIndex: Fuse<RegistryEntry> | null = null;
  private agentsIndex: Fuse<RegistryEntry> | null = null;
  private toolsIndex: Fuse<RegistryEntry> | null = null;
  private skillsRegistry: Registry | null = null;

  constructor() {
    this.server = new Server(
      {
        name: 'goodvibes-tools',
        version: '2.1.0',
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    this.setupHandlers();
  }

  /**
   * Initialize search indexes
   */
  private initializeIndexes(): void {
    console.error('Initializing indexes from:', PLUGIN_ROOT);

    this.skillsRegistry = loadRegistry('skills/_registry.yaml');
    this.skillsIndex = createIndex(this.skillsRegistry);
    console.error(`Skills index: ${this.skillsRegistry?.search_index?.length || 0} entries`);

    const agentsRegistry = loadRegistry('agents/_registry.yaml');
    this.agentsIndex = createIndex(agentsRegistry);
    console.error(`Agents index: ${agentsRegistry?.search_index?.length || 0} entries`);

    const toolsRegistry = loadRegistry('tools/_registry.yaml');
    this.toolsIndex = createIndex(toolsRegistry);
    console.error(`Tools index: ${toolsRegistry?.search_index?.length || 0} entries`);
  }

  /**
   * Setup request handlers
   */
  private setupHandlers(): void {
    // List available tools
    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: [
        // Core search tools
        {
          name: 'search_skills',
          description: 'Search the skill registry for relevant skills based on keywords or task description',
          inputSchema: {
            type: 'object',
            properties: {
              query: { type: 'string', description: 'Natural language query or keywords' },
              category: { type: 'string', description: 'Optional category filter' },
              limit: { type: 'integer', description: 'Max results (default: 5)', default: 5 },
            },
            required: ['query'],
          },
        },
        {
          name: 'search_agents',
          description: 'Search for specialized agents by expertise area',
          inputSchema: {
            type: 'object',
            properties: {
              query: { type: 'string', description: 'Keywords describing expertise needed' },
              limit: { type: 'integer', description: 'Max results (default: 5)', default: 5 },
            },
            required: ['query'],
          },
        },
        {
          name: 'search_tools',
          description: 'Search for available tools by functionality',
          inputSchema: {
            type: 'object',
            properties: {
              query: { type: 'string', description: 'Keywords describing tool functionality' },
              limit: { type: 'integer', description: 'Max results (default: 5)', default: 5 },
            },
            required: ['query'],
          },
        },
        {
          name: 'recommend_skills',
          description: 'Analyze task and recommend relevant skills',
          inputSchema: {
            type: 'object',
            properties: {
              task: { type: 'string', description: 'Natural language task description' },
              max_results: { type: 'integer', description: 'Max recommendations (default: 5)', default: 5 },
            },
            required: ['task'],
          },
        },
        // Content retrieval
        {
          name: 'get_skill_content',
          description: 'Load full content of a skill by path',
          inputSchema: {
            type: 'object',
            properties: {
              path: { type: 'string', description: 'Skill path from registry' },
            },
            required: ['path'],
          },
        },
        {
          name: 'get_agent_content',
          description: 'Load full content of an agent by path',
          inputSchema: {
            type: 'object',
            properties: {
              path: { type: 'string', description: 'Agent path from registry' },
            },
            required: ['path'],
          },
        },
        {
          name: 'skill_dependencies',
          description: 'Show skill relationships and dependencies',
          inputSchema: {
            type: 'object',
            properties: {
              skill: { type: 'string', description: 'Skill to analyze' },
              depth: { type: 'integer', description: 'Dependency tree depth (default: 2)', default: 2 },
              include_optional: { type: 'boolean', description: 'Include optional deps', default: true },
            },
            required: ['skill'],
          },
        },
        // Context gathering
        {
          name: 'detect_stack',
          description: 'Analyze project to identify technology stack',
          inputSchema: {
            type: 'object',
            properties: {
              path: { type: 'string', description: 'Project root path', default: '.' },
              deep: { type: 'boolean', description: 'Deep analysis', default: false },
            },
          },
        },
        {
          name: 'check_versions',
          description: 'Get installed package versions',
          inputSchema: {
            type: 'object',
            properties: {
              packages: { type: 'array', items: { type: 'string' }, description: 'Packages to check' },
              check_latest: { type: 'boolean', description: 'Compare against latest', default: false },
              path: { type: 'string', description: 'Project path', default: '.' },
            },
          },
        },
        {
          name: 'scan_patterns',
          description: 'Identify existing code patterns and conventions',
          inputSchema: {
            type: 'object',
            properties: {
              path: { type: 'string', description: 'Directory to scan', default: 'src' },
              pattern_types: {
                type: 'array',
                items: { type: 'string' },
                description: 'Pattern types to detect',
                default: ['all'],
              },
            },
          },
        },
        // Live data
        {
          name: 'fetch_docs',
          description: 'Fetch current documentation for a library',
          inputSchema: {
            type: 'object',
            properties: {
              library: { type: 'string', description: 'Library or framework name' },
              topic: { type: 'string', description: 'Specific topic to look up' },
              version: { type: 'string', description: 'Specific version', default: 'latest' },
            },
            required: ['library'],
          },
        },
        {
          name: 'get_schema',
          description: 'Introspect database schema',
          inputSchema: {
            type: 'object',
            properties: {
              source: {
                type: 'string',
                enum: ['prisma', 'drizzle', 'typeorm', 'sql'],
                description: 'Schema source type',
              },
              path: { type: 'string', description: 'Path to schema file', default: '.' },
              tables: { type: 'array', items: { type: 'string' }, description: 'Filter tables' },
            },
            required: ['source'],
          },
        },
        {
          name: 'read_config',
          description: 'Parse existing configuration files',
          inputSchema: {
            type: 'object',
            properties: {
              config: {
                type: 'string',
                enum: ['package.json', 'tsconfig', 'eslint', 'prettier', 'tailwind', 'next', 'vite', 'prisma', 'env', 'custom'],
                description: 'Config type or filename',
              },
              path: { type: 'string', description: 'Custom path' },
              resolve_extends: { type: 'boolean', description: 'Resolve extended configs', default: true },
            },
            required: ['config'],
          },
        },
        // Validation
        {
          name: 'validate_implementation',
          description: 'Check code matches skill patterns',
          inputSchema: {
            type: 'object',
            properties: {
              files: { type: 'array', items: { type: 'string' }, description: 'Files to validate' },
              skill: { type: 'string', description: 'Skill that was applied' },
              checks: {
                type: 'array',
                items: { type: 'string' },
                description: 'Validation checks to run',
                default: ['all'],
              },
            },
            required: ['files'],
          },
        },
        {
          name: 'run_smoke_test',
          description: 'Quick verification generated code works',
          inputSchema: {
            type: 'object',
            properties: {
              type: {
                type: 'string',
                enum: ['build', 'typecheck', 'lint', 'import', 'all'],
                description: 'Type of smoke test',
                default: 'all',
              },
              files: { type: 'array', items: { type: 'string' }, description: 'Specific files to test' },
              timeout: { type: 'integer', description: 'Timeout in seconds', default: 30 },
            },
          },
        },
        {
          name: 'check_types',
          description: 'Run TypeScript type checking',
          inputSchema: {
            type: 'object',
            properties: {
              files: { type: 'array', items: { type: 'string' }, description: 'Files to check' },
              strict: { type: 'boolean', description: 'Use strict mode', default: false },
              include_suggestions: { type: 'boolean', description: 'Include fix suggestions', default: true },
            },
          },
        },
        // Scaffolding
        {
          name: 'scaffold_project',
          description: 'Create a new project from a template',
          inputSchema: {
            type: 'object',
            properties: {
              template: { type: 'string', description: 'Template name (next-app, vite-react, next-saas)' },
              output_dir: { type: 'string', description: 'Output directory for new project' },
              variables: { type: 'object', description: 'Template variables', additionalProperties: true },
              run_install: { type: 'boolean', description: 'Run npm install', default: true },
              run_git_init: { type: 'boolean', description: 'Initialize git', default: true },
            },
            required: ['template', 'output_dir'],
          },
        },
        {
          name: 'list_templates',
          description: 'List available project templates',
          inputSchema: {
            type: 'object',
            properties: {
              category: { type: 'string', description: 'Filter by category (minimal, full)' },
            },
          },
        },
      ],
    }));

    // Handle tool calls
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      try {
        switch (name) {
          // Search tools
          case 'search_skills':
            return this.handleSearchSkills(args as { query: string; category?: string; limit?: number });
          case 'search_agents':
            return this.handleSearchAgents(args as { query: string; limit?: number });
          case 'search_tools':
            return this.handleSearchTools(args as { query: string; limit?: number });
          case 'recommend_skills':
            return this.handleRecommendSkills(args as { task: string; max_results?: number });

          // Content retrieval
          case 'get_skill_content':
            return this.handleGetSkillContent(args as { path: string });
          case 'get_agent_content':
            return this.handleGetAgentContent(args as { path: string });
          case 'skill_dependencies':
            return this.handleSkillDependencies(args as { skill: string; depth?: number; include_optional?: boolean });

          // Context gathering
          case 'detect_stack':
            return this.handleDetectStack(args as { path?: string; deep?: boolean });
          case 'check_versions':
            return this.handleCheckVersions(args as { packages?: string[]; check_latest?: boolean; path?: string });
          case 'scan_patterns':
            return this.handleScanPatterns(args as { path?: string; pattern_types?: string[] });

          // Live data
          case 'fetch_docs':
            return this.handleFetchDocs(args as { library: string; topic?: string; version?: string });
          case 'get_schema':
            return this.handleGetSchema(args as { source: string; path?: string; tables?: string[] });
          case 'read_config':
            return this.handleReadConfig(args as { config: string; path?: string; resolve_extends?: boolean });

          // Validation
          case 'validate_implementation':
            return this.handleValidateImplementation(args as { files: string[]; skill?: string; checks?: string[] });
          case 'run_smoke_test':
            return this.handleRunSmokeTest(args as { type?: string; files?: string[]; timeout?: number });
          case 'check_types':
            return this.handleCheckTypes(args as { files?: string[]; strict?: boolean; include_suggestions?: boolean });

          // Scaffolding
          case 'scaffold_project':
            return this.handleScaffoldProject(args as { template: string; output_dir: string; variables?: Record<string, string>; run_install?: boolean; run_git_init?: boolean });
          case 'list_templates':
            return this.handleListTemplates(args as { category?: string });

          default:
            throw new Error(`Unknown tool: ${name}`);
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        return {
          content: [{ type: 'text', text: JSON.stringify({ error: message }) }],
          isError: true,
        };
      }
    });
  }

  // ============ Search Handlers ============

  private handleSearchSkills(args: { query: string; category?: string; limit?: number }) {
    const results = search(this.skillsIndex, args.query, args.limit || 5);
    const filtered = args.category
      ? results.filter((r) => r.path.startsWith(args.category!))
      : results;

    return {
      content: [{
        type: 'text',
        text: JSON.stringify({ skills: filtered, total_count: filtered.length, query: args.query }, null, 2),
      }],
    };
  }

  private handleSearchAgents(args: { query: string; limit?: number }) {
    const results = search(this.agentsIndex, args.query, args.limit || 5);
    return {
      content: [{
        type: 'text',
        text: JSON.stringify({ agents: results, total_count: results.length, query: args.query }, null, 2),
      }],
    };
  }

  private handleSearchTools(args: { query: string; limit?: number }) {
    const results = search(this.toolsIndex, args.query, args.limit || 5);
    return {
      content: [{
        type: 'text',
        text: JSON.stringify({ tools: results, total_count: results.length, query: args.query }, null, 2),
      }],
    };
  }

  private handleRecommendSkills(args: { task: string; max_results?: number }) {
    // Extract keywords from task
    const keywords = args.task.toLowerCase().split(/\s+/).filter(w => w.length > 3);

    // Search with combined query
    const results = search(this.skillsIndex, args.task, args.max_results || 5);

    // Analyze task for category hints
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

    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          recommendations,
          task_analysis: {
            category,
            keywords: keywords.slice(0, 10),
            complexity: keywords.length > 10 ? 'complex' : keywords.length > 5 ? 'moderate' : 'simple',
          },
        }, null, 2),
      }],
    };
  }

  // ============ Content Retrieval Handlers ============

  private handleGetSkillContent(args: { path: string }) {
    // Try multiple path patterns
    const attempts = [
      path.join(PLUGIN_ROOT, 'skills', args.path, 'SKILL.md'),
      path.join(PLUGIN_ROOT, 'skills', args.path + '.md'),
      path.join(PLUGIN_ROOT, 'skills', args.path),
    ];

    for (const skillPath of attempts) {
      if (fs.existsSync(skillPath)) {
        const content = fs.readFileSync(skillPath, 'utf-8');
        return { content: [{ type: 'text', text: content }] };
      }
    }

    throw new Error(`Skill not found: ${args.path}`);
  }

  private handleGetAgentContent(args: { path: string }) {
    const attempts = [
      path.join(PLUGIN_ROOT, 'agents', `${args.path}.md`),
      path.join(PLUGIN_ROOT, 'agents', args.path),
      path.join(PLUGIN_ROOT, 'agents', args.path, 'index.md'),
    ];

    for (const agentPath of attempts) {
      if (fs.existsSync(agentPath)) {
        const content = fs.readFileSync(agentPath, 'utf-8');
        return { content: [{ type: 'text', text: content }] };
      }
    }

    throw new Error(`Agent not found: ${args.path}`);
  }

  private handleSkillDependencies(args: { skill: string; depth?: number; include_optional?: boolean }) {
    // Search for the skill
    const results = search(this.skillsIndex, args.skill, 1);
    if (results.length === 0) {
      throw new Error(`Skill not found: ${args.skill}`);
    }

    const skill = results[0];
    const depth = args.depth || 2;
    const includeOptional = args.include_optional !== false;

    // Load and parse the skill file to get actual dependencies
    const skillMetadata = this.parseSkillMetadata(skill.path);

    // Build dependency tree
    const required: Array<{ skill: string; path: string; reason: string }> = [];
    const optional: Array<{ skill: string; path: string; reason: string }> = [];
    const conflicts: Array<{ skill: string; path: string; reason: string }> = [];
    const dependents: Array<{ skill: string; path: string }> = [];

    // Parse dependencies from skill metadata
    if (skillMetadata.requires) {
      for (const req of skillMetadata.requires) {
        const reqResult = search(this.skillsIndex, req, 1);
        if (reqResult.length > 0) {
          required.push({
            skill: reqResult[0].name,
            path: reqResult[0].path,
            reason: 'Listed as required dependency',
          });

          // Recursively get nested dependencies if depth allows
          if (depth > 1) {
            const nestedMeta = this.parseSkillMetadata(reqResult[0].path);
            if (nestedMeta.requires) {
              for (const nested of nestedMeta.requires.slice(0, 3)) {
                const nestedResult = search(this.skillsIndex, nested, 1);
                if (nestedResult.length > 0 && !required.find(r => r.path === nestedResult[0].path)) {
                  required.push({
                    skill: nestedResult[0].name,
                    path: nestedResult[0].path,
                    reason: `Required by ${reqResult[0].name}`,
                  });
                }
              }
            }
          }
        }
      }
    }

    // Parse optional/complementary skills
    if (includeOptional && skillMetadata.complements) {
      for (const comp of skillMetadata.complements) {
        const compResult = search(this.skillsIndex, comp, 1);
        if (compResult.length > 0) {
          optional.push({
            skill: compResult[0].name,
            path: compResult[0].path,
            reason: 'Listed as complementary skill',
          });
        }
      }
    }

    // Parse conflicts
    if (skillMetadata.conflicts) {
      for (const conf of skillMetadata.conflicts) {
        const confResult = search(this.skillsIndex, conf, 1);
        if (confResult.length > 0) {
          conflicts.push({
            skill: confResult[0].name,
            path: confResult[0].path,
            reason: 'Listed as conflicting skill',
          });
        }
      }
    }

    // Find skills that depend on this one (reverse lookup)
    if (this.skillsRegistry?.search_index) {
      for (const entry of this.skillsRegistry.search_index) {
        if (entry.path === skill.path) continue;
        const entryMeta = this.parseSkillMetadata(entry.path);
        if (entryMeta.requires?.some(r =>
          r.toLowerCase().includes(skill.name.toLowerCase()) ||
          skill.path.includes(r)
        )) {
          dependents.push({ skill: entry.name, path: entry.path });
        }
      }
    }

    // Find related skills by category and technology overlap
    const skillPath = skill.path;
    const category = skillPath.split('/')[0];

    // Search for complementary skills in same category if we don't have enough optional
    if (optional.length < 3) {
      const related = search(this.skillsIndex, category, 10)
        .filter(r => r.path !== skillPath && !optional.find(o => o.path === r.path))
        .slice(0, 5 - optional.length);

      for (const r of related) {
        optional.push({
          skill: r.name,
          path: r.path,
          reason: 'Related skill in same category',
        });
      }
    }

    // Build suggested bundle
    const suggestedBundle = [skill.path];
    for (const req of required.slice(0, 3)) {
      suggestedBundle.push(req.path);
    }
    for (const opt of optional.slice(0, 2)) {
      if (!suggestedBundle.includes(opt.path)) {
        suggestedBundle.push(opt.path);
      }
    }

    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          skill: skill.name,
          path: skill.path,
          metadata: {
            category: skillMetadata.category || category,
            technologies: skillMetadata.technologies || [],
            difficulty: skillMetadata.difficulty,
          },
          dependencies: {
            required,
            optional: optional.slice(0, 5),
            conflicts,
          },
          dependents: dependents.slice(0, 5),
          suggested_bundle: suggestedBundle,
          analysis: {
            has_prerequisites: required.length > 0,
            has_conflicts: conflicts.length > 0,
            dependency_count: required.length + optional.length,
            is_foundational: dependents.length > 2,
          },
        }, null, 2),
      }],
    };
  }

  /**
   * Parse skill metadata from YAML frontmatter
   */
  private parseSkillMetadata(skillPath: string): {
    requires?: string[];
    complements?: string[];
    conflicts?: string[];
    category?: string;
    technologies?: string[];
    difficulty?: string;
  } {
    const attempts = [
      path.join(PLUGIN_ROOT, 'skills', skillPath, 'SKILL.md'),
      path.join(PLUGIN_ROOT, 'skills', skillPath + '.md'),
      path.join(PLUGIN_ROOT, 'skills', skillPath),
    ];

    for (const filePath of attempts) {
      if (fs.existsSync(filePath)) {
        try {
          const content = fs.readFileSync(filePath, 'utf-8');

          // Parse YAML frontmatter
          const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---/);
          if (frontmatterMatch) {
            const frontmatter = yaml.load(frontmatterMatch[1]) as Record<string, unknown>;
            return {
              requires: Array.isArray(frontmatter.requires) ? frontmatter.requires : undefined,
              complements: Array.isArray(frontmatter.complements) ? frontmatter.complements :
                          Array.isArray(frontmatter.related) ? frontmatter.related : undefined,
              conflicts: Array.isArray(frontmatter.conflicts) ? frontmatter.conflicts : undefined,
              category: typeof frontmatter.category === 'string' ? frontmatter.category : undefined,
              technologies: Array.isArray(frontmatter.technologies) ? frontmatter.technologies :
                           Array.isArray(frontmatter.tech) ? frontmatter.tech : undefined,
              difficulty: typeof frontmatter.difficulty === 'string' ? frontmatter.difficulty : undefined,
            };
          }

          // Try to extract metadata from content if no frontmatter
          const metadata: {
            requires?: string[];
            complements?: string[];
            conflicts?: string[];
            technologies?: string[];
          } = {};

          // Look for "Requires:" or "Prerequisites:" sections
          const requiresMatch = content.match(/(?:Requires|Prerequisites|Dependencies):\s*\n((?:\s*-\s*.+\n)+)/i);
          if (requiresMatch) {
            metadata.requires = requiresMatch[1].match(/-\s*(.+)/g)?.map(m => m.replace(/^-\s*/, '').trim()) || [];
          }

          // Look for "Related:" or "See also:" sections
          const relatedMatch = content.match(/(?:Related|See also|Complements):\s*\n((?:\s*-\s*.+\n)+)/i);
          if (relatedMatch) {
            metadata.complements = relatedMatch[1].match(/-\s*(.+)/g)?.map(m => m.replace(/^-\s*/, '').trim()) || [];
          }

          // Extract technologies from content
          const techKeywords = ['react', 'next', 'nextjs', 'prisma', 'drizzle', 'tailwind', 'typescript', 'node', 'express', 'vite', 'vitest', 'jest', 'zustand', 'zod', 'trpc'];
          const contentLower = content.toLowerCase();
          metadata.technologies = techKeywords.filter(t => contentLower.includes(t));

          return metadata;
        } catch {
          return {};
        }
      }
    }

    return {};
  }

  // ============ Context Gathering Handlers ============

  private handleDetectStack(args: { path?: string; deep?: boolean }) {
    const projectPath = path.resolve(PROJECT_ROOT, args.path || '.');
    const stack: StackInfo = {
      frontend: {},
      backend: {},
      build: { typescript: false },
      detected_configs: [],
      recommended_skills: [],
    };

    // Read package.json
    const pkg = readJsonFile(path.join(projectPath, 'package.json')) as Record<string, Record<string, string>> | null;
    const deps = { ...pkg?.dependencies, ...pkg?.devDependencies };

    // Detect frontend
    if (deps?.['next']) { stack.frontend.framework = 'next'; stack.recommended_skills.push('webdev/meta-frameworks/nextjs'); }
    else if (deps?.['nuxt']) { stack.frontend.framework = 'nuxt'; stack.recommended_skills.push('webdev/meta-frameworks/nuxt'); }
    else if (deps?.['@remix-run/react']) { stack.frontend.framework = 'remix'; }
    else if (deps?.['astro']) { stack.frontend.framework = 'astro'; }

    if (deps?.['react']) { stack.frontend.ui_library = 'react'; }
    else if (deps?.['vue']) { stack.frontend.ui_library = 'vue'; }
    else if (deps?.['svelte']) { stack.frontend.ui_library = 'svelte'; }

    if (deps?.['tailwindcss']) { stack.frontend.styling = 'tailwind'; stack.recommended_skills.push('webdev/styling/tailwind'); }
    else if (deps?.['styled-components']) { stack.frontend.styling = 'styled-components'; }
    else if (deps?.['@emotion/react']) { stack.frontend.styling = 'emotion'; }

    if (deps?.['zustand']) { stack.frontend.state_management = 'zustand'; stack.recommended_skills.push('webdev/state-management/zustand'); }
    else if (deps?.['@reduxjs/toolkit']) { stack.frontend.state_management = 'redux'; }
    else if (deps?.['jotai']) { stack.frontend.state_management = 'jotai'; }
    else if (deps?.['recoil']) { stack.frontend.state_management = 'recoil'; }

    // Detect backend
    stack.backend.runtime = 'node';
    if (deps?.['express']) { stack.backend.framework = 'express'; }
    else if (deps?.['fastify']) { stack.backend.framework = 'fastify'; }
    else if (deps?.['hono']) { stack.backend.framework = 'hono'; }
    else if (deps?.['next']) { stack.backend.framework = 'next-api'; }

    if (deps?.['prisma'] || deps?.['@prisma/client']) {
      stack.backend.orm = 'prisma';
      stack.recommended_skills.push('webdev/databases-orms/prisma');
    }
    else if (deps?.['drizzle-orm']) { stack.backend.orm = 'drizzle'; stack.recommended_skills.push('webdev/databases-orms/drizzle'); }
    else if (deps?.['typeorm']) { stack.backend.orm = 'typeorm'; }

    // Detect build
    stack.build.package_manager = detectPackageManager(projectPath);
    stack.build.typescript = !!deps?.['typescript'] || fs.existsSync(path.join(projectPath, 'tsconfig.json'));

    if (deps?.['vite']) { stack.build.bundler = 'vite'; stack.recommended_skills.push('webdev/build-tools/vite'); }
    else if (deps?.['turbo']) { stack.build.bundler = 'turbopack'; }
    else if (deps?.['webpack']) { stack.build.bundler = 'webpack'; }
    else if (deps?.['esbuild']) { stack.build.bundler = 'esbuild'; }

    // Detect config files
    const configFiles = [
      'next.config.js', 'next.config.mjs', 'next.config.ts',
      'vite.config.ts', 'vite.config.js',
      'tailwind.config.js', 'tailwind.config.ts',
      'tsconfig.json',
      'prisma/schema.prisma',
      '.eslintrc.js', '.eslintrc.json', 'eslint.config.js',
      '.prettierrc', '.prettierrc.json',
      'drizzle.config.ts',
    ];

    for (const config of configFiles) {
      if (fs.existsSync(path.join(projectPath, config))) {
        stack.detected_configs.push(config);
      }
    }

    return {
      content: [{ type: 'text', text: JSON.stringify(stack, null, 2) }],
    };
  }

  private async handleCheckVersions(args: { packages?: string[]; check_latest?: boolean; path?: string }) {
    const projectPath = path.resolve(PROJECT_ROOT, args.path || '.');
    const pkg = readJsonFile(path.join(projectPath, 'package.json')) as Record<string, Record<string, string>> | null;

    if (!pkg) {
      throw new Error('package.json not found');
    }

    const deps = { ...pkg.dependencies, ...pkg.devDependencies };
    const packagesToCheck = args.packages?.length ? args.packages : Object.keys(deps).slice(0, 20);

    const packages: PackageInfo[] = [];

    for (const name of packagesToCheck) {
      const installed = deps[name] || 'not installed';
      const pkgInfo: PackageInfo = {
        name,
        installed,
        outdated: false,
      };

      // Fetch latest version from npm registry if requested
      if (args.check_latest && installed !== 'not installed') {
        try {
          const npmInfo = await this.fetchNpmPackageInfo(name);
          if (npmInfo) {
            pkgInfo.latest = npmInfo.latest;
            pkgInfo.wanted = npmInfo.wanted || installed;

            // Parse versions for comparison
            const installedClean = installed.replace(/^[\^~>=<]+/, '');
            const latestClean = npmInfo.latest;

            // Check if outdated
            if (installedClean !== latestClean) {
              pkgInfo.outdated = true;

              // Check for breaking changes (major version bump)
              const installedMajor = parseInt(installedClean.split('.')[0]) || 0;
              const latestMajor = parseInt(latestClean.split('.')[0]) || 0;
              pkgInfo.breaking_changes = latestMajor > installedMajor;
            }
          }
        } catch {
          // If npm lookup fails, continue without latest info
        }
      }

      packages.push(pkgInfo);
    }

    const outdatedCount = packages.filter(p => p.outdated).length;
    const majorUpdates = packages.filter(p => p.breaking_changes).length;

    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          packages,
          summary: {
            total: packages.length,
            outdated: outdatedCount,
            major_updates: majorUpdates,
            up_to_date: packages.length - outdatedCount,
          },
        }, null, 2),
      }],
    };
  }

  /**
   * Fetch package info from npm registry
   */
  private async fetchNpmPackageInfo(packageName: string): Promise<{ latest: string; wanted?: string } | null> {
    try {
      // Use npm view command which is more reliable than direct registry calls
      const result = await safeExec(`npm view ${packageName} version`, PROJECT_ROOT, 10000);
      if (result.error || !result.stdout) {
        return null;
      }

      const latest = result.stdout.trim();

      // Also get dist-tags for wanted version
      const tagsResult = await safeExec(`npm view ${packageName} dist-tags --json`, PROJECT_ROOT, 10000);
      let wanted: string | undefined;
      if (!tagsResult.error && tagsResult.stdout) {
        try {
          const tags = JSON.parse(tagsResult.stdout);
          wanted = tags.latest;
        } catch {
          // Ignore parse errors
        }
      }

      return { latest, wanted };
    } catch {
      return null;
    }
  }

  private handleScanPatterns(args: { path?: string; pattern_types?: string[] }) {
    const scanPath = path.resolve(PROJECT_ROOT, args.path || 'src');

    const patterns = {
      naming: {
        components: 'PascalCase',
        files: 'kebab-case',
        functions: 'camelCase',
        variables: 'camelCase',
      },
      structure: {
        component_pattern: 'unknown',
        colocation: false,
        barrel_exports: false,
      },
      architecture: {
        pattern: 'unknown',
        layers: [] as string[],
        state_location: 'unknown',
      },
      testing: {
        framework: 'unknown',
        location: 'unknown',
        naming: 'unknown',
      },
      styling: {
        approach: 'unknown',
        class_naming: 'unknown',
      },
    };

    // Check for common patterns
    if (fs.existsSync(scanPath)) {
      // Check for barrel exports
      if (fs.existsSync(path.join(scanPath, 'index.ts')) || fs.existsSync(path.join(scanPath, 'index.js'))) {
        patterns.structure.barrel_exports = true;
      }

      // Check for components folder
      if (fs.existsSync(path.join(scanPath, 'components'))) {
        patterns.architecture.layers.push('components');
      }
      if (fs.existsSync(path.join(scanPath, 'lib'))) {
        patterns.architecture.layers.push('lib');
      }
      if (fs.existsSync(path.join(scanPath, 'utils'))) {
        patterns.architecture.layers.push('utils');
      }
      if (fs.existsSync(path.join(scanPath, 'hooks'))) {
        patterns.architecture.layers.push('hooks');
      }
      if (fs.existsSync(path.join(scanPath, 'services'))) {
        patterns.architecture.layers.push('services');
      }

      // Check for test files
      const projectRoot = path.resolve(scanPath, '..');
      if (fs.existsSync(path.join(projectRoot, '__tests__'))) {
        patterns.testing.location = '__tests__';
      } else if (fs.existsSync(path.join(projectRoot, 'tests'))) {
        patterns.testing.location = 'tests';
      }

      // Check for test framework
      const pkg = readJsonFile(path.join(projectRoot, 'package.json')) as Record<string, Record<string, string>> | null;
      const deps = { ...pkg?.dependencies, ...pkg?.devDependencies };
      if (deps?.['vitest']) patterns.testing.framework = 'vitest';
      else if (deps?.['jest']) patterns.testing.framework = 'jest';
      else if (deps?.['@playwright/test']) patterns.testing.framework = 'playwright';

      // Check styling
      if (deps?.['tailwindcss']) {
        patterns.styling.approach = 'utility-first';
        patterns.styling.class_naming = 'tailwind';
      } else if (deps?.['styled-components']) {
        patterns.styling.approach = 'css-in-js';
      }
    }

    return {
      content: [{ type: 'text', text: JSON.stringify(patterns, null, 2) }],
    };
  }

  // ============ Live Data Handlers ============

  private async handleFetchDocs(args: { library: string; topic?: string; version?: string }) {
    const library = args.library.toLowerCase();
    const topic = args.topic?.toLowerCase();

    // Documentation sources with API endpoints or scrapeable pages
    const docsSources: Record<string, {
      url: string;
      api?: string;
      searchUrl?: (topic: string) => string;
      type: 'npm' | 'github' | 'website';
    }> = {
      'react': { url: 'https://react.dev', type: 'website', searchUrl: (t) => `https://react.dev/reference/react/${t}` },
      'next': { url: 'https://nextjs.org/docs', type: 'website', searchUrl: (t) => `https://nextjs.org/docs/${t}` },
      'nextjs': { url: 'https://nextjs.org/docs', type: 'website', searchUrl: (t) => `https://nextjs.org/docs/${t}` },
      'prisma': { url: 'https://www.prisma.io/docs', type: 'website', searchUrl: (t) => `https://www.prisma.io/docs/concepts/${t}` },
      'tailwind': { url: 'https://tailwindcss.com/docs', type: 'website', searchUrl: (t) => `https://tailwindcss.com/docs/${t}` },
      'tailwindcss': { url: 'https://tailwindcss.com/docs', type: 'website', searchUrl: (t) => `https://tailwindcss.com/docs/${t}` },
      'typescript': { url: 'https://www.typescriptlang.org/docs', type: 'website' },
      'vite': { url: 'https://vitejs.dev/guide', type: 'website' },
      'vitest': { url: 'https://vitest.dev/guide', type: 'website' },
      'zustand': { url: 'https://docs.pmnd.rs/zustand', type: 'website', api: 'https://raw.githubusercontent.com/pmndrs/zustand/main/readme.md' },
      'drizzle': { url: 'https://orm.drizzle.team/docs/overview', type: 'website' },
      'zod': { url: 'https://zod.dev', type: 'website', api: 'https://raw.githubusercontent.com/colinhacks/zod/master/README.md' },
      'trpc': { url: 'https://trpc.io/docs', type: 'website' },
      'tanstack-query': { url: 'https://tanstack.com/query/latest/docs/react/overview', type: 'website' },
      'react-query': { url: 'https://tanstack.com/query/latest/docs/react/overview', type: 'website' },
    };

    const source = docsSources[library];
    const result: {
      library: string;
      version: string;
      content: string;
      api_reference: Array<{ name: string; description: string; url?: string }>;
      source_url: string;
      topic?: string;
      readme?: string;
      last_updated: string;
    } = {
      library: args.library,
      version: args.version || 'latest',
      content: '',
      api_reference: [],
      source_url: source?.url || `https://www.npmjs.com/package/${args.library}`,
      last_updated: new Date().toISOString().split('T')[0],
    };

    if (topic) {
      result.topic = topic;
    }

    // Try to fetch npm package info for any package
    try {
      const npmData = await this.fetchNpmReadme(args.library);
      if (npmData) {
        result.readme = npmData.readme;
        result.content = npmData.description || '';
        if (npmData.repository) {
          result.api_reference.push({
            name: 'Repository',
            description: 'Source code repository',
            url: npmData.repository,
          });
        }
        if (npmData.homepage) {
          result.api_reference.push({
            name: 'Homepage',
            description: 'Official documentation',
            url: npmData.homepage,
          });
        }
      }
    } catch {
      // Continue without npm data
    }

    // If we have a GitHub raw API for README, fetch it
    if (source?.api) {
      try {
        const readmeContent = await this.fetchUrl(source.api);
        if (readmeContent) {
          result.readme = readmeContent.slice(0, 10000); // Limit size
          result.content = `Documentation fetched from GitHub README. See ${source.url} for full docs.`;
        }
      } catch {
        // Continue without GitHub readme
      }
    }

    // Add common API references based on library type
    const apiReferences = this.getCommonApiReferences(library, topic);
    result.api_reference.push(...apiReferences);

    // If no content was fetched, provide helpful fallback
    if (!result.content && !result.readme) {
      result.content = `Documentation for ${args.library}. Visit ${result.source_url} for full documentation.`;
      if (topic) {
        result.content += ` Search for "${topic}" in the documentation.`;
        if (source?.searchUrl) {
          result.api_reference.push({
            name: `${topic} documentation`,
            description: `Direct link to ${topic} docs`,
            url: source.searchUrl(topic),
          });
        }
      }
    }

    return {
      content: [{
        type: 'text',
        text: JSON.stringify(result, null, 2),
      }],
    };
  }

  /**
   * Fetch npm package README and metadata
   */
  private async fetchNpmReadme(packageName: string): Promise<{
    readme?: string;
    description?: string;
    repository?: string;
    homepage?: string;
  } | null> {
    try {
      const result = await safeExec(
        `npm view ${packageName} readme description repository.url homepage --json`,
        PROJECT_ROOT,
        15000
      );

      if (result.error || !result.stdout) {
        return null;
      }

      const data = JSON.parse(result.stdout);
      return {
        readme: typeof data.readme === 'string' ? data.readme.slice(0, 8000) : undefined,
        description: data.description,
        repository: data['repository.url']?.replace(/^git\+/, '').replace(/\.git$/, ''),
        homepage: data.homepage,
      };
    } catch {
      return null;
    }
  }

  /**
   * Simple HTTPS fetch helper
   */
  private fetchUrl(url: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const client = url.startsWith('https') ? https : http;
      const request = client.get(url, { timeout: 10000 }, (response) => {
        if (response.statusCode === 301 || response.statusCode === 302) {
          // Follow redirect
          const redirectUrl = response.headers.location;
          if (redirectUrl) {
            this.fetchUrl(redirectUrl).then(resolve).catch(reject);
            return;
          }
        }

        if (response.statusCode !== 200) {
          reject(new Error(`HTTP ${response.statusCode}`));
          return;
        }

        let data = '';
        response.on('data', chunk => data += chunk);
        response.on('end', () => resolve(data));
        response.on('error', reject);
      });

      request.on('error', reject);
      request.on('timeout', () => {
        request.destroy();
        reject(new Error('Request timeout'));
      });
    });
  }

  /**
   * Get common API references for known libraries
   */
  private getCommonApiReferences(library: string, topic?: string): Array<{ name: string; description: string; url?: string }> {
    const refs: Array<{ name: string; description: string; url?: string }> = [];

    const libraryApis: Record<string, Array<{ name: string; description: string; url?: string }>> = {
      'react': [
        { name: 'useState', description: 'State hook for functional components', url: 'https://react.dev/reference/react/useState' },
        { name: 'useEffect', description: 'Side effects hook', url: 'https://react.dev/reference/react/useEffect' },
        { name: 'useContext', description: 'Context consumption hook', url: 'https://react.dev/reference/react/useContext' },
        { name: 'useRef', description: 'Mutable ref object hook', url: 'https://react.dev/reference/react/useRef' },
        { name: 'useMemo', description: 'Memoization hook', url: 'https://react.dev/reference/react/useMemo' },
      ],
      'next': [
        { name: 'App Router', description: 'File-based routing in app directory', url: 'https://nextjs.org/docs/app' },
        { name: 'Server Components', description: 'React Server Components', url: 'https://nextjs.org/docs/app/building-your-application/rendering/server-components' },
        { name: 'API Routes', description: 'Backend API endpoints', url: 'https://nextjs.org/docs/app/building-your-application/routing/route-handlers' },
        { name: 'Middleware', description: 'Request/response middleware', url: 'https://nextjs.org/docs/app/building-your-application/routing/middleware' },
      ],
      'nextjs': [
        { name: 'App Router', description: 'File-based routing in app directory', url: 'https://nextjs.org/docs/app' },
        { name: 'Server Components', description: 'React Server Components', url: 'https://nextjs.org/docs/app/building-your-application/rendering/server-components' },
      ],
      'prisma': [
        { name: 'Schema', description: 'Prisma schema language', url: 'https://www.prisma.io/docs/concepts/components/prisma-schema' },
        { name: 'Client', description: 'Prisma Client API', url: 'https://www.prisma.io/docs/concepts/components/prisma-client' },
        { name: 'Migrate', description: 'Database migrations', url: 'https://www.prisma.io/docs/concepts/components/prisma-migrate' },
      ],
      'tailwind': [
        { name: 'Utility Classes', description: 'Core utility classes reference', url: 'https://tailwindcss.com/docs/utility-first' },
        { name: 'Configuration', description: 'Tailwind config options', url: 'https://tailwindcss.com/docs/configuration' },
        { name: 'Responsive Design', description: 'Responsive breakpoints', url: 'https://tailwindcss.com/docs/responsive-design' },
      ],
      'zustand': [
        { name: 'create', description: 'Create a store', url: 'https://docs.pmnd.rs/zustand/getting-started/introduction' },
        { name: 'Middleware', description: 'Store middleware (persist, devtools)', url: 'https://docs.pmnd.rs/zustand/guides/typescript' },
      ],
      'zod': [
        { name: 'z.object', description: 'Object schema validation', url: 'https://zod.dev/?id=objects' },
        { name: 'z.string', description: 'String validation', url: 'https://zod.dev/?id=strings' },
        { name: 'z.infer', description: 'Type inference from schema', url: 'https://zod.dev/?id=type-inference' },
      ],
      'drizzle': [
        { name: 'Schema', description: 'Drizzle schema definition', url: 'https://orm.drizzle.team/docs/sql-schema-declaration' },
        { name: 'Queries', description: 'Query builder API', url: 'https://orm.drizzle.team/docs/select' },
        { name: 'Migrations', description: 'Database migrations', url: 'https://orm.drizzle.team/docs/migrations' },
      ],
    };

    const libraryRefs = libraryApis[library] || [];

    // Filter by topic if provided
    if (topic) {
      const topicLower = topic.toLowerCase();
      const filtered = libraryRefs.filter(r =>
        r.name.toLowerCase().includes(topicLower) ||
        r.description.toLowerCase().includes(topicLower)
      );
      if (filtered.length > 0) {
        refs.push(...filtered);
      } else {
        refs.push(...libraryRefs.slice(0, 3)); // Return top 3 if no match
      }
    } else {
      refs.push(...libraryRefs.slice(0, 5)); // Return top 5
    }

    return refs;
  }

  private handleGetSchema(args: { source: string; path?: string; tables?: string[] }) {
    const projectPath = path.resolve(PROJECT_ROOT, args.path || '.');

    if (args.source === 'prisma') {
      return this.parsePrismaSchema(projectPath, args.tables);
    }

    if (args.source === 'drizzle') {
      return this.parseDrizzleSchema(projectPath, args.tables);
    }

    if (args.source === 'typeorm') {
      return this.parseTypeORMSchema(projectPath, args.tables);
    }

    if (args.source === 'sql') {
      return this.parseSQLSchema(projectPath, args.tables);
    }

    throw new Error(`Unknown schema source: ${args.source}. Supported: prisma, drizzle, typeorm, sql`);
  }

  private parsePrismaSchema(projectPath: string, filterTables?: string[]) {
    const schemaPath = path.join(projectPath, 'prisma', 'schema.prisma');
    if (!fs.existsSync(schemaPath)) {
      throw new Error('Prisma schema not found at prisma/schema.prisma');
    }

    const content = fs.readFileSync(schemaPath, 'utf-8');
    const modelRegex = /model\s+(\w+)\s*\{([^}]+)\}/g;
    const tables = [];
    let match;

    while ((match = modelRegex.exec(content)) !== null) {
      const modelName = match[1];
      const modelBody = match[2];

      if (filterTables?.length && !filterTables.includes(modelName)) continue;

      const columns = [];
      const relations = [];

      for (const line of modelBody.split('\n')) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('//') || trimmed.startsWith('@@')) continue;

        const fieldMatch = /^(\w+)\s+(\w+)(\??)(\[\])?/.exec(trimmed);
        if (fieldMatch) {
          const [, fieldName, fieldType, nullable, isArray] = fieldMatch;

          // Check if it's a relation (type starts with uppercase and isn't a Prisma scalar)
          const prismaScalars = ['String', 'Int', 'Float', 'Boolean', 'DateTime', 'Json', 'Bytes', 'BigInt', 'Decimal'];
          const isRelation = /^[A-Z]/.test(fieldType) && !prismaScalars.includes(fieldType);

          if (isRelation) {
            relations.push({
              field: fieldName,
              target: fieldType,
              type: isArray ? 'one-to-many' : 'many-to-one',
            });
          } else {
            columns.push({
              name: fieldName,
              type: fieldType,
              nullable: nullable === '?',
              primary: trimmed.includes('@id'),
              unique: trimmed.includes('@unique'),
              default: trimmed.match(/@default\(([^)]+)\)/)?.[1] || null,
            });
          }
        }
      }

      // Parse indexes from @@index and @@unique
      const indexMatches = modelBody.matchAll(/@@(index|unique)\(\[([^\]]+)\]\)/g);
      const indexes = [];
      for (const idxMatch of indexMatches) {
        indexes.push({
          type: idxMatch[1],
          columns: idxMatch[2].split(',').map(c => c.trim()),
        });
      }

      tables.push({ name: modelName, columns, relations, indexes });
    }

    return {
      content: [{
        type: 'text',
        text: JSON.stringify({ source: 'prisma', tables, raw_path: 'prisma/schema.prisma' }, null, 2),
      }],
    };
  }

  private parseDrizzleSchema(projectPath: string, filterTables?: string[]) {
    // Look for drizzle schema files
    const schemaPaths = [
      path.join(projectPath, 'drizzle', 'schema.ts'),
      path.join(projectPath, 'src', 'db', 'schema.ts'),
      path.join(projectPath, 'src', 'schema.ts'),
      path.join(projectPath, 'db', 'schema.ts'),
    ];

    let schemaPath: string | null = null;
    for (const p of schemaPaths) {
      if (fs.existsSync(p)) {
        schemaPath = p;
        break;
      }
    }

    if (!schemaPath) {
      throw new Error('Drizzle schema not found. Checked: drizzle/schema.ts, src/db/schema.ts, src/schema.ts, db/schema.ts');
    }

    const content = fs.readFileSync(schemaPath, 'utf-8');
    const tables = [];

    // Parse pgTable/mysqlTable/sqliteTable definitions
    const tableRegex = /export\s+const\s+(\w+)\s*=\s*(?:pgTable|mysqlTable|sqliteTable)\s*\(\s*['"](\w+)['"]\s*,\s*\{([^}]+)\}/g;
    let match;

    while ((match = tableRegex.exec(content)) !== null) {
      const [, varName, tableName, columnsBlock] = match;

      if (filterTables?.length && !filterTables.includes(tableName) && !filterTables.includes(varName)) continue;

      const columns = [];
      const relations = [];

      // Parse column definitions
      const columnRegex = /(\w+)\s*:\s*(varchar|text|integer|serial|boolean|timestamp|json|uuid|bigint|real|doublePrecision|date|time|numeric)(?:\([^)]*\))?/g;
      let colMatch;

      while ((colMatch = columnRegex.exec(columnsBlock)) !== null) {
        const [fullMatch, colName, colType] = colMatch;
        columns.push({
          name: colName,
          type: colType,
          nullable: !fullMatch.includes('.notNull()'),
          primary: fullMatch.includes('.primaryKey()'),
          unique: fullMatch.includes('.unique()'),
          default: fullMatch.match(/\.default\(([^)]+)\)/)?.[1] || null,
        });
      }

      // Parse references for relations
      const refRegex = /\.references\(\s*\(\)\s*=>\s*(\w+)\.(\w+)/g;
      let refMatch;
      while ((refMatch = refRegex.exec(columnsBlock)) !== null) {
        relations.push({
          target: refMatch[1],
          targetColumn: refMatch[2],
          type: 'many-to-one',
        });
      }

      tables.push({
        name: tableName,
        variable: varName,
        columns,
        relations,
        indexes: [],
      });
    }

    // Also look for relations() definitions
    const relationsRegex = /relations\s*\(\s*(\w+)\s*,\s*\(\s*\{\s*(\w+)\s*\}\s*\)\s*=>\s*\(([^)]+)\)/g;
    while ((match = relationsRegex.exec(content)) !== null) {
      const [, tableName, , relBlock] = match;
      const table = tables.find(t => t.variable === tableName || t.name === tableName);
      if (table) {
        const oneMatches = relBlock.matchAll(/one\s*\(\s*(\w+)/g);
        for (const m of oneMatches) {
          table.relations.push({ target: m[1], targetColumn: 'id', type: 'many-to-one' });
        }
        const manyMatches = relBlock.matchAll(/many\s*\(\s*(\w+)/g);
        for (const m of manyMatches) {
          table.relations.push({ target: m[1], targetColumn: 'id', type: 'one-to-many' });
        }
      }
    }

    return {
      content: [{
        type: 'text',
        text: JSON.stringify({ source: 'drizzle', tables, raw_path: schemaPath }, null, 2),
      }],
    };
  }

  private parseTypeORMSchema(projectPath: string, filterTables?: string[]) {
    // Look for TypeORM entity files
    const entityPaths = [
      path.join(projectPath, 'src', 'entities'),
      path.join(projectPath, 'src', 'entity'),
      path.join(projectPath, 'entities'),
      path.join(projectPath, 'entity'),
    ];

    let entityDir: string | null = null;
    for (const p of entityPaths) {
      if (fs.existsSync(p)) {
        entityDir = p;
        break;
      }
    }

    if (!entityDir) {
      throw new Error('TypeORM entities not found. Checked: src/entities, src/entity, entities, entity');
    }

    const tables = [];
    const entityFiles = fs.readdirSync(entityDir).filter(f => f.endsWith('.ts') || f.endsWith('.js'));

    for (const file of entityFiles) {
      const content = fs.readFileSync(path.join(entityDir, file), 'utf-8');

      // Parse @Entity decorator
      const entityMatch = content.match(/@Entity\s*\(\s*['"]?(\w+)?['"]?\s*\)/);
      if (!entityMatch) continue;

      // Parse class name
      const classMatch = content.match(/class\s+(\w+)/);
      if (!classMatch) continue;

      const tableName = entityMatch[1] || classMatch[1].toLowerCase();
      const className = classMatch[1];

      if (filterTables?.length && !filterTables.includes(tableName) && !filterTables.includes(className)) continue;

      const columns = [];
      const relations = [];

      // Parse @Column decorators
      const columnRegex = /@(PrimaryGeneratedColumn|PrimaryColumn|Column)\s*\(([^)]*)\)\s*\n\s*(\w+)\s*[?!]?\s*:\s*(\w+)/g;
      let colMatch;

      while ((colMatch = columnRegex.exec(content)) !== null) {
        const [, decorator, options, colName, colType] = colMatch;
        columns.push({
          name: colName,
          type: colType,
          nullable: options.includes('nullable: true'),
          primary: decorator.includes('Primary'),
          unique: options.includes('unique: true'),
        });
      }

      // Parse relation decorators
      const relRegex = /@(OneToOne|OneToMany|ManyToOne|ManyToMany)\s*\(\s*\(\)\s*=>\s*(\w+)/g;
      let relMatch;

      while ((relMatch = relRegex.exec(content)) !== null) {
        const [, relType, target] = relMatch;
        relations.push({
          target,
          type: relType.replace(/([A-Z])/g, '-$1').toLowerCase().slice(1),
        });
      }

      tables.push({
        name: tableName,
        entity: className,
        columns,
        relations,
        indexes: [],
        file,
      });
    }

    return {
      content: [{
        type: 'text',
        text: JSON.stringify({ source: 'typeorm', tables, entity_dir: entityDir }, null, 2),
      }],
    };
  }

  private parseSQLSchema(projectPath: string, filterTables?: string[]) {
    // Look for SQL schema files
    const sqlPaths = [
      path.join(projectPath, 'schema.sql'),
      path.join(projectPath, 'db', 'schema.sql'),
      path.join(projectPath, 'sql', 'schema.sql'),
      path.join(projectPath, 'database', 'schema.sql'),
      path.join(projectPath, 'migrations', 'schema.sql'),
    ];

    let sqlPath: string | null = null;
    for (const p of sqlPaths) {
      if (fs.existsSync(p)) {
        sqlPath = p;
        break;
      }
    }

    if (!sqlPath) {
      // Try to find any .sql file
      const findSql = (dir: string): string | null => {
        if (!fs.existsSync(dir)) return null;
        const files = fs.readdirSync(dir);
        for (const f of files) {
          if (f.endsWith('.sql') && !f.includes('migration')) {
            return path.join(dir, f);
          }
        }
        return null;
      };

      sqlPath = findSql(projectPath) || findSql(path.join(projectPath, 'db')) || findSql(path.join(projectPath, 'sql'));
    }

    if (!sqlPath) {
      throw new Error('SQL schema not found. Checked: schema.sql, db/schema.sql, sql/schema.sql, database/schema.sql');
    }

    const content = fs.readFileSync(sqlPath, 'utf-8');
    const tables = [];

    // Parse CREATE TABLE statements
    const tableRegex = /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?[`"']?(\w+)[`"']?\s*\(([^;]+)\)/gi;
    let match;

    while ((match = tableRegex.exec(content)) !== null) {
      const [, tableName, columnsBlock] = match;

      if (filterTables?.length && !filterTables.includes(tableName)) continue;

      const columns = [];
      const relations = [];
      const indexes = [];

      // Parse columns
      const lines = columnsBlock.split(',').map(l => l.trim());
      for (const line of lines) {
        // Skip constraints
        if (/^(PRIMARY|FOREIGN|UNIQUE|CHECK|CONSTRAINT|INDEX|KEY)/i.test(line)) {
          // Parse foreign key for relations
          const fkMatch = line.match(/FOREIGN\s+KEY\s*\([`"']?(\w+)[`"']?\)\s*REFERENCES\s+[`"']?(\w+)[`"']?/i);
          if (fkMatch) {
            relations.push({
              column: fkMatch[1],
              target: fkMatch[2],
              type: 'many-to-one',
            });
          }
          // Parse unique/index
          const uniqueMatch = line.match(/UNIQUE\s*\(([^)]+)\)/i);
          if (uniqueMatch) {
            indexes.push({
              type: 'unique',
              columns: uniqueMatch[1].split(',').map(c => c.trim().replace(/[`"']/g, '')),
            });
          }
          continue;
        }

        // Parse column definition
        const colMatch = line.match(/^[`"']?(\w+)[`"']?\s+(\w+)(?:\([^)]+\))?(.*)$/i);
        if (colMatch) {
          const [, colName, colType, rest] = colMatch;
          columns.push({
            name: colName,
            type: colType.toUpperCase(),
            nullable: !/NOT\s+NULL/i.test(rest),
            primary: /PRIMARY\s+KEY/i.test(rest),
            unique: /UNIQUE/i.test(rest),
            default: rest.match(/DEFAULT\s+([^\s,]+)/i)?.[1] || null,
            auto_increment: /AUTO_INCREMENT|SERIAL|IDENTITY/i.test(rest),
          });
        }
      }

      tables.push({ name: tableName, columns, relations, indexes });
    }

    return {
      content: [{
        type: 'text',
        text: JSON.stringify({ source: 'sql', tables, raw_path: sqlPath }, null, 2),
      }],
    };
  }

  private handleReadConfig(args: { config: string; path?: string; resolve_extends?: boolean }) {
    const projectPath = path.resolve(PROJECT_ROOT, args.path || '.');

    const configPaths: Record<string, string[]> = {
      'package.json': ['package.json'],
      'tsconfig': ['tsconfig.json'],
      'eslint': ['.eslintrc.js', '.eslintrc.json', '.eslintrc', 'eslint.config.js', 'eslint.config.mjs'],
      'prettier': ['.prettierrc', '.prettierrc.json', '.prettierrc.js', 'prettier.config.js'],
      'tailwind': ['tailwind.config.js', 'tailwind.config.ts', 'tailwind.config.mjs'],
      'next': ['next.config.js', 'next.config.mjs', 'next.config.ts'],
      'vite': ['vite.config.ts', 'vite.config.js'],
      'prisma': ['prisma/schema.prisma'],
      'env': ['.env', '.env.local', '.env.example'],
    };

    const filesToTry = args.config === 'custom' && args.path
      ? [args.path]
      : configPaths[args.config] || [args.config];

    for (const file of filesToTry) {
      const filePath = path.join(projectPath, file);
      if (fs.existsSync(filePath)) {
        const content = fs.readFileSync(filePath, 'utf-8');

        // Try to parse JSON
        let parsed: unknown = null;
        try {
          if (file.endsWith('.json')) {
            parsed = JSON.parse(content);
          }
        } catch {
          // Not JSON, return raw content
        }

        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              config_type: args.config,
              file_path: file,
              format: file.endsWith('.json') ? 'json' : file.endsWith('.js') || file.endsWith('.ts') ? 'javascript' : 'text',
              content: parsed || content,
              extends: [],
              env_vars: [],
            }, null, 2),
          }],
        };
      }
    }

    throw new Error(`Config '${args.config}' not found`);
  }

  // ============ Validation Handlers ============

  private async handleValidateImplementation(args: { files: string[]; skill?: string; checks?: string[] }) {
    const issues: Array<{
      severity: 'error' | 'warning' | 'info';
      file: string;
      line: number;
      rule: string;
      message: string;
      suggestion: string;
    }> = [];

    const checksRun: string[] = [];
    const checks = args.checks || ['all'];
    const runAll = checks.includes('all');

    // Load skill patterns if a skill is specified
    let skillPatterns: {
      required_exports?: string[];
      required_imports?: string[];
      naming_conventions?: Record<string, string>;
      must_include?: string[];
      must_not_include?: string[];
    } = {};

    if (args.skill) {
      const skillMeta = this.parseSkillMetadata(args.skill);
      // Try to extract patterns from skill content
      skillPatterns = this.extractSkillPatterns(args.skill);
    }

    for (const file of args.files) {
      const filePath = path.resolve(PROJECT_ROOT, file);

      if (!fs.existsSync(filePath)) {
        issues.push({
          severity: 'error',
          file,
          line: 0,
          rule: 'file/exists',
          message: 'File not found',
          suggestion: 'Check the file path',
        });
        continue;
      }

      const content = fs.readFileSync(filePath, 'utf-8');
      const lines = content.split('\n');
      const ext = path.extname(file);
      const isTypeScript = ext === '.ts' || ext === '.tsx';
      const isReact = ext === '.tsx' || ext === '.jsx' || content.includes('import React') || content.includes("from 'react'");

      // ========== Security Checks ==========
      if (runAll || checks.includes('security')) {
        checksRun.push('security');

        // Check for hardcoded secrets
        const secretPatterns = [
          { pattern: /(?:password|passwd|pwd)\s*[:=]\s*['"][^'"]+['"]/gi, name: 'password' },
          { pattern: /(?:api[_-]?key|apikey)\s*[:=]\s*['"][^'"]+['"]/gi, name: 'API key' },
          { pattern: /(?:secret|token)\s*[:=]\s*['"][A-Za-z0-9+/=]{20,}['"]/gi, name: 'secret/token' },
          { pattern: /(?:aws[_-]?(?:access|secret))[_-]?(?:key|id)\s*[:=]\s*['"][^'"]+['"]/gi, name: 'AWS credential' },
          { pattern: /private[_-]?key\s*[:=]\s*['"][^'"]+['"]/gi, name: 'private key' },
        ];

        lines.forEach((line, i) => {
          // Skip if it's reading from env
          if (line.includes('process.env') || line.includes('import.meta.env')) return;

          for (const { pattern, name } of secretPatterns) {
            if (pattern.test(line)) {
              issues.push({
                severity: 'error',
                file,
                line: i + 1,
                rule: 'security/no-hardcoded-secrets',
                message: `Potential hardcoded ${name}`,
                suggestion: 'Move sensitive data to environment variables',
              });
            }
            pattern.lastIndex = 0; // Reset regex
          }
        });

        // Check for dangerous functions
        const dangerousPatterns = [
          { pattern: /eval\s*\(/, rule: 'security/no-eval', message: 'Use of eval() is dangerous' },
          { pattern: /innerHTML\s*=/, rule: 'security/no-innerhtml', message: 'innerHTML can lead to XSS' },
          { pattern: /dangerouslySetInnerHTML/, rule: 'security/dangerously-set-inner-html', message: 'dangerouslySetInnerHTML should be used carefully' },
          { pattern: /document\.write/, rule: 'security/no-document-write', message: 'document.write can be exploited' },
          { pattern: /new\s+Function\s*\(/, rule: 'security/no-new-function', message: 'new Function() is similar to eval()' },
        ];

        lines.forEach((line, i) => {
          for (const { pattern, rule, message } of dangerousPatterns) {
            if (pattern.test(line)) {
              issues.push({
                severity: rule.includes('dangerously') ? 'warning' : 'error',
                file,
                line: i + 1,
                rule,
                message,
                suggestion: 'Use safer alternatives or sanitize input',
              });
            }
          }
        });

        // SQL injection risk
        if (content.includes('query(') || content.includes('execute(')) {
          lines.forEach((line, i) => {
            if (/query\s*\(\s*[`'"].*\$\{/.test(line) || /query\s*\(\s*.*\+/.test(line)) {
              issues.push({
                severity: 'error',
                file,
                line: i + 1,
                rule: 'security/sql-injection',
                message: 'Potential SQL injection vulnerability',
                suggestion: 'Use parameterized queries or prepared statements',
              });
            }
          });
        }
      }

      // ========== Structure Checks ==========
      if (runAll || checks.includes('structure')) {
        checksRun.push('structure');

        // Check for exports
        const hasExport = content.includes('export default') || content.includes('export {') ||
                         content.includes('export const') || content.includes('export function') ||
                         content.includes('export class') || content.includes('export type') ||
                         content.includes('export interface');

        if (!hasExport && !file.includes('index') && !file.includes('.d.ts')) {
          issues.push({
            severity: 'warning',
            file,
            line: 1,
            rule: 'structure/missing-export',
            message: 'No exports found in file',
            suggestion: 'Add exports to make the module usable',
          });
        }

        // React component checks
        if (isReact) {
          const componentName = path.basename(file, ext);
          const pascalCase = /^[A-Z][a-zA-Z0-9]*$/.test(componentName);

          if (!pascalCase && !file.includes('index') && !file.includes('use')) {
            issues.push({
              severity: 'info',
              file,
              line: 1,
              rule: 'structure/component-naming',
              message: 'React component files should use PascalCase',
              suggestion: `Rename to ${componentName.charAt(0).toUpperCase() + componentName.slice(1)}`,
            });
          }

          // Check for proper hook usage
          const hookUsage = content.match(/use[A-Z]\w+/g);
          if (hookUsage) {
            lines.forEach((line, i) => {
              if (/if\s*\(.*use[A-Z]/.test(line) || /&&\s*use[A-Z]/.test(line)) {
                issues.push({
                  severity: 'error',
                  file,
                  line: i + 1,
                  rule: 'react/hooks-rules',
                  message: 'Hooks cannot be called conditionally',
                  suggestion: 'Move hook call outside of conditions',
                });
              }
            });
          }
        }

        // File size check
        if (lines.length > 500) {
          issues.push({
            severity: 'info',
            file,
            line: 1,
            rule: 'structure/file-size',
            message: `File has ${lines.length} lines, consider splitting`,
            suggestion: 'Break large files into smaller, focused modules',
          });
        }

        // Check for barrel exports in index files
        if (file.includes('index') && content.length < 50 && !content.includes('export')) {
          issues.push({
            severity: 'info',
            file,
            line: 1,
            rule: 'structure/empty-index',
            message: 'Index file appears empty or incomplete',
            suggestion: 'Add barrel exports or remove empty index',
          });
        }
      }

      // ========== Error Handling Checks ==========
      if (runAll || checks.includes('errors')) {
        checksRun.push('errors');

        // Check async functions for error handling
        const asyncMatches = content.matchAll(/async\s+(?:function\s+)?(\w+)?\s*\([^)]*\)\s*(?::\s*\w+(?:<[^>]+>)?)?\s*\{/g);
        for (const match of asyncMatches) {
          const startIndex = match.index || 0;
          const funcContent = this.extractFunctionBody(content, startIndex);

          if (funcContent && !funcContent.includes('try') && !funcContent.includes('catch') && !funcContent.includes('.catch(')) {
            const lineNum = content.substring(0, startIndex).split('\n').length;
            issues.push({
              severity: 'warning',
              file,
              line: lineNum,
              rule: 'error-handling/async-try-catch',
              message: 'Async function without error handling',
              suggestion: 'Wrap async code in try/catch or use .catch()',
            });
          }
        }

        // Check for empty catch blocks
        lines.forEach((line, i) => {
          if (/catch\s*\([^)]*\)\s*\{\s*\}/.test(line) || (line.includes('catch') && lines[i + 1]?.trim() === '}')) {
            issues.push({
              severity: 'warning',
              file,
              line: i + 1,
              rule: 'error-handling/empty-catch',
              message: 'Empty catch block swallows errors',
              suggestion: 'Log the error or handle it appropriately',
            });
          }
        });

        // Check for console.log in catch blocks (should use console.error)
        for (let i = 0; i < lines.length; i++) {
          if (lines[i].includes('catch') && lines[i + 1]?.includes('console.log')) {
            issues.push({
              severity: 'info',
              file,
              line: i + 2,
              rule: 'error-handling/console-error',
              message: 'Use console.error for errors, not console.log',
              suggestion: 'Replace console.log with console.error in catch blocks',
            });
          }
        }
      }

      // ========== TypeScript Checks ==========
      if ((runAll || checks.includes('typescript')) && isTypeScript) {
        checksRun.push('typescript');

        // Check for 'any' type
        const anyMatches = content.matchAll(/:\s*any\b/g);
        for (const match of anyMatches) {
          const lineNum = content.substring(0, match.index || 0).split('\n').length;
          issues.push({
            severity: 'warning',
            file,
            line: lineNum,
            rule: 'typescript/no-any',
            message: 'Avoid using "any" type',
            suggestion: 'Use a more specific type or "unknown"',
          });
        }

        // Check for @ts-ignore without explanation
        lines.forEach((line, i) => {
          if (/@ts-ignore(?!\s+.{10,})/.test(line)) {
            issues.push({
              severity: 'warning',
              file,
              line: i + 1,
              rule: 'typescript/no-ts-ignore',
              message: '@ts-ignore should include an explanation',
              suggestion: 'Add a comment explaining why the ignore is needed',
            });
          }
        });

        // Check for non-null assertions
        const assertionCount = (content.match(/!\./g) || []).length;
        if (assertionCount > 5) {
          issues.push({
            severity: 'info',
            file,
            line: 1,
            rule: 'typescript/excessive-non-null',
            message: `${assertionCount} non-null assertions found`,
            suggestion: 'Consider proper null checking instead of assertions',
          });
        }
      }

      // ========== Naming Conventions ==========
      if (runAll || checks.includes('naming')) {
        checksRun.push('naming');

        // Check function naming (camelCase)
        const funcMatches = content.matchAll(/(?:function|const|let)\s+([a-zA-Z_]\w*)\s*(?:=\s*(?:async\s*)?\(|[\(<])/g);
        for (const match of funcMatches) {
          const name = match[1];
          if (name.startsWith('_')) continue; // Allow underscore prefix
          if (/^[A-Z]/.test(name) && !isReact) {
            // Not PascalCase for non-React functions
          } else if (!/^[a-z][a-zA-Z0-9]*$/.test(name) && !/^[A-Z][a-zA-Z0-9]*$/.test(name)) {
            const lineNum = content.substring(0, match.index || 0).split('\n').length;
            issues.push({
              severity: 'info',
              file,
              line: lineNum,
              rule: 'naming/camelCase',
              message: `Function "${name}" should use camelCase`,
              suggestion: 'Use camelCase for functions and variables',
            });
          }
        }

        // Check for SCREAMING_CASE constants
        const constMatches = content.matchAll(/const\s+([a-zA-Z_]\w*)\s*=/g);
        for (const match of constMatches) {
          const name = match[1];
          // If it's all caps with underscores, it should be a true constant
          if (/^[A-Z][A-Z0-9_]+$/.test(name)) {
            const lineNum = content.substring(0, match.index || 0).split('\n').length;
            const line = lines[lineNum - 1] || '';
            // Check if it's actually a constant value
            if (line.includes('()') || line.includes('new ')) {
              issues.push({
                severity: 'info',
                file,
                line: lineNum,
                rule: 'naming/screaming-case',
                message: `SCREAMING_CASE "${name}" should be for constant values only`,
                suggestion: 'Use SCREAMING_CASE only for true constants, not functions or instances',
              });
            }
          }
        }
      }

      // ========== Best Practices ==========
      if (runAll || checks.includes('best-practices')) {
        checksRun.push('best-practices');

        // Check for console.log (should be removed in production)
        lines.forEach((line, i) => {
          if (/console\.(log|debug|info)\(/.test(line) && !line.includes('//') && !line.trim().startsWith('//')) {
            issues.push({
              severity: 'info',
              file,
              line: i + 1,
              rule: 'best-practices/no-console',
              message: 'console.log found in code',
              suggestion: 'Remove or use a proper logging library',
            });
          }
        });

        // Check for TODO/FIXME comments
        lines.forEach((line, i) => {
          if (/\/\/\s*(TODO|FIXME|HACK|XXX):/i.test(line)) {
            issues.push({
              severity: 'info',
              file,
              line: i + 1,
              rule: 'best-practices/no-todo',
              message: 'TODO/FIXME comment found',
              suggestion: 'Address the TODO or create a ticket to track it',
            });
          }
        });

        // Check for magic numbers
        const magicNumberRegex = /[^a-zA-Z0-9_"](\d{2,})[^a-zA-Z0-9_"]/g;
        lines.forEach((line, i) => {
          // Skip obvious non-magic numbers
          if (line.includes('import') || line.includes('require') || line.includes('version')) return;
          if (line.includes('port') || line.includes('timeout') || line.includes('delay')) return;

          let match;
          while ((match = magicNumberRegex.exec(line)) !== null) {
            const num = parseInt(match[1]);
            if (num > 1 && num !== 100 && num !== 1000 && ![200, 201, 204, 400, 401, 403, 404, 500].includes(num)) {
              issues.push({
                severity: 'info',
                file,
                line: i + 1,
                rule: 'best-practices/no-magic-numbers',
                message: `Magic number ${num} found`,
                suggestion: 'Extract to a named constant',
              });
              break; // Only report once per line
            }
          }
          magicNumberRegex.lastIndex = 0;
        });
      }

      // ========== Skill Pattern Validation ==========
      if (args.skill && skillPatterns) {
        checksRun.push('skill-patterns');

        // Check required imports
        if (skillPatterns.required_imports) {
          for (const imp of skillPatterns.required_imports) {
            if (!content.includes(imp)) {
              issues.push({
                severity: 'warning',
                file,
                line: 1,
                rule: 'skill/missing-import',
                message: `Skill requires import: ${imp}`,
                suggestion: `Add import for ${imp}`,
              });
            }
          }
        }

        // Check must include patterns
        if (skillPatterns.must_include) {
          for (const pattern of skillPatterns.must_include) {
            if (!content.includes(pattern)) {
              issues.push({
                severity: 'warning',
                file,
                line: 1,
                rule: 'skill/missing-pattern',
                message: `Skill expects pattern: ${pattern}`,
                suggestion: `Implement the expected pattern`,
              });
            }
          }
        }

        // Check must not include patterns
        if (skillPatterns.must_not_include) {
          for (const pattern of skillPatterns.must_not_include) {
            if (content.includes(pattern)) {
              const lineNum = content.split('\n').findIndex(l => l.includes(pattern)) + 1;
              issues.push({
                severity: 'warning',
                file,
                line: lineNum || 1,
                rule: 'skill/forbidden-pattern',
                message: `Skill advises against: ${pattern}`,
                suggestion: 'Remove or replace with recommended alternative',
              });
            }
          }
        }
      }
    }

    // Calculate summary
    const errors = issues.filter(i => i.severity === 'error').length;
    const warnings = issues.filter(i => i.severity === 'warning').length;
    const info = issues.filter(i => i.severity === 'info').length;
    const score = Math.max(0, 100 - (errors * 20) - (warnings * 5) - (info * 1));

    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          valid: errors === 0,
          score,
          grade: score >= 90 ? 'A' : score >= 80 ? 'B' : score >= 70 ? 'C' : score >= 60 ? 'D' : 'F',
          issues,
          summary: {
            errors,
            warnings,
            info,
            files_checked: args.files.length,
            checks_run: [...new Set(checksRun)],
          },
          skill: args.skill || null,
        }, null, 2),
      }],
    };
  }

  /**
   * Extract function body from content starting at index
   */
  private extractFunctionBody(content: string, startIndex: number): string {
    let braceCount = 0;
    let started = false;
    let endIndex = startIndex;

    for (let i = startIndex; i < content.length && i < startIndex + 2000; i++) {
      if (content[i] === '{') {
        braceCount++;
        started = true;
      } else if (content[i] === '}') {
        braceCount--;
        if (started && braceCount === 0) {
          endIndex = i + 1;
          break;
        }
      }
    }

    return content.substring(startIndex, endIndex);
  }

  /**
   * Extract validation patterns from skill content
   */
  private extractSkillPatterns(skillPath: string): {
    required_imports?: string[];
    must_include?: string[];
    must_not_include?: string[];
  } {
    const patterns: {
      required_imports?: string[];
      must_include?: string[];
      must_not_include?: string[];
    } = {};

    const attempts = [
      path.join(PLUGIN_ROOT, 'skills', skillPath, 'SKILL.md'),
      path.join(PLUGIN_ROOT, 'skills', skillPath + '.md'),
      path.join(PLUGIN_ROOT, 'skills', skillPath),
    ];

    for (const filePath of attempts) {
      if (fs.existsSync(filePath)) {
        try {
          const content = fs.readFileSync(filePath, 'utf-8');

          // Look for Required imports section
          const importsMatch = content.match(/(?:Required imports|Must import):\s*\n((?:\s*-\s*.+\n)+)/i);
          if (importsMatch) {
            patterns.required_imports = importsMatch[1].match(/-\s*(.+)/g)?.map(m =>
              m.replace(/^-\s*/, '').replace(/[`'"]/g, '').trim()
            );
          }

          // Look for code block patterns that should be included
          const codeBlocks = content.match(/```(?:typescript|javascript|tsx|jsx)?\n([\s\S]*?)```/g);
          if (codeBlocks && codeBlocks.length > 0) {
            // Extract key patterns from code examples
            const keyPatterns: string[] = [];
            for (const block of codeBlocks.slice(0, 3)) {
              const code = block.replace(/```\w*\n?/g, '');
              // Extract imports
              const imports = code.match(/import\s+.*from\s+['"]([^'"]+)['"]/g);
              if (imports) {
                patterns.required_imports = patterns.required_imports || [];
                for (const imp of imports) {
                  const pkg = imp.match(/from\s+['"]([^'"]+)['"]/)?.[1];
                  if (pkg && !pkg.startsWith('.') && !patterns.required_imports.includes(pkg)) {
                    patterns.required_imports.push(pkg);
                  }
                }
              }
            }
          }

          // Look for "Avoid" or "Don't" patterns
          const avoidMatch = content.match(/(?:Avoid|Don't|Do not|Never):\s*\n((?:\s*-\s*.+\n)+)/i);
          if (avoidMatch) {
            patterns.must_not_include = avoidMatch[1].match(/-\s*(.+)/g)?.map(m =>
              m.replace(/^-\s*/, '').replace(/[`'"]/g, '').trim()
            );
          }

          return patterns;
        } catch {
          return patterns;
        }
      }
    }

    return patterns;
  }

  private async handleRunSmokeTest(args: { type?: string; files?: string[]; timeout?: number }) {
    const testType = args.type || 'all';
    const timeout = (args.timeout || 30) * 1000;
    const tests: Array<{
      name: string;
      passed: boolean;
      duration_ms: number;
      output: string;
      error: string | null;
    }> = [];

    const pm = detectPackageManager(PROJECT_ROOT);
    const runCmd = pm === 'npm' ? 'npm run' : pm;

    // Type check
    if (testType === 'all' || testType === 'typecheck') {
      const start = Date.now();
      const result = await safeExec(`${runCmd} tsc --noEmit 2>&1 || echo "TypeScript not configured"`, PROJECT_ROOT, timeout);
      tests.push({
        name: 'typecheck',
        passed: !result.error && !result.stdout.includes('error'),
        duration_ms: Date.now() - start,
        output: result.stdout.slice(0, 500),
        error: result.error || null,
      });
    }

    // Lint
    if (testType === 'all' || testType === 'lint') {
      const start = Date.now();
      const result = await safeExec(`${runCmd} lint 2>&1 || echo "Lint not configured"`, PROJECT_ROOT, timeout);
      tests.push({
        name: 'lint',
        passed: !result.error && !result.stdout.includes('error'),
        duration_ms: Date.now() - start,
        output: result.stdout.slice(0, 500),
        error: result.error || null,
      });
    }

    // Build
    if (testType === 'all' || testType === 'build') {
      const start = Date.now();
      const result = await safeExec(`${runCmd} build 2>&1 || echo "Build not configured"`, PROJECT_ROOT, timeout);
      tests.push({
        name: 'build',
        passed: !result.error && !result.stdout.includes('error'),
        duration_ms: Date.now() - start,
        output: result.stdout.slice(0, 500),
        error: result.error || null,
      });
    }

    const passed = tests.filter(t => t.passed).length;
    const failed = tests.filter(t => !t.passed).length;

    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          passed: failed === 0,
          tests,
          summary: {
            total: tests.length,
            passed,
            failed,
            duration_ms: tests.reduce((sum, t) => sum + t.duration_ms, 0),
          },
        }, null, 2),
      }],
    };
  }

  private async handleCheckTypes(args: { files?: string[]; strict?: boolean; include_suggestions?: boolean }) {
    const filesArg = args.files?.length ? args.files.join(' ') : '';
    const strictFlag = args.strict ? '--strict' : '';

    const result = await safeExec(
      `npx tsc --noEmit ${strictFlag} ${filesArg} 2>&1`,
      PROJECT_ROOT,
      60000
    );

    const errors: Array<{
      file: string;
      line: number;
      column: number;
      code: string;
      message: string;
      suggestion: string;
    }> = [];

    // Parse TypeScript errors
    const errorRegex = /(.+)\((\d+),(\d+)\):\s+error\s+(TS\d+):\s+(.+)/g;
    let match;

    while ((match = errorRegex.exec(result.stdout + result.stderr)) !== null) {
      errors.push({
        file: match[1],
        line: parseInt(match[2]),
        column: parseInt(match[3]),
        code: match[4],
        message: match[5],
        suggestion: args.include_suggestions ? 'Check type definitions' : '',
      });
    }

    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          valid: errors.length === 0,
          errors,
          summary: {
            files_checked: args.files?.length || 'all',
            errors: errors.length,
            warnings: 0,
          },
        }, null, 2),
      }],
    };
  }

  // ============ Scaffolding Handlers ============

  private async handleScaffoldProject(args: {
    template: string;
    output_dir: string;
    variables?: Record<string, string>;
    run_install?: boolean;
    run_git_init?: boolean;
  }) {
    const templatePath = path.join(PLUGIN_ROOT, 'templates');

    // Find template
    const templateDirs = ['minimal', 'full'];
    let templateDir: string | null = null;

    for (const category of templateDirs) {
      const candidatePath = path.join(templatePath, category, args.template);
      if (fs.existsSync(candidatePath)) {
        templateDir = candidatePath;
        break;
      }
    }

    if (!templateDir) {
      throw new Error(`Template not found: ${args.template}`);
    }

    // Load template.yaml
    const templateYamlPath = path.join(templateDir, 'template.yaml');
    if (!fs.existsSync(templateYamlPath)) {
      throw new Error(`Template config not found: ${args.template}/template.yaml`);
    }

    const templateConfig = yaml.load(fs.readFileSync(templateYamlPath, 'utf-8')) as {
      name: string;
      required_skills?: string[];
      variables?: Array<{ name: string; default?: string }>;
      post_create?: Array<{ command: string; description: string }>;
    };

    // Prepare variables with defaults
    const variables: Record<string, string> = {};
    if (templateConfig.variables) {
      for (const v of templateConfig.variables) {
        variables[v.name] = args.variables?.[v.name] || v.default || '';
      }
    }
    // Override with provided variables
    Object.assign(variables, args.variables || {});

    // Create output directory
    const outputPath = path.resolve(PROJECT_ROOT, args.output_dir);
    if (!fs.existsSync(outputPath)) {
      fs.mkdirSync(outputPath, { recursive: true });
    }

    // Copy files
    const filesDir = path.join(templateDir, 'files');
    const createdFiles: string[] = [];

    function copyFilesRecursive(src: string, dest: string) {
      const entries = fs.readdirSync(src, { withFileTypes: true });

      for (const entry of entries) {
        const srcPath = path.join(src, entry.name);
        let destName = entry.name;

        // Remove .hbs extension for output
        if (destName.endsWith('.hbs')) {
          destName = destName.slice(0, -4);
        }

        const destPath = path.join(dest, destName);

        if (entry.isDirectory()) {
          fs.mkdirSync(destPath, { recursive: true });
          copyFilesRecursive(srcPath, destPath);
        } else {
          let content = fs.readFileSync(srcPath, 'utf-8');

          // Apply variable substitutions (simple Handlebars-style)
          for (const [key, value] of Object.entries(variables)) {
            const regex = new RegExp(`\\{\\{${key}\\}\\}`, 'g');
            content = content.replace(regex, value);
          }

          fs.writeFileSync(destPath, content);
          createdFiles.push(path.relative(outputPath, destPath));
        }
      }
    }

    if (fs.existsSync(filesDir)) {
      copyFilesRecursive(filesDir, outputPath);
    }

    // Run post-create commands
    const postCreateResults: Array<{ command: string; success: boolean; output: string }> = [];

    if (args.run_install !== false) {
      const pm = detectPackageManager(outputPath);
      const installCmd = pm === 'npm' ? 'npm install' : `${pm} install`;
      const result = await safeExec(installCmd, outputPath, 120000);
      postCreateResults.push({
        command: installCmd,
        success: !result.error,
        output: result.stdout.slice(0, 200),
      });
    }

    if (args.run_git_init !== false) {
      const result = await safeExec('git init', outputPath, 10000);
      postCreateResults.push({
        command: 'git init',
        success: !result.error,
        output: result.stdout.slice(0, 100),
      });
    }

    // Determine next steps
    const nextSteps = [
      `cd ${args.output_dir}`,
    ];

    if (args.template === 'next-saas') {
      nextSteps.push('cp .env.example .env');
      nextSteps.push('Configure environment variables in .env');
      nextSteps.push('npx prisma db push');
    }

    nextSteps.push('npm run dev');

    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          success: true,
          template: args.template,
          output_dir: args.output_dir,
          created_files: createdFiles,
          variables_applied: variables,
          post_create_results: postCreateResults,
          recommended_skills: templateConfig.required_skills || [],
          next_steps: nextSteps,
        }, null, 2),
      }],
    };
  }

  private handleListTemplates(args: { category?: string }) {
    const templatePath = path.join(PLUGIN_ROOT, 'templates');
    const registryPath = path.join(templatePath, '_registry.yaml');

    if (!fs.existsSync(registryPath)) {
      throw new Error('Template registry not found');
    }

    const registry = yaml.load(fs.readFileSync(registryPath, 'utf-8')) as {
      templates: Array<{
        name: string;
        path: string;
        description: string;
        category: string;
        stack: string[];
        complexity: string;
      }>;
    };

    let templates = registry.templates || [];

    if (args.category) {
      templates = templates.filter(t => t.category === args.category);
    }

    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          templates,
          total: templates.length,
          categories: ['minimal', 'full'],
        }, null, 2),
      }],
    };
  }

  /**
   * Start the server
   */
  async run(): Promise<void> {
    this.initializeIndexes();

    const transport = new StdioServerTransport();
    await this.server.connect(transport);

    console.error('GoodVibes MCP Server v2.1.0 running with 17 tools');
  }
}

// Main entry point
const server = new GoodVibesServer();
server.run().catch((error) => {
  console.error('Server error:', error);
  process.exit(1);
});
