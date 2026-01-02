# Panda CSS Token System

Design tokens following W3C specification.

## Token Types

### Core Tokens

Raw design values:

```typescript
// panda.config.ts
export default defineConfig({
  theme: {
    tokens: {
      colors: {
        blue: {
          50: { value: '#eff6ff' },
          100: { value: '#dbeafe' },
          500: { value: '#3b82f6' },
          600: { value: '#2563eb' },
          700: { value: '#1d4ed8' },
        },
        gray: {
          50: { value: '#f9fafb' },
          100: { value: '#f3f4f6' },
          500: { value: '#6b7280' },
          900: { value: '#111827' },
        },
      },
      spacing: {
        '0': { value: '0' },
        '1': { value: '0.25rem' },
        '2': { value: '0.5rem' },
        '3': { value: '0.75rem' },
        '4': { value: '1rem' },
        '6': { value: '1.5rem' },
        '8': { value: '2rem' },
      },
      sizes: {
        sm: { value: '24rem' },
        md: { value: '28rem' },
        lg: { value: '32rem' },
        full: { value: '100%' },
      },
      radii: {
        none: { value: '0' },
        sm: { value: '0.125rem' },
        md: { value: '0.375rem' },
        lg: { value: '0.5rem' },
        full: { value: '9999px' },
      },
      fontSizes: {
        xs: { value: '0.75rem' },
        sm: { value: '0.875rem' },
        md: { value: '1rem' },
        lg: { value: '1.125rem' },
        xl: { value: '1.25rem' },
        '2xl': { value: '1.5rem' },
      },
      fontWeights: {
        normal: { value: '400' },
        medium: { value: '500' },
        semibold: { value: '600' },
        bold: { value: '700' },
      },
      shadows: {
        sm: { value: '0 1px 2px 0 rgb(0 0 0 / 0.05)' },
        md: { value: '0 4px 6px -1px rgb(0 0 0 / 0.1)' },
        lg: { value: '0 10px 15px -3px rgb(0 0 0 / 0.1)' },
      },
    },
  },
});
```

### Semantic Tokens

Context-aware tokens with conditions:

```typescript
export default defineConfig({
  theme: {
    semanticTokens: {
      colors: {
        // Text colors
        text: {
          DEFAULT: {
            value: { base: '{colors.gray.900}', _dark: '{colors.gray.100}' },
          },
          muted: {
            value: { base: '{colors.gray.500}', _dark: '{colors.gray.400}' },
          },
        },

        // Background colors
        bg: {
          DEFAULT: {
            value: { base: '{colors.white}', _dark: '{colors.gray.900}' },
          },
          muted: {
            value: { base: '{colors.gray.100}', _dark: '{colors.gray.800}' },
          },
          surface: {
            value: { base: '{colors.white}', _dark: '{colors.gray.800}' },
          },
        },

        // Border colors
        border: {
          DEFAULT: {
            value: { base: '{colors.gray.200}', _dark: '{colors.gray.700}' },
          },
        },

        // Accent colors
        accent: {
          DEFAULT: {
            value: { base: '{colors.blue.500}', _dark: '{colors.blue.400}' },
          },
          hover: {
            value: { base: '{colors.blue.600}', _dark: '{colors.blue.300}' },
          },
        },

        // Status colors
        success: {
          value: { base: '{colors.green.500}', _dark: '{colors.green.400}' },
        },
        error: {
          value: { base: '{colors.red.500}', _dark: '{colors.red.400}' },
        },
        warning: {
          value: { base: '{colors.yellow.500}', _dark: '{colors.yellow.400}' },
        },
      },
    },
  },
});
```

## Token References

Reference other tokens using `{}` syntax:

```typescript
semanticTokens: {
  colors: {
    primary: {
      value: '{colors.blue.500}', // Reference core token
    },
    buttonBg: {
      value: '{colors.primary}', // Reference semantic token
    },
  },
}
```

## Conditions

### Built-in Conditions

```typescript
semanticTokens: {
  colors: {
    bg: {
      value: {
        base: '#ffffff',         // Default
        _dark: '#1f2937',        // Dark mode
        _light: '#ffffff',       // Light mode (explicit)
        _osDark: '#1f2937',      // OS dark preference
        _osLight: '#ffffff',     // OS light preference
      },
    },
  },
}
```

### Custom Conditions

```typescript
// panda.config.ts
export default defineConfig({
  conditions: {
    extend: {
      highContrast: '@media (prefers-contrast: more)',
      reducedMotion: '@media (prefers-reduced-motion: reduce)',
      rtl: '[dir=rtl] &',
      groupHover: '.group:hover &',
    },
  },
  theme: {
    semanticTokens: {
      colors: {
        text: {
          value: {
            base: '{colors.gray.900}',
            _dark: '{colors.gray.100}',
            _highContrast: '{colors.black}',
          },
        },
      },
    },
  },
});
```

## Using Tokens

### In css() Function

```tsx
import { css } from '../styled-system/css';

const styles = css({
  color: 'text',           // Semantic token
  bg: 'bg.muted',          // Nested semantic token
  padding: '4',            // Spacing token
  borderRadius: 'lg',      // Radii token
  fontSize: 'md',          // Font size token
  boxShadow: 'md',         // Shadow token
});
```

### In Recipes

```typescript
const button = cva({
  base: {
    color: 'white',
    bg: 'accent',
    _hover: {
      bg: 'accent.hover',
    },
  },
});
```

### Dynamic Tokens

```tsx
// Access token values programmatically
import { token } from '../styled-system/tokens';

const primaryColor = token('colors.blue.500');
// Returns: var(--colors-blue-500)

// Get raw value
const rawColor = token.raw('colors.blue.500');
// Returns: #3b82f6
```

## Token Utilities

### Color Tokens

```typescript
const colorStyles = css({
  color: 'blue.500',
  bg: 'gray.100',
  borderColor: 'gray.300',
  outlineColor: 'accent',
});
```

### Spacing Tokens

```typescript
const spacingStyles = css({
  p: '4',          // padding: 1rem
  px: '6',         // padding-left/right: 1.5rem
  py: '2',         // padding-top/bottom: 0.5rem
  m: 'auto',
  gap: '4',
});
```

### Typography Tokens

```typescript
const textStyles = css({
  fontSize: 'lg',
  fontWeight: 'semibold',
  lineHeight: 'tight',
  letterSpacing: 'wide',
});
```

## Text Styles

Predefined typography compositions:

```typescript
// panda.config.ts
export default defineConfig({
  theme: {
    extend: {
      textStyles: {
        h1: {
          value: {
            fontSize: '3xl',
            fontWeight: 'bold',
            lineHeight: '1.2',
          },
        },
        h2: {
          value: {
            fontSize: '2xl',
            fontWeight: 'semibold',
            lineHeight: '1.3',
          },
        },
        body: {
          value: {
            fontSize: 'md',
            lineHeight: '1.6',
          },
        },
      },
    },
  },
});

// Usage
const heading = css({
  textStyle: 'h1',
});
```

## Layer Styles

Visual compositions:

```typescript
// panda.config.ts
export default defineConfig({
  theme: {
    extend: {
      layerStyles: {
        card: {
          value: {
            bg: 'bg.surface',
            borderRadius: 'lg',
            boxShadow: 'md',
            p: '4',
          },
        },
        glassmorphism: {
          value: {
            bg: 'rgba(255, 255, 255, 0.1)',
            backdropFilter: 'blur(10px)',
            border: '1px solid rgba(255, 255, 255, 0.2)',
          },
        },
      },
    },
  },
});

// Usage
const card = css({
  layerStyle: 'card',
});
```

## Keyframes

Animation tokens:

```typescript
// panda.config.ts
export default defineConfig({
  theme: {
    extend: {
      keyframes: {
        fadeIn: {
          from: { opacity: '0' },
          to: { opacity: '1' },
        },
        slideUp: {
          from: { transform: 'translateY(10px)', opacity: '0' },
          to: { transform: 'translateY(0)', opacity: '1' },
        },
        spin: {
          from: { transform: 'rotate(0deg)' },
          to: { transform: 'rotate(360deg)' },
        },
      },
    },
  },
});

// Usage
const animated = css({
  animation: 'fadeIn 0.3s ease-out',
});
```
