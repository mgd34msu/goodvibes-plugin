# Bundle Optimization Reference

Techniques for reducing bundle size through dependency analysis and optimization.

## Bundle Analysis Tools

### Webpack Bundle Analyzer

```bash
# Generate stats file
npx webpack --profile --json > stats.json

# Or via npm script
npm run build -- --stats

# Analyze
npx webpack-bundle-analyzer stats.json

# Static HTML report
npx webpack-bundle-analyzer stats.json -m static -r report.html
```

**Webpack config integration:**
```javascript
const BundleAnalyzerPlugin = require('webpack-bundle-analyzer').BundleAnalyzerPlugin;

module.exports = {
  plugins: [
    new BundleAnalyzerPlugin({
      analyzerMode: 'static',
      reportFilename: 'bundle-report.html',
      openAnalyzer: false,
    }),
  ],
};
```

### Vite / Rollup Visualization

```bash
# Install
npm install -D rollup-plugin-visualizer

# vite.config.ts
import { visualizer } from 'rollup-plugin-visualizer';

export default defineConfig({
  plugins: [
    visualizer({
      filename: 'bundle-stats.html',
      open: true,
      gzipSize: true,
      brotliSize: true,
    }),
  ],
});
```

### Source Map Explorer

```bash
# Analyze from source maps
npx source-map-explorer dist/**/*.js

# With HTML output
npx source-map-explorer dist/**/*.js --html result.html
```

### Bundle Phobia (Pre-Install Check)

```bash
# Check package size before installing
npx bundle-phobia-cli lodash

# Check multiple packages
npx bundle-phobia-cli react react-dom next

# Export comparison
npx bundle-phobia-cli lodash lodash-es --json
```

---

## Heavy Dependency Replacements

### Date/Time Libraries

| Library | Size (min+gzip) | Alternative | Size |
|---------|-----------------|-------------|------|
| moment | 290KB | date-fns | 13KB (per function) |
| moment | 290KB | dayjs | 6KB |
| moment-timezone | 400KB | date-fns-tz | 3KB |
| luxon | 70KB | dayjs | 6KB |

**Migration example:**
```javascript
// moment -> date-fns
// Before
import moment from 'moment';
moment().format('YYYY-MM-DD');

// After
import { format } from 'date-fns';
format(new Date(), 'yyyy-MM-dd');
```

**Migration example:**
```javascript
// moment -> dayjs
// Before
import moment from 'moment';
moment().add(1, 'day');

// After
import dayjs from 'dayjs';
dayjs().add(1, 'day');
```

### Utility Libraries

| Library | Size | Alternative | Size |
|---------|------|-------------|------|
| lodash (full) | 70KB | lodash-es | Tree-shakeable |
| underscore | 18KB | Native ES6+ | 0KB |
| ramda | 50KB | remeda | 5KB (tree-shakeable) |
| jquery | 85KB | Native DOM | 0KB |

**Lodash optimization:**
```javascript
// BAD: Imports entire library
import _ from 'lodash';
_.map(arr, fn);

// BETTER: Named import with lodash-es
import { map } from 'lodash-es';

// BEST: Cherry-pick import
import map from 'lodash/map';
```

### HTTP Clients

| Library | Size | Alternative | Size |
|---------|------|-------------|------|
| axios | 14KB | ky | 5KB |
| axios | 14KB | native fetch | 0KB |
| superagent | 18KB | native fetch | 0KB |
| request | deprecated | native fetch | 0KB |

**Fetch wrapper pattern:**
```javascript
// Minimal axios replacement
async function request(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });
  if (!response.ok) throw new Error(response.statusText);
  return response.json();
}
```

### Other Common Replacements

| Library | Size | Alternative | Size |
|---------|------|-------------|------|
| uuid | 8KB | crypto.randomUUID() | 0KB |
| classnames | 2KB | clsx | 0.5KB |
| validator | 50KB | zod (type-safe) | 12KB |
| numeral | 16KB | Intl.NumberFormat | 0KB |
| chalk (Node) | 8KB | picocolors | 1KB |

---

## Tree Shaking

### Requirements for Tree Shaking

1. **ES Modules (ESM)**
```javascript
// Tree-shakeable
export function used() {}
export function unused() {}

// NOT tree-shakeable
module.exports = { used, unused };
```

2. **No Side Effects**
```json
// package.json
{
  "sideEffects": false
}

// Or specify files with side effects
{
  "sideEffects": [
    "*.css",
    "*.scss",
    "./src/polyfills.js"
  ]
}
```

3. **Bundler Configuration**
```javascript
// Webpack
module.exports = {
  mode: 'production',
  optimization: {
    usedExports: true,
    sideEffects: true,
  },
};

// Vite (enabled by default in production)
export default defineConfig({
  build: {
    minify: 'terser',
    rollupOptions: {
      treeshake: true,
    },
  },
});
```

### Verifying Tree Shaking Works

```javascript
// Check if unused export is eliminated

// utils.js
export function used() { console.log('used'); }
export function unused() { console.log('unused'); }

// app.js
import { used } from './utils';
used();

// In bundle, 'unused' should not appear
// grep -r "unused" dist/
```

### Common Tree Shaking Blockers

```javascript
// 1. CommonJS imports
const _ = require('lodash');  // Breaks tree shaking

// 2. Re-exporting with side effects
export * from './module';  // May prevent tree shaking

// 3. Dynamic imports based on variables
const method = condition ? 'methodA' : 'methodB';
import(`./methods/${method}`);  // Not statically analyzable

// 4. Object property access
import * as utils from './utils';
utils.someMethod();  // Harder to tree shake
```

---

## Code Splitting

### Dynamic Imports

```javascript
// Route-based splitting
const Home = React.lazy(() => import('./pages/Home'));
const About = React.lazy(() => import('./pages/About'));

function App() {
  return (
    <Suspense fallback={<Loading />}>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/about" element={<About />} />
      </Routes>
    </Suspense>
  );
}
```

### Manual Chunking

```javascript
// Webpack
module.exports = {
  optimization: {
    splitChunks: {
      chunks: 'all',
      cacheGroups: {
        vendor: {
          test: /[\\/]node_modules[\\/]/,
          name: 'vendors',
          chunks: 'all',
        },
        react: {
          test: /[\\/]node_modules[\\/](react|react-dom)/,
          name: 'react',
          chunks: 'all',
          priority: 10,
        },
      },
    },
  },
};

// Vite
export default defineConfig({
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          vendor: ['react', 'react-dom'],
          router: ['react-router-dom'],
          ui: ['@radix-ui/react-dialog', '@radix-ui/react-dropdown-menu'],
        },
      },
    },
  },
});
```

### Named Chunks

```javascript
// Webpack magic comments
const Chart = React.lazy(() =>
  import(/* webpackChunkName: "chart" */ './components/Chart')
);

// Vite/Rollup
const Chart = React.lazy(() =>
  import('./components/Chart').then(m => ({ default: m.Chart }))
);
```

---

## External Dependencies

### CDN for Large Dependencies

```javascript
// Webpack externals
module.exports = {
  externals: {
    react: 'React',
    'react-dom': 'ReactDOM',
    lodash: '_',
  },
};

// Then in HTML
<script src="https://unpkg.com/react@18/umd/react.production.min.js"></script>
<script src="https://unpkg.com/react-dom@18/umd/react-dom.production.min.js"></script>
```

### Module Federation (Micro-frontends)

```javascript
// Host app
new ModuleFederationPlugin({
  name: 'host',
  remotes: {
    app1: 'app1@http://localhost:3001/remoteEntry.js',
    app2: 'app2@http://localhost:3002/remoteEntry.js',
  },
  shared: ['react', 'react-dom'],
});

// Remote app
new ModuleFederationPlugin({
  name: 'app1',
  filename: 'remoteEntry.js',
  exposes: {
    './Button': './src/Button',
  },
  shared: ['react', 'react-dom'],
});
```

---

## Polyfill Optimization

### Modern Browsers Only

```javascript
// Vite - target modern browsers
export default defineConfig({
  build: {
    target: 'esnext',  // Or 'es2020', 'es2022'
  },
});

// Webpack - browserslist
// package.json
{
  "browserslist": [
    "last 2 Chrome versions",
    "last 2 Firefox versions",
    "last 2 Safari versions",
    "last 2 Edge versions"
  ]
}
```

### Conditional Polyfills

```html
<!-- Serve polyfills only to old browsers -->
<script type="module" src="/modern.js"></script>
<script nomodule src="/legacy-with-polyfills.js"></script>
```

### core-js Optimization

```javascript
// babel.config.js
module.exports = {
  presets: [
    ['@babel/preset-env', {
      useBuiltIns: 'usage',  // Only include used polyfills
      corejs: 3,
    }],
  ],
};
```

---

## Image and Asset Optimization

### Image Import Optimization

```javascript
// Vite - automatic optimization
import largeImage from './large.png?w=800&format=webp';

// Next.js Image
import Image from 'next/image';
<Image src="/large.png" width={800} height={600} />
```

### Font Subsetting

```css
/* Only include needed characters */
@font-face {
  font-family: 'CustomFont';
  src: url('/font.woff2') format('woff2');
  unicode-range: U+0000-00FF; /* Latin characters only */
}
```

### CSS Optimization

```javascript
// PurgeCSS with Tailwind
// tailwind.config.js
module.exports = {
  content: [
    './src/**/*.{js,jsx,ts,tsx}',
  ],
  // Unused CSS is automatically removed in production
};
```

---

## Monitoring Bundle Size

### Size Limit

```bash
npm install -D size-limit @size-limit/preset-app
```

```json
// package.json
{
  "size-limit": [
    {
      "path": "dist/**/*.js",
      "limit": "300 KB"
    },
    {
      "path": "dist/vendors*.js",
      "limit": "150 KB"
    }
  ],
  "scripts": {
    "size": "size-limit"
  }
}
```

### bundlewatch

```json
// bundlewatch.config.json
{
  "files": [
    {
      "path": "dist/**/*.js",
      "maxSize": "300kb"
    },
    {
      "path": "dist/**/*.css",
      "maxSize": "50kb"
    }
  ],
  "ci": {
    "githubAccessToken": "$GITHUB_TOKEN"
  }
}
```

### CI Integration

```yaml
# GitHub Actions
- name: Build
  run: npm run build

- name: Check bundle size
  run: npx size-limit

# Or with bundlewatch
- name: Bundlewatch
  run: npx bundlewatch
  env:
    BUNDLEWATCH_GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

---

## Quick Wins Checklist

```markdown
## Immediate Actions (High Impact)
- [ ] Replace moment with date-fns or dayjs
- [ ] Use lodash-es with named imports
- [ ] Replace axios with native fetch
- [ ] Enable tree shaking (ESM + sideEffects: false)
- [ ] Add code splitting for routes

## Medium-Term (During Refactoring)
- [ ] Replace heavy UI libraries with lighter alternatives
- [ ] Externalize large dependencies to CDN
- [ ] Optimize images (WebP, lazy loading)
- [ ] Subset fonts
- [ ] Review and remove unused dependencies

## Monitoring (Ongoing)
- [ ] Add size-limit to CI
- [ ] Set up bundle size alerts
- [ ] Review bundle report monthly
- [ ] Track bundle size trends
```
