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
import { copyFile, mkdir } from 'fs/promises';
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

async function tryCopy(resolveSpec, destName) {
  try {
    const src = require.resolve(resolveSpec);
    await mkdir(wasmDir, { recursive: true });
    await copyFile(src, join(wasmDir, destName));
    console.log(`Copied: ${destName}`);
  } catch {
    console.warn(`Skipped (not installed yet): ${destName}`);
  }
}

async function build() {
  await mkdir(serverDir, { recursive: true });

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
    sourcemap: true,
    minify: false,
    keepNames: true,
    define: { __GV_VERSION__: JSON.stringify(PLUGIN_VERSION) },
    external: ['sql.js'],
  });
  console.log('Build completed: plugins/goodvibes/server/connect/index.cjs');

  await tryCopy('sql.js/dist/sql-wasm.wasm', 'sql-wasm.wasm');
}

build().catch((err) => {
  console.error('Build failed:', err);
  process.exit(1);
});
