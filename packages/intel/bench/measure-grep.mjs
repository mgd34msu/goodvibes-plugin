#!/usr/bin/env node
/**
 * EXP4 equivalent (deep-review Appendix A), search vs native `git grep`,
 * ground-truthed by match count. v1 measured "files_only 7,813t vs native
 * 4,370t (1.79×)", a case where the old defaults LOST to native; the row's
 * required fixes (field issue 2's cap-honesty rebuild) are what this reruns
 * against, to see whether the v2 defaults actually close that gap on kept
 * operations (gate 5).
 *
 * Usage: node packages/intel/bench/measure-grep.mjs [pattern] [subdir]
 * Requires: packages/intel built; `git` on PATH; run from inside a git repo
 * (uses `git grep` as the native baseline for a fair match-count check).
 */

import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { withServer, estimateTokens } from './lib/server-client.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.join(__dirname, '..', '..', '..');

async function nativeGitGrep(pattern, subdir) {
  try {
    // --no-index: search the working tree like code_grep/ripgrep do (still
    // honors .gitignore). Plain `git grep` only searches the git INDEX
    // (tracked/staged files), in a tree with uncommitted new files that
    // undercounts relative to a filesystem-walking search, which is not a
    // fair native baseline (confirmed empirically: this workspace's own new
    // files caused a 23-vs-57 "mismatch" that was a baseline bug, not a
    // code_grep bug).
    const out = execFileSync('git', ['grep', '-n', '--no-index', '--', pattern, subdir], {
      cwd: repoRoot,
      encoding: 'utf-8',
      maxBuffer: 64 * 1024 * 1024,
    });
    return out;
  } catch (err) {
    // git grep exits 1 when there are no matches, that's not a failure.
    if (err.status === 1) return '';
    throw err;
  }
}

async function main() {
  const pattern = process.argv[2] ?? 'estimatePayloadTokens';
  const subdir = process.argv[3] ?? 'packages';

  const nativeOut = await nativeGitGrep(pattern, subdir);
  const nativeMatchCount = nativeOut ? nativeOut.trimEnd().split('\n').length : 0;
  const nativeTokens = estimateTokens(nativeOut);

  const env = await withServer((callTool) =>
    callTool('code_grep', {
      queries: [{ id: 'q1', pattern, path: subdir }],
      base_path: repoRoot,
      output: { mode: 'files_only' },
    }),
  );
  const q = env?.data?.queries?.q1;
  const codeGrepMatchCount = q?.match_count ?? 0;
  const codeGrepTokens = estimateTokens(JSON.stringify(env?.data ?? {}));

  console.log(`EXP4: search vs native git grep (tokens = bytes/3.5)\n`);
  console.log(`Pattern: ${JSON.stringify(pattern)}  Path: ${subdir}\n`);
  console.log('| | Matches | Tokens |');
  console.log('|---|---|---|');
  console.log(`| native (git grep -n) | ${nativeMatchCount} | ${nativeTokens}t |`);
  console.log(`| code_grep (files_only) | ${codeGrepMatchCount} | ${codeGrepTokens}t |`);
  console.log('');

  const countsMatch = nativeMatchCount === codeGrepMatchCount;
  const beatsNative = codeGrepTokens < nativeTokens;
  console.log(`Ground truth: ${countsMatch ? 'MATCH' : `MISMATCH (native ${nativeMatchCount} vs code_grep ${codeGrepMatchCount})`}`);
  console.log(
    beatsNative
      ? `VERDICT: PASS; code_grep files_only (${codeGrepTokens}t) beats native git grep (${nativeTokens}t).`
      : `VERDICT: FAIL; code_grep files_only (${codeGrepTokens}t) did not beat native git grep (${nativeTokens}t).`,
  );
  process.exitCode = countsMatch && beatsNative ? 0 : 1;
}

main().catch((err) => {
  console.error('Bench failed:', err);
  process.exit(1);
});
