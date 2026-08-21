#!/usr/bin/env node
/**
 * Runs every measurement behind the token-savings claims in the READMEs.
 *
 * The rule those numbers serve: intel must beat the native tool on these
 * operations at default settings, or the claim comes out of the README rather
 * than being restated with a softer verb. This script is how that is checked.
 *
 * Scoped to the two operations that ship, `code_read`'s outline extract and
 * `code_grep`'s search. Earlier rounds also measured `content`, `symbols`, and
 * `ast` extract modes, which no longer exist, so there is nothing left to
 * compare them against.
 *
 * Runnable on demand, not wired into CI, so a claim can be reproduced before
 * it is quoted. Exit 0 is PASS, 1 is FAIL, and the outline script exits 2 when
 * extraction itself errored and nothing was measured.
 */

import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function run(script, args = []) {
  console.log(`\n${'='.repeat(72)}\n${script} ${args.join(' ')}\n${'='.repeat(72)}`);
  const result = spawnSync('node', [path.join(__dirname, script), ...args], { stdio: 'inherit' });
  return result.status ?? 1;
}

const outlineStatus = run('measure-outline.mjs');
const grepStatus = run('measure-grep.mjs');

console.log(`\n${'='.repeat(72)}`);
console.log('SUMMARY');
console.log('='.repeat(72));
console.log(`measure-outline.mjs: ${outlineStatus === 0 ? 'PASS' : outlineStatus === 2 ? 'INCONCLUSIVE' : 'FAIL'}`);
console.log(`measure-grep.mjs:    ${grepStatus === 0 ? 'PASS' : 'FAIL'}`);

process.exit(outlineStatus === 0 && grepStatus === 0 ? 0 : 1);
