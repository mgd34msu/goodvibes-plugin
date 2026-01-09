#!/usr/bin/env node
/**
 * Bundle entry points into self-contained files
 *
 * This bundles each hook entry point so the plugin cache doesn't need subdirectories.
 */

import * as esbuild from 'esbuild';
import { readdirSync, mkdirSync, existsSync } from 'fs';
import { join, basename } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const srcDir = join(__dirname, '..', 'src');
const distDir = join(__dirname, '..', 'dist');

// Get all entry point .ts files in src root (not subdirectories)
const entryPoints = readdirSync(srcDir)
  .filter(f => f.endsWith('.ts') && !f.endsWith('.d.ts'))
  .map(f => join(srcDir, f));

console.log(`Bundling ${entryPoints.length} entry points...`);

// Ensure dist exists
if (!existsSync(distDir)) {
  mkdirSync(distDir, { recursive: true });
}

// Bundle each entry point
for (const entry of entryPoints) {
  const name = basename(entry, '.ts');
  console.log(`  ${name}.ts -> ${name}.js`);

  await esbuild.build({
    entryPoints: [entry],
    bundle: true,
    platform: 'node',
    target: 'node20',
    format: 'esm',
    outfile: join(distDir, `${name}.js`),
    external: ['node:*'], // Keep node: imports external
    banner: {
      js: '/* Bundled with esbuild */',
    },
  });
}

console.log('Done!');
