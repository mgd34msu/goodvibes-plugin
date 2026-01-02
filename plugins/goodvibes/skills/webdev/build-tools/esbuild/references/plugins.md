# esbuild Plugins

## Plugin API

### Basic Structure

```javascript
const plugin = {
  name: 'plugin-name',
  setup(build) {
    // Resolve hooks
    build.onResolve({ filter: /\.ext$/ }, (args) => {
      return { path: '/resolved/path', namespace: 'ns' };
    });

    // Load hooks
    build.onLoad({ filter: /.*/, namespace: 'ns' }, (args) => {
      return { contents: 'code', loader: 'js' };
    });

    // Lifecycle hooks
    build.onStart(() => console.log('Building...'));
    build.onEnd((result) => console.log('Done!'));
  },
};
```

### onResolve

```javascript
build.onResolve({ filter: /^env$/ }, (args) => {
  // args.path - import path
  // args.importer - file that imported
  // args.namespace - namespace of importer
  // args.resolveDir - directory to resolve from
  // args.kind - import-statement, require-call, etc.
  // args.pluginData - data from previous plugin

  return {
    path: '/absolute/path',
    namespace: 'my-namespace',
    external: false,
    sideEffects: false,
    pluginData: { custom: 'data' },
    errors: [],
    warnings: [],
  };
});
```

### onLoad

```javascript
build.onLoad({ filter: /\.yaml$/, namespace: 'file' }, async (args) => {
  // args.path - resolved path
  // args.namespace - resolved namespace
  // args.suffix - URL suffix (e.g., ?raw)
  // args.pluginData - data from onResolve

  const yaml = await fs.readFile(args.path, 'utf8');
  const data = YAML.parse(yaml);

  return {
    contents: `export default ${JSON.stringify(data)}`,
    loader: 'js',
    resolveDir: path.dirname(args.path),
    pluginData: { processed: true },
    errors: [],
    warnings: [],
    watchFiles: [args.path],
    watchDirs: [],
  };
});
```

## Community Plugins

### esbuild-plugin-alias

```bash
npm install esbuild-plugin-alias
```

```javascript
import alias from 'esbuild-plugin-alias';

await esbuild.build({
  plugins: [
    alias({
      '@': path.resolve(__dirname, 'src'),
      '@components': path.resolve(__dirname, 'src/components'),
    }),
  ],
});
```

### esbuild-plugin-copy

```bash
npm install esbuild-plugin-copy
```

```javascript
import { copy } from 'esbuild-plugin-copy';

await esbuild.build({
  plugins: [
    copy({
      assets: [
        { from: './public/**/*', to: './' },
        { from: './assets/fonts/*', to: './fonts' },
      ],
    }),
  ],
});
```

### esbuild-sass-plugin

```bash
npm install esbuild-sass-plugin sass
```

```javascript
import { sassPlugin } from 'esbuild-sass-plugin';

await esbuild.build({
  plugins: [
    sassPlugin({
      type: 'css', // or 'style' for inline
      filter: /\.scss$/,
      cache: true,
    }),
  ],
});
```

### esbuild-plugin-postcss

```bash
npm install esbuild-postcss postcss autoprefixer
```

```javascript
import postcss from 'esbuild-postcss';

await esbuild.build({
  plugins: [postcss()],
});
```

### @craftamap/esbuild-plugin-html

```bash
npm install @craftamap/esbuild-plugin-html
```

```javascript
import { htmlPlugin } from '@craftamap/esbuild-plugin-html';

await esbuild.build({
  metafile: true, // Required
  plugins: [
    htmlPlugin({
      files: [
        {
          entryPoints: ['src/index.tsx'],
          filename: 'index.html',
          htmlTemplate: 'public/index.html',
        },
      ],
    }),
  ],
});
```

### esbuild-plugin-svgr

```bash
npm install esbuild-plugin-svgr
```

```javascript
import svgr from 'esbuild-plugin-svgr';

await esbuild.build({
  plugins: [
    svgr({
      svgo: true,
      ref: true,
      titleProp: true,
    }),
  ],
});
```

### esbuild-plugin-globals

```bash
npm install esbuild-plugin-globals
```

```javascript
import globals from 'esbuild-plugin-globals';

await esbuild.build({
  plugins: [
    globals({
      react: 'React',
      'react-dom': 'ReactDOM',
    }),
  ],
});
```

## Custom Plugin Examples

### Environment Variables

```javascript
const envPlugin = {
  name: 'env',
  setup(build) {
    const options = build.initialOptions;
    options.define = options.define || {};

    // Add all VITE_ prefixed env vars
    for (const [key, value] of Object.entries(process.env)) {
      if (key.startsWith('VITE_')) {
        options.define[`import.meta.env.${key}`] = JSON.stringify(value);
      }
    }

    options.define['import.meta.env.MODE'] = JSON.stringify(
      process.env.NODE_ENV || 'development'
    );
  },
};
```

### GraphQL

```javascript
import { parse, print } from 'graphql';

const graphqlPlugin = {
  name: 'graphql',
  setup(build) {
    build.onLoad({ filter: /\.(graphql|gql)$/ }, async (args) => {
      const source = await fs.promises.readFile(args.path, 'utf8');
      const document = parse(source);

      return {
        contents: `export default ${JSON.stringify(print(document))}`,
        loader: 'js',
      };
    });
  },
};
```

### YAML

```javascript
import yaml from 'js-yaml';

const yamlPlugin = {
  name: 'yaml',
  setup(build) {
    build.onLoad({ filter: /\.ya?ml$/ }, async (args) => {
      const text = await fs.promises.readFile(args.path, 'utf8');
      const data = yaml.load(text);

      return {
        contents: `export default ${JSON.stringify(data)}`,
        loader: 'json',
      };
    });
  },
};
```

### Markdown

```javascript
import { marked } from 'marked';

const markdownPlugin = {
  name: 'markdown',
  setup(build) {
    build.onLoad({ filter: /\.md$/ }, async (args) => {
      const md = await fs.promises.readFile(args.path, 'utf8');
      const html = marked.parse(md);

      return {
        contents: `export default ${JSON.stringify(html)}`,
        loader: 'js',
      };
    });
  },
};
```

### Bundle Analyzer

```javascript
const analyzerPlugin = {
  name: 'analyzer',
  setup(build) {
    build.onEnd(async (result) => {
      if (result.metafile) {
        const text = await esbuild.analyzeMetafile(result.metafile, {
          verbose: true,
        });
        console.log(text);

        // Write to file
        await fs.promises.writeFile(
          'meta.json',
          JSON.stringify(result.metafile)
        );
      }
    });
  },
};

// Use with metafile: true
await esbuild.build({
  metafile: true,
  plugins: [analyzerPlugin],
});
```

### Clean Plugin

```javascript
import { rm } from 'fs/promises';

const cleanPlugin = {
  name: 'clean',
  setup(build) {
    build.onStart(async () => {
      const outdir = build.initialOptions.outdir;
      if (outdir) {
        await rm(outdir, { recursive: true, force: true });
      }
    });
  },
};
```

### Progress Plugin

```javascript
let startTime;

const progressPlugin = {
  name: 'progress',
  setup(build) {
    build.onStart(() => {
      startTime = Date.now();
      console.log('Build started...');
    });

    build.onEnd((result) => {
      const duration = Date.now() - startTime;
      const errors = result.errors.length;
      const warnings = result.warnings.length;

      console.log(`Build finished in ${duration}ms`);
      if (errors) console.log(`${errors} errors`);
      if (warnings) console.log(`${warnings} warnings`);
    });
  },
};
```

## Plugin Performance Tips

### Use Filter Regex

```javascript
// Good - filter runs in Go, fast
build.onLoad({ filter: /\.tsx$/ }, callback);

// Avoid - matches everything, slow
build.onLoad({ filter: /.*/ }, (args) => {
  if (!args.path.endsWith('.tsx')) return;
  // ...
});
```

### Cache Results

```javascript
const cache = new Map();

const cachingPlugin = {
  name: 'caching',
  setup(build) {
    build.onLoad({ filter: /\.special$/ }, async (args) => {
      const stat = await fs.promises.stat(args.path);
      const key = `${args.path}:${stat.mtimeMs}`;

      if (cache.has(key)) {
        return cache.get(key);
      }

      const result = await processFile(args.path);
      cache.set(key, result);
      return result;
    });
  },
};
```

### Virtual Modules

```javascript
const virtualModules = {
  'virtual:config': 'export const version = "1.0.0"',
  'virtual:env': `export const env = ${JSON.stringify(process.env)}`,
};

const virtualPlugin = {
  name: 'virtual',
  setup(build) {
    build.onResolve({ filter: /^virtual:/ }, (args) => ({
      path: args.path,
      namespace: 'virtual',
    }));

    build.onLoad({ filter: /.*/, namespace: 'virtual' }, (args) => ({
      contents: virtualModules[args.path],
      loader: 'js',
    }));
  },
};
```
