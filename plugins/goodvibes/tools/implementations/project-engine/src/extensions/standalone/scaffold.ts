/**
 * Scaffold Project — L2 Extension
 *
 * Orchestrates project scaffolding from templates, composing file I/O with
 * template config parsing and post-create commands.
 *
 * @module extensions/standalone/scaffold
 */

import * as node_fs from 'node:fs';
import * as node_path from 'node:path';
// js-yaml: YAML parsing for template.yaml config files.
// Dependency: 'js-yaml' must be listed in project package.json dependencies.
import * as yaml from 'js-yaml';

import { PLUGIN_ROOT, PROJECT_ROOT } from '../../shared/config.js';
import { safeExec, detectPackageManager } from '../../shared/utils.js';
import { ok, fail } from '../../shared/response.js';
import type { McpResponse } from '../../shared/types.js';
import type { ScaffoldProjectArgs } from '../../core/standalone/types.js';

// =============================================================================
// Internal Types
// =============================================================================

/**
 * Template configuration loaded from template.yaml.
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

// =============================================================================
// Internal I/O Helpers
// =============================================================================

/**
 * Recursively copy template files to an output directory, substituting
 * Handlebars-style `{{key}}` variables in file contents.
 *
 * Files ending with `.hbs` have that extension stripped in the output.
 *
 * @param src - Absolute path to the template source directory
 * @param dest - Absolute path to the output directory
 * @param variables - Variable substitution map
 * @param createdFiles - Accumulator for tracking created relative file paths
 * @param outputPath - Base output path used for relative path calculation
 */
async function copyFilesRecursive(
  src: string,
  dest: string,
  variables: Record<string, string>,
  createdFiles: string[],
  outputPath: string
): Promise<void> {
  const entries = await node_fs.promises.readdir(src, { withFileTypes: true });

  for (const entry of entries) {
    const srcPath = node_path.join(src, entry.name);
    let destName = entry.name;

    if (destName.endsWith('.hbs')) {
      destName = destName.slice(0, -4);
    }

    const destPath = node_path.join(dest, destName);

    if (entry.isDirectory()) {
      await node_fs.promises.mkdir(destPath, { recursive: true });
      await copyFilesRecursive(srcPath, destPath, variables, createdFiles, outputPath);
    } else {
      let content = await node_fs.promises.readFile(srcPath, 'utf-8');

      for (const [key, value] of Object.entries(variables)) {
        const regex = new RegExp(`\\{\\{${key}\\}\\}`, 'g');
        content = content.replace(regex, value);
      }

      await node_fs.promises.writeFile(destPath, content);
      createdFiles.push(node_path.relative(outputPath, destPath));
    }
  }
}

// =============================================================================
// Public Handler
// =============================================================================

/**
 * Scaffold a new project from a template.
 *
 * Workflow:
 * 1. Locate the template directory under `PLUGIN_ROOT/templates/`
 * 2. Load and parse `template.yaml` for config and default variables
 * 3. Merge caller-supplied variables over template defaults
 * 4. Create the output directory and copy template files
 * 5. Optionally run package install and `git init`
 * 6. Return created files, applied variables, and next steps
 *
 * @param args - ScaffoldProjectArgs describing the template and output location
 * @returns McpResponse with JSON-encoded scaffolding result, or a fail response if template not found
 */
export async function scaffoldProject(args: ScaffoldProjectArgs): Promise<McpResponse> {
  const templatePath = node_path.join(PLUGIN_ROOT, 'templates');

  // Find template in minimal/ or full/ categories
  const templateDirs = ['minimal', 'full'];
  let templateDir: string | null = null;

  for (const category of templateDirs) {
    const candidatePath = node_path.join(templatePath, category, args.template);
    if (node_fs.existsSync(candidatePath)) {
      templateDir = candidatePath;
      break;
    }
  }

  if (!templateDir) {
    return fail(`Template not found: ${args.template}`);
  }

  const templateYamlPath = node_path.join(templateDir, 'template.yaml');
  if (!node_fs.existsSync(templateYamlPath)) {
    return fail(`Template config not found: ${args.template}/template.yaml`);
  }

  const templateConfig = yaml.load(
    await node_fs.promises.readFile(templateYamlPath, 'utf-8')
  ) as TemplateConfig;

  // Build variables with defaults
  const variables: Record<string, string> = {};
  if (templateConfig.variables) {
    for (const v of templateConfig.variables) {
      variables[v.name] = args.variables?.[v.name] || v.default || '';
    }
  }
  Object.assign(variables, args.variables || {});

  // Create output directory
  const outputPath = node_path.resolve(PROJECT_ROOT, args.output_dir);
  if (!node_fs.existsSync(outputPath)) {
    await node_fs.promises.mkdir(outputPath, { recursive: true });
  }

  // Copy template files
  const filesDir = node_path.join(templateDir, 'files');
  const createdFiles: string[] = [];

  if (node_fs.existsSync(filesDir)) {
    await copyFilesRecursive(filesDir, outputPath, variables, createdFiles, outputPath);
  }

  // Run post-create steps
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

  // Build next steps
  const nextSteps: string[] = [`cd ${args.output_dir}`];

  if (args.template === 'next-saas') {
    nextSteps.push('cp .env.example .env');
    nextSteps.push('Configure environment variables in .env');
    nextSteps.push('npx prisma db push');
  }

  nextSteps.push('npm run dev');

  return ok({
    success: true,
    template: args.template,
    output_dir: args.output_dir,
    created_files: createdFiles,
    variables_applied: variables,
    post_create_results: postCreateResults,
    recommended_skills: templateConfig.required_skills || [],
    next_steps: nextSteps,
  });
}
