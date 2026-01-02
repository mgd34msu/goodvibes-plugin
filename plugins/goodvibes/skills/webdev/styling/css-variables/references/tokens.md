# CSS Variables Token Organization

Structured design token systems.

## Token Categories

### Color Tokens

```css
:root {
  /* Primitive colors */
  --color-blue-50: #eff6ff;
  --color-blue-100: #dbeafe;
  --color-blue-200: #bfdbfe;
  --color-blue-300: #93c5fd;
  --color-blue-400: #60a5fa;
  --color-blue-500: #3b82f6;
  --color-blue-600: #2563eb;
  --color-blue-700: #1d4ed8;
  --color-blue-800: #1e40af;
  --color-blue-900: #1e3a8a;

  /* Repeat for: gray, red, green, yellow, purple, etc. */

  /* Semantic color aliases */
  --color-primary: var(--color-blue-500);
  --color-primary-light: var(--color-blue-400);
  --color-primary-dark: var(--color-blue-600);

  --color-success: var(--color-green-500);
  --color-warning: var(--color-yellow-500);
  --color-error: var(--color-red-500);
  --color-info: var(--color-blue-500);
}
```

### Spacing Tokens

```css
:root {
  /* Base unit */
  --space-unit: 4px;

  /* Scale */
  --space-0: 0;
  --space-px: 1px;
  --space-0-5: calc(var(--space-unit) * 0.5);  /* 2px */
  --space-1: var(--space-unit);                 /* 4px */
  --space-1-5: calc(var(--space-unit) * 1.5);   /* 6px */
  --space-2: calc(var(--space-unit) * 2);       /* 8px */
  --space-2-5: calc(var(--space-unit) * 2.5);   /* 10px */
  --space-3: calc(var(--space-unit) * 3);       /* 12px */
  --space-3-5: calc(var(--space-unit) * 3.5);   /* 14px */
  --space-4: calc(var(--space-unit) * 4);       /* 16px */
  --space-5: calc(var(--space-unit) * 5);       /* 20px */
  --space-6: calc(var(--space-unit) * 6);       /* 24px */
  --space-7: calc(var(--space-unit) * 7);       /* 28px */
  --space-8: calc(var(--space-unit) * 8);       /* 32px */
  --space-9: calc(var(--space-unit) * 9);       /* 36px */
  --space-10: calc(var(--space-unit) * 10);     /* 40px */
  --space-12: calc(var(--space-unit) * 12);     /* 48px */
  --space-14: calc(var(--space-unit) * 14);     /* 56px */
  --space-16: calc(var(--space-unit) * 16);     /* 64px */
  --space-20: calc(var(--space-unit) * 20);     /* 80px */
  --space-24: calc(var(--space-unit) * 24);     /* 96px */

  /* Semantic spacing */
  --space-component-padding: var(--space-4);
  --space-section-gap: var(--space-8);
  --space-page-gutter: var(--space-4);
}
```

### Typography Tokens

```css
:root {
  /* Font families */
  --font-sans: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  --font-serif: Georgia, Cambria, 'Times New Roman', Times, serif;
  --font-mono: ui-monospace, SFMono-Regular, 'SF Mono', Menlo, monospace;

  /* Font sizes */
  --text-xs: 0.75rem;      /* 12px */
  --text-sm: 0.875rem;     /* 14px */
  --text-base: 1rem;       /* 16px */
  --text-lg: 1.125rem;     /* 18px */
  --text-xl: 1.25rem;      /* 20px */
  --text-2xl: 1.5rem;      /* 24px */
  --text-3xl: 1.875rem;    /* 30px */
  --text-4xl: 2.25rem;     /* 36px */
  --text-5xl: 3rem;        /* 48px */
  --text-6xl: 3.75rem;     /* 60px */

  /* Font weights */
  --font-thin: 100;
  --font-light: 300;
  --font-normal: 400;
  --font-medium: 500;
  --font-semibold: 600;
  --font-bold: 700;
  --font-extrabold: 800;
  --font-black: 900;

  /* Line heights */
  --leading-none: 1;
  --leading-tight: 1.25;
  --leading-snug: 1.375;
  --leading-normal: 1.5;
  --leading-relaxed: 1.625;
  --leading-loose: 2;

  /* Letter spacing */
  --tracking-tighter: -0.05em;
  --tracking-tight: -0.025em;
  --tracking-normal: 0;
  --tracking-wide: 0.025em;
  --tracking-wider: 0.05em;
  --tracking-widest: 0.1em;
}
```

### Size Tokens

```css
:root {
  /* Container widths */
  --container-xs: 320px;
  --container-sm: 640px;
  --container-md: 768px;
  --container-lg: 1024px;
  --container-xl: 1280px;
  --container-2xl: 1536px;

  /* Component sizes */
  --size-4: 1rem;      /* 16px */
  --size-5: 1.25rem;   /* 20px */
  --size-6: 1.5rem;    /* 24px */
  --size-8: 2rem;      /* 32px */
  --size-10: 2.5rem;   /* 40px */
  --size-12: 3rem;     /* 48px */
  --size-16: 4rem;     /* 64px */
  --size-20: 5rem;     /* 80px */
  --size-24: 6rem;     /* 96px */

  /* Icon sizes */
  --icon-xs: var(--size-4);
  --icon-sm: var(--size-5);
  --icon-md: var(--size-6);
  --icon-lg: var(--size-8);
  --icon-xl: var(--size-10);
}
```

### Border Tokens

```css
:root {
  /* Border widths */
  --border-0: 0;
  --border-1: 1px;
  --border-2: 2px;
  --border-4: 4px;
  --border-8: 8px;

  /* Border radius */
  --radius-none: 0;
  --radius-sm: 0.125rem;   /* 2px */
  --radius-default: 0.25rem; /* 4px */
  --radius-md: 0.375rem;   /* 6px */
  --radius-lg: 0.5rem;     /* 8px */
  --radius-xl: 0.75rem;    /* 12px */
  --radius-2xl: 1rem;      /* 16px */
  --radius-3xl: 1.5rem;    /* 24px */
  --radius-full: 9999px;

  /* Semantic radius */
  --radius-button: var(--radius-lg);
  --radius-card: var(--radius-xl);
  --radius-input: var(--radius-md);
  --radius-badge: var(--radius-full);
}
```

### Shadow Tokens

```css
:root {
  --shadow-xs: 0 1px 2px 0 rgb(0 0 0 / 0.05);
  --shadow-sm: 0 1px 3px 0 rgb(0 0 0 / 0.1), 0 1px 2px -1px rgb(0 0 0 / 0.1);
  --shadow-md: 0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1);
  --shadow-lg: 0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1);
  --shadow-xl: 0 20px 25px -5px rgb(0 0 0 / 0.1), 0 8px 10px -6px rgb(0 0 0 / 0.1);
  --shadow-2xl: 0 25px 50px -12px rgb(0 0 0 / 0.25);
  --shadow-inner: inset 0 2px 4px 0 rgb(0 0 0 / 0.05);
  --shadow-none: 0 0 #0000;

  /* Focus ring */
  --ring-width: 2px;
  --ring-offset: 2px;
  --ring-color: var(--color-primary);
}
```

### Animation Tokens

```css
:root {
  /* Durations */
  --duration-75: 75ms;
  --duration-100: 100ms;
  --duration-150: 150ms;
  --duration-200: 200ms;
  --duration-300: 300ms;
  --duration-500: 500ms;
  --duration-700: 700ms;
  --duration-1000: 1000ms;

  /* Timing functions */
  --ease-linear: linear;
  --ease-in: cubic-bezier(0.4, 0, 1, 1);
  --ease-out: cubic-bezier(0, 0, 0.2, 1);
  --ease-in-out: cubic-bezier(0.4, 0, 0.2, 1);
  --ease-bounce: cubic-bezier(0.68, -0.55, 0.265, 1.55);

  /* Semantic transitions */
  --transition-fast: var(--duration-150) var(--ease-out);
  --transition-normal: var(--duration-200) var(--ease-out);
  --transition-slow: var(--duration-300) var(--ease-out);
  --transition-colors: color var(--duration-150), background-color var(--duration-150), border-color var(--duration-150);
}
```

### Z-Index Tokens

```css
:root {
  --z-0: 0;
  --z-10: 10;
  --z-20: 20;
  --z-30: 30;
  --z-40: 40;
  --z-50: 50;

  /* Semantic z-index */
  --z-dropdown: var(--z-10);
  --z-sticky: var(--z-20);
  --z-fixed: var(--z-30);
  --z-modal-backdrop: var(--z-40);
  --z-modal: var(--z-50);
  --z-popover: var(--z-50);
  --z-tooltip: var(--z-50);
}
```

## Token File Structure

```
styles/
  tokens/
    colors.css
    spacing.css
    typography.css
    borders.css
    shadows.css
    animations.css
    z-index.css
  themes/
    light.css
    dark.css
  tokens.css        # Imports all token files
```

```css
/* tokens.css */
@import './tokens/colors.css';
@import './tokens/spacing.css';
@import './tokens/typography.css';
@import './tokens/borders.css';
@import './tokens/shadows.css';
@import './tokens/animations.css';
@import './tokens/z-index.css';
```

## Using with TypeScript

```typescript
// tokens.ts
export const tokens = {
  colors: {
    primary: 'var(--color-primary)',
    secondary: 'var(--color-secondary)',
  },
  spacing: {
    sm: 'var(--space-2)',
    md: 'var(--space-4)',
    lg: 'var(--space-6)',
  },
} as const;

// Usage in styled-components, emotion, etc.
const Button = styled.button`
  padding: ${tokens.spacing.md};
  background: ${tokens.colors.primary};
`;
```
