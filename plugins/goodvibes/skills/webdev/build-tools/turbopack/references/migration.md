# Migrating from Webpack to Turbopack

## Pre-Migration Checklist

1. **Update Next.js to 16+**
2. **Audit webpack plugins** (plugins are NOT supported)
3. **Audit custom loaders** (many are compatible)
4. **Test development build first** before production

## Step-by-Step Migration

### Step 1: Update Next.js

```bash
npm install next@latest react@latest react-dom@latest
```

### Step 2: Audit Current Webpack Config

```typescript
// Identify what needs migration
webpack: (config, { isServer }) => {
  // Loaders - usually migratable
  config.module.rules.push({
    test: /\.svg$/,
    use: ['@svgr/webpack'],
  });

  // Plugins - NOT supported, need alternatives
  config.plugins.push(
    new BundleAnalyzerPlugin()  // Find alternative
  );

  // Resolve aliases - supported
  config.resolve.alias = {
    '@': path.resolve(__dirname, 'src'),
  };

  return config;
}
```

### Step 3: Migrate Loaders

```typescript
// Before (webpack)
webpack: (config) => {
  config.module.rules.push(
    {
      test: /\.svg$/,
      use: ['@svgr/webpack'],
    },
    {
      test: /\.graphql$/,
      use: ['graphql-tag/loader'],
    },
    {
      test: /\.yaml$/,
      use: ['yaml-loader'],
    }
  );
  return config;
}

// After (Turbopack)
turbopack: {
  rules: {
    '*.svg': {
      loaders: ['@svgr/webpack'],
      as: '*.js',
    },
    '*.graphql': {
      loaders: ['graphql-tag/loader'],
      as: '*.js',
    },
    '*.yaml': {
      loaders: ['yaml-loader'],
      as: '*.js',
    },
  },
}
```

### Step 4: Migrate Resolve Aliases

```typescript
// Before (webpack)
webpack: (config) => {
  config.resolve.alias = {
    '@': path.resolve(__dirname, 'src'),
    '@components': path.resolve(__dirname, 'src/components'),
    'lodash': 'lodash-es',
  };
  return config;
}

// After (Turbopack)
turbopack: {
  resolveAlias: {
    '@': './src',
    '@components': './src/components',
    'lodash': 'lodash-es',
  },
}
```

### Step 5: Handle Unsupported Plugins

| Plugin | Alternative |
|--------|-------------|
| BundleAnalyzerPlugin | `@next/bundle-analyzer` or `next build --profile` |
| DefinePlugin | `env` in next.config.ts |
| CopyWebpackPlugin | `public/` directory or custom script |
| MiniCssExtractPlugin | Built-in CSS handling |
| CompressionPlugin | CDN/server compression |
| WorkboxPlugin | next-pwa or custom service worker |

```typescript
// Environment variables (replaces DefinePlugin)
const nextConfig: NextConfig = {
  env: {
    CUSTOM_VAR: process.env.CUSTOM_VAR,
  },
};

// Bundle analyzer
// npm install @next/bundle-analyzer
const withBundleAnalyzer = require('@next/bundle-analyzer')({
  enabled: process.env.ANALYZE === 'true',
});

module.exports = withBundleAnalyzer(nextConfig);
```

### Step 6: Test Development Build

```bash
# Test with Turbopack (default in Next.js 16+)
next dev

# If issues, fallback to webpack
next dev --webpack
```

### Step 7: Test Production Build

```bash
# Test production with Turbopack
next build

# If issues, fallback to webpack
next build --webpack
```

## Common Migration Issues

### Issue: Plugin Not Supported

```bash
# Error: webpack plugins are not supported in Turbopack
```

**Solution**: Find alternative or use webpack flag

```typescript
// Option 1: Use built-in Next.js feature
const nextConfig: NextConfig = {
  images: { ... },  // Use next/image config instead of image-webpack-loader
};

// Option 2: Keep using webpack
// next dev --webpack
```

### Issue: Loader Incompatible

```bash
# Error: loader 'some-loader' is not supported
```

**Solution**: Check loader compatibility or use alternative

```typescript
// Check if built-in support exists
// CSS, Sass, TypeScript, etc. are built-in

// Use webpack for edge cases
// next dev --webpack
```

### Issue: Custom Module Resolution

```typescript
// Before: Complex resolution logic
webpack: (config) => {
  config.resolve.plugins.push(new TsconfigPathsPlugin());
  return config;
}

// After: Use resolveAlias or tsconfig paths
// Turbopack respects tsconfig.json paths automatically
{
  "compilerOptions": {
    "paths": {
      "@/*": ["./src/*"]
    }
  }
}
```

## Gradual Migration Strategy

### Phase 1: Development Only

```bash
# Use Turbopack for dev, webpack for build
next dev        # Turbopack
next build --webpack  # Keep webpack for production
```

### Phase 2: Identify Blockers

```typescript
// Log what's incompatible
console.log('Webpack plugins in use:', [
  'BundleAnalyzerPlugin',
  'CustomPlugin',
]);
```

### Phase 3: Full Migration

```bash
# Once all issues resolved
next dev   # Turbopack
next build # Turbopack
```

## Performance Validation

### Before Migration

```bash
# Measure webpack performance
time next dev &
# Note startup time

# Test HMR
time # (edit file, measure update time)
```

### After Migration

```bash
# Measure Turbopack performance
time next dev &
# Note startup time (should be faster)

# Test HMR
time # (edit file, should be ~10x faster)
```

## Rollback Plan

Always have a rollback option:

```json
{
  "scripts": {
    "dev": "next dev",
    "dev:webpack": "next dev --webpack",
    "build": "next build",
    "build:webpack": "next build --webpack"
  }
}
```

## Migration Checklist

- [ ] Updated to Next.js 16+
- [ ] Audited webpack plugins
- [ ] Migrated compatible loaders to turbopack.rules
- [ ] Migrated resolve aliases to turbopack.resolveAlias
- [ ] Found alternatives for unsupported plugins
- [ ] Tested development build with Turbopack
- [ ] Tested production build with Turbopack
- [ ] Validated performance improvements
- [ ] Documented any webpack fallback requirements
