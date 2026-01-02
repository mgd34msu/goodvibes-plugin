# CSS Variables Theming

Complete theme systems with CSS custom properties.

## Multi-Theme Architecture

### Theme Tokens

```css
/* tokens.css */
:root {
  /* Core design tokens (never change) */
  --color-blue-50: #eff6ff;
  --color-blue-100: #dbeafe;
  --color-blue-500: #3b82f6;
  --color-blue-600: #2563eb;
  --color-blue-700: #1d4ed8;

  --color-gray-50: #f9fafb;
  --color-gray-100: #f3f4f6;
  --color-gray-200: #e5e7eb;
  --color-gray-500: #6b7280;
  --color-gray-700: #374151;
  --color-gray-800: #1f2937;
  --color-gray-900: #111827;

  --color-white: #ffffff;
  --color-black: #000000;
}
```

### Semantic Tokens (Theme-Dependent)

```css
/* Light theme (default) */
:root,
[data-theme="light"] {
  /* Backgrounds */
  --bg-primary: var(--color-white);
  --bg-secondary: var(--color-gray-50);
  --bg-tertiary: var(--color-gray-100);
  --bg-inverse: var(--color-gray-900);

  /* Text */
  --text-primary: var(--color-gray-900);
  --text-secondary: var(--color-gray-700);
  --text-muted: var(--color-gray-500);
  --text-inverse: var(--color-white);

  /* Borders */
  --border-default: var(--color-gray-200);
  --border-strong: var(--color-gray-300);

  /* Interactive */
  --interactive-primary: var(--color-blue-500);
  --interactive-primary-hover: var(--color-blue-600);
  --interactive-secondary: var(--color-gray-100);
  --interactive-secondary-hover: var(--color-gray-200);

  /* Status */
  --status-success: #10b981;
  --status-warning: #f59e0b;
  --status-error: #ef4444;
  --status-info: var(--color-blue-500);

  /* Shadows */
  --shadow-sm: 0 1px 2px 0 rgb(0 0 0 / 0.05);
  --shadow-md: 0 4px 6px -1px rgb(0 0 0 / 0.1);
  --shadow-lg: 0 10px 15px -3px rgb(0 0 0 / 0.1);
}

/* Dark theme */
[data-theme="dark"] {
  /* Backgrounds */
  --bg-primary: var(--color-gray-900);
  --bg-secondary: var(--color-gray-800);
  --bg-tertiary: var(--color-gray-700);
  --bg-inverse: var(--color-white);

  /* Text */
  --text-primary: var(--color-gray-50);
  --text-secondary: var(--color-gray-200);
  --text-muted: var(--color-gray-500);
  --text-inverse: var(--color-gray-900);

  /* Borders */
  --border-default: var(--color-gray-700);
  --border-strong: var(--color-gray-600);

  /* Interactive */
  --interactive-primary: var(--color-blue-500);
  --interactive-primary-hover: var(--color-blue-400);
  --interactive-secondary: var(--color-gray-800);
  --interactive-secondary-hover: var(--color-gray-700);

  /* Shadows (adjusted for dark) */
  --shadow-sm: 0 1px 2px 0 rgb(0 0 0 / 0.3);
  --shadow-md: 0 4px 6px -1px rgb(0 0 0 / 0.4);
  --shadow-lg: 0 10px 15px -3px rgb(0 0 0 / 0.5);
}
```

## Theme Switching

### JavaScript Controller

```typescript
type Theme = 'light' | 'dark' | 'system';

class ThemeManager {
  private currentTheme: Theme = 'system';
  private mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');

  constructor() {
    // Load saved preference
    const saved = localStorage.getItem('theme') as Theme | null;
    if (saved) {
      this.setTheme(saved);
    } else {
      this.applySystemTheme();
    }

    // Listen for system changes
    this.mediaQuery.addEventListener('change', () => {
      if (this.currentTheme === 'system') {
        this.applySystemTheme();
      }
    });
  }

  setTheme(theme: Theme) {
    this.currentTheme = theme;
    localStorage.setItem('theme', theme);

    if (theme === 'system') {
      this.applySystemTheme();
    } else {
      document.documentElement.setAttribute('data-theme', theme);
    }
  }

  private applySystemTheme() {
    const isDark = this.mediaQuery.matches;
    document.documentElement.setAttribute(
      'data-theme',
      isDark ? 'dark' : 'light'
    );
  }

  getTheme(): Theme {
    return this.currentTheme;
  }

  toggle() {
    const current = document.documentElement.getAttribute('data-theme');
    this.setTheme(current === 'dark' ? 'light' : 'dark');
  }
}

export const themeManager = new ThemeManager();
```

### React Hook

```tsx
function useTheme() {
  const [theme, setThemeState] = useState<'light' | 'dark'>('light');

  useEffect(() => {
    // Initial theme
    const saved = localStorage.getItem('theme');
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    const initial = saved || (prefersDark ? 'dark' : 'light');
    setThemeState(initial as 'light' | 'dark');
    document.documentElement.setAttribute('data-theme', initial);
  }, []);

  const setTheme = useCallback((newTheme: 'light' | 'dark') => {
    setThemeState(newTheme);
    localStorage.setItem('theme', newTheme);
    document.documentElement.setAttribute('data-theme', newTheme);
  }, []);

  const toggleTheme = useCallback(() => {
    setTheme(theme === 'dark' ? 'light' : 'dark');
  }, [theme, setTheme]);

  return { theme, setTheme, toggleTheme };
}
```

## Brand Themes

### Multiple Brand Themes

```css
/* Default brand */
:root {
  --brand-primary: #3b82f6;
  --brand-primary-light: #60a5fa;
  --brand-primary-dark: #2563eb;
  --brand-secondary: #8b5cf6;
}

/* Alternative brand theme */
[data-brand="sunset"] {
  --brand-primary: #f97316;
  --brand-primary-light: #fb923c;
  --brand-primary-dark: #ea580c;
  --brand-secondary: #ec4899;
}

[data-brand="forest"] {
  --brand-primary: #10b981;
  --brand-primary-light: #34d399;
  --brand-primary-dark: #059669;
  --brand-secondary: #14b8a6;
}

/* Usage in components */
.button-primary {
  background: var(--brand-primary);
}

.button-primary:hover {
  background: var(--brand-primary-dark);
}
```

## Component Theming

### Configurable Component

```css
.card {
  /* Configurable via parent */
  --card-bg: var(--bg-primary);
  --card-border: var(--border-default);
  --card-padding: var(--space-4);
  --card-radius: var(--radius-lg);
  --card-shadow: var(--shadow-md);

  background: var(--card-bg);
  border: 1px solid var(--card-border);
  padding: var(--card-padding);
  border-radius: var(--card-radius);
  box-shadow: var(--card-shadow);
}

/* Parent can override */
.featured-section {
  --card-bg: var(--bg-secondary);
  --card-shadow: var(--shadow-lg);
}

/* Or inline */
<div class="card" style="--card-bg: var(--brand-primary); --card-padding: var(--space-6);">
```

### Interactive States

```css
.button {
  --button-bg: var(--interactive-primary);
  --button-bg-hover: var(--interactive-primary-hover);
  --button-text: var(--text-inverse);

  background: var(--button-bg);
  color: var(--button-text);
  transition: background 150ms ease;
}

.button:hover {
  background: var(--button-bg-hover);
}

.button:focus-visible {
  outline: 2px solid var(--button-bg);
  outline-offset: 2px;
}

.button:disabled {
  --button-bg: var(--text-muted);
  cursor: not-allowed;
}
```

## High Contrast Mode

```css
@media (prefers-contrast: more) {
  :root {
    --text-primary: var(--color-black);
    --text-secondary: var(--color-black);
    --bg-primary: var(--color-white);
    --border-default: var(--color-black);
    --shadow-sm: none;
    --shadow-md: none;
    --shadow-lg: 0 0 0 2px var(--color-black);
  }

  [data-theme="dark"] {
    --text-primary: var(--color-white);
    --text-secondary: var(--color-white);
    --bg-primary: var(--color-black);
    --border-default: var(--color-white);
  }
}
```

## Reduced Motion

```css
@media (prefers-reduced-motion: reduce) {
  :root {
    --transition-fast: 0ms;
    --transition-normal: 0ms;
    --transition-slow: 0ms;
    --animation-duration: 0ms;
  }
}
```

## Color Scheme Meta

```css
/* Tell browser about color scheme */
:root {
  color-scheme: light dark;
}

[data-theme="light"] {
  color-scheme: light;
}

[data-theme="dark"] {
  color-scheme: dark;
}
```

```html
<meta name="theme-color" content="#3b82f6" media="(prefers-color-scheme: light)">
<meta name="theme-color" content="#1e3a5f" media="(prefers-color-scheme: dark)">
```

## SSR/Flash Prevention

```html
<head>
  <script>
    // Run before render to prevent flash
    (function() {
      const theme = localStorage.getItem('theme');
      if (theme) {
        document.documentElement.setAttribute('data-theme', theme);
      } else if (window.matchMedia('(prefers-color-scheme: dark)').matches) {
        document.documentElement.setAttribute('data-theme', 'dark');
      }
    })();
  </script>
</head>
```

## Testing Themes

```typescript
describe('Theme', () => {
  beforeEach(() => {
    document.documentElement.removeAttribute('data-theme');
  });

  it('applies light theme variables', () => {
    document.documentElement.setAttribute('data-theme', 'light');

    const bgColor = getComputedStyle(document.documentElement)
      .getPropertyValue('--bg-primary')
      .trim();

    expect(bgColor).toBe('#ffffff');
  });

  it('applies dark theme variables', () => {
    document.documentElement.setAttribute('data-theme', 'dark');

    const bgColor = getComputedStyle(document.documentElement)
      .getPropertyValue('--bg-primary')
      .trim();

    expect(bgColor).toContain('111827');
  });
});
```
