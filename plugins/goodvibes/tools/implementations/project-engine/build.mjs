import * as esbuild from 'esbuild';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { cp, mkdir, readdir } from 'fs/promises';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

async function build() {
  try {
    // Bundle everything including sql.js
    await esbuild.build({
      entryPoints: [join(__dirname, 'src/index.ts')],
      bundle: true,
      platform: 'node',
      target: 'node18',
      format: 'cjs',
      outfile: join(__dirname, 'dist/index.cjs'),
      sourcemap: true,
      external: ['pg', 'mysql2/promise'], // Optional peer deps - not installed at build time
      minify: false,
      keepNames: true,
    });
    
    // Copy sql.js WASM file to dist (sql-wasm.wasm is needed at runtime)
    const distDir = join(__dirname, 'dist');
    await mkdir(distDir, { recursive: true });
    
    // Copy the WASM file directly to dist
    const wasmSrc = join(__dirname, 'node_modules/sql.js/dist/sql-wasm.wasm');
    const wasmDest = join(distDir, 'sql-wasm.wasm');
    try {
      await cp(wasmSrc, wasmDest);
      console.log('Copied: sql-wasm.wasm');
    } catch (e) {
      console.warn('Warning: Could not copy sql-wasm.wasm:', e.message);
    }
    
    console.log('Build completed: dist/index.cjs');
  } catch (error) {
    console.error('Build failed:', error);
    process.exit(1);
  }
}

build();
