# UnoCSS Custom Rules

Define custom atomic utilities with rules.

## Rule Syntax

### Static Rules

```typescript
import { defineConfig } from 'unocss';

export default defineConfig({
  rules: [
    // Simple static rule
    ['card', { padding: '1rem', borderRadius: '0.5rem', boxShadow: '0 2px 4px rgba(0,0,0,0.1)' }],

    // Multiple properties
    ['flex-center', {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
    }],

    // CSS variables
    ['primary-text', { color: 'var(--color-primary)' }],
  ],
});
```

### Dynamic Rules

Regex patterns with captured values:

```typescript
export default defineConfig({
  rules: [
    // Match: m-4, m-8, m-12
    [/^m-(\d+)$/, ([, d]) => ({ margin: `${d}px` })],

    // With rem conversion: p-4 = 1rem
    [/^p-(\d+)$/, ([, d]) => ({ padding: `${Number(d) / 4}rem` })],

    // Named properties: mt-4, mb-8, ml-2
    [/^m([trbl])-(\d+)$/, ([, dir, d]) => {
      const directions = { t: 'top', r: 'right', b: 'bottom', l: 'left' };
      return { [`margin-${directions[dir]}`]: `${d}px` };
    }],

    // With units: w-100px, w-50%
    [/^w-(\d+)(px|%|rem)?$/, ([, n, unit = 'px']) => ({
      width: `${n}${unit}`,
    })],
  ],
});
```

### Named Capture Groups

```typescript
export default defineConfig({
  rules: [
    // bg-blue-500, bg-red-200
    [/^bg-(?<color>\w+)-(?<shade>\d+)$/, ({ groups }) => ({
      backgroundColor: `var(--color-${groups.color}-${groups.shade})`,
    })],

    // text-blue-500/50 (with opacity)
    [/^text-(?<color>\w+)-(?<shade>\d+)\/(?<opacity>\d+)$/, ({ groups }) => ({
      color: `rgb(var(--color-${groups.color}-${groups.shade}) / ${Number(groups.opacity) / 100})`,
    })],
  ],
});
```

## Rule Context

Access theme and other utilities:

```typescript
export default defineConfig({
  rules: [
    // Access theme
    [/^text-(.+)$/, ([, color], { theme }) => {
      const themeColor = theme.colors?.[color];
      if (themeColor) {
        return { color: themeColor };
      }
    }],

    // With raw CSS
    ['custom-gradient', {
      background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
    }],
  ],

  theme: {
    colors: {
      primary: '#3b82f6',
      secondary: '#6b7280',
    },
  },
});
```

## CSS Layers

Organize with @layer:

```typescript
export default defineConfig({
  rules: [
    // Assign to layer
    ['base-reset', { margin: 0, padding: 0 }, { layer: 'base' }],
    ['component-card', { padding: '1rem' }, { layer: 'components' }],
    ['utility-hidden', { display: 'none' }, { layer: 'utilities' }],
  ],
});
```

## Complex Rules

### Media Queries

```typescript
export default defineConfig({
  rules: [
    // Print only
    ['print-hidden', {
      '@media print': {
        display: 'none',
      },
    }],

    // Dark mode
    ['dark-bg', {
      backgroundColor: '#1f2937',
      '@media (prefers-color-scheme: dark)': {
        backgroundColor: '#111827',
      },
    }],
  ],
});
```

### Pseudo Elements

```typescript
export default defineConfig({
  rules: [
    ['divider', {
      position: 'relative',
      '&::after': {
        content: '""',
        position: 'absolute',
        bottom: '0',
        left: '0',
        right: '0',
        height: '1px',
        backgroundColor: 'currentColor',
        opacity: '0.1',
      },
    }],
  ],
});
```

### Keyframes

```typescript
export default defineConfig({
  rules: [
    ['animate-spin', {
      animation: 'spin 1s linear infinite',
    }],
    ['animate-pulse', {
      animation: 'pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite',
    }],
  ],

  preflights: [
    {
      getCSS: () => `
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }
      `,
    },
  ],
});
```

## Rule Ordering

```typescript
export default defineConfig({
  rules: [
    // Order matters - first match wins
    [/^m-auto$/, () => ({ margin: 'auto' })],
    [/^m-(\d+)$/, ([, d]) => ({ margin: `${d}px` })],
  ],
});
```

## Extractors

Custom class detection:

```typescript
import { defineConfig } from 'unocss';

export default defineConfig({
  extractors: [
    {
      name: 'custom-extractor',
      extract({ code }) {
        // Extract classes from custom syntax
        const matches = code.match(/styles\["([^"]+)"\]/g) || [];
        return matches.map(m => m.match(/styles\["([^"]+)"\]/)?.[1]).filter(Boolean);
      },
    },
  ],
});
```

## Utility Functions

Helper functions for rules:

```typescript
// utils.ts
export function createSpacingRule(property: string, prefix: string) {
  return [
    new RegExp(`^${prefix}-([\\d.]+)(px|rem|em)?$`),
    ([, n, unit = 'rem']) => ({
      [property]: `${n}${unit}`,
    }),
  ] as const;
}

// uno.config.ts
import { createSpacingRule } from './utils';

export default defineConfig({
  rules: [
    createSpacingRule('margin', 'm'),
    createSpacingRule('padding', 'p'),
    createSpacingRule('gap', 'gap'),
  ],
});
```

## Debug Rules

```typescript
export default defineConfig({
  rules: [
    // Debug rule - shows in console
    [/^debug$/, () => {
      console.log('Debug class matched');
      return { outline: '1px solid red' };
    }],
  ],
});
```
