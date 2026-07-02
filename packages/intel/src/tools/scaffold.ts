/**
 * `scaffold` — create a new project from a template (§4.1).
 *
 * Ported from `PJ/extensions/standalone/scaffold.ts` (`plugins/goodvibes/tools/
 * implementations/project-engine/src/extensions/standalone/scaffold.ts`, read-only
 * quarry) with the plan §9.5 fixes: the two phantom-manifest templates are fixed
 * at the content layer (`plugins/goodvibes-intel/templates/`, see its README),
 * `latest`-pinned dependencies are replaced with tested versions, and
 * `_registry.yaml` does not carry forward.
 *
 * v2 additions over the v1 handler:
 *  - `base_path`/`resolved_path` fsx contract (§3.2) instead of a hardcoded
 *    `PROJECT_ROOT` env lookup.
 *  - Runs under `core/proc` `withBudget` so a hung install command degrades to
 *    a partial, honestly-accounted result instead of hanging the client.
 *  - `dry_run` mode: reports what would be created/run without touching disk
 *    or spawning a shell — this is what the regression test in
 *    `src/__tests__/scaffold.test.ts` exercises.
 *  - Copies whatever is physically present in the template's `files/` tree
 *    (matching v1's actual behavior — the `template.yaml` `files:` list is
 *    documentation, never consulted for the copy itself); a per-template
 *    consistency test (also in `scaffold.test.ts`) is the regression guard
 *    against manifest/tree drift so that documentation issue cannot recur
 *    silently.
 */

import * as fs from 'node:fs';
import { promises as fsp } from 'node:fs';
import * as path from 'node:path';
import { execFile } from 'node:child_process';
import * as yaml from 'js-yaml';

import { errorEnvelope, successEnvelope, toCallToolResult, startTimer } from '@goodvibes/core/envelope';
import { resolveInputPath } from '@goodvibes/core/fsx';
import { withBudget } from '@goodvibes/core/proc';
import type { ToolDefinition } from './types.js';

/** Scaffold has no dedicated §3.1 budget row; it may shell out to `npm install`,
 * so it gets a longer-than-analyzer budget. Config-overridable would require a
 * new config key — deferred; this is a fixed, documented ruling for alpha. */
const SCAFFOLD_BUDGET_MS = 90_000;
/** Hard ceiling for any single post-create shell command (install/git init). */
const POST_CREATE_TIMEOUT_MS = 60_000;

interface TemplateVariable {
  name: string;
  default?: string;
}

interface TemplateConfig {
  name?: string;
  required_skills?: string[];
  variables?: TemplateVariable[];
  post_create?: Array<{ command: string; description: string }>;
}

interface PostCreateResult {
  command: string;
  success: boolean;
  output: string;
}

interface ScaffoldArgs {
  template: string;
  output_dir: string;
  base_path?: string;
  variables?: Record<string, string>;
  run_install?: boolean;
  run_git_init?: boolean;
  package_manager?: 'npm' | 'pnpm' | 'yarn' | 'bun';
  dry_run?: boolean;
  output?: { max_tokens?: number };
}

interface ScaffoldData {
  content: string; // envelope enforceMaxTokens contract — human-readable summary
  template: string;
  output_dir: string;
  resolved_path: string;
  dry_run: boolean;
  created_files: string[];
  variables_applied: Record<string, string>;
  post_create_results: PostCreateResult[];
  recommended_skills: string[];
  next_steps: string[];
}

/** Every template directory this server ships, relative to the plugin root. */
const TEMPLATE_CATEGORIES = ['minimal', 'full'] as const;

function templatesRoot(): string {
  // PLUGIN_ROOT is set by .mcp.json's env block to ${CLAUDE_PLUGIN_ROOT}; the
  // templates ship as a sibling of server/ under the plugin root (§4.1).
  const pluginRoot = process.env.PLUGIN_ROOT ?? process.cwd();
  return path.join(pluginRoot, 'templates');
}

/** Locate a named template under minimal/ or full/. */
function findTemplateDir(templatesDir: string, template: string): string | null {
  for (const category of TEMPLATE_CATEGORIES) {
    const candidate = path.join(templatesDir, category, template);
    if (fs.existsSync(candidate)) return candidate;
  }
  return null;
}

/** Recursively list every file under `dir`, relative to `dir`. */
async function listFilesRecursive(dir: string, relBase = ''): Promise<string[]> {
  const entries = await fsp.readdir(dir, { withFileTypes: true });
  const out: string[] = [];
  for (const entry of entries) {
    const rel = relBase ? path.join(relBase, entry.name) : entry.name;
    if (entry.isDirectory()) {
      out.push(...(await listFilesRecursive(path.join(dir, entry.name), rel)));
    } else {
      out.push(rel);
    }
  }
  return out;
}

/** Strip a trailing `.hbs` extension (handlebars-templated files render without it). */
function destName(name: string): string {
  return name.endsWith('.hbs') ? name.slice(0, -4) : name;
}

/** Substitute `{{key}}` variables in file content. */
function substitute(content: string, variables: Record<string, string>): string {
  let out = content;
  for (const [key, value] of Object.entries(variables)) {
    out = out.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), value);
  }
  return out;
}

async function copyFilesRecursive(
  src: string,
  dest: string,
  variables: Record<string, string>,
  createdFiles: string[],
  outputPath: string,
): Promise<void> {
  const entries = await fsp.readdir(src, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, destName(entry.name));
    if (entry.isDirectory()) {
      await fsp.mkdir(destPath, { recursive: true });
      await copyFilesRecursive(srcPath, destPath, variables, createdFiles, outputPath);
    } else {
      const content = await fsp.readFile(srcPath, 'utf-8');
      await fsp.writeFile(destPath, substitute(content, variables));
      createdFiles.push(path.relative(outputPath, destPath));
    }
  }
}

/** Run a shell command with a hard timeout; never throws — reports failure in the result. */
function runShell(command: string, cwd: string, timeoutMs: number): Promise<PostCreateResult> {
  return new Promise((resolve) => {
    const [cmd, ...args] = command.split(' ');
    execFile(cmd, args, { cwd, timeout: timeoutMs, windowsHide: true }, (err, stdout, stderr) => {
      resolve({
        command,
        success: !err,
        output: (err ? stderr || err.message : stdout).slice(0, 200),
      });
    });
  });
}

function installCommand(pm: NonNullable<ScaffoldArgs['package_manager']>): string {
  return pm === 'npm' ? 'npm install' : `${pm} install`;
}

async function runScaffold(args: ScaffoldArgs): Promise<ScaffoldData> {
  const templatesDir = templatesRoot();
  const templateDir = findTemplateDir(templatesDir, args.template);
  if (!templateDir) {
    const available = TEMPLATE_CATEGORIES.flatMap((c) => {
      const dir = path.join(templatesDir, c);
      return fs.existsSync(dir) ? fs.readdirSync(dir) : [];
    });
    throw new Error(
      `Template not found: '${args.template}'. Available: ${available.join(', ') || '(none installed)'}.`,
    );
  }

  const templateYamlPath = path.join(templateDir, 'template.yaml');
  if (!fs.existsSync(templateYamlPath)) {
    throw new Error(`Template config not found: ${args.template}/template.yaml`);
  }
  const templateConfig = yaml.load(await fsp.readFile(templateYamlPath, 'utf-8')) as TemplateConfig;

  const variables: Record<string, string> = {};
  for (const v of templateConfig.variables ?? []) {
    variables[v.name] = args.variables?.[v.name] ?? v.default ?? '';
  }
  Object.assign(variables, args.variables ?? {});

  const { resolved_path: outputPath } = resolveInputPath(args.output_dir, args.base_path);
  const filesDir = path.join(templateDir, 'files');
  const dryRun = args.dry_run === true;

  let createdFiles: string[];
  if (dryRun) {
    createdFiles = fs.existsSync(filesDir)
      ? (await listFilesRecursive(filesDir)).map(destName)
      : [];
  } else {
    if (!fs.existsSync(outputPath)) {
      await fsp.mkdir(outputPath, { recursive: true });
    }
    createdFiles = [];
    if (fs.existsSync(filesDir)) {
      await copyFilesRecursive(filesDir, outputPath, variables, createdFiles, outputPath);
    }
  }

  const postCreateResults: PostCreateResult[] = [];
  const pm = args.package_manager ?? 'npm';
  if (!dryRun && args.run_install !== false) {
    postCreateResults.push(await runShell(installCommand(pm), outputPath, POST_CREATE_TIMEOUT_MS));
  } else if (dryRun && args.run_install !== false) {
    postCreateResults.push({ command: installCommand(pm), success: true, output: '(dry run — not executed)' });
  }
  if (!dryRun && args.run_git_init !== false) {
    postCreateResults.push(await runShell('git init', outputPath, 10_000));
  } else if (dryRun && args.run_git_init !== false) {
    postCreateResults.push({ command: 'git init', success: true, output: '(dry run — not executed)' });
  }

  const nextSteps: string[] = [`cd ${args.output_dir}`];
  if (args.template === 'next-saas') {
    nextSteps.push('cp .env.example .env');
    nextSteps.push('Configure environment variables in .env');
    nextSteps.push('npx prisma db push');
  }
  nextSteps.push('npm run dev');

  const summaryLines = [
    `Scaffolded '${args.template}' ${dryRun ? '(dry run) ' : ''}into ${args.output_dir}`,
    `${createdFiles.length} file(s)${dryRun ? ' would be created' : ' created'}.`,
  ];

  return {
    content: summaryLines.join(' '),
    template: args.template,
    output_dir: args.output_dir,
    resolved_path: outputPath,
    dry_run: dryRun,
    created_files: createdFiles,
    variables_applied: variables,
    post_create_results: postCreateResults,
    recommended_skills: templateConfig.required_skills ?? [],
    next_steps: nextSteps,
  };
}

function validate(raw: Record<string, unknown>): ScaffoldArgs | string {
  if (typeof raw.template !== 'string' || raw.template.length === 0) {
    return 'template (string) is required.';
  }
  if (typeof raw.output_dir !== 'string' || raw.output_dir.length === 0) {
    return 'output_dir (string) is required.';
  }
  return {
    template: raw.template,
    output_dir: raw.output_dir,
    base_path: typeof raw.base_path === 'string' ? raw.base_path : undefined,
    variables:
      raw.variables && typeof raw.variables === 'object'
        ? (raw.variables as Record<string, string>)
        : undefined,
    run_install: typeof raw.run_install === 'boolean' ? raw.run_install : undefined,
    run_git_init: typeof raw.run_git_init === 'boolean' ? raw.run_git_init : undefined,
    package_manager:
      raw.package_manager === 'npm' ||
      raw.package_manager === 'pnpm' ||
      raw.package_manager === 'yarn' ||
      raw.package_manager === 'bun'
        ? raw.package_manager
        : undefined,
    dry_run: typeof raw.dry_run === 'boolean' ? raw.dry_run : undefined,
    output:
      raw.output && typeof raw.output === 'object'
        ? (raw.output as { max_tokens?: number })
        : undefined,
  };
}

export const scaffoldTool: ToolDefinition = {
  definition: {
    name: 'scaffold',
    description:
      'Create a new project from a bundled template (minimal: vite-react, next-app; full: next-saas). ' +
      'Copies template files with {{variable}} substitution, then optionally runs an install and `git init`. ' +
      'Set dry_run: true to preview created files and commands without touching disk or a shell.',
    inputSchema: {
      type: 'object',
      properties: {
        template: { type: 'string', description: "Template id, e.g. 'vite-react', 'next-app', 'next-saas'." },
        output_dir: { type: 'string', description: 'Directory to scaffold into (relative to base_path, or cwd with a warning).' },
        base_path: { type: 'string', description: 'Base directory output_dir resolves against.' },
        variables: { type: 'object', description: 'Template variable overrides (defaults come from template.yaml).' },
        run_install: { type: 'boolean', description: 'Run the package manager install after copying files (default true).' },
        run_git_init: { type: 'boolean', description: "Run 'git init' after copying files (default true)." },
        package_manager: { type: 'string', enum: ['npm', 'pnpm', 'yarn', 'bun'], description: 'Defaults to npm.' },
        dry_run: { type: 'boolean', description: 'Preview only — no filesystem writes, no shell commands (default false).' },
        output: {
          type: 'object',
          properties: { max_tokens: { type: 'number' } },
          description: 'Response token cap.',
        },
      },
      required: ['template', 'output_dir'],
    },
  },
  handler: async (rawArgs) => {
    const parsed = validate(rawArgs);
    if (typeof parsed === 'string') {
      return toCallToolResult(errorEnvelope(`Invalid arguments: ${parsed}`));
    }

    const elapsed = startTimer();
    const outcome = await withBudget(SCAFFOLD_BUDGET_MS, async (signal) => {
      try {
        const data = await runScaffold(parsed);
        return { ok: true as const, data };
      } catch (err) {
        void signal.aborted; // scaffold's file/shell steps are not cooperative-cancelable; budget still bounds wall time
        return { ok: false as const, error: err instanceof Error ? err.message : String(err) };
      }
    });

    const meta = { execution_ms: elapsed(), budget_exceeded: outcome.budget_exceeded };
    if (!outcome.value.ok) {
      return toCallToolResult(errorEnvelope(outcome.value.error, meta));
    }

    const env = successEnvelope(outcome.value.data, meta);
    return toCallToolResult(env);
  },
};
