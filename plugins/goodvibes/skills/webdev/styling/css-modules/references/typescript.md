# CSS Modules TypeScript Integration

Type-safe CSS Modules with full IDE support.

## Basic Type Declaration

Minimal setup for TypeScript projects:

```typescript
// src/types/css-modules.d.ts
declare module '*.module.css' {
  const classes: { readonly [key: string]: string };
  export default classes;
}

declare module '*.module.scss' {
  const classes: { readonly [key: string]: string };
  export default classes;
}

declare module '*.module.sass' {
  const classes: { readonly [key: string]: string };
  export default classes;
}
```

Include in tsconfig.json:

```json
{
  "compilerOptions": {
    "typeRoots": ["./node_modules/@types", "./src/types"]
  },
  "include": ["src/**/*"]
}
```

## typed-css-modules

Generate precise type definitions for each CSS file.

### Installation

```bash
npm install -D typed-css-modules
```

### Usage

```bash
# Generate types for all CSS modules in src
npx tcm src

# Watch mode
npx tcm src --watch

# Specific directory
npx tcm src/components
```

### Generated Output

```css
/* Button.module.css */
.button {
  padding: 12px;
}

.primary {
  background: blue;
}

.secondary {
  background: gray;
}

.disabled {
  opacity: 0.5;
}
```

Generates:

```typescript
// Button.module.css.d.ts
declare const styles: {
  readonly button: string;
  readonly primary: string;
  readonly secondary: string;
  readonly disabled: string;
};
export default styles;
```

### Configuration Options

```bash
# CamelCase conversion
npx tcm src --camelCase
# .my-class becomes myClass

# Dashes only (preserve underscores)
npx tcm src --camelCase dashes
# .my-class becomes myClass
# .my_class stays as my_class

# Named exports (tree-shakeable)
npx tcm src --namedExports
# export const button: string;
# export const primary: string;

# TypeScript 5.0 arbitrary extensions
npx tcm src --allowArbitraryExtensions
# Generates .d.css.ts instead of .css.d.ts

# Custom pattern
npx tcm "src/**/*.module.css"

# Output to different directory
npx tcm src --outDir types
```

### Package.json Scripts

```json
{
  "scripts": {
    "css:types": "tcm src",
    "css:types:watch": "tcm src --watch",
    "prebuild": "npm run css:types",
    "dev": "concurrently \"tcm src --watch\" \"vite\""
  }
}
```

### Named Exports

With `--namedExports`:

```typescript
// Button.module.css.d.ts
export const button: string;
export const primary: string;
export const secondary: string;
```

Usage:

```tsx
import { button, primary } from './Button.module.css';

function Button() {
  return <button className={`${button} ${primary}`}>Click</button>;
}
```

## typescript-plugin-css-modules

IDE integration without generating files.

### Installation

```bash
npm install -D typescript-plugin-css-modules
```

### Configuration

```json
// tsconfig.json
{
  "compilerOptions": {
    "plugins": [
      {
        "name": "typescript-plugin-css-modules",
        "options": {
          "classnameTransform": "camelCase",
          "customMatcher": "\\.module\\.(c|le|sa|sc)ss$"
        }
      }
    ]
  }
}
```

### VS Code Setup

Use workspace TypeScript version:

```json
// .vscode/settings.json
{
  "typescript.tsdk": "node_modules/typescript/lib",
  "typescript.enablePromptUseWorkspaceTsdk": true
}
```

### Plugin Options

```json
{
  "plugins": [
    {
      "name": "typescript-plugin-css-modules",
      "options": {
        // Transform class names
        "classnameTransform": "camelCase", // or "camelCaseOnly", "dashes", "asIs"

        // Custom file matcher
        "customMatcher": "\\.module\\.css$",

        // Custom template for class names
        "customTemplate": "./cssModuleTemplate.js",

        // PostCSS config path
        "postCssConfigPath": "./postcss.config.js",

        // Render as default export
        "rendererOptions": {
          "namedExports": false
        }
      }
    }
  ]
}
```

## Combining Approaches

Use plugin for development, generate types for CI:

```json
{
  "scripts": {
    "typecheck": "tcm src && tsc --noEmit",
    "dev": "vite"
  }
}
```

## Type-Safe Patterns

### Variant Props

```tsx
import styles from './Button.module.css';

// Define allowed variants based on CSS
type ButtonVariant = 'primary' | 'secondary' | 'danger';
type ButtonSize = 'sm' | 'md' | 'lg';

interface ButtonProps {
  variant?: ButtonVariant;
  size?: ButtonSize;
  children: React.ReactNode;
}

function Button({ variant = 'primary', size = 'md', children }: ButtonProps) {
  return (
    <button className={`${styles.button} ${styles[variant]} ${styles[size]}`}>
      {children}
    </button>
  );
}
```

### Strict Class Access

```typescript
// With named exports
import * as styles from './Card.module.css';

// TypeScript error if class doesn't exist
const className = styles.nonExistent; // Error!

// Or create a helper
function cx(...classes: (keyof typeof styles)[]): string {
  return classes.map(c => styles[c]).join(' ');
}

<div className={cx('card', 'elevated')} />
```

### Conditional Classes with Type Safety

```tsx
import styles from './Alert.module.css';
import clsx from 'clsx';

type AlertType = keyof Pick<typeof styles, 'info' | 'success' | 'warning' | 'error'>;

interface AlertProps {
  type: AlertType;
  dismissible?: boolean;
  children: React.ReactNode;
}

function Alert({ type, dismissible, children }: AlertProps) {
  return (
    <div className={clsx(
      styles.alert,
      styles[type],
      dismissible && styles.dismissible
    )}>
      {children}
    </div>
  );
}
```

## Vite Integration

Vite supports CSS Modules types natively with configuration:

```typescript
// vite.config.ts
import { defineConfig } from 'vite';

export default defineConfig({
  css: {
    modules: {
      localsConvention: 'camelCase',
    },
  },
});
```

For full types, still use typed-css-modules or the plugin.

## Troubleshooting

### "Cannot find module" Error

1. Check file extension is `.module.css`
2. Verify declaration file is included in tsconfig
3. Restart TypeScript server

### Class Names Not Matching

```typescript
// If using camelCase transform
// CSS: .my-button
// JS: styles.myButton (not styles['my-button'])
```

### Generated Types Out of Sync

```json
{
  "scripts": {
    "postinstall": "tcm src"
  }
}
```

### ESLint Import Errors

```json
// .eslintrc
{
  "settings": {
    "import/resolver": {
      "typescript": {}
    }
  },
  "rules": {
    "import/no-unresolved": ["error", { "ignore": ["\\.module\\.css$"] }]
  }
}
```
