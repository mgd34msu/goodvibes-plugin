/**
 * F1 — base_path / resolved-path echo (release gate).
 *
 * Locks the field issue 1 contract: absolute inputs pass through, relative
 * inputs resolve against base_path, and a relative input with NO base_path still
 * resolves (against cwd) but carries a warning field. Every resolution echoes an
 * absolute resolved_path. No git-bash path rewrite.
 */

import { describe, it, expect } from 'vitest';
import * as path from 'path';
import { resolveInputPath, resolveBaseDir, assertWithinRoot } from '../fsx/index.js';

describe('resolveInputPath (issue 1 contract)', () => {
  it('passes an absolute input through as its own resolved_path, no warning', () => {
    const abs = path.resolve('/abs/project/src/App.tsx');
    const r = resolveInputPath(abs, '/some/other/base');
    expect(r.resolved_path).toBe(abs);
    expect(r.warning).toBeUndefined();
  });

  it('resolves a relative input against base_path and echoes the absolute path', () => {
    const r = resolveInputPath('src/App.tsx', '/abs/project');
    expect(r.resolved_path).toBe(path.resolve('/abs/project', 'src/App.tsx'));
    expect(path.isAbsolute(r.resolved_path)).toBe(true);
    expect(r.warning).toBeUndefined();
  });

  it('resolves a relative base_path against cwd first', () => {
    const r = resolveInputPath('a.ts', 'rel/base', '/work/dir');
    expect(r.resolved_path).toBe(path.resolve('/work/dir', 'rel/base', 'a.ts'));
  });

  it('warns when a relative input has no base_path but still resolves', () => {
    const r = resolveInputPath('src/App.tsx', undefined, '/work/dir');
    expect(r.resolved_path).toBe(path.resolve('/work/dir', 'src/App.tsx'));
    expect(r.warning).toBeDefined();
    expect(r.warning).toContain('base_path');
  });

  it('does not apply any git-bash style rewrite to paths', () => {
    // A Windows-style drive path stays as given (resolved), not rewritten to /c/.
    const r = resolveInputPath('C:/Users/x/file.ts', undefined, '/work');
    expect(r.resolved_path).not.toContain('/c/');
  });
});

describe('resolveBaseDir', () => {
  it('returns cwd when no base_path is given', () => {
    expect(resolveBaseDir(undefined, '/work/dir')).toBe(path.resolve('/work/dir'));
  });
  it('resolves a relative base against cwd', () => {
    expect(resolveBaseDir('pkg/app', '/work/dir')).toBe(path.resolve('/work/dir', 'pkg/app'));
  });
});

describe('assertWithinRoot (opt-in boundary, no hidden config)', () => {
  it('allows paths inside the root', () => {
    expect(() => assertWithinRoot('/root/project/src/a.ts', '/root/project')).not.toThrow();
  });
  it('rejects paths that escape the root', () => {
    expect(() => assertWithinRoot('/root/other/a.ts', '/root/project')).toThrow(/outside the project root/);
  });
  it('does not confuse a sibling prefix for containment', () => {
    expect(() => assertWithinRoot('/root/project-secrets/a.ts', '/root/project')).toThrow();
  });
  it('is a no-op when no root is supplied', () => {
    expect(() => assertWithinRoot('/anywhere/a.ts', undefined)).not.toThrow();
  });
});
