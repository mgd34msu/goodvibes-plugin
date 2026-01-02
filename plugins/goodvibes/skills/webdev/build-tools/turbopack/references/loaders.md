# Turbopack Loader Compatibility

## Loader Configuration Syntax

```typescript
turbopack: {
  rules: {
    '*.extension': {
      loaders: ['loader-name'],
      as: '*.js', // Output type
    },
  },
}
```

## Compatible Loaders

### File Loaders

```typescript
// Raw file content as string
'*.txt': {
  loaders: ['raw-loader'],
  as: '*.js',
}

// File URL
'*.pdf': {
  loaders: ['file-loader'],
  as: '*.js',
}

// Inline as base64
'*.png': {
  loaders: ['url-loader'],
  as: '*.js',
}
```

### Data Format Loaders

```typescript
// YAML
'*.yaml': {
  loaders: ['yaml-loader'],
  as: '*.js',
}

// TOML
'*.toml': {
  loaders: ['toml-loader'],
  as: '*.js',
}

// JSON5
'*.json5': {
  loaders: ['json5-loader'],
  as: '*.js',
}

// CSV
'*.csv': {
  loaders: ['csv-loader'],
  as: '*.js',
}
```

### Markup Loaders

```typescript
// Markdown to HTML
'*.md': {
  loaders: ['html-loader', 'markdown-loader'],
  as: '*.js',
}

// MDX (Markdown + JSX)
'*.mdx': {
  loaders: ['@mdx-js/loader'],
  as: '*.js',
}

// Handlebars
'*.hbs': {
  loaders: ['handlebars-loader'],
  as: '*.js',
}
```

### Graphics Loaders

```typescript
// SVG as React component
'*.svg': {
  loaders: ['@svgr/webpack'],
  as: '*.js',
}

// SVG with options
'*.svg': {
  loaders: [
    {
      loader: '@svgr/webpack',
      options: {
        svgo: true,
        titleProp: true,
        ref: true,
      },
    },
  ],
  as: '*.js',
}
```

### API/Schema Loaders

```typescript
// GraphQL
'*.graphql': {
  loaders: ['graphql-tag/loader'],
  as: '*.js',
}

// GraphQL (alternative)
'*.gql': {
  loaders: ['graphql-loader'],
  as: '*.js',
}
```

### Transpiler Loaders

```typescript
// Babel (when needed beyond SWC)
'*.js': {
  loaders: [
    {
      loader: 'babel-loader',
      options: {
        presets: ['@babel/preset-env'],
      },
    },
  ],
  as: '*.js',
}
```

## Loader Options

### Passing Options

```typescript
'*.svg': {
  loaders: [
    {
      loader: '@svgr/webpack',
      options: {
        // SVGO optimization
        svgo: true,
        svgoConfig: {
          plugins: [
            { name: 'removeViewBox', active: false },
            { name: 'removeDimensions', active: true },
          ],
        },
        // Generate TypeScript
        typescript: true,
        // Add displayName
        displayName: true,
        // Ref forwarding
        ref: true,
        // Title prop
        titleProp: true,
      },
    },
  ],
  as: '*.js',
}
```

### Chaining Loaders

```typescript
// Loaders run right-to-left (bottom-to-top)
'*.md': {
  loaders: [
    'html-loader',      // 2. Convert HTML to module
    'markdown-loader',  // 1. Convert MD to HTML
  ],
  as: '*.js',
}
```

## Partially Supported Loaders

These loaders may work but with limitations:

| Loader | Status | Notes |
|--------|--------|-------|
| babel-loader | Partial | SWC preferred, Babel for edge cases |
| sass-loader | Built-in | Use native Sass support instead |
| css-loader | Built-in | CSS Modules built-in |
| postcss-loader | Built-in | Via postcss.config.js |
| ts-loader | N/A | TypeScript built-in via SWC |

## Unsupported Loaders

These loaders will NOT work:

| Loader | Reason | Alternative |
|--------|--------|-------------|
| thread-loader | Architecture conflict | Built-in parallelism |
| cache-loader | Not needed | Native caching |
| mini-css-extract-plugin | Plugin, not loader | Built-in CSS handling |
| style-loader | Built-in | Native CSS injection |

## Pattern Matching

```typescript
turbopack: {
  rules: {
    // Single extension
    '*.svg': { ... },

    // Multiple files (separate rules)
    '*.yaml': { ... },
    '*.yml': { ... },

    // Path-specific (limited support)
    'src/icons/*.svg': { ... },
  },
}
```

## Testing Loader Compatibility

```typescript
// next.config.ts
const nextConfig: NextConfig = {
  turbopack: {
    rules: {
      '*.svg': {
        loaders: ['@svgr/webpack'],
        as: '*.js',
      },
    },
  },
};

// Test file: test.tsx
import Logo from './logo.svg';

export default function Test() {
  return <Logo />;
}
```

Run `next dev` and check for errors.

## Fallback to Webpack

If a loader is unsupported:

```bash
# Use webpack for incompatible projects
next dev --webpack
next build --webpack
```

Or conditionally in config:

```typescript
const useWebpack = process.env.USE_WEBPACK === 'true';

const nextConfig: NextConfig = useWebpack
  ? {
      webpack: (config) => {
        // Full webpack config
        return config;
      },
    }
  : {
      turbopack: {
        rules: { ... },
      },
    };
```
