/**
 * Explain Codebase Handler
 *
 * LLM-powered tool that generates a high-level explanation of a codebase.
 * Gathers information from multiple sources (stack detection, API routes,
 * conventions, directory structure) and uses Claude to synthesize into
 * a comprehensive overview with architecture diagrams.
 *
 * @module handlers/docs/explain-codebase
 */

import * as fs from 'fs';
import * as fsPromises from 'fs/promises';
import * as path from 'path';
import { spawn } from 'child_process';

import { success, error, readJsonFile, fileExists } from '../../utils.js';
import { PROJECT_ROOT } from '../../config.js';
import { handleDetectStack } from '../context.js';
import { handleGetApiRoutes } from '../schema/index.js';
import { handleGetConventions, type GetConventionsArgs } from '../project/conventions.js';

// =============================================================================
// Types
// =============================================================================

/**
 * Arguments for the explain_codebase MCP tool
 */
export interface ExplainCodebaseArgs {
  /** Directory to analyze (defaults to PROJECT_ROOT) */
  path?: string;
  /** Analysis depth: shallow (fast), medium (default), deep (thorough) */
  depth?: 'shallow' | 'medium' | 'deep';
  /** Specific areas to focus on (e.g., ["auth", "api", "database"]) */
  focus?: string[];
  /** Regenerate even if cached (default: false) */
  refresh?: boolean;
  /** Generate architecture diagram (default: true) */
  include_architecture?: boolean;
}

/**
 * Key file detected in the codebase
 */
interface KeyFile {
  path: string;
  purpose: string;
  importance: 'critical' | 'high' | 'medium';
}

/**
 * Architecture information
 */
interface Architecture {
  type: string;
  description: string;
  layers?: string[];
  diagram_ascii?: string;
}

/**
 * Result from explain_codebase tool
 */
interface ExplainCodebaseResult {
  summary: string;
  tech_stack: string[];
  architecture: Architecture;
  key_files: KeyFile[];
  entry_points: string[];
  main_features: string[];
  dependencies_summary: string;
  patterns_used: string[];
  conventions: string[];
  concerns?: string[];
  cached: boolean;
  generated_at: string;
}

/**
 * Cached explanation data
 */
interface CachedExplanation extends ExplainCodebaseResult {
  cache_version: number;
  project_hash: string;
}

/**
 * Gathered codebase information before LLM analysis
 */
interface CodebaseInfo {
  packageJson: PackageJsonData | null;
  stack: StackData;
  apiRoutes: ApiRoutesData;
  conventions: ConventionsData;
  structure: string;
  keyFiles: KeyFile[];
  entryPoints: string[];
}

/**
 * Package.json data structure
 */
interface PackageJsonData {
  name?: string;
  description?: string;
  version?: string;
  scripts?: Record<string, string>;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
}

/**
 * Stack detection result
 */
interface StackData {
  frontend?: {
    framework?: string;
    ui_library?: string;
    styling?: string;
    state_management?: string;
  };
  backend?: {
    runtime?: string;
    framework?: string;
    orm?: string;
    database?: string;
  };
  build?: {
    bundler?: string;
    package_manager?: string;
    typescript?: boolean;
  };
  detected_configs?: string[];
  recommended_skills?: string[];
}

/**
 * API routes result
 */
interface ApiRoutesData {
  routes?: Array<{
    method: string;
    path: string;
    handler?: string;
  }>;
  framework?: string;
}

/**
 * Conventions result
 */
interface ConventionsData {
  naming?: {
    files?: string;
    variables?: string;
    functions?: string;
  };
  imports?: {
    order?: string[];
    style?: string;
  };
  structure?: {
    directory_layout?: string[];
  };
}

// =============================================================================
// Constants
// =============================================================================

const CACHE_DIR = '.goodvibes/cache';
const CACHE_FILE = 'codebase-explanation.json';
const CACHE_VERSION = 1;

/**
 * Key file patterns with importance levels
 */
const KEY_FILE_PATTERNS: Array<{
  pattern: RegExp;
  importance: 'critical' | 'high' | 'medium';
  purpose: string;
}> = [
  // Entry points - Critical
  { pattern: /^src\/(index|main|app)\.(ts|js|tsx|jsx)$/, importance: 'critical', purpose: 'Application entry point' },
  { pattern: /^(index|main|app)\.(ts|js|tsx|jsx)$/, importance: 'critical', purpose: 'Application entry point' },
  { pattern: /^src\/server\.(ts|js)$/, importance: 'critical', purpose: 'Server entry point' },
  { pattern: /^server\.(ts|js)$/, importance: 'critical', purpose: 'Server entry point' },

  // Next.js specific - Critical
  { pattern: /^app\/layout\.(tsx|jsx|ts|js)$/, importance: 'critical', purpose: 'Next.js root layout' },
  { pattern: /^app\/page\.(tsx|jsx|ts|js)$/, importance: 'critical', purpose: 'Next.js home page' },
  { pattern: /^pages\/_app\.(tsx|jsx|ts|js)$/, importance: 'critical', purpose: 'Next.js app wrapper' },
  { pattern: /^pages\/index\.(tsx|jsx|ts|js)$/, importance: 'critical', purpose: 'Next.js home page' },

  // Configuration - Critical
  { pattern: /^next\.config\.(js|mjs|ts)$/, importance: 'critical', purpose: 'Next.js configuration' },
  { pattern: /^vite\.config\.(ts|js)$/, importance: 'critical', purpose: 'Vite configuration' },
  { pattern: /schema\.prisma$/, importance: 'critical', purpose: 'Prisma database schema' },

  // Routing - High
  { pattern: /^src\/(routes|router)\.(ts|js)$/, importance: 'high', purpose: 'Application routing' },
  { pattern: /^app\/api\/.*\/route\.(ts|js)$/, importance: 'high', purpose: 'API route handler' },

  // Configuration - High
  { pattern: /^(src\/)?(config|settings)\.(ts|js)$/, importance: 'high', purpose: 'Application configuration' },
  { pattern: /^tsconfig\.json$/, importance: 'high', purpose: 'TypeScript configuration' },
  { pattern: /^tailwind\.config\.(js|ts)$/, importance: 'high', purpose: 'Tailwind CSS configuration' },
  { pattern: /^drizzle\.config\.(ts|js)$/, importance: 'high', purpose: 'Drizzle ORM configuration' },

  // Auth - High
  { pattern: /^(src\/)?(auth|authentication)\.(ts|js)$/, importance: 'high', purpose: 'Authentication logic' },
  { pattern: /^(src\/)?lib\/auth\.(ts|js)$/, importance: 'high', purpose: 'Authentication utilities' },
  { pattern: /^(src\/)?middleware\.(ts|js)$/, importance: 'high', purpose: 'Request middleware' },

  // Database - High
  { pattern: /^(src\/)?lib\/db\.(ts|js)$/, importance: 'high', purpose: 'Database client setup' },
  { pattern: /^(src\/)?db\/(index|client)\.(ts|js)$/, importance: 'high', purpose: 'Database client' },

  // State management - Medium
  { pattern: /^(src\/)?store\/(index)?\.(ts|js)$/, importance: 'medium', purpose: 'State store configuration' },
  { pattern: /^(src\/)?context\/.*\.(tsx|ts)$/, importance: 'medium', purpose: 'React context provider' },

  // API - Medium
  { pattern: /^(src\/)?api\/(index|client)\.(ts|js)$/, importance: 'medium', purpose: 'API client setup' },
  { pattern: /^(src\/)?trpc\/.*\.(ts|js)$/, importance: 'medium', purpose: 'tRPC router/procedures' },

  // Types - Medium
  { pattern: /^(src\/)?types\/(index)?\.(ts|d\.ts)$/, importance: 'medium', purpose: 'Type definitions' },
];

/**
 * Directories to skip when scanning
 */
const SKIP_DIRS = new Set([
  'node_modules', '.git', 'dist', 'build', 'out', '.next', '.nuxt',
  '.svelte-kit', 'coverage', '.cache', '.turbo', '.vercel',
]);

/**
 * Maximum directory depth for structure scan
 */
const MAX_STRUCTURE_DEPTH: Record<string, number> = {
  shallow: 2,
  medium: 3,
  deep: 4,
};

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Get directory structure as a tree string
 */
async function getDirectoryStructure(
  dir: string,
  baseDir: string,
  maxDepth: number,
  currentDepth: number = 0,
  prefix: string = '',
): Promise<string> {
  if (currentDepth >= maxDepth) return '';

  let result = '';

  try {
    const entries = await fsPromises.readdir(dir, { withFileTypes: true });
    const filtered = entries.filter(e => !SKIP_DIRS.has(e.name) && !e.name.startsWith('.'));

    // Sort: directories first, then files
    filtered.sort((a, b) => {
      if (a.isDirectory() && !b.isDirectory()) return -1;
      if (!a.isDirectory() && b.isDirectory()) return 1;
      return a.name.localeCompare(b.name);
    });

    for (let i = 0; i < filtered.length; i++) {
      const entry = filtered[i];
      const isLast = i === filtered.length - 1;
      const connector = isLast ? '\\--' : '|--';
      const childPrefix = isLast ? '   ' : '|  ';

      result += `${prefix}${connector} ${entry.name}${entry.isDirectory() ? '/' : ''}\n`;

      if (entry.isDirectory()) {
        const childDir = path.join(dir, entry.name);
        result += await getDirectoryStructure(
          childDir,
          baseDir,
          maxDepth,
          currentDepth + 1,
          prefix + childPrefix
        );
      }
    }
  } catch {
    // Directory read error, skip
  }

  return result;
}

/**
 * Find key files in the project
 */
async function findKeyFiles(projectPath: string): Promise<KeyFile[]> {
  const keyFiles: KeyFile[] = [];

  async function scanDir(dir: string, relativePath: string = ''): Promise<void> {
    try {
      const entries = await fsPromises.readdir(dir, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        const relPath = path.join(relativePath, entry.name).replace(/\\/g, '/');

        if (entry.isDirectory()) {
          if (!SKIP_DIRS.has(entry.name) && !entry.name.startsWith('.')) {
            await scanDir(fullPath, relPath);
          }
        } else {
          // Check against patterns
          for (const pattern of KEY_FILE_PATTERNS) {
            if (pattern.pattern.test(relPath)) {
              keyFiles.push({
                path: relPath,
                purpose: pattern.purpose,
                importance: pattern.importance,
              });
              break;
            }
          }
        }
      }
    } catch {
      // Directory read error, skip
    }
  }

  await scanDir(projectPath);

  // Sort by importance
  const importanceOrder = { critical: 0, high: 1, medium: 2 };
  keyFiles.sort((a, b) => importanceOrder[a.importance] - importanceOrder[b.importance]);

  return keyFiles;
}

/**
 * Find entry points in the project
 */
async function findEntryPoints(projectPath: string, packageJson: PackageJsonData | null): Promise<string[]> {
  const entryPoints: string[] = [];

  // Check package.json main/module/exports
  if (packageJson) {
    const pkg = packageJson as Record<string, unknown>;
    if (typeof pkg.main === 'string') entryPoints.push(pkg.main);
    if (typeof pkg.module === 'string') entryPoints.push(pkg.module);

    // Check scripts for common entry patterns
    if (packageJson.scripts) {
      const scripts = packageJson.scripts;
      if (scripts.dev?.includes('next')) entryPoints.push('app/ (Next.js App Router)');
      if (scripts.dev?.includes('vite')) entryPoints.push('index.html / src/main.tsx');
      if (scripts.start?.includes('node')) {
        const match = scripts.start.match(/node\s+(\S+)/);
        if (match) entryPoints.push(match[1]);
      }
    }
  }

  // Check for common entry files
  const commonEntries = [
    'src/index.ts', 'src/index.tsx', 'src/main.ts', 'src/main.tsx',
    'src/app.ts', 'src/app.tsx', 'app/page.tsx', 'pages/index.tsx',
    'index.ts', 'index.js', 'server.ts', 'server.js',
  ];

  for (const entry of commonEntries) {
    if (await fileExists(path.join(projectPath, entry))) {
      if (!entryPoints.includes(entry)) {
        entryPoints.push(entry);
      }
    }
  }

  return Array.from(new Set(entryPoints));
}

/**
 * Generate a hash of key project files for cache invalidation
 */
async function generateProjectHash(projectPath: string): Promise<string> {
  const filesToHash = [
    'package.json',
    'package-lock.json',
    'pnpm-lock.yaml',
    'yarn.lock',
    'tsconfig.json',
  ];

  let hashContent = '';

  for (const file of filesToHash) {
    const filePath = path.join(projectPath, file);
    try {
      const stat = await fsPromises.stat(filePath);
      hashContent += `${file}:${stat.mtimeMs}:${stat.size};`;
    } catch {
      // File doesn't exist, skip
    }
  }

  // Simple hash function
  let hash = 0;
  for (let i = 0; i < hashContent.length; i++) {
    const char = hashContent.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }

  return hash.toString(36);
}

/**
 * Get cached explanation if valid
 */
async function getCachedExplanation(projectPath: string): Promise<CachedExplanation | null> {
  const cachePath = path.join(projectPath, CACHE_DIR, CACHE_FILE);

  try {
    if (!(await fileExists(cachePath))) {
      return null;
    }

    const content = await fsPromises.readFile(cachePath, 'utf-8');
    const cached = JSON.parse(content) as CachedExplanation;

    // Check cache version
    if (cached.cache_version !== CACHE_VERSION) {
      return null;
    }

    // Check if project has changed
    const currentHash = await generateProjectHash(projectPath);
    if (cached.project_hash !== currentHash) {
      return null;
    }

    return cached;
  } catch {
    return null;
  }
}

/**
 * Save explanation to cache
 */
async function cacheExplanation(
  projectPath: string,
  result: ExplainCodebaseResult,
): Promise<void> {
  const cacheDir = path.join(projectPath, CACHE_DIR);
  const cachePath = path.join(cacheDir, CACHE_FILE);

  try {
    await fsPromises.mkdir(cacheDir, { recursive: true });

    const cached: CachedExplanation = {
      ...result,
      cache_version: CACHE_VERSION,
      project_hash: await generateProjectHash(projectPath),
    };

    await fsPromises.writeFile(cachePath, JSON.stringify(cached, null, 2));
  } catch {
    // Cache write failed, non-critical
  }
}

/**
 * Spawn Claude CLI and get JSON response
 */
async function spawnClaude(prompt: string, timeout: number = 90000): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const args = ['--print', '-p', prompt];
    const child = spawn('claude', args, {
      shell: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    child.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    child.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`Claude CLI exited with code ${code}: ${stderr}`));
        return;
      }

      // Try to extract JSON from the response
      try {
        // Look for JSON block in the output
        const jsonMatch = stdout.match(/```json\n?([\s\S]*?)\n?```/);
        if (jsonMatch) {
          resolve(JSON.parse(jsonMatch[1]));
          return;
        }

        // Try parsing the whole output as JSON
        const trimmed = stdout.trim();
        const startIdx = trimmed.indexOf('{');
        const endIdx = trimmed.lastIndexOf('}');
        if (startIdx !== -1 && endIdx !== -1 && endIdx > startIdx) {
          resolve(JSON.parse(trimmed.substring(startIdx, endIdx + 1)));
          return;
        }

        reject(new Error('No valid JSON found in Claude response'));
      } catch (parseError) {
        reject(new Error(`Failed to parse Claude response: ${parseError}`));
      }
    });

    child.on('error', (err) => {
      reject(new Error(`Failed to spawn Claude CLI: ${err.message}`));
    });

    // Timeout
    const timeoutId = setTimeout(() => {
      child.kill();
      reject(new Error(`Claude CLI timed out after ${timeout / 1000} seconds`));
    }, timeout);

    child.on('close', () => clearTimeout(timeoutId));
  });
}

/**
 * Generate ASCII architecture diagram based on detected stack
 */
function generateArchitectureDiagram(stack: StackData, apiRoutes: ApiRoutesData): string {
  const hasApi = apiRoutes.routes && apiRoutes.routes.length > 0;
  const hasDatabase = stack.backend?.orm || stack.backend?.database;
  const isNextjs = stack.frontend?.framework === 'next';
  const isFullStack = hasApi && stack.frontend?.ui_library;

  if (isNextjs && isFullStack) {
    return `
+--------------------------------------------------+
|                    Client Browser                 |
+--------------------------------------------------+
                         |
                         v
+--------------------------------------------------+
|               Next.js Application                 |
|  +--------------------------------------------+  |
|  |          React Components (UI)             |  |
|  |  +-------+  +-------+  +-------+          |  |
|  |  | Pages |  | Comps |  | Hooks |          |  |
|  |  +-------+  +-------+  +-------+          |  |
|  +--------------------------------------------+  |
|  +--------------------------------------------+  |
|  |           API Routes / Server Actions       |  |
|  |  +----------------+  +----------------+    |  |
|  |  | /api/...       |  | Server Actions |    |  |
|  |  +----------------+  +----------------+    |  |
|  +--------------------------------------------+  |
+--------------------------------------------------+
                         |
                         v
+--------------------------------------------------+
|                Database Layer                     |
|  +--------------------------------------------+  |
|  |  ${(stack.backend?.orm || 'ORM').padEnd(10)} -> ${(stack.backend?.database || 'Database').padEnd(20)}  |  |
|  +--------------------------------------------+  |
+--------------------------------------------------+
`.trim();
  }

  if (isFullStack) {
    return `
+--------------------------------------------------+
|                    Client Browser                 |
+--------------------------------------------------+
                         |
                         v
+--------------------------------------------------+
|                Frontend Layer                     |
|  +--------------------------------------------+  |
|  |  ${(stack.frontend?.ui_library || 'UI').padEnd(8)} + ${(stack.frontend?.styling || 'CSS').padEnd(10)} Components      |  |
|  +--------------------------------------------+  |
+--------------------------------------------------+
                         |
                         v
+--------------------------------------------------+
|                 Backend Layer                     |
|  +--------------------------------------------+  |
|  |  ${(stack.backend?.framework || 'Server').padEnd(12)} API Routes               |  |
|  +--------------------------------------------+  |
+--------------------------------------------------+
${hasDatabase ? `                         |
                         v
+--------------------------------------------------+
|                Database Layer                     |
|  +--------------------------------------------+  |
|  |  ${(stack.backend?.orm || 'ORM').padEnd(10)} -> ${(stack.backend?.database || 'Database').padEnd(20)}  |  |
|  +--------------------------------------------+  |
+--------------------------------------------------+` : ''}
`.trim();
  }

  // Frontend-only application
  if (stack.frontend?.ui_library && !hasApi) {
    return `
+--------------------------------------------------+
|                    Client Browser                 |
+--------------------------------------------------+
                         |
                         v
+--------------------------------------------------+
|              Single Page Application              |
|  +--------------------------------------------+  |
|  |  ${(stack.frontend?.ui_library || 'UI').padEnd(8)} + ${(stack.frontend?.styling || 'CSS').padEnd(10)}                   |  |
|  +--------------------------------------------+  |
|  +--------------------------------------------+  |
|  |  State: ${(stack.frontend?.state_management || 'Local').padEnd(10)}                       |  |
|  +--------------------------------------------+  |
+--------------------------------------------------+
                         |
                         v
+--------------------------------------------------+
|               External APIs / Services            |
+--------------------------------------------------+
`.trim();
  }

  // Backend-only / API service
  if (hasApi && !stack.frontend?.ui_library) {
    return `
+--------------------------------------------------+
|                  API Consumers                    |
+--------------------------------------------------+
                         |
                         v
+--------------------------------------------------+
|                  API Service                      |
|  +--------------------------------------------+  |
|  |  ${(stack.backend?.framework || 'Server').padEnd(12)} REST/GraphQL API         |  |
|  +--------------------------------------------+  |
+--------------------------------------------------+
${hasDatabase ? `                         |
                         v
+--------------------------------------------------+
|                Database Layer                     |
|  +--------------------------------------------+  |
|  |  ${(stack.backend?.orm || 'Driver').padEnd(10)} -> ${(stack.backend?.database || 'Database').padEnd(20)}  |  |
|  +--------------------------------------------+  |
+--------------------------------------------------+` : ''}
`.trim();
  }

  // Generic/Unknown structure
  return `
+--------------------------------------------------+
|                   Application                     |
|  +--------------------------------------------+  |
|  |               Source Code                   |  |
|  |          (Structure analysis needed)        |  |
|  +--------------------------------------------+  |
+--------------------------------------------------+
`.trim();
}

/**
 * Build the LLM analysis prompt
 */
function buildAnalysisPrompt(
  info: CodebaseInfo,
  focus: string[],
  depth: string,
): string {
  const focusText = focus.length > 0
    ? `Focus especially on: ${focus.join(', ')}`
    : 'Provide a general overview';

  const depthInstructions: Record<string, string> = {
    shallow: 'Be concise. 1-2 paragraphs for summary.',
    medium: 'Be moderately detailed. 2-3 paragraphs for summary.',
    deep: 'Be thorough. 3-4 paragraphs with comprehensive analysis.',
  };

  return `Analyze this codebase and provide a comprehensive explanation.

## Project Info
Name: ${info.packageJson?.name || 'Unknown'}
Description: ${info.packageJson?.description || 'No description'}
Version: ${info.packageJson?.version || 'Unknown'}

## Technology Stack
${JSON.stringify(info.stack, null, 2)}

## Directory Structure
${info.structure || 'Not available'}

## API Routes (first 15)
${JSON.stringify(info.apiRoutes.routes?.slice(0, 15), null, 2)}

## Key Files
${info.keyFiles.map(f => `- ${f.path} (${f.importance}): ${f.purpose}`).join('\n')}

## Entry Points
${info.entryPoints.join('\n')}

## Detected Conventions
${JSON.stringify(info.conventions, null, 2)}

## Analysis Instructions
${focusText}
${depthInstructions[depth] || depthInstructions.medium}

Respond with ONLY a JSON object (no markdown fences, no explanation) with this exact structure:
{
  "summary": "2-3 paragraph overview of what this project is and does",
  "architecture": {
    "type": "monolith|microservices|modular-monolith|serverless|spa|jamstack",
    "description": "Explanation of the architecture pattern used",
    "layers": ["layer1", "layer2", "layer3"]
  },
  "main_features": ["feature1", "feature2", "feature3"],
  "dependencies_summary": "Brief summary of key dependencies and their purpose",
  "patterns_used": ["pattern1", "pattern2"],
  "conventions": ["convention1", "convention2"],
  "concerns": ["potential issue 1", "tech debt item"]
}

Important:
- summary should explain WHAT the project does, WHO it's for, and HOW it works at a high level
- architecture.type should reflect the actual pattern (not just the framework)
- main_features should be inferred from routes, components, and structure
- patterns_used should identify actual design patterns (Repository, Factory, MVC, etc.)
- concerns should highlight genuine issues, not generic advice`;
}

/**
 * Create fallback result when LLM is unavailable
 */
function createFallbackResult(
  info: CodebaseInfo,
  includeArchitecture: boolean,
): ExplainCodebaseResult {
  // Determine architecture type from stack
  let archType = 'unknown';
  let archDesc = 'Unable to determine architecture pattern';
  const layers: string[] = [];

  const stack = info.stack;
  const hasApi = info.apiRoutes.routes && info.apiRoutes.routes.length > 0;

  if (stack.frontend?.framework === 'next') {
    archType = 'modular-monolith';
    archDesc = 'Next.js full-stack application with colocated frontend and API routes';
    layers.push('UI Components', 'API Routes', 'Data Layer');
  } else if (stack.frontend?.ui_library && hasApi) {
    archType = 'monolith';
    archDesc = 'Full-stack application with frontend and backend in the same codebase';
    layers.push('Frontend', 'Backend', 'Database');
  } else if (stack.frontend?.ui_library) {
    archType = 'spa';
    archDesc = 'Single Page Application (client-side only)';
    layers.push('UI Components', 'State Management', 'API Client');
  } else if (hasApi) {
    archType = 'api-service';
    archDesc = 'Backend API service';
    layers.push('API Layer', 'Business Logic', 'Data Access');
  }

  // Build tech stack array
  const techStack: string[] = [];
  if (stack.frontend?.framework) techStack.push(stack.frontend.framework);
  if (stack.frontend?.ui_library) techStack.push(stack.frontend.ui_library);
  if (stack.frontend?.styling) techStack.push(stack.frontend.styling);
  if (stack.backend?.orm) techStack.push(stack.backend.orm);
  if (stack.build?.typescript) techStack.push('TypeScript');
  if (stack.build?.bundler) techStack.push(stack.build.bundler);

  // Build summary
  const name = info.packageJson?.name || 'This project';
  const desc = info.packageJson?.description || '';
  const summary = `${name} is a ${archType} application built with ${techStack.slice(0, 3).join(', ')}. ${desc ? desc + '. ' : ''}The codebase contains ${info.keyFiles.length} key files and ${info.apiRoutes.routes?.length || 0} API routes. For a more detailed analysis, run with Claude CLI available.`;

  // Determine main features from API routes
  const mainFeatures: string[] = [];
  if (info.apiRoutes.routes) {
    const routePaths = new Set(info.apiRoutes.routes.map(r => r.path.split('/')[2] || r.path.split('/')[1]));
    mainFeatures.push(...Array.from(routePaths).slice(0, 5).filter(Boolean));
  }
  if (mainFeatures.length === 0) {
    mainFeatures.push('See API routes for features');
  }

  // Dependencies summary
  const deps = info.packageJson?.dependencies || {};
  const depCount = Object.keys(deps).length;
  const depsSummary = `${depCount} production dependencies including ${techStack.slice(0, 3).join(', ')}.`;

  // Patterns from conventions
  const patterns: string[] = [];
  if (info.conventions.imports?.style) patterns.push(`Import style: ${info.conventions.imports.style}`);
  if (info.conventions.structure?.directory_layout) {
    patterns.push(`Structure: ${info.conventions.structure.directory_layout.slice(0, 3).join(', ')}`);
  }

  const architecture: Architecture = {
    type: archType,
    description: archDesc,
    layers,
  };

  if (includeArchitecture) {
    architecture.diagram_ascii = generateArchitectureDiagram(stack, info.apiRoutes);
  }

  return {
    summary,
    tech_stack: techStack,
    architecture,
    key_files: info.keyFiles,
    entry_points: info.entryPoints,
    main_features: mainFeatures,
    dependencies_summary: depsSummary,
    patterns_used: patterns,
    conventions: info.conventions.structure?.directory_layout || [],
    concerns: ['LLM analysis unavailable - results are based on static analysis only'],
    cached: false,
    generated_at: new Date().toISOString(),
  };
}

/**
 * Gather all codebase information
 */
async function gatherCodebaseInfo(
  projectPath: string,
  depth: 'shallow' | 'medium' | 'deep',
): Promise<CodebaseInfo> {
  // Read package.json
  const packageJson = await readJsonFile(path.join(projectPath, 'package.json')) as PackageJsonData | null;

  // Detect stack (parse the response)
  const stackResponse = await handleDetectStack({ path: projectPath });
  let stack: StackData = {};
  try {
    const stackText = stackResponse.content[0].text;
    stack = JSON.parse(stackText);
  } catch {
    // Stack detection failed, use empty
  }

  // Get API routes (parse the response)
  const apiResponse = await handleGetApiRoutes({ path: projectPath });
  let apiRoutes: ApiRoutesData = {};
  try {
    const apiText = apiResponse.content[0].text;
    apiRoutes = JSON.parse(apiText);
  } catch {
    // API routes detection failed, use empty
  }

  // Get conventions (for medium/deep analysis only)
  let conventions: ConventionsData = {};
  if (depth !== 'shallow') {
    try {
      const convArgs: GetConventionsArgs = { path: projectPath };
      const convResponse = await handleGetConventions(convArgs);
      const convText = convResponse.content[0].text;
      conventions = JSON.parse(convText);
    } catch {
      // Conventions detection failed, use empty
    }
  }

  // Get directory structure
  const maxDepth = MAX_STRUCTURE_DEPTH[depth] || 3;
  const structure = await getDirectoryStructure(projectPath, projectPath, maxDepth);

  // Find key files
  const keyFiles = await findKeyFiles(projectPath);

  // Find entry points
  const entryPoints = await findEntryPoints(projectPath, packageJson);

  return {
    packageJson,
    stack,
    apiRoutes,
    conventions,
    structure,
    keyFiles,
    entryPoints,
  };
}

// =============================================================================
// Main Handler
// =============================================================================

/**
 * Handles the explain_codebase MCP tool call.
 *
 * Generates a high-level explanation of a codebase using LLM analysis.
 * Gathers information from multiple sources including stack detection,
 * API routes, conventions, and directory structure, then synthesizes
 * into a comprehensive overview.
 *
 * @param args - The explain_codebase tool arguments
 * @param args.path - Directory to analyze (defaults to PROJECT_ROOT)
 * @param args.depth - Analysis depth: shallow, medium (default), deep
 * @param args.focus - Specific areas to focus on
 * @param args.refresh - Force regeneration even if cached
 * @param args.include_architecture - Include ASCII architecture diagram
 * @returns MCP tool response with codebase explanation
 *
 * @example
 * handleExplainCodebase({});
 * // Returns comprehensive codebase explanation
 *
 * @example
 * handleExplainCodebase({ depth: 'deep', focus: ['auth', 'api'] });
 * // Returns detailed analysis focusing on auth and API
 */
export async function handleExplainCodebase(args: ExplainCodebaseArgs) {
  const projectPath = path.resolve(PROJECT_ROOT, args.path || '.');
  const depth = args.depth || 'medium';
  const focus = args.focus || [];
  const refresh = args.refresh || false;
  const includeArchitecture = args.include_architecture !== false;

  // Validate path exists
  if (!fs.existsSync(projectPath)) {
    return error(`Path does not exist: ${projectPath}`);
  }

  // Check cache (unless refresh requested)
  if (!refresh) {
    const cached = await getCachedExplanation(projectPath);
    if (cached) {
      // Return cached result with cache flag
      const result: ExplainCodebaseResult = {
        summary: cached.summary,
        tech_stack: cached.tech_stack,
        architecture: cached.architecture,
        key_files: cached.key_files,
        entry_points: cached.entry_points,
        main_features: cached.main_features,
        dependencies_summary: cached.dependencies_summary,
        patterns_used: cached.patterns_used,
        conventions: cached.conventions,
        concerns: cached.concerns,
        cached: true,
        generated_at: cached.generated_at,
      };
      return success(result);
    }
  }

  // Gather codebase information
  const info = await gatherCodebaseInfo(projectPath, depth);

  // Build prompt for Claude
  const prompt = buildAnalysisPrompt(info, focus, depth);

  try {
    // Call Claude for analysis
    const timeout = depth === 'deep' ? 120000 : depth === 'shallow' ? 60000 : 90000;
    const llmResult = await spawnClaude(prompt, timeout) as Partial<ExplainCodebaseResult>;

    // Build final result
    const result: ExplainCodebaseResult = {
      summary: llmResult.summary || 'Analysis incomplete',
      tech_stack: info.stack.recommended_skills?.map(s => s.split('/').pop() || s) || [],
      architecture: {
        type: llmResult.architecture?.type || 'unknown',
        description: llmResult.architecture?.description || 'Unable to determine',
        layers: llmResult.architecture?.layers || [],
        ...(includeArchitecture && {
          diagram_ascii: generateArchitectureDiagram(info.stack, info.apiRoutes),
        }),
      },
      key_files: info.keyFiles,
      entry_points: info.entryPoints,
      main_features: llmResult.main_features || [],
      dependencies_summary: llmResult.dependencies_summary || 'Not analyzed',
      patterns_used: llmResult.patterns_used || [],
      conventions: llmResult.conventions || [],
      concerns: llmResult.concerns,
      cached: false,
      generated_at: new Date().toISOString(),
    };

    // Enhance tech_stack from actual stack detection
    const techStack: string[] = [];
    if (info.stack.frontend?.framework) techStack.push(info.stack.frontend.framework);
    if (info.stack.frontend?.ui_library) techStack.push(info.stack.frontend.ui_library);
    if (info.stack.frontend?.styling) techStack.push(info.stack.frontend.styling);
    if (info.stack.frontend?.state_management) techStack.push(info.stack.frontend.state_management);
    if (info.stack.backend?.framework) techStack.push(info.stack.backend.framework);
    if (info.stack.backend?.orm) techStack.push(info.stack.backend.orm);
    if (info.stack.build?.typescript) techStack.push('TypeScript');
    if (info.stack.build?.bundler) techStack.push(info.stack.build.bundler);
    result.tech_stack = Array.from(new Set(techStack));

    // Cache the result
    await cacheExplanation(projectPath, result);

    return success(result);
  } catch (err) {
    // Fallback to static analysis if Claude is unavailable
    console.error('[explain-codebase] LLM analysis failed, using fallback:', err instanceof Error ? err.message : err);

    const fallbackResult = createFallbackResult(info, includeArchitecture);

    // Cache even the fallback (to avoid repeated failures)
    await cacheExplanation(projectPath, fallbackResult);

    return success(fallbackResult);
  }
}
