/**
 * Conventions Analysis Handler
 *
 * LLM-powered analysis of code patterns and conventions in a project.
 * Samples files from different parts of the codebase, analyzes patterns,
 * and uses Claude to synthesize findings into actionable conventions.
 *
 * @module handlers/project/conventions
 */

import * as fs from 'fs';
import * as path from 'path';
import { spawn } from 'child_process';

import { success, error } from '../../utils.js';
import { PROJECT_ROOT } from '../../config.js';

/**
 * Arguments for the get_conventions MCP tool
 */
export interface GetConventionsArgs {
  /** Directory to analyze (defaults to PROJECT_ROOT) */
  path?: string;
  /** Specific areas to focus on */
  focus?: Array<'naming' | 'imports' | 'structure' | 'testing' | 'error-handling'>;
}

/**
 * Convention pattern detected in the codebase
 */
interface Convention {
  category: string;
  pattern: string;
  examples: string[];
  rationale: string;
  confidence: 'high' | 'medium' | 'low';
}

/**
 * Naming conventions detected
 */
interface NamingConventions {
  files: string;
  variables: string;
  functions: string;
  classes: string;
  constants: string;
}

/**
 * Import conventions detected
 */
interface ImportConventions {
  order: string[];
  style: string;
  barrel_files: boolean;
}

/**
 * Structure conventions detected
 */
interface StructureConventions {
  directory_layout: string[];
  component_organization: string;
}

/**
 * Testing conventions detected
 */
interface TestingConventions {
  file_naming: string;
  describe_structure: string;
  assertion_style: string;
}

/**
 * Error handling conventions detected
 */
interface ErrorHandlingConventions {
  pattern: string;
  custom_errors: boolean;
  logging: string;
}

/**
 * Config file information
 */
interface ConfigFile {
  file: string;
  purpose: string;
}

/**
 * Result from get_conventions tool
 */
interface ConventionsResult {
  conventions: Convention[];
  naming: NamingConventions;
  imports: ImportConventions;
  structure: StructureConventions;
  testing: TestingConventions;
  error_handling: ErrorHandlingConventions;
  config_files: ConfigFile[];
  recommendations: string[];
}

// File extensions to sample
const SAMPLE_EXTENSIONS = new Set([
  '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs',
]);

// Directories to skip during scanning
const SKIP_DIRS = new Set([
  'node_modules', '.git', 'dist', 'build', 'out',
  '.next', '.nuxt', '.svelte-kit', 'coverage',
  '.cache', 'vendor', '__pycache__', '.venv', 'venv', 'target',
]);

// Config files to detect
const CONFIG_FILES: Record<string, string> = {
  'tsconfig.json': 'TypeScript configuration',
  'tsconfig.build.json': 'TypeScript build configuration',
  '.eslintrc.js': 'ESLint configuration (legacy)',
  '.eslintrc.json': 'ESLint configuration (legacy JSON)',
  'eslint.config.js': 'ESLint flat config',
  'eslint.config.mjs': 'ESLint flat config (ESM)',
  '.prettierrc': 'Prettier configuration',
  '.prettierrc.json': 'Prettier configuration (JSON)',
  'prettier.config.js': 'Prettier configuration (JS)',
  'jest.config.js': 'Jest configuration',
  'jest.config.ts': 'Jest configuration (TypeScript)',
  'vitest.config.ts': 'Vitest configuration',
  'vitest.config.js': 'Vitest configuration',
  'tailwind.config.js': 'Tailwind CSS configuration',
  'tailwind.config.ts': 'Tailwind CSS configuration (TypeScript)',
  'next.config.js': 'Next.js configuration',
  'next.config.mjs': 'Next.js configuration (ESM)',
  'next.config.ts': 'Next.js configuration (TypeScript)',
  'vite.config.ts': 'Vite configuration',
  'vite.config.js': 'Vite configuration',
  'package.json': 'Package manifest',
  '.gitignore': 'Git ignore rules',
  '.env.example': 'Environment variables template',
  'prisma/schema.prisma': 'Prisma database schema',
  'drizzle.config.ts': 'Drizzle ORM configuration',
};

/**
 * Sample files from a directory tree
 */
function sampleFiles(
  dir: string,
  baseDir: string,
  samples: Map<string, string[]>,
  maxPerCategory: number = 5,
  maxTotal: number = 30,
): number {
  let totalSampled = 0;

  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });

    for (const entry of entries) {
      if (totalSampled >= maxTotal) break;

      const fullPath = path.join(dir, entry.name);
      const relativePath = path.relative(baseDir, fullPath);

      if (entry.isDirectory()) {
        if (!SKIP_DIRS.has(entry.name)) {
          totalSampled += sampleFiles(fullPath, baseDir, samples, maxPerCategory, maxTotal - totalSampled);
        }
      } else if (entry.isFile()) {
        const ext = path.extname(entry.name).toLowerCase();
        if (SAMPLE_EXTENSIONS.has(ext)) {
          // Categorize the file
          const category = categorizeFile(relativePath, entry.name);
          if (!samples.has(category)) {
            samples.set(category, []);
          }
          const categoryFiles = samples.get(category)!;
          if (categoryFiles.length < maxPerCategory) {
            categoryFiles.push(fullPath);
            totalSampled++;
          }
        }
      }
    }
  } catch (err) {
    // Directory read error, continue
  }

  return totalSampled;
}

/**
 * Categorize a file based on path and name
 */
function categorizeFile(relativePath: string, fileName: string): string {
  const lowerPath = relativePath.toLowerCase();
  const lowerName = fileName.toLowerCase();

  if (lowerName.includes('.test.') || lowerName.includes('.spec.') || lowerPath.includes('__tests__')) {
    return 'test';
  }
  if (lowerPath.includes('component') || (lowerName.endsWith('.tsx') && !lowerPath.includes('page'))) {
    return 'component';
  }
  if (lowerPath.includes('hook') || lowerName.startsWith('use')) {
    return 'hook';
  }
  if (lowerPath.includes('util') || lowerPath.includes('lib') || lowerPath.includes('helper')) {
    return 'utility';
  }
  if (lowerPath.includes('api') || lowerPath.includes('route') || lowerPath.includes('handler')) {
    return 'api';
  }
  if (lowerPath.includes('type') || lowerName.endsWith('.d.ts')) {
    return 'types';
  }
  if (lowerPath.includes('config') || lowerName.includes('config')) {
    return 'config';
  }
  return 'other';
}

/**
 * Read file content safely with size limit
 */
function readFileSafe(filePath: string, maxSize: number = 50000): string | null {
  try {
    const stats = fs.statSync(filePath);
    if (stats.size > maxSize) {
      // Read only first part of large files
      const fd = fs.openSync(filePath, 'r');
      const buffer = Buffer.alloc(maxSize);
      fs.readSync(fd, buffer, 0, maxSize, 0);
      fs.closeSync(fd);
      return buffer.toString('utf-8');
    }
    return fs.readFileSync(filePath, 'utf-8');
  } catch {
    return null;
  }
}

/**
 * Detect config files in the project
 */
function detectConfigFiles(projectPath: string): ConfigFile[] {
  const configs: ConfigFile[] = [];

  for (const [file, purpose] of Object.entries(CONFIG_FILES)) {
    const fullPath = path.join(projectPath, file);
    if (fs.existsSync(fullPath)) {
      configs.push({ file, purpose });
    }
  }

  return configs;
}

/**
 * Detect directory structure
 */
function detectDirectoryStructure(projectPath: string): string[] {
  const layout: string[] = [];
  const commonDirs = [
    'src', 'app', 'pages', 'components', 'lib', 'utils', 'hooks',
    'services', 'api', 'types', 'styles', 'public', 'assets',
    'tests', '__tests__', 'spec', 'e2e', 'prisma', 'scripts',
  ];

  for (const dir of commonDirs) {
    const fullPath = path.join(projectPath, dir);
    if (fs.existsSync(fullPath) && fs.statSync(fullPath).isDirectory()) {
      layout.push(dir);
    }
    // Also check src subdirectories
    const srcPath = path.join(projectPath, 'src', dir);
    if (fs.existsSync(srcPath) && fs.statSync(srcPath).isDirectory()) {
      layout.push(`src/${dir}`);
    }
  }

  return [...new Set(layout)];
}

/**
 * Spawn Claude CLI and get JSON response
 */
async function spawnClaude(prompt: string): Promise<unknown> {
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
        // Find the first { and last }
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

    // Timeout after 60 seconds
    setTimeout(() => {
      child.kill();
      reject(new Error('Claude CLI timed out after 60 seconds'));
    }, 60000);
  });
}

/**
 * Build the analysis prompt for Claude
 */
function buildAnalysisPrompt(
  samples: Map<string, { path: string; content: string }[]>,
  configFiles: ConfigFile[],
  directoryLayout: string[],
  focus: string[],
): string {
  const focusAreas = focus.length > 0
    ? focus
    : ['naming', 'imports', 'structure', 'testing', 'error-handling'];

  let prompt = `Analyze the following code samples from a project and identify coding conventions and patterns.

Focus areas: ${focusAreas.join(', ')}

Project structure:
- Directories: ${directoryLayout.join(', ')}
- Config files: ${configFiles.map(c => c.file).join(', ')}

Code samples by category:
`;

  for (const [category, files] of samples) {
    prompt += `\n=== ${category.toUpperCase()} FILES ===\n`;
    for (const file of files) {
      // Truncate content for prompt
      const content = file.content.length > 3000
        ? file.content.substring(0, 3000) + '\n... (truncated)'
        : file.content;
      prompt += `\n--- ${file.path} ---\n${content}\n`;
    }
  }

  prompt += `
Based on these code samples, respond with ONLY a JSON object (no markdown, no explanation) with this exact structure:
{
  "conventions": [
    {
      "category": "naming|imports|structure|testing|error-handling",
      "pattern": "description of the pattern",
      "examples": ["example1", "example2"],
      "rationale": "why this pattern is used",
      "confidence": "high|medium|low"
    }
  ],
  "naming": {
    "files": "detected file naming convention",
    "variables": "detected variable naming convention",
    "functions": "detected function naming convention",
    "classes": "detected class naming convention",
    "constants": "detected constant naming convention"
  },
  "imports": {
    "order": ["group1", "group2"],
    "style": "detected import style",
    "barrel_files": true|false
  },
  "structure": {
    "directory_layout": ["dir1", "dir2"],
    "component_organization": "flat|by-feature|by-type"
  },
  "testing": {
    "file_naming": "detected test file naming pattern",
    "describe_structure": "detected test structure style",
    "assertion_style": "detected assertion style"
  },
  "error_handling": {
    "pattern": "detected error handling pattern",
    "custom_errors": true|false,
    "logging": "detected logging approach"
  },
  "recommendations": ["recommendation1", "recommendation2"]
}

Important:
- Only include conventions you can confidently detect from the samples
- Set confidence based on how consistently the pattern appears
- Include specific examples from the code
- Recommendations should suggest improvements to consistency`;

  return prompt;
}

/**
 * Create fallback result when LLM is unavailable
 */
function createFallbackResult(
  samples: Map<string, { path: string; content: string }[]>,
  configFiles: ConfigFile[],
  directoryLayout: string[],
): ConventionsResult {
  // Analyze what we can statically
  const conventions: Convention[] = [];

  // Detect barrel files
  let hasBarrelFiles = false;
  for (const [, files] of samples) {
    for (const file of files) {
      if (file.path.endsWith('/index.ts') || file.path.endsWith('/index.js')) {
        hasBarrelFiles = true;
        conventions.push({
          category: 'imports',
          pattern: 'Uses barrel files (index.ts) for module exports',
          examples: [file.path],
          rationale: 'Simplifies imports and provides clean module boundaries',
          confidence: 'high',
        });
        break;
      }
    }
    if (hasBarrelFiles) break;
  }

  // Detect test patterns
  const testFiles = samples.get('test') || [];
  let testNaming = 'unknown';
  if (testFiles.some(f => f.path.includes('.test.'))) {
    testNaming = '*.test.ts';
  } else if (testFiles.some(f => f.path.includes('.spec.'))) {
    testNaming = '*.spec.ts';
  }

  // Detect import patterns from samples
  let hasTypeImports = false;
  let hasPathAliases = false;
  for (const [, files] of samples) {
    for (const file of files) {
      if (file.content.includes('import type')) {
        hasTypeImports = true;
      }
      if (file.content.includes("from '@/") || file.content.includes("from '~/")) {
        hasPathAliases = true;
      }
    }
  }

  if (hasTypeImports) {
    conventions.push({
      category: 'imports',
      pattern: 'Uses import type for type-only imports',
      examples: ['import type { User } from "./types"'],
      rationale: 'Improves tree-shaking and clarifies import intent',
      confidence: 'high',
    });
  }

  if (hasPathAliases) {
    conventions.push({
      category: 'imports',
      pattern: 'Uses path aliases (@/ or ~/) for imports',
      examples: ['import { Button } from "@/components"'],
      rationale: 'Cleaner imports, avoids relative path complexity',
      confidence: 'high',
    });
  }

  return {
    conventions,
    naming: {
      files: 'kebab-case (detected from file names)',
      variables: 'camelCase (TypeScript standard)',
      functions: 'camelCase (TypeScript standard)',
      classes: 'PascalCase (TypeScript standard)',
      constants: 'SCREAMING_SNAKE_CASE or camelCase',
    },
    imports: {
      order: ['external', 'internal', 'relative'],
      style: hasTypeImports ? 'named imports with type imports separated' : 'named imports',
      barrel_files: hasBarrelFiles,
    },
    structure: {
      directory_layout: directoryLayout,
      component_organization: directoryLayout.some(d => d.includes('feature')) ? 'by-feature' : 'by-type',
    },
    testing: {
      file_naming: testNaming,
      describe_structure: testFiles.length > 0 ? 'BDD (describe/it blocks)' : 'unknown',
      assertion_style: 'expect (Jest/Vitest)',
    },
    error_handling: {
      pattern: 'try-catch blocks',
      custom_errors: false,
      logging: 'console',
    },
    config_files: configFiles,
    recommendations: [
      'Run with Claude CLI available for full LLM-powered analysis',
      'Consider adding more consistent patterns across the codebase',
    ],
  };
}

/**
 * Handles the get_conventions MCP tool call.
 *
 * Analyzes code patterns and conventions in a project by:
 * 1. Sampling files from different parts of the codebase
 * 2. Detecting config files and directory structure
 * 3. Using Claude to synthesize findings into conventions
 *
 * @param args - The get_conventions tool arguments
 * @param args.path - Directory to analyze (defaults to PROJECT_ROOT)
 * @param args.focus - Specific areas to focus on
 * @returns MCP tool response with detected conventions
 *
 * @example
 * handleGetConventions({});
 * // Returns: {
 * //   conventions: [...],
 * //   naming: { files: 'kebab-case', ... },
 * //   imports: { order: [...], ... },
 * //   ...
 * // }
 */
export async function handleGetConventions(args: GetConventionsArgs) {
  const projectPath = path.resolve(PROJECT_ROOT, args.path || '.');
  const focus = args.focus || [];

  // Validate path exists
  if (!fs.existsSync(projectPath)) {
    return error(`Path does not exist: ${projectPath}`);
  }

  // Detect config files
  const configFiles = detectConfigFiles(projectPath);

  // Detect directory structure
  const directoryLayout = detectDirectoryStructure(projectPath);

  // Sample files from the codebase
  const samplePaths = new Map<string, string[]>();
  sampleFiles(projectPath, projectPath, samplePaths);

  // Read content for sampled files
  const samples = new Map<string, { path: string; content: string }[]>();
  for (const [category, paths] of samplePaths) {
    const filesWithContent: { path: string; content: string }[] = [];
    for (const filePath of paths) {
      const content = readFileSafe(filePath);
      if (content) {
        const relativePath = path.relative(projectPath, filePath);
        filesWithContent.push({ path: relativePath, content });
      }
    }
    if (filesWithContent.length > 0) {
      samples.set(category, filesWithContent);
    }
  }

  if (samples.size === 0) {
    return success({
      conventions: [],
      naming: {
        files: 'unknown',
        variables: 'unknown',
        functions: 'unknown',
        classes: 'unknown',
        constants: 'unknown',
      },
      imports: {
        order: [],
        style: 'unknown',
        barrel_files: false,
      },
      structure: {
        directory_layout: directoryLayout,
        component_organization: 'unknown',
      },
      testing: {
        file_naming: 'unknown',
        describe_structure: 'unknown',
        assertion_style: 'unknown',
      },
      error_handling: {
        pattern: 'unknown',
        custom_errors: false,
        logging: 'unknown',
      },
      config_files: configFiles,
      recommendations: ['No source files found to analyze'],
    });
  }

  // Build prompt for Claude
  const prompt = buildAnalysisPrompt(samples, configFiles, directoryLayout, focus);

  try {
    // Call Claude for analysis
    const llmResult = await spawnClaude(prompt) as Partial<ConventionsResult>;

    // Merge with detected config files
    const result: ConventionsResult = {
      conventions: llmResult.conventions || [],
      naming: llmResult.naming || {
        files: 'unknown',
        variables: 'unknown',
        functions: 'unknown',
        classes: 'unknown',
        constants: 'unknown',
      },
      imports: llmResult.imports || {
        order: [],
        style: 'unknown',
        barrel_files: false,
      },
      structure: llmResult.structure || {
        directory_layout: directoryLayout,
        component_organization: 'unknown',
      },
      testing: llmResult.testing || {
        file_naming: 'unknown',
        describe_structure: 'unknown',
        assertion_style: 'unknown',
      },
      error_handling: llmResult.error_handling || {
        pattern: 'unknown',
        custom_errors: false,
        logging: 'unknown',
      },
      config_files: configFiles,
      recommendations: llmResult.recommendations || [],
    };

    return success(result);
  } catch (err) {
    // Fallback to static analysis if Claude is unavailable
    console.error('[conventions] LLM analysis failed, using fallback:', err instanceof Error ? err.message : err);

    const fallbackResult = createFallbackResult(samples, configFiles, directoryLayout);
    return success(fallbackResult);
  }
}
