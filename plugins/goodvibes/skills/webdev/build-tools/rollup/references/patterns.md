# Rollup Configuration Patterns

## React Library

```javascript
import resolve from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';
import typescript from '@rollup/plugin-typescript';
import terser from '@rollup/plugin-terser';
import peerDepsExternal from 'rollup-plugin-peer-deps-external';
import postcss from 'rollup-plugin-postcss';

const production = !process.env.ROLLUP_WATCH;

export default {
  input: 'src/index.ts',

  output: [
    {
      file: 'dist/index.esm.js',
      format: 'esm',
      sourcemap: true,
    },
    {
      file: 'dist/index.cjs.js',
      format: 'cjs',
      sourcemap: true,
      exports: 'named',
    },
  ],

  plugins: [
    peerDepsExternal(),
    resolve({ browser: true }),
    commonjs(),
    typescript({
      tsconfig: './tsconfig.json',
      declaration: true,
      declarationDir: 'dist/types',
    }),
    postcss({
      modules: true,
      minimize: production,
    }),
    production && terser(),
  ],
};
```

## CLI Tool

```javascript
import resolve from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';
import typescript from '@rollup/plugin-typescript';
import json from '@rollup/plugin-json';
import { chmod } from 'fs/promises';

export default {
  input: 'src/cli.ts',

  output: {
    file: 'dist/cli.js',
    format: 'esm',
    banner: '#!/usr/bin/env node',
  },

  plugins: [
    resolve({ preferBuiltins: true }),
    commonjs(),
    typescript(),
    json(),
    {
      name: 'chmod',
      writeBundle() {
        return chmod('dist/cli.js', 0o755);
      },
    },
  ],

  external: [
    // Node.js builtins
    'fs', 'path', 'os', 'child_process',
  ],
};
```

## Multi-Package Monorepo

```javascript
import resolve from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';
import typescript from '@rollup/plugin-typescript';
import { glob } from 'glob';

const packages = glob.sync('packages/*/package.json');

export default packages.map((pkgPath) => {
  const pkg = require(`./${pkgPath}`);
  const dir = pkgPath.replace('/package.json', '');

  return {
    input: `${dir}/src/index.ts`,
    output: [
      {
        file: `${dir}/dist/index.esm.js`,
        format: 'esm',
        sourcemap: true,
      },
      {
        file: `${dir}/dist/index.cjs.js`,
        format: 'cjs',
        sourcemap: true,
      },
    ],
    external: [
      ...Object.keys(pkg.dependencies || {}),
      ...Object.keys(pkg.peerDependencies || {}),
      /^@myorg\//,
    ],
    plugins: [
      resolve(),
      commonjs(),
      typescript({
        tsconfig: `${dir}/tsconfig.json`,
      }),
    ],
  };
});
```

## Development vs Production

```javascript
import resolve from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';
import typescript from '@rollup/plugin-typescript';
import terser from '@rollup/plugin-terser';
import replace from '@rollup/plugin-replace';
import { visualizer } from 'rollup-plugin-visualizer';

const production = process.env.NODE_ENV === 'production';

export default {
  input: 'src/index.ts',

  output: {
    file: production ? 'dist/bundle.min.js' : 'dist/bundle.js',
    format: 'esm',
    sourcemap: !production,
  },

  plugins: [
    replace({
      preventAssignment: true,
      'process.env.NODE_ENV': JSON.stringify(
        production ? 'production' : 'development'
      ),
    }),
    resolve(),
    commonjs(),
    typescript(),
    production && terser(),
    production && visualizer({ filename: 'bundle-stats.html' }),
  ].filter(Boolean),
};
```

## Multiple Bundles (Dev/Prod/Types)

```javascript
import resolve from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';
import typescript from '@rollup/plugin-typescript';
import terser from '@rollup/plugin-terser';
import { dts } from 'rollup-plugin-dts';

const shared = {
  input: 'src/index.ts',
  external: ['react', 'react-dom'],
  plugins: [resolve(), commonjs()],
};

export default [
  // Development ESM
  {
    ...shared,
    output: {
      file: 'dist/index.development.mjs',
      format: 'esm',
      sourcemap: true,
    },
    plugins: [
      ...shared.plugins,
      typescript({ declaration: true, declarationDir: 'dist/types' }),
    ],
  },

  // Production ESM
  {
    ...shared,
    output: {
      file: 'dist/index.production.mjs',
      format: 'esm',
    },
    plugins: [...shared.plugins, typescript(), terser()],
  },

  // Production CJS
  {
    ...shared,
    output: {
      file: 'dist/index.cjs',
      format: 'cjs',
      exports: 'named',
    },
    plugins: [...shared.plugins, typescript(), terser()],
  },

  // TypeScript declarations
  {
    input: 'dist/types/index.d.ts',
    output: { file: 'dist/index.d.ts', format: 'es' },
    plugins: [dts()],
  },
];
```

## Browser Global (UMD)

```javascript
import resolve from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';
import typescript from '@rollup/plugin-typescript';
import terser from '@rollup/plugin-terser';

export default {
  input: 'src/index.ts',

  output: [
    {
      file: 'dist/my-library.js',
      format: 'umd',
      name: 'MyLibrary',
      globals: {
        react: 'React',
        'react-dom': 'ReactDOM',
      },
      sourcemap: true,
    },
    {
      file: 'dist/my-library.min.js',
      format: 'umd',
      name: 'MyLibrary',
      globals: {
        react: 'React',
        'react-dom': 'ReactDOM',
      },
      plugins: [terser()],
    },
  ],

  external: ['react', 'react-dom'],
  plugins: [resolve(), commonjs(), typescript()],
};
```

## With CSS Modules

```javascript
import resolve from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';
import typescript from '@rollup/plugin-typescript';
import postcss from 'rollup-plugin-postcss';
import autoprefixer from 'autoprefixer';

export default {
  input: 'src/index.ts',

  output: [
    {
      file: 'dist/index.esm.js',
      format: 'esm',
      sourcemap: true,
    },
  ],

  plugins: [
    resolve(),
    commonjs(),
    postcss({
      modules: {
        generateScopedName: '[name]__[local]___[hash:base64:5]',
      },
      plugins: [autoprefixer()],
      extract: 'styles.css',
      minimize: true,
      sourceMap: true,
    }),
    typescript(),
  ],
};
```

## Environment-Based Config

```javascript
// rollup.config.js
import { defineConfig } from 'rollup';

export default defineConfig((commandLineArgs) => {
  const isWatch = commandLineArgs.watch;
  const env = process.env.NODE_ENV || 'development';

  return {
    input: 'src/index.ts',
    output: {
      file: `dist/bundle.${env}.js`,
      format: 'esm',
      sourcemap: env !== 'production',
    },
    watch: isWatch
      ? {
          include: 'src/**',
          clearScreen: false,
        }
      : false,
    plugins: [
      // ... plugins
    ],
  };
});
```

## Preserving Entry Signatures

For libraries that need to maintain exact export structure:

```javascript
export default {
  input: {
    index: 'src/index.ts',
    utils: 'src/utils/index.ts',
    hooks: 'src/hooks/index.ts',
  },

  output: {
    dir: 'dist',
    format: 'esm',
    // Preserve exports from entry points
    preserveModules: true,
    preserveModulesRoot: 'src',
  },

  plugins: [
    // ...
  ],
};
```

## Custom Banner/Footer

```javascript
import pkg from './package.json';

export default {
  input: 'src/index.ts',

  output: {
    file: 'dist/bundle.js',
    format: 'esm',
    banner: `
/*!
 * ${pkg.name} v${pkg.version}
 * (c) ${new Date().getFullYear()} ${pkg.author}
 * Released under the ${pkg.license} License
 */
    `.trim(),
    footer: '/* Follow me on Twitter @author */',
  },
};
```
