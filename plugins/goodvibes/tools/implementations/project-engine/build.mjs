import * as esbuild from 'esbuild';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { cp, mkdir } from 'fs/promises';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

async function build() {
  try {
    await esbuild.build({
      entryPoints: [join(__dirname, 'src/index.ts')],
      bundle: true,
      platform: 'node',
      target: 'node18',
      format: 'cjs',
      outfile: join(__dirname, 'dist/index.cjs'),
      sourcemap: true,
      external: ['sql.js'],
      minify: false,
      keepNames: true,
    });
    
    // Copy sql.js WASM file to dist
    const nodeModulesDir = join(__dirname, 'dist/node_modules');
    await mkdir(nodeModulesDir, { recursive: true });
    
    // Copy sql.js package including WASM files
    const src = join(__dirname, 'node_modules/sql.js');
    const dest = join(nodeModulesDir, 'sql.js');
    try {
      await cp(src, dest, { recursive: true });
      console.log('Copied: sql.js WASM files');
    } catch (e) {
      console.warn('Warning: Could not copy sql.js:', e.message);
    }
    
    console.log('Build completed: dist/index.cjs');
  } catch (error) {
    console.error('Build failed:', error);
    process.exit(1);
  }
}

build();
