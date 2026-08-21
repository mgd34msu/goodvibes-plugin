/**
 * Build the goodvibes-intel server bundle.
 *
 * Matches v1's proven esbuild pattern (bundle, platform:node, format:cjs,
 * keepNames, sourcemap), updated for v2: target node20, output committed under
 * plugins/goodvibes/server/intel/. Externals per §5.1: @ast-grep/napi and
 * @vscode/ripgrep (native) and sql.js (loads its WASM at runtime); `typescript`
 * IS bundled (pure JS, one copy, one version, the single compiler host lives in
 * intel). The WASM copy step targets server/wasm/ and copies BOTH the
 * tree-sitter grammars AND sql-wasm.wasm. Every copy must succeed: a failed
 * copy throws and fails the build, and the asset directory is removed first so
 * a dropped asset shows up as a deletion in the committed tree instead of
 * leaving a stale file behind for dist-match to bless.
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
const serverDir = join(__dirname, '../../plugins/goodvibes/server/intel');
const wasmDir = join(serverDir, 'wasm');
// Tree-sitter grammar .wasm assets are committed source under packages/intel/wasm/
// (lane 1: copied from v1 precision-engine's built dist, see lane report for the
// pinned web-tree-sitter version note) rather than resolved from the
// `tree-sitter-wasms` npm package, which is not a workspace dependency (the
// grammars are prebuilt binaries, not build output of that package here).
const localWasmDir = join(__dirname, 'wasm');

// chmod after each copy so the shipped asset mode does not depend on the
// building machine's umask (the artifact manifest hashes content, but a
// world-unreadable asset would still break a user's install).
async function copyResolved(resolveSpec, destName) {
  const src = require.resolve(resolveSpec);
  const destination = join(wasmDir, destName);
  await mkdir(wasmDir, { recursive: true });
  await copyFile(src, destination);
  await chmod(destination, 0o644);
  console.log(`Copied: ${destName}`);
}

async function copyLocal(srcName, destName = srcName) {
  const destination = join(wasmDir, destName);
  await mkdir(wasmDir, { recursive: true });
  await copyFile(join(localWasmDir, srcName), destination);
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
    // Native + WASM-loading deps stay external (runtime deps in server/package.json).
    // 'web-tree-sitter' is external for a permanent reason (lane 1, verified
    // empirically): it is an Emscripten/WASM loader that resolves its own
    // runtime .wasm via `import.meta.url` internally; esbuild's CJS output
    // format zeroes `import.meta`, which broke that internal resolution when
    // bundled ("filename ... Received undefined"). Kept unbundled so it runs
    // as its own ESM/CJS module with working self-resolution, added to
    // plugins/goodvibes/server/intel/package.json's runtime deps accordingly.
    // 'fast-glob' bundles per spec §5.1 now that it is installed.
    external: ['@ast-grep/napi', '@vscode/ripgrep', 'sql.js', 'web-tree-sitter'],
  });
  await assertWritten(join(serverDir, 'index.cjs'));
  console.log('Build completed: plugins/goodvibes/server/intel/index.cjs');

  // WASM assets → server/wasm/: tree-sitter grammars + core + sql-wasm.
  // Grammars are committed source under packages/intel/wasm/ (lane 1: copied
  // from v1 precision-engine's dist, see lane report for the pinned
  // web-tree-sitter version note; NOT resolved from the `tree-sitter-wasms`
  // npm package, which is not a workspace dependency here).
  // There is deliberately no `tree-sitter.wasm` copy here. Nothing under
  // packages/intel/src loads that filename: lib/tree-sitter.ts probes only for
  // `tree-sitter-<language>.wasm` grammars and lets Parser.init() resolve
  // web-tree-sitter's own runtime module, so the old best-effort copy of it
  // could only ever print a warning.
  const languages = ['typescript', 'javascript', 'python', 'rust', 'go'];
  for (const lang of languages) {
    await copyLocal(`tree-sitter-${lang}.wasm`);
  }
  // web-tree-sitter's own runtime wasm (distinct from the grammar files above),
  // under its real filename, Parser.init() resolves it relative to the
  // executing bundle by default when no locateFile option is given.
  await copyResolved('web-tree-sitter/web-tree-sitter.wasm', 'web-tree-sitter.wasm');
  await copyResolved('sql.js/dist/sql-wasm.wasm', 'sql-wasm.wasm');
}

build().catch((err) => {
  console.error('Build failed:', err);
  process.exit(1);
});
