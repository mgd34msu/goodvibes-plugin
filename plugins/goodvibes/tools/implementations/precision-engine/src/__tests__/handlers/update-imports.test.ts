/**
 * Tests for the updateImports functionality inside precision-exec handler.
 *
 * These tests verify the import rewriting logic indirectly via the
 * handlePrecisionExec file_ops move operation with update_imports: true.
 * The internal functions (updateImports, computeRelativeImport,
 * resolveImportToAbsolute, normalizeImportPath) are not exported, so
 * they are exercised through the handler's public interface.
 *
 * Design notes:
 * - Test files are created inside process.cwd() (the precision-engine dir)
 *   because updateImports uses getProjectRoot() which returns the git root
 *   and then scans via fast-glob from that root. Files in /tmp are never scanned.
 * - A unique subdirectory per test run avoids collisions between test suites.
 * - commands: [{ cmd: 'true' }] is added so the response goes through the
 *   standard code path where file_ops results appear under parsed.data.file_ops.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { handlePrecisionExec } from '../../handlers/precision-exec.js';
import { expectSuccess } from '../test-utils.js';
import * as fs from 'fs/promises';
import * as path from 'path';

describe('update_imports via file_ops move', () => {
  // Create test files inside cwd so getProjectRoot / fast-glob can find them
  const testRoot = path.join(process.cwd(), 'src/__tests__/tmp-update-imports');
  let testSubdir: string;

  beforeEach(async () => {
    // Unique subdirectory per test to avoid collisions
    testSubdir = path.join(testRoot, `run-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    await fs.mkdir(testSubdir, { recursive: true });
  });

  afterEach(async () => {
    await fs.rm(testRoot, { recursive: true, force: true });
  });

  // -------------------------------------------------------------------------
  // Helper: invoke a move with update_imports
  // -------------------------------------------------------------------------
  async function moveWithImportUpdate(source: string, destination: string) {
    const result = await handlePrecisionExec({
      file_ops: [
        {
          op: 'move',
          source,
          destination,
          options: { update_imports: true },
        },
      ],
      commands: [{ cmd: 'true' }],
    });
    return expectSuccess(result);
  }

  // -------------------------------------------------------------------------
  // 1. Basic relative import rewriting after file move
  // -------------------------------------------------------------------------
  it('rewrites basic relative import after file move', async () => {
    // auth.ts moved to auth-v2.ts
    // consumer.ts imports from './auth'
    const authFile = path.join(testSubdir, 'auth.ts');
    const authDest = path.join(testSubdir, 'auth-v2.ts');
    const consumerFile = path.join(testSubdir, 'consumer.ts');

    await fs.writeFile(authFile, 'export const auth = true;');
    await fs.writeFile(consumerFile, "import { auth } from './auth';");

    const parsed = await moveWithImportUpdate(authFile, authDest);
    expect(parsed.data.file_ops[0].success).toBe(true);

    const consumerContent = await fs.readFile(consumerFile, 'utf-8');
    expect(consumerContent).toBe("import { auth } from './auth-v2';");
  });

  // -------------------------------------------------------------------------
  // 2. Files that do NOT import the moved file are left unchanged
  // -------------------------------------------------------------------------
  it('does not modify files that do not import the moved file', async () => {
    const authFile = path.join(testSubdir, 'auth.ts');
    const authDest = path.join(testSubdir, 'auth-new.ts');
    const unrelatedFile = path.join(testSubdir, 'unrelated.ts');
    const originalContent = "import { foo } from './something-else';";

    await fs.writeFile(authFile, 'export const auth = true;');
    await fs.writeFile(unrelatedFile, originalContent);

    await moveWithImportUpdate(authFile, authDest);

    const unrelatedContent = await fs.readFile(unrelatedFile, 'utf-8');
    expect(unrelatedContent).toBe(originalContent);
  });

  // -------------------------------------------------------------------------
  // 3. affected_paths lists only files that were rewritten
  // -------------------------------------------------------------------------
  it('returns affected_paths listing rewritten files', async () => {
    const srcFile = path.join(testSubdir, 'utils.ts');
    const destFile = path.join(testSubdir, 'utils-v2.ts');
    const consumerA = path.join(testSubdir, 'a.ts');
    const consumerB = path.join(testSubdir, 'b.ts');
    const unrelated = path.join(testSubdir, 'c.ts');

    await fs.writeFile(srcFile, 'export const x = 1;');
    await fs.writeFile(consumerA, "import { x } from './utils';");
    await fs.writeFile(consumerB, "export { x } from './utils';");
    await fs.writeFile(unrelated, "import { y } from './other';");

    const result = await handlePrecisionExec({
      file_ops: [
        {
          op: 'move',
          source: srcFile,
          destination: destFile,
          options: { update_imports: true },
        },
      ],
      commands: [{ cmd: 'true' }],
    });
    const parsed = expectSuccess(result);
    const affected = parsed.data.file_ops[0].affected_paths as string[];

    expect(affected).toHaveLength(2);
    expect(affected).toContain(consumerA);
    expect(affected).toContain(consumerB);
    expect(affected).not.toContain(unrelated);
  });

  // -------------------------------------------------------------------------
  // 4. Extension preservation — .js extension in ESM-style imports
  //
  // Note: resolveImportToAbsolute normalizes extensions away for matching, so
  // './session.js' matches 'session.ts' and computeRelativeImport re-adds '.js'.
  // -------------------------------------------------------------------------
  it('preserves .js extension in ESM-style imports', async () => {
    const srcFile = path.join(testSubdir, 'session.ts');
    const destFile = path.join(testSubdir, 'session-v2.ts');
    const consumerFile = path.join(testSubdir, 'consumer.ts');

    await fs.writeFile(srcFile, 'export const session = null;');
    // ESM-style import uses explicit .js extension (TS resolves .ts from .js)
    await fs.writeFile(consumerFile, "import { session } from './session.js';");

    await moveWithImportUpdate(srcFile, destFile);

    const content = await fs.readFile(consumerFile, 'utf-8');
    // Should preserve the .js extension in the new import
    expect(content).toBe("import { session } from './session-v2.js';");
  });

  // -------------------------------------------------------------------------
  // 5. Index file with directory-style import (from './auth' -> './auth-v2')
  // -------------------------------------------------------------------------
  it('rewrites directory-style import when index file is moved (directory rename)', async () => {
    // auth/index.ts moved to auth-v2/index.ts
    // consumer imports from './auth' (directory style, no /index)
    const authDir = path.join(testSubdir, 'auth');
    const authV2Dir = path.join(testSubdir, 'auth-v2');
    await fs.mkdir(authDir);
    await fs.mkdir(authV2Dir);

    const indexFile = path.join(authDir, 'index.ts');
    const destIndex = path.join(authV2Dir, 'index.ts');
    const consumerFile = path.join(testSubdir, 'consumer.ts');

    await fs.writeFile(indexFile, 'export const auth = true;');
    await fs.writeFile(consumerFile, "import { auth } from './auth';");

    await moveWithImportUpdate(indexFile, destIndex);

    const content = await fs.readFile(consumerFile, 'utf-8');
    expect(content).toBe("import { auth } from './auth-v2';");
  });

  // -------------------------------------------------------------------------
  // 6. Index file with explicit /index import (from './auth/index' -> './auth-v2/index')
  // -------------------------------------------------------------------------
  it('rewrites explicit /index import when index file is moved', async () => {
    const authDir = path.join(testSubdir, 'auth');
    const authV2Dir = path.join(testSubdir, 'auth-v2');
    await fs.mkdir(authDir);
    await fs.mkdir(authV2Dir);

    const indexFile = path.join(authDir, 'index.ts');
    const destIndex = path.join(authV2Dir, 'index.ts');
    const consumerFile = path.join(testSubdir, 'consumer.ts');

    await fs.writeFile(indexFile, 'export const auth = true;');
    // Explicit /index style import
    await fs.writeFile(consumerFile, "import { auth } from './auth/index';");

    await moveWithImportUpdate(indexFile, destIndex);

    const content = await fs.readFile(consumerFile, 'utf-8');
    expect(content).toBe("import { auth } from './auth-v2/index';");
  });

  // -------------------------------------------------------------------------
  // 7. require() pattern rewriting
  // -------------------------------------------------------------------------
  it('rewrites require() patterns', async () => {
    const srcFile = path.join(testSubdir, 'config.ts');
    const destFile = path.join(testSubdir, 'config-v2.ts');
    const consumerFile = path.join(testSubdir, 'consumer.js');

    await fs.writeFile(srcFile, 'module.exports = {};');
    await fs.writeFile(consumerFile, "const config = require('./config');");

    await moveWithImportUpdate(srcFile, destFile);

    const content = await fs.readFile(consumerFile, 'utf-8');
    expect(content).toBe("const config = require('./config-v2');");
  });

  // -------------------------------------------------------------------------
  // 8. Dynamic import() pattern rewriting
  // -------------------------------------------------------------------------
  it('rewrites dynamic import() patterns', async () => {
    const srcFile = path.join(testSubdir, 'module.ts');
    const destFile = path.join(testSubdir, 'module-v2.ts');
    const consumerFile = path.join(testSubdir, 'consumer.ts');

    await fs.writeFile(srcFile, 'export const mod = true;');
    await fs.writeFile(consumerFile, "const mod = await import('./module');");

    await moveWithImportUpdate(srcFile, destFile);

    const content = await fs.readFile(consumerFile, 'utf-8');
    expect(content).toBe("const mod = await import('./module-v2');");
  });

  // -------------------------------------------------------------------------
  // 9. Export re-export statement rewriting
  // -------------------------------------------------------------------------
  it('rewrites export ... from patterns', async () => {
    const srcFile = path.join(testSubdir, 'types.ts');
    const destFile = path.join(testSubdir, 'types-v2.ts');
    const barrelFile = path.join(testSubdir, 'index.ts');

    await fs.writeFile(srcFile, 'export type Foo = string;');
    await fs.writeFile(barrelFile, "export { Foo } from './types';");

    await moveWithImportUpdate(srcFile, destFile);

    const content = await fs.readFile(barrelFile, 'utf-8');
    expect(content).toBe("export { Foo } from './types-v2';");
  });

  // -------------------------------------------------------------------------
  // 10. Cross-directory move — sibling directory
  // -------------------------------------------------------------------------
  it('rewrites import after cross-directory move to sibling dir', async () => {
    // helpers/util.ts  moved to  utils/util.ts
    // consumer.ts imports from './helpers/util'
    const helpersDir = path.join(testSubdir, 'helpers');
    const utilsDir = path.join(testSubdir, 'utils');
    await fs.mkdir(helpersDir);
    await fs.mkdir(utilsDir);

    const srcFile = path.join(helpersDir, 'util.ts');
    const destFile = path.join(utilsDir, 'util.ts');
    const consumerFile = path.join(testSubdir, 'consumer.ts');

    await fs.writeFile(srcFile, 'export const util = 1;');
    await fs.writeFile(consumerFile, "import { util } from './helpers/util';");

    await moveWithImportUpdate(srcFile, destFile);

    const content = await fs.readFile(consumerFile, 'utf-8');
    expect(content).toBe("import { util } from './utils/util';");
  });

  // -------------------------------------------------------------------------
  // 11. Cross-directory move — file moved to parent directory
  // -------------------------------------------------------------------------
  it('rewrites import after move to parent directory', async () => {
    // nested/helper.ts  moved to  helper.ts (in parent)
    // consumer.ts imports from './nested/helper'
    const nestedDir = path.join(testSubdir, 'nested');
    await fs.mkdir(nestedDir);

    const srcFile = path.join(nestedDir, 'helper.ts');
    const destFile = path.join(testSubdir, 'helper.ts');
    const consumerFile = path.join(testSubdir, 'consumer.ts');

    await fs.writeFile(srcFile, 'export const helper = 1;');
    await fs.writeFile(consumerFile, "import { helper } from './nested/helper';");

    await moveWithImportUpdate(srcFile, destFile);

    const content = await fs.readFile(consumerFile, 'utf-8');
    expect(content).toBe("import { helper } from './helper';");
  });

  // -------------------------------------------------------------------------
  // 12. Cross-directory move — file moved deeper into subdirectory
  // -------------------------------------------------------------------------
  it('rewrites import after move into a deeper subdirectory', async () => {
    // helper.ts  moved to  deep/nested/helper.ts
    // consumer.ts imports from './helper'
    const deepDir = path.join(testSubdir, 'deep', 'nested');
    await fs.mkdir(deepDir, { recursive: true });

    const srcFile = path.join(testSubdir, 'helper.ts');
    const destFile = path.join(deepDir, 'helper.ts');
    const consumerFile = path.join(testSubdir, 'consumer.ts');

    await fs.writeFile(srcFile, 'export const helper = 1;');
    await fs.writeFile(consumerFile, "import { helper } from './helper';");

    await moveWithImportUpdate(srcFile, destFile);

    const content = await fs.readFile(consumerFile, 'utf-8');
    expect(content).toBe("import { helper } from './deep/nested/helper';");
  });

  // -------------------------------------------------------------------------
  // 13. Multiple imports in the same file — all rewritten
  // -------------------------------------------------------------------------
  it('rewrites multiple imports in the same consumer file', async () => {
    const srcFile = path.join(testSubdir, 'shared.ts');
    const destFile = path.join(testSubdir, 'shared-v2.ts');
    const consumerFile = path.join(testSubdir, 'consumer.ts');

    await fs.writeFile(srcFile, 'export const a = 1; export const b = 2;');
    // Two separate import statements from the same moved file
    await fs.writeFile(
      consumerFile,
      [
        "import { a } from './shared';",
        "import { b } from './shared';",
        "import { c } from './other';",
      ].join('\n'),
    );

    await moveWithImportUpdate(srcFile, destFile);

    const content = await fs.readFile(consumerFile, 'utf-8');
    const lines = content.split('\n');
    expect(lines[0]).toBe("import { a } from './shared-v2';");
    expect(lines[1]).toBe("import { b } from './shared-v2';");
    // Unrelated import should not be touched
    expect(lines[2]).toBe("import { c } from './other';");
  });

  // -------------------------------------------------------------------------
  // 14. Non-relative (bare module) imports are NOT rewritten
  // -------------------------------------------------------------------------
  it('does not rewrite non-relative (bare module) imports', async () => {
    const srcFile = path.join(testSubdir, 'some-module.ts');
    const destFile = path.join(testSubdir, 'some-module-v2.ts');
    const consumerFile = path.join(testSubdir, 'consumer.ts');
    const originalContent = "import React from 'react'; import { useState } from 'react';";

    await fs.writeFile(srcFile, 'export {};');
    await fs.writeFile(consumerFile, originalContent);

    await moveWithImportUpdate(srcFile, destFile);

    const content = await fs.readFile(consumerFile, 'utf-8');
    // Bare imports must not be rewritten
    expect(content).toBe(originalContent);
  });

  // -------------------------------------------------------------------------
  // 15. move without update_imports — no rewriting occurs
  // -------------------------------------------------------------------------
  it('does not rewrite imports when update_imports is false', async () => {
    const srcFile = path.join(testSubdir, 'orig.ts');
    const destFile = path.join(testSubdir, 'renamed.ts');
    const consumerFile = path.join(testSubdir, 'consumer.ts');
    const originalContent = "import { x } from './orig';";

    await fs.writeFile(srcFile, 'export const x = 1;');
    await fs.writeFile(consumerFile, originalContent);

    await handlePrecisionExec({
      file_ops: [
        {
          op: 'move',
          source: srcFile,
          destination: destFile,
          // No update_imports option — defaults to false
        },
      ],
      commands: [{ cmd: 'true' }],
    });

    const content = await fs.readFile(consumerFile, 'utf-8');
    expect(content).toBe(originalContent);
  });

  // -------------------------------------------------------------------------
  // 16. skipped_paths is absent when there are no skipped files
  // -------------------------------------------------------------------------
  it('does not include skipped_paths in result when all files are readable', async () => {
    const srcFile = path.join(testSubdir, 'clean.ts');
    const destFile = path.join(testSubdir, 'clean-v2.ts');
    const consumerFile = path.join(testSubdir, 'consumer.ts');

    await fs.writeFile(srcFile, 'export const x = 1;');
    await fs.writeFile(consumerFile, "import { x } from './clean';");

    const result = await handlePrecisionExec({
      file_ops: [
        {
          op: 'move',
          source: srcFile,
          destination: destFile,
          options: { update_imports: true },
        },
      ],
      commands: [{ cmd: 'true' }],
    });
    const parsed = expectSuccess(result);
    // skipped_paths should be absent (no skipped files)
    expect(parsed.data.file_ops[0].skipped_paths).toBeUndefined();
  });
});
