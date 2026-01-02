# Webpack Optimization Guide

## Bundle Size Optimization

### Tree Shaking

```javascript
// Ensure ESM exports
// package.json
{
  "sideEffects": false,
  // or specify files with side effects
  "sideEffects": ["*.css", "*.scss"]
}

// webpack.config.js
module.exports = {
  mode: 'production', // Enables tree shaking
  optimization: {
    usedExports: true,
  },
};
```

### Code Splitting

```javascript
optimization: {
  splitChunks: {
    chunks: 'all',
    minSize: 20000,
    minRemainingSize: 0,
    minChunks: 1,
    maxAsyncRequests: 30,
    maxInitialRequests: 30,
    enforceSizeThreshold: 50000,
    cacheGroups: {
      // Vendor chunk
      vendors: {
        test: /[\\/]node_modules[\\/]/,
        priority: -10,
        reuseExistingChunk: true,
        name: 'vendors',
      },
      // React chunk
      react: {
        test: /[\\/]node_modules[\\/](react|react-dom)[\\/]/,
        name: 'react',
        chunks: 'all',
        priority: 20,
      },
      // Common chunk
      common: {
        minChunks: 2,
        priority: -20,
        reuseExistingChunk: true,
        name: 'common',
      },
    },
  },
  // Extract runtime code
  runtimeChunk: 'single',
}
```

### Dynamic Imports

```javascript
// Route-based splitting
const Home = React.lazy(() => import('./pages/Home'));
const About = React.lazy(() => import('./pages/About'));

// Named chunks
const Dashboard = React.lazy(() =>
  import(/* webpackChunkName: "dashboard" */ './pages/Dashboard')
);

// Prefetch (low priority)
import(/* webpackPrefetch: true */ './HeavyComponent');

// Preload (high priority)
import(/* webpackPreload: true */ './CriticalComponent');
```

### Externals

Exclude large libraries from bundle:

```javascript
externals: {
  react: 'React',
  'react-dom': 'ReactDOM',
  lodash: '_',
},

// Load from CDN in HTML
// <script src="https://unpkg.com/react/umd/react.production.min.js"></script>
```

## Build Performance

### Caching

```javascript
// Filesystem cache (Webpack 5)
cache: {
  type: 'filesystem',
  version: '1.0',
  cacheDirectory: path.resolve(__dirname, '.cache'),
  buildDependencies: {
    config: [__filename],
  },
  compression: 'gzip',
}
```

### Parallel Processing

```javascript
const TerserPlugin = require('terser-webpack-plugin');

optimization: {
  minimizer: [
    new TerserPlugin({
      parallel: true, // Use all CPU cores
    }),
  ],
}
```

### Module Resolution

```javascript
resolve: {
  // Only resolve these extensions
  extensions: ['.ts', '.tsx', '.js', '.jsx'],

  // Prefer main fields
  mainFields: ['browser', 'module', 'main'],

  // Limit module search
  modules: [
    path.resolve(__dirname, 'src'),
    'node_modules',
  ],

  // Alias for faster resolution
  alias: {
    '@': path.resolve(__dirname, 'src'),
  },
}
```

### Exclude Node Modules

```javascript
{
  test: /\.js$/,
  exclude: /node_modules/,
  use: 'babel-loader',
}

// Or include only specific paths
{
  test: /\.js$/,
  include: path.resolve(__dirname, 'src'),
  use: 'babel-loader',
}
```

### Thread Loader

Parallel loaders for heavy processing:

```bash
npm install --save-dev thread-loader
```

```javascript
{
  test: /\.js$/,
  use: [
    {
      loader: 'thread-loader',
      options: {
        workers: 4,
      },
    },
    'babel-loader',
  ],
}
```

## Output Optimization

### Content Hashing

```javascript
output: {
  filename: '[name].[contenthash].js',
  chunkFilename: '[name].[contenthash].chunk.js',
  assetModuleFilename: 'assets/[hash][ext]',
}
```

### Module IDs

```javascript
optimization: {
  // Deterministic IDs for better caching
  moduleIds: 'deterministic',
  chunkIds: 'deterministic',
}
```

### Compression

```javascript
const CompressionPlugin = require('compression-webpack-plugin');

plugins: [
  // Gzip
  new CompressionPlugin({
    algorithm: 'gzip',
    test: /\.(js|css|html|svg)$/,
    threshold: 10240,
    minRatio: 0.8,
  }),

  // Brotli
  new CompressionPlugin({
    filename: '[path][base].br',
    algorithm: 'brotliCompress',
    test: /\.(js|css|html|svg)$/,
    compressionOptions: { level: 11 },
  }),
]
```

## Development Optimization

### Fast Refresh

```javascript
const ReactRefreshWebpackPlugin = require('@pmmmwh/react-refresh-webpack-plugin');

// Development only
plugins: [
  new ReactRefreshWebpackPlugin(),
]

// In babel-loader
{
  loader: 'babel-loader',
  options: {
    plugins: [
      process.env.NODE_ENV === 'development' && 'react-refresh/babel',
    ].filter(Boolean),
  },
}
```

### Source Maps

```javascript
// Development - fast rebuild
devtool: 'eval-cheap-module-source-map',

// Production - accurate but slow
devtool: 'source-map',

// Production - hidden from browser devtools
devtool: 'hidden-source-map',
```

### Watch Optimization

```javascript
watchOptions: {
  ignored: /node_modules/,
  aggregateTimeout: 300,
  poll: 1000, // Use polling in Docker/VMs
}
```

## Analysis Tools

### Bundle Analyzer

```javascript
const { BundleAnalyzerPlugin } = require('webpack-bundle-analyzer');

plugins: [
  new BundleAnalyzerPlugin({
    analyzerMode: process.env.ANALYZE ? 'server' : 'disabled',
    openAnalyzer: true,
  }),
]
```

### Stats Output

```javascript
// webpack.config.js
stats: {
  assets: true,
  chunks: true,
  modules: true,
  reasons: true,
  errorDetails: true,
}

// Or generate JSON
// npx webpack --json > stats.json
```

## Performance Budgets

```javascript
performance: {
  hints: 'warning', // 'error' to fail build
  maxEntrypointSize: 250000, // 250kb
  maxAssetSize: 250000,
  assetFilter: (assetFilename) => {
    return !/\.map$/.test(assetFilename);
  },
}
```

## Production Configuration

```javascript
// webpack.prod.js
const { merge } = require('webpack-merge');
const common = require('./webpack.common.js');
const TerserPlugin = require('terser-webpack-plugin');
const CssMinimizerPlugin = require('css-minimizer-webpack-plugin');

module.exports = merge(common, {
  mode: 'production',
  devtool: 'source-map',

  output: {
    filename: '[name].[contenthash].js',
    chunkFilename: '[name].[contenthash].chunk.js',
  },

  optimization: {
    minimize: true,
    minimizer: [
      new TerserPlugin({
        parallel: true,
        terserOptions: {
          compress: {
            drop_console: true,
          },
        },
      }),
      new CssMinimizerPlugin(),
    ],
    splitChunks: {
      chunks: 'all',
      cacheGroups: {
        vendor: {
          test: /[\\/]node_modules[\\/]/,
          name: 'vendors',
          chunks: 'all',
        },
      },
    },
    runtimeChunk: 'single',
    moduleIds: 'deterministic',
  },

  cache: {
    type: 'filesystem',
  },

  performance: {
    hints: 'warning',
    maxEntrypointSize: 250000,
    maxAssetSize: 250000,
  },
});
```
