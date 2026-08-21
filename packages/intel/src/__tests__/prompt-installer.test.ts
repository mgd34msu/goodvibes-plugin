/**
 * Tests for the `/goodvibes:plugin install-prompts`/`uninstall-prompts`
 * helper script (`plugins/goodvibes/commands/lib/prompt-installer.mjs`).
 *
 * SAFETY: this script's target-resolution logic prefers the real `~/.claude/`
 * directory over an explicit project directory when it exists and is
 * writable (matching v1's documented behavior), every test here overrides
 * `HOME` to an isolated temp directory so no test can ever touch the actual
 * user's home directory or its real CLAUDE.md.
 */

import { describe, it, expect, afterEach } from 'vitest';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import * as path from 'node:path';
import * as fs from 'node:fs';
import * as os from 'node:os';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SCRIPT = path.resolve(__dirname, '../../../../plugins/goodvibes/commands/lib/prompt-installer.mjs');

const tmpDirs: string[] = [];
function makeTmpDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gv-prompt-installer-'));
  tmpDirs.push(dir);
  return dir;
}

afterEach(() => {
  while (tmpDirs.length) {fs.rmSync(tmpDirs.pop()!, { recursive: true, force: true });}
});

function run(command: string, projectDir: string, fakeHome: string): Record<string, unknown> {
  const stdout = execFileSync('node', [SCRIPT, command, projectDir], {
    encoding: 'utf-8',
    env: { ...process.env, HOME: fakeHome },
    timeout: 10000,
  });
  return JSON.parse(stdout);
}

describe('prompt-installer.mjs', () => {
  it('installs into a fake ~/.claude when it exists and is writable', () => {
    const fakeHome = makeTmpDir();
    fs.mkdirSync(path.join(fakeHome, '.claude'), { recursive: true });
    const projectDir = makeTmpDir();

    const result = run('install', projectDir, fakeHome);
    expect(result.targetDir).toBe(path.join(fakeHome, '.claude'));

    const claudeMd = fs.readFileSync(path.join(fakeHome, '.claude', 'CLAUDE.md'), 'utf-8');
    expect(claudeMd).toContain('<!-- GOODVIBES IMPORTS -->');
    expect(claudeMd).toContain('@.goodvibes/GOODVIBES.md');
    expect(fs.existsSync(path.join(fakeHome, '.claude', '.goodvibes', 'GOODVIBES.md'))).toBe(true);
  });

  it('round-trips install then uninstall without touching pre-existing CLAUDE.md content', () => {
    const fakeHome = makeTmpDir();
    const claudeDir = path.join(fakeHome, '.claude');
    fs.mkdirSync(claudeDir, { recursive: true });
    const original = '# My existing global preferences\n- keep this\n';
    fs.writeFileSync(path.join(claudeDir, 'CLAUDE.md'), original);
    const projectDir = makeTmpDir();

    run('install', projectDir, fakeHome);
    const afterInstall = fs.readFileSync(path.join(claudeDir, 'CLAUDE.md'), 'utf-8');
    expect(afterInstall).toContain('keep this');
    expect(afterInstall).toContain('<!-- GOODVIBES IMPORTS -->');

    const uninstallResult = run('uninstall', projectDir, fakeHome);
    expect(uninstallResult.importRemoved).toBe(true);

    const afterUninstall = fs.readFileSync(path.join(claudeDir, 'CLAUDE.md'), 'utf-8');
    expect(afterUninstall.trim()).toBe(original.trim());
    expect(afterUninstall).not.toContain('GOODVIBES IMPORTS');
    expect(fs.existsSync(path.join(claudeDir, '.goodvibes', 'GOODVIBES.md'))).toBe(false);
  });

  it('deletes CLAUDE.md entirely on uninstall when goodvibes wrote the whole file', () => {
    const fakeHome = makeTmpDir();
    fs.mkdirSync(path.join(fakeHome, '.claude'), { recursive: true });
    const projectDir = makeTmpDir();

    run('install', projectDir, fakeHome);
    const claudeMdPath = path.join(fakeHome, '.claude', 'CLAUDE.md');
    expect(fs.existsSync(claudeMdPath)).toBe(true);

    const result = run('uninstall', projectDir, fakeHome);
    expect(result.removed).toBe(true);
    expect(fs.existsSync(claudeMdPath)).toBe(false);
  });

  it('falls back to the project directory when no writable ~/.claude exists', () => {
    const fakeHome = makeTmpDir(); // deliberately no .claude subdir created
    const projectDir = makeTmpDir();

    const result = run('install', projectDir, fakeHome);
    expect(result.targetDir).toBe(projectDir);
    expect(fs.existsSync(path.join(projectDir, '.goodvibes', 'GOODVIBES.md'))).toBe(true);
  });

  it('status reports installed:false before install and true after', () => {
    const fakeHome = makeTmpDir();
    fs.mkdirSync(path.join(fakeHome, '.claude'), { recursive: true });
    const projectDir = makeTmpDir();

    const before = run('status', projectDir, fakeHome);
    expect(before.installed).toBe(false);

    run('install', projectDir, fakeHome);
    const after = run('status', projectDir, fakeHome);
    expect(after.installed).toBe(true);
    expect(after.importPresent).toBe(true);
  });
});
