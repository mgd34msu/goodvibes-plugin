/**
 * Build the goodvibes-connect server bundle.
 *
 * esbuild pattern per §5.1. External: sql.js (+ wasm copy), every server imports
 * core/telemetry, so sql-wasm.wasm ships in server/wasm/. connect's DB drivers
 * resolve from the *target project* per the kept v1 `drivers.ts` pattern, so they
 * are not deps of this package at all. Output is committed under
 * plugins/goodvibes/server/connect/.
 */

import * as esbuild from 'esbuild';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { chmod, copyFile, mkdir, rm, stat } from 'fs/promises';
import { createRequire } from 'module';

// Version is injected from the single source of truth (plugin.json) so the
// SERVER_VERSION constant can never drift from releases again (2.0.2 lesson).
const PLUGIN_VERSION = JSON.parse(
  readFileSync(new URL('../../plugins/goodvibes/.claude-plugin/plugin.json', import.meta.url), 'utf8'),
).version;


const __dirname = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const serverDir = join(__dirname, '../../plugins/goodvibes/server/connect');
const wasmDir = join(serverDir, 'wasm');

// chmod after each copy so the shipped asset mode does not depend on the
// building machine's umask. A failed copy throws and fails the build rather
// than leaving the previously committed asset in place for dist-match to bless.
async function copyResolved(resolveSpec, destName) {
  const src = require.resolve(resolveSpec);
  const destination = join(wasmDir, destName);
  await mkdir(wasmDir, { recursive: true });
  await copyFile(src, destination);
  await chmod(destination, 0o644);
  console.log(`Copied: ${destName}`);
}

// A build that exits 0 having written nothing makes every downstream gate
// vacuous: dist-match diffs the stale committed bundle against itself and
// passes. Assert this run actually produced the bundle.
const BUILD_STARTED_AT = Date.now();
async function assertWritten(outfile) {
  const info = await stat(outfile).catch(() => null);
  if (!info) throw new Error(`Build did not write ${outfile}`);
  if (info.size === 0) throw new Error(`Build wrote an empty ${outfile}`);
  // One second of slack for filesystems with coarse mtime granularity.
  if (info.mtimeMs + 1000 < BUILD_STARTED_AT) {
    throw new Error(`${outfile} was not rewritten by this build (mtime predates the run)`);
  }
}

async function build() {
  await mkdir(serverDir, { recursive: true });
  // Clear the asset directory so a removed asset is a visible deletion.
  await rm(wasmDir, { recursive: true, force: true });

  await esbuild.build({
    entryPoints: [join(__dirname, 'src/index.ts')],
    bundle: true,
    platform: 'node',
    target: 'node20',
    format: 'cjs',
    outfile: join(serverDir, 'index.cjs'),
    // Bundle module-key comments are rendered relative to esbuild's working
    // directory, pin it to the repo root so output is byte-identical no
    // matter where the build is invoked from.
    absWorkingDir: join(__dirname, '../..'),
    // Opt-in: a shipped .map embeds the full TypeScript source in the
  // marketplace tree. Set GOODVIBES_SOURCEMAP=1 for a local debugging build.
  sourcemap: process.env.GOODVIBES_SOURCEMAP === '1',
    minify: false,
    keepNames: true,
    define: { __GV_VERSION__: JSON.stringify(PLUGIN_VERSION) },
    external: ['sql.js'],
  });
  await assertWritten(join(serverDir, 'index.cjs'));
  console.log('Build completed: plugins/goodvibes/server/connect/index.cjs');

  await copyResolved('sql.js/dist/sql-wasm.wasm', 'sql-wasm.wasm');
}

build().catch((err) => {
  console.error('Build failed:', err);
  process.exit(1);
});
