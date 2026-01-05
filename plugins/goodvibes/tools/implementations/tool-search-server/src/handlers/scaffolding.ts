/**
 * Scaffolding handlers
 *
 * Provides MCP tools for scaffolding new projects from templates
 * and listing available project templates.
 *
 * @module handlers/scaffolding
 */

import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'js-yaml';
import { ToolResponse } from '../types.js';
import { PLUGIN_ROOT, PROJECT_ROOT } from '../config.js';
import { safeExec, detectPackageManager } from '../utils.js';

/**
 * Arguments for the scaffold_project MCP tool
 */
export interface ScaffoldProjectArgs {
  /** Template name to use (e.g., 'next-saas', 'react-component') */
  template: string;
  /** Output directory for the scaffolded project */
  output_dir: string;
  /** Variables to substitute in template files */
  variables?: Record<string, string>;
  /** Whether to run npm/pnpm/yarn install after scaffolding (default: true) */
  run_install?: boolean;
  /** Whether to initialize a git repository (default: true) */
  run_git_init?: boolean;
}

/**
 * Arguments for the list_templates MCP tool
 */
export interface ListTemplatesArgs {
  /** Filter templates by category (e.g., 'minimal', 'full') */
  category?: string;
}

/**
 * Template configuration from template.yaml
 */
interface TemplateConfig {
  /** Template display name */
  name: string;
  /** Skills recommended for working with this template */
  required_skills?: string[];
  /** Variables that can be substituted in template files */
  variables?: Array<{ name: string; default?: string }>;
  /** Commands to run after project creation */
  post_create?: Array<{ command: string; description: string }>;
}

/**
 * Template entry from the registry
 */
interface TemplateEntry {
  /** Template name */
  name: string;
  /** Path to template directory */
  path: string;
  /** Template description */
  description: string;
  /** Template category */
  category: string;
  /** Technologies included in the template */
  stack: string[];
  /** Template complexity level */
  complexity: string;
}

/**
 * Template registry structure
 */
interface TemplateRegistry {
  /** List of available templates */
  templates: TemplateEntry[];
}

/**
 * Copies files recursively with Handlebars-style variable substitution.
 *
 * @param src - Source directory path
 * @param dest - Destination directory path
 * @param variables - Variables to substitute in file contents
 * @param createdFiles - Array to track created file paths
 * @param outputPath - Base output path for relative path calculation
 */
async function copyFilesRecursive(
  src: string,
  dest: string,
  variables: Record<string, string>,
  createdFiles: string[],
  outputPath: string
): Promise<void> {
  const entries = await fs.promises.readdir(src, { withFileTypes: true });

  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    let destName = entry.name;

    // Remove .hbs extension for output
    if (destName.endsWith('.hbs')) {
      destName = destName.slice(0, -4);
    }

    const destPath = path.join(dest, destName);

    if (entry.isDirectory()) {
      await fs.promises.mkdir(destPath, { recursive: true });
      await copyFilesRecursive(srcPath, destPath, variables, createdFiles, outputPath);
    } else {
      let content = await fs.promises.readFile(srcPath, 'utf-8');

      // Apply variable substitutions (simple Handlebars-style)
      for (const [key, value] of Object.entries(variables)) {
        const regex = new RegExp(`\\{\\{${key}\\}\\}`, 'g');
        content = content.replace(regex, value);
      }

      await fs.promises.writeFile(destPath, content);
      createdFiles.push(path.relative(outputPath, destPath));
    }
  }
}

/**
 * Handle scaffold_project tool call
 */
export async function handleScaffoldProject(args: ScaffoldProjectArgs): Promise<ToolResponse> {
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

  const templateConfig = yaml.load(await fs.promises.readFile(templateYamlPath, 'utf-8')) as TemplateConfig;

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
    await fs.promises.mkdir(outputPath, { recursive: true });
  }

  // Copy files
  const filesDir = path.join(templateDir, 'files');
  const createdFiles: string[] = [];

  if (fs.existsSync(filesDir)) {
    await copyFilesRecursive(filesDir, outputPath, variables, createdFiles, outputPath);
  }

  // Run post-create commands
  const postCreateResults: Array<{ command: string; success: boolean; output: string }> = [];

  if (args.run_install !== false) {
    const pm = await detectPackageManager(outputPath);
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

/**
 * Handle list_templates tool call
 */
export async function handleListTemplates(args: ListTemplatesArgs): Promise<ToolResponse> {
  const templatePath = path.join(PLUGIN_ROOT, 'templates');
  const registryPath = path.join(templatePath, '_registry.yaml');

  if (!fs.existsSync(registryPath)) {
    throw new Error('Template registry not found');
  }

  const registry = yaml.load(await fs.promises.readFile(registryPath, 'utf-8')) as TemplateRegistry;

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
