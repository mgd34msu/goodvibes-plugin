# Styling Approach Comparison

This reference guide helps you choose the right styling approach for your project.

## Decision Tree

```
Start
  |
  +-- Need rapid prototyping with utility classes?
  |     YES --> Use Tailwind CSS
  |     NO  --> Continue
  |
  +-- Need runtime dynamic theming with JS logic?
  |     YES --> Use CSS-in-JS (styled-components, Emotion)
  |     NO  --> Continue
  |
  +-- Want scoped styles with traditional CSS syntax?
  |     YES --> Use CSS Modules
  |     NO  --> Continue
  |
  +-- Building a simple site with minimal interactivity?
  |     YES --> Use Vanilla CSS
  |     NO  --> Default to Tailwind CSS
```

## Tailwind CSS

### Pros
- **Rapid development**: Pre-built utility classes for common patterns
- **Consistency**: Design constraints prevent arbitrary values
- **Small production bundle**: PurgeCSS removes unused classes
- **Responsive design**: Built-in mobile-first breakpoints
- **Dark mode**: First-class support with `dark:` prefix
- **Hover/focus states**: Easy pseudo-class variants
- **Type safety**: TypeScript plugin available

### Cons
- **Learning curve**: Need to memorize utility class names
- **Verbose HTML**: Many classes per element
- **Initial bundle size**: ~45KB gzipped (mitigated by purging)
- **Customization overhead**: Extending default theme requires config

### Best For
- Component-based frameworks (React, Vue, Svelte)
- Teams prioritizing consistency
- Projects with design systems
- Rapid prototyping and MVPs

### Example
```tsx
<button className="bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded transition-colors duration-200">
  Click me
</button>
```

### Configuration Example
```typescript
// tailwind.config.ts
import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{js,ts,jsx,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        primary: {
          DEFAULT: '#3b82f6',
          dark: '#2563eb',
        },
      },
    },
  },
  plugins: [],
};

export default config;
```

---

## CSS Modules

### Pros
- **Scoped styles**: No global namespace pollution
- **Traditional CSS**: Familiar syntax and patterns
- **Smaller bundle**: No runtime, just compiled CSS
- **Framework agnostic**: Works with any JS framework
- **Gradual adoption**: Can coexist with global styles

### Cons
- **Naming overhead**: Need to create class names for everything
- **No runtime logic**: Can't compute styles based on props
- **Limited type safety**: Class names are strings
- **Composition complexity**: Harder to share styles across components

### Best For
- Teams preferring traditional CSS workflow
- Projects migrating from global CSS
- Apps where bundle size is critical
- Server-rendered apps with minimal client-side JS

### Example
```tsx
// Button.module.css
.button {
  background-color: #3b82f6;
  color: white;
  padding: 0.5rem 1rem;
  border-radius: 0.375rem;
  transition: background-color 200ms;
}

.button:hover {
  background-color: #2563eb;
}

.primary {
  composes: button;
  font-weight: bold;
}

// Button.tsx
import styles from './Button.module.css';

export function Button({ variant = 'default' }) {
  return (
    <button className={variant === 'primary' ? styles.primary : styles.button}>
      Click me
    </button>
  );
}
```

---

## CSS-in-JS

### styled-components / Emotion

### Pros
- **Dynamic styling**: Compute styles from props and state
- **Type safety**: Full TypeScript support for style props
- **Component-scoped**: Styles live with components
- **Theming**: Built-in theme provider and context
- **No class name bugs**: Generated automatically
- **Server-side rendering**: Full SSR support

### Cons
- **Runtime overhead**: Styles computed and injected at runtime
- **Bundle size**: Adds ~15KB gzipped library code
- **Learning curve**: Different mental model from CSS
- **Performance**: Can cause re-renders if not optimized
- **Debugging**: Generated class names harder to trace

### Best For
- Apps needing runtime theming
- Component libraries with dynamic variants
- Teams already using styled-components
- Projects requiring TypeScript style types

### styled-components Example
```typescript
import styled from 'styled-components';

interface ButtonProps {
  $variant?: 'primary' | 'secondary';
  $size?: 'sm' | 'md' | 'lg';
}

const Button = styled.button<ButtonProps>`
  background-color: ${props => 
    props.$variant === 'primary' ? '#3b82f6' : '#6b7280'
  };
  color: white;
  padding: ${props => {
    switch (props.$size) {
      case 'sm': return '0.25rem 0.5rem';
      case 'lg': return '0.75rem 1.5rem';
      default: return '0.5rem 1rem';
    }
  }};
  border-radius: 0.375rem;
  transition: background-color 200ms;

  &:hover {
    background-color: ${props => 
      props.$variant === 'primary' ? '#2563eb' : '#4b5563'
    };
  }
`;

export function MyButton() {
  return <Button $variant="primary" $size="md">Click me</Button>;
}
```

### Emotion Example
```typescript
import { css } from '@emotion/react';

const buttonStyle = css`
  background-color: #3b82f6;
  color: white;
  padding: 0.5rem 1rem;
  border-radius: 0.375rem;
  transition: background-color 200ms;

  &:hover {
    background-color: #2563eb;
  }
`;

export function Button() {
  return <button css={buttonStyle}>Click me</button>;
}
```

---

## Vanilla CSS

### Pros
- **Zero dependencies**: No build step or libraries
- **Maximum control**: Full CSS feature set
- **Lightweight**: Smallest possible bundle
- **Progressive enhancement**: Works without JS
- **Browser native**: Uses cascade and inheritance naturally

### Cons
- **Global namespace**: Easy to create naming conflicts
- **No scoping**: Must manage specificity manually
- **No type safety**: Class names are strings
- **Repetitive**: More boilerplate for common patterns

### Best For
- Simple websites with minimal interactivity
- Progressive web apps prioritizing baseline experience
- Projects avoiding build tooling
- Learning CSS fundamentals

### Example
```css
/* styles.css */
:root {
  --color-primary: #3b82f6;
  --color-primary-dark: #2563eb;
  --spacing-md: 0.5rem 1rem;
}

.button {
  background-color: var(--color-primary);
  color: white;
  padding: var(--spacing-md);
  border-radius: 0.375rem;
  transition: background-color 200ms;
}

.button:hover {
  background-color: var(--color-primary-dark);
}

.button--primary {
  font-weight: bold;
}
```

---

## Design Token Examples

### JSON Format
```json
{
  "color": {
    "primary": {
      "50": "#eff6ff",
      "100": "#dbeafe",
      "500": "#3b82f6",
      "900": "#1e3a8a"
    },
    "semantic": {
      "success": "#10b981",
      "error": "#ef4444",
      "warning": "#f59e0b"
    }
  },
  "spacing": {
    "xs": "0.25rem",
    "sm": "0.5rem",
    "md": "1rem",
    "lg": "1.5rem",
    "xl": "2rem"
  },
  "typography": {
    "fontFamily": {
      "sans": ["Inter", "system-ui", "sans-serif"],
      "mono": ["Fira Code", "monospace"]
    },
    "fontSize": {
      "xs": "0.75rem",
      "sm": "0.875rem",
      "base": "1rem",
      "lg": "1.125rem"
    }
  }
}
```

### TypeScript Format
```typescript
export const tokens = {
  color: {
    primary: {
      50: '#eff6ff',
      100: '#dbeafe',
      500: '#3b82f6',
      900: '#1e3a8a',
    },
    semantic: {
      success: '#10b981',
      error: '#ef4444',
      warning: '#f59e0b',
    },
  },
  spacing: {
    xs: '0.25rem',
    sm: '0.5rem',
    md: '1rem',
    lg: '1.5rem',
    xl: '2rem',
  },
  typography: {
    fontFamily: {
      sans: ['Inter', 'system-ui', 'sans-serif'],
      mono: ['Fira Code', 'monospace'],
    },
    fontSize: {
      xs: '0.75rem',
      sm: '0.875rem',
      base: '1rem',
      lg: '1.125rem',
    },
  },
} as const;

export type ColorToken = keyof typeof tokens.color;
export type SpacingToken = keyof typeof tokens.spacing;
```

---

## Responsive Breakpoint Patterns

### Mobile-First (Recommended)
```css
/* Base styles (mobile) */
.container {
  padding: 1rem;
  display: block;
}

/* Tablet (768px+) */
@media (min-width: 768px) {
  .container {
    padding: 2rem;
  }
}

/* Desktop (1024px+) */
@media (min-width: 1024px) {
  .container {
    padding: 3rem;
    display: flex;
  }
}
```

### Tailwind Responsive Pattern
```tsx
<div className="
  p-4 
  md:p-8 md:flex md:gap-4
  lg:p-12 lg:gap-6
  xl:max-w-7xl xl:mx-auto
">
  {/* Styles adapt at each breakpoint */}
</div>
```

### Container Queries (Modern)
```css
.card-grid {
  container-type: inline-size;
}

.card {
  padding: 1rem;
}

@container (min-width: 400px) {
  .card {
    display: grid;
    grid-template-columns: 1fr 2fr;
    gap: 1rem;
  }
}
```

---

## Dark Mode Implementation Comparison

### Class-based (Tailwind)
```tsx
// Component
<div className="bg-white dark:bg-gray-900 text-black dark:text-white">
  Content
</div>

// Provider (next-themes)
import { ThemeProvider } from 'next-themes';

function App({ children }) {
  return (
    <ThemeProvider attribute="class" defaultTheme="system">
      {children}
    </ThemeProvider>
  );
}
```

### CSS Variables
```css
:root {
  --bg-primary: #ffffff;
  --text-primary: #000000;
}

.dark {
  --bg-primary: #1a1a1a;
  --text-primary: #ffffff;
}

.component {
  background-color: var(--bg-primary);
  color: var(--text-primary);
}
```

### Media Query
```css
.component {
  background-color: #ffffff;
  color: #000000;
}

@media (prefers-color-scheme: dark) {
  .component {
    background-color: #1a1a1a;
    color: #ffffff;
  }
}
```

---

## Animation Library Comparison

### Framer Motion (React)
**Pros**: Declarative, gesture support, layout animations  
**Cons**: ~32KB gzipped bundle size, React-only

```tsx
import { motion } from 'framer-motion';

<motion.div
  initial={{ opacity: 0, y: 20 }}
  animate={{ opacity: 1, y: 0 }}
  exit={{ opacity: 0 }}
  transition={{ duration: 0.3 }}
>
  Content
</motion.div>
```

### CSS Transitions (Vanilla)
**Pros**: Lightweight, framework-agnostic, GPU-accelerated  
**Cons**: Limited to property changes, no complex sequences

```css
.element {
  opacity: 0;
  transform: translateY(20px);
  transition: opacity 300ms ease-out, transform 300ms ease-out;
}

.element.visible {
  opacity: 1;
  transform: translateY(0);
}
```

### Tailwind Transitions
**Pros**: Utility-based, no extra dependencies  
**Cons**: Limited to simple transitions

```tsx
<button className="transition-all duration-300 hover:scale-105 hover:shadow-lg">
  Hover me
</button>
```

---

## Bundle Size Comparison

| Approach | Bundle Size (gzipped) | Notes |
|----------|----------------------|-------|
| Vanilla CSS | ~5KB | Varies by custom CSS |
| CSS Modules | ~5-10KB | Compiled CSS only |
| Tailwind CSS | ~10-50KB | After PurgeCSS |
| styled-components | ~15KB | Runtime library |
| Emotion | ~8KB | Runtime library |
| Framer Motion | ~32KB | Animation library |

**Tips to minimize bundle:**
- Enable PurgeCSS for Tailwind
- Use tree-shaking for CSS-in-JS
- Avoid unnecessary animation libraries
- Split critical CSS for above-the-fold
- Lazy load non-critical styles

---

## Accessibility Considerations

### Color Contrast
- **WCAG AA**: 4.5:1 for normal text, 3:1 for large text
- **WCAG AAA**: 7:1 for normal text, 4.5:1 for large text

**Tools:**
- [WebAIM Contrast Checker](https://webaim.org/resources/contrastchecker/)
- `npx @axe-core/cli` for automated testing

### Responsive Font Sizes
Use relative units (rem, em) instead of pixels:

```css
/* Good */
html { font-size: 16px; }
body { font-size: 1rem; }  /* 16px */
h1 { font-size: 2.5rem; }  /* 40px */

/* Bad */
body { font-size: 16px; }
h1 { font-size: 40px; }
```

### Reduced Motion
Respect user preference:

```css
@media (prefers-reduced-motion: reduce) {
  * {
    animation-duration: 0.01ms !important;
    transition-duration: 0.01ms !important;
  }
}
```

**Tailwind:**
```tsx
<div className="transition-transform motion-reduce:transition-none">
  Content
</div>
```

---

## Framework-Specific Recommendations

### Next.js
- **Best choice**: Tailwind CSS (official integration)
- **Alternative**: CSS Modules (built-in support)
- **Advanced**: styled-components with SSR

### Remix
- **Best choice**: Tailwind CSS or vanilla CSS
- **Alternative**: CSS Modules via Vite plugin

### Astro
- **Best choice**: Scoped styles (built-in)
- **Alternative**: Tailwind CSS

### SvelteKit
- **Best choice**: Scoped styles (built-in)
- **Alternative**: Tailwind CSS

### Vue/Nuxt
- **Best choice**: Scoped styles (built-in)
- **Alternative**: Tailwind CSS
