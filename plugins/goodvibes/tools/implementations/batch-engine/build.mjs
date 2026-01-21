import * as esbuild from 'esbuild';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function build() {
  try {
    await esbuild.build({
      entryPoints: [path.join(__dirname, 'src/index.ts')],
      bundle: true,
      platform: 'node',
      format: 'cjs',
      outfile: path.join(__dirname, 'dist/index.cjs'),
      sourcemap: true,
      external: ['@modelcontextprotocol/sdk'],
      target: 'node18',
      logLevel: 'info',
    });
    console.log('Build completed: dist/index.cjs');
  } catch (error) {
    console.error('Build failed:', error);
    process.exit(1);
  }
}

build();
