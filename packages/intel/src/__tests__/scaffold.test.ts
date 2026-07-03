/**
 * Fixture tests for the `scaffold` tool (§4.1, §5.3 "new tests: manifest-vs-tree
 * consistency + scaffold dry-run").
 *
 * 1. Manifest/tree consistency: for every template under
 *    plugins/goodvibes/templates/{minimal,full}/*, the template.yaml
 *    `files:` list must exactly match what's physically under `files/` — this
 *    is the regression guard for the "3 phantom manifest files" class of bug
 *    (plan §9.5).
 * 2. Scaffold dry-run: the tool reports created files and post-create commands
 *    without touching disk or a shell.
 * 3. Unknown template: fails cleanly with an error envelope, not a throw.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { fileURLToPath } from 'node:url';
import * as path from 'node:path';
import * as fs from 'node:fs';
import { promises as fsp } from 'node:fs';
import * as yaml from 'js-yaml';
import { scaffoldTool } from '../tools/scaffold.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../../../../');
const PLUGIN_ROOT = path.join(REPO_ROOT, 'plugins/goodvibes');
const TEMPLATES_ROOT = path.join(PLUGIN_ROOT, 'templates');

let originalPluginRoot: string | undefined;

beforeAll(() => {
  originalPluginRoot = process.env.PLUGIN_ROOT;
  process.env.PLUGIN_ROOT = PLUGIN_ROOT;
});

afterAll(() => {
  if (originalPluginRoot === undefined) {delete process.env.PLUGIN_ROOT;}
  else {process.env.PLUGIN_ROOT = originalPluginRoot;}
});

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

function discoverTemplates(): Array<{ category: string; name: string; dir: string }> {
  const found: Array<{ category: string; name: string; dir: string }> = [];
  for (const category of ['minimal', 'full']) {
    const categoryDir = path.join(TEMPLATES_ROOT, category);
    if (!fs.existsSync(categoryDir)) {continue;}
    for (const name of fs.readdirSync(categoryDir)) {
      const dir = path.join(categoryDir, name);
      if (fs.statSync(dir).isDirectory()) {found.push({ category, name, dir });}
    }
  }
  return found;
}

describe('scaffold templates: manifest/tree consistency', () => {
  const templates = discoverTemplates();

  it('found at least the three shipped templates', () => {
    expect(templates.length).toBeGreaterThanOrEqual(3);
  });

  for (const tpl of discoverTemplates()) {
    it(`${tpl.category}/${tpl.name}: template.yaml files: list matches files/ tree exactly`, async () => {
      const yamlPath = path.join(tpl.dir, 'template.yaml');
      expect(fs.existsSync(yamlPath)).toBe(true);

      const config = yaml.load(await fsp.readFile(yamlPath, 'utf-8')) as { files?: string[] };
      const manifestFiles = [...(config.files ?? [])].sort();

      const filesDir = path.join(tpl.dir, 'files');
      const treeFiles = fs.existsSync(filesDir) ? (await listFilesRecursive(filesDir)).sort() : [];

      // Bidirectional: nothing in the manifest is missing from disk (the
      // "phantom file" bug), and nothing on disk is undocumented.
      expect(manifestFiles).toEqual(treeFiles);
    });
  }
});

describe('scaffold: dry_run', () => {
  it('previews vite-react without touching disk or a shell', async () => {
    const result = await scaffoldTool.handler({
      template: 'vite-react',
      output_dir: 'nonexistent-dry-run-dir',
      base_path: '/tmp/goodvibes-scaffold-dry-run-does-not-exist',
      variables: { project_name: 'dry-run-app' },
      dry_run: true,
    });

    expect(result.isError).toBeFalsy();
    const text = (result.content[0] as { text: string }).text;
    const envelope = JSON.parse(text);

    expect(envelope.success).toBe(true);
    expect(envelope.data.dry_run).toBe(true);
    expect(envelope.data.template).toBe('vite-react');
    expect(Array.isArray(envelope.data.created_files)).toBe(true);
    expect(envelope.data.created_files.length).toBeGreaterThan(0);
    // package.json.hbs renders without the .hbs suffix in the preview list.
    expect(envelope.data.created_files).toContain('package.json');
    expect(envelope.data.created_files).not.toContain('package.json.hbs');

    // Dry run must never create the output directory.
    expect(fs.existsSync(path.join('/tmp/goodvibes-scaffold-dry-run-does-not-exist', 'nonexistent-dry-run-dir'))).toBe(false);

    // Post-create commands are reported but marked as not executed.
    const commands = envelope.data.post_create_results.map((r: { command: string }) => r.command);
    expect(commands).toContain('npm install');
    expect(commands).toContain('git init');
    for (const r of envelope.data.post_create_results) {
      expect(r.output).toContain('dry run');
    }
  });

  it('applies caller variable overrides over template.yaml defaults', async () => {
    const result = await scaffoldTool.handler({
      template: 'next-app',
      output_dir: 'dry-run-next',
      base_path: '/tmp/goodvibes-scaffold-dry-run-does-not-exist',
      variables: { project_name: 'my-custom-app' },
      dry_run: true,
    });
    const envelope = JSON.parse((result.content[0] as { text: string }).text);
    expect(envelope.data.variables_applied.project_name).toBe('my-custom-app');
  });

  it('fails cleanly on an unknown template', async () => {
    const result = await scaffoldTool.handler({
      template: 'does-not-exist',
      output_dir: 'wherever',
      dry_run: true,
    });
    expect(result.isError).toBe(true);
    const envelope = JSON.parse((result.content[0] as { text: string }).text);
    expect(envelope.success).toBe(false);
    expect(envelope.error).toMatch(/Template not found/);
  });

  it('rejects missing required arguments', async () => {
    const result = await scaffoldTool.handler({ template: 'vite-react' });
    expect(result.isError).toBe(true);
    const envelope = JSON.parse((result.content[0] as { text: string }).text);
    expect(envelope.error).toMatch(/output_dir/);
  });
});
