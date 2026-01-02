# Webpack Plugins Reference

## Core Plugins (Built-in)

### DefinePlugin

Replace variables at compile time:

```javascript
const webpack = require('webpack');

new webpack.DefinePlugin({
  'process.env.NODE_ENV': JSON.stringify('production'),
  API_URL: JSON.stringify('https://api.example.com'),
  VERSION: JSON.stringify(require('./package.json').version),
})
```

### ProvidePlugin

Auto-import modules when used:

```javascript
new webpack.ProvidePlugin({
  $: 'jquery',
  jQuery: 'jquery',
  React: 'react',
})
```

### ProgressPlugin

Show build progress:

```javascript
new webpack.ProgressPlugin({
  percentBy: 'entries',
})
```

### BannerPlugin

Add banner to output files:

```javascript
new webpack.BannerPlugin({
  banner: '/*! My App - v1.0.0 */',
  raw: true,
})
```

### IgnorePlugin

Exclude modules from bundle:

```javascript
// Ignore moment.js locales
new webpack.IgnorePlugin({
  resourceRegExp: /^\.\/locale$/,
  contextRegExp: /moment$/,
})
```

### ModuleFederationPlugin

Micro-frontend architecture:

```javascript
const { ModuleFederationPlugin } = require('webpack').container;

new ModuleFederationPlugin({
  name: 'app',
  filename: 'remoteEntry.js',
  exposes: {
    './Component': './src/Component',
  },
  remotes: {
    other: 'other@http://localhost:3001/remoteEntry.js',
  },
  shared: ['react', 'react-dom'],
})
```

## HTML & Assets

### HtmlWebpackPlugin

Generate HTML files:

```bash
npm install --save-dev html-webpack-plugin
```

```javascript
const HtmlWebpackPlugin = require('html-webpack-plugin');

new HtmlWebpackPlugin({
  template: './public/index.html',
  filename: 'index.html',
  chunks: ['main'],
  minify: {
    removeComments: true,
    collapseWhitespace: true,
    removeAttributeQuotes: true,
  },
  meta: {
    viewport: 'width=device-width, initial-scale=1',
  },
})
```

### CopyWebpackPlugin

Copy static files:

```bash
npm install --save-dev copy-webpack-plugin
```

```javascript
const CopyPlugin = require('copy-webpack-plugin');

new CopyPlugin({
  patterns: [
    { from: 'public/assets', to: 'assets' },
    { from: 'public/robots.txt', to: 'robots.txt' },
  ],
})
```

### FaviconsWebpackPlugin

Generate favicons:

```bash
npm install --save-dev favicons-webpack-plugin
```

```javascript
const FaviconsWebpackPlugin = require('favicons-webpack-plugin');

new FaviconsWebpackPlugin({
  logo: './src/logo.png',
  mode: 'webapp',
  cache: true,
})
```

## CSS

### MiniCssExtractPlugin

Extract CSS to files:

```bash
npm install --save-dev mini-css-extract-plugin
```

```javascript
const MiniCssExtractPlugin = require('mini-css-extract-plugin');

// In plugins
new MiniCssExtractPlugin({
  filename: '[name].[contenthash].css',
  chunkFilename: '[id].[contenthash].css',
})

// In rules (replace style-loader)
{
  test: /\.css$/,
  use: [MiniCssExtractPlugin.loader, 'css-loader'],
}
```

### CssMinimizerWebpackPlugin

Minify CSS:

```bash
npm install --save-dev css-minimizer-webpack-plugin
```

```javascript
const CssMinimizerPlugin = require('css-minimizer-webpack-plugin');

optimization: {
  minimizer: [
    '...',  // Keep default minimizers
    new CssMinimizerPlugin(),
  ],
}
```

### PurgeCSSPlugin

Remove unused CSS:

```bash
npm install --save-dev purgecss-webpack-plugin glob-all
```

```javascript
const PurgeCSSPlugin = require('purgecss-webpack-plugin');
const glob = require('glob-all');

new PurgeCSSPlugin({
  paths: glob.sync([
    path.join(__dirname, 'src/**/*.{js,jsx,ts,tsx}'),
    path.join(__dirname, 'public/index.html'),
  ]),
})
```

## Optimization

### TerserWebpackPlugin

Minify JavaScript:

```bash
npm install --save-dev terser-webpack-plugin
```

```javascript
const TerserPlugin = require('terser-webpack-plugin');

optimization: {
  minimize: true,
  minimizer: [
    new TerserPlugin({
      parallel: true,
      terserOptions: {
        ecma: 2020,
        compress: {
          drop_console: true,
          drop_debugger: true,
        },
        output: {
          comments: false,
        },
      },
    }),
  ],
}
```

### CompressionWebpackPlugin

Generate gzip/brotli files:

```bash
npm install --save-dev compression-webpack-plugin
```

```javascript
const CompressionPlugin = require('compression-webpack-plugin');

new CompressionPlugin({
  algorithm: 'gzip',
  test: /\.(js|css|html|svg)$/,
  threshold: 8192,
  minRatio: 0.8,
})

// Brotli
new CompressionPlugin({
  filename: '[path][base].br',
  algorithm: 'brotliCompress',
  test: /\.(js|css|html|svg)$/,
})
```

### BundleAnalyzerPlugin

Visualize bundle size:

```bash
npm install --save-dev webpack-bundle-analyzer
```

```javascript
const { BundleAnalyzerPlugin } = require('webpack-bundle-analyzer');

new BundleAnalyzerPlugin({
  analyzerMode: 'static',
  reportFilename: 'bundle-report.html',
  openAnalyzer: false,
})
```

## Development

### HotModuleReplacementPlugin

Enable HMR (usually via devServer.hot):

```javascript
new webpack.HotModuleReplacementPlugin()
```

### ReactRefreshWebpackPlugin

Fast Refresh for React:

```bash
npm install --save-dev @pmmmwh/react-refresh-webpack-plugin react-refresh
```

```javascript
const ReactRefreshWebpackPlugin = require('@pmmmwh/react-refresh-webpack-plugin');

// In plugins (dev only)
new ReactRefreshWebpackPlugin()

// In babel-loader options
{
  loader: 'babel-loader',
  options: {
    plugins: [require.resolve('react-refresh/babel')],
  },
}
```

### ErrorOverlayPlugin

Better error display:

```bash
npm install --save-dev error-overlay-webpack-plugin
```

```javascript
const ErrorOverlayPlugin = require('error-overlay-webpack-plugin');

new ErrorOverlayPlugin()
```

## TypeScript

### ForkTsCheckerWebpackPlugin

Type checking in separate process:

```bash
npm install --save-dev fork-ts-checker-webpack-plugin
```

```javascript
const ForkTsCheckerWebpackPlugin = require('fork-ts-checker-webpack-plugin');

new ForkTsCheckerWebpackPlugin({
  typescript: {
    configFile: './tsconfig.json',
  },
  async: true,
})
```

## PWA

### WorkboxWebpackPlugin

Service worker generation:

```bash
npm install --save-dev workbox-webpack-plugin
```

```javascript
const { GenerateSW } = require('workbox-webpack-plugin');

new GenerateSW({
  clientsClaim: true,
  skipWaiting: true,
  runtimeCaching: [
    {
      urlPattern: /^https:\/\/api\./,
      handler: 'NetworkFirst',
    },
  ],
})
```

## Environment

### DotenvWebpackPlugin

Load .env files:

```bash
npm install --save-dev dotenv-webpack
```

```javascript
const Dotenv = require('dotenv-webpack');

new Dotenv({
  path: './.env',
  safe: true,
  systemvars: true,
})
```

## Caching

### HardSourceWebpackPlugin

Module-level caching (Webpack 5 has built-in caching):

```javascript
// Webpack 5 built-in cache
cache: {
  type: 'filesystem',
  buildDependencies: {
    config: [__filename],
  },
}
```

## Plugin Pattern

### Custom Plugin

```javascript
class MyPlugin {
  apply(compiler) {
    compiler.hooks.done.tap('MyPlugin', (stats) => {
      console.log('Build complete!');
    });

    compiler.hooks.emit.tapAsync('MyPlugin', (compilation, callback) => {
      // Modify assets
      callback();
    });
  }
}

// Use
plugins: [new MyPlugin()]
```
