# Chakra UI Theming Reference

Advanced theming patterns for Chakra UI v3.

## Theme Configuration

### Creating a Custom System

```tsx
// theme.ts
import { createSystem, defaultConfig, defineConfig } from '@chakra-ui/react'

const config = defineConfig({
  // Prefix CSS variables
  cssVarsPrefix: 'app',

  // Enforce token usage
  strictTokens: true,

  theme: {
    tokens: {
      // Base tokens
    },
    semanticTokens: {
      // Semantic aliases
    },
    recipes: {
      // Component variants
    },
    slotRecipes: {
      // Multi-part component variants
    },
  },
})

export const system = createSystem(defaultConfig, config)
```

### Token Types

```tsx
const config = defineConfig({
  theme: {
    tokens: {
      // Colors
      colors: {
        brand: {
          50: { value: '#e6f2ff' },
          100: { value: '#b3d9ff' },
          500: { value: '#0073e6' },
          900: { value: '#00161a' },
        },
      },

      // Spacing
      spacing: {
        xs: { value: '0.25rem' },
        sm: { value: '0.5rem' },
        md: { value: '1rem' },
        lg: { value: '1.5rem' },
        xl: { value: '2rem' },
      },

      // Font sizes
      fontSizes: {
        xs: { value: '0.75rem' },
        sm: { value: '0.875rem' },
        md: { value: '1rem' },
        lg: { value: '1.125rem' },
        xl: { value: '1.25rem' },
      },

      // Font weights
      fontWeights: {
        normal: { value: '400' },
        medium: { value: '500' },
        semibold: { value: '600' },
        bold: { value: '700' },
      },

      // Line heights
      lineHeights: {
        none: { value: '1' },
        tight: { value: '1.25' },
        normal: { value: '1.5' },
        relaxed: { value: '1.625' },
      },

      // Border radius
      radii: {
        none: { value: '0' },
        sm: { value: '0.125rem' },
        md: { value: '0.375rem' },
        lg: { value: '0.5rem' },
        xl: { value: '0.75rem' },
        full: { value: '9999px' },
      },

      // Shadows
      shadows: {
        sm: { value: '0 1px 2px rgba(0, 0, 0, 0.05)' },
        md: { value: '0 4px 6px -1px rgba(0, 0, 0, 0.1)' },
        lg: { value: '0 10px 15px -3px rgba(0, 0, 0, 0.1)' },
      },

      // Z-index
      zIndex: {
        hide: { value: -1 },
        base: { value: 0 },
        dropdown: { value: 1000 },
        modal: { value: 1400 },
        tooltip: { value: 1800 },
      },

      // Animations
      durations: {
        fast: { value: '150ms' },
        normal: { value: '200ms' },
        slow: { value: '300ms' },
      },

      easings: {
        default: { value: 'cubic-bezier(0.4, 0, 0.2, 1)' },
        in: { value: 'cubic-bezier(0.4, 0, 1, 1)' },
        out: { value: 'cubic-bezier(0, 0, 0.2, 1)' },
      },

      // Assets
      assets: {
        logo: { value: 'url(/logo.svg)' },
      },

      // Borders
      borders: {
        none: { value: 'none' },
        default: { value: '1px solid' },
        thick: { value: '2px solid' },
      },
    },
  },
})
```

## Semantic Tokens

### Light/Dark Mode Tokens

```tsx
const config = defineConfig({
  theme: {
    semanticTokens: {
      colors: {
        // Background tokens
        bg: {
          DEFAULT: {
            value: { base: '{colors.white}', _dark: '{colors.gray.900}' },
          },
          subtle: {
            value: { base: '{colors.gray.50}', _dark: '{colors.gray.800}' },
          },
          muted: {
            value: { base: '{colors.gray.100}', _dark: '{colors.gray.700}' },
          },
        },

        // Text tokens
        fg: {
          DEFAULT: {
            value: { base: '{colors.gray.900}', _dark: '{colors.gray.50}' },
          },
          muted: {
            value: { base: '{colors.gray.600}', _dark: '{colors.gray.400}' },
          },
        },

        // Border tokens
        border: {
          DEFAULT: {
            value: { base: '{colors.gray.200}', _dark: '{colors.gray.700}' },
          },
          muted: {
            value: { base: '{colors.gray.100}', _dark: '{colors.gray.800}' },
          },
        },

        // Brand semantic tokens
        brand: {
          solid: { value: '{colors.brand.500}' },
          contrast: { value: 'white' },
          fg: {
            value: { base: '{colors.brand.700}', _dark: '{colors.brand.300}' },
          },
          muted: {
            value: { base: '{colors.brand.100}', _dark: '{colors.brand.900}' },
          },
          subtle: {
            value: { base: '{colors.brand.50}', _dark: '{colors.brand.950}' },
          },
          emphasized: {
            value: { base: '{colors.brand.200}', _dark: '{colors.brand.800}' },
          },
          focusRing: { value: '{colors.brand.500}' },
        },
      },

      shadows: {
        xs: {
          value: {
            base: '0 1px 2px rgba(0, 0, 0, 0.05)',
            _dark: '0 1px 2px rgba(0, 0, 0, 0.4)',
          },
        },
      },
    },
  },
})
```

### Token Reference Syntax

```tsx
// Reference other tokens with curly braces
semanticTokens: {
  colors: {
    accent: { value: '{colors.brand.500}' },
    // Full path required
    highlight: { value: '{colors.yellow.300}' },
  },
}
```

## Recipes

### Single-Part Recipe

```tsx
import { defineRecipe } from '@chakra-ui/react'

const buttonRecipe = defineRecipe({
  className: 'button',

  base: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontWeight: 'medium',
    borderRadius: 'lg',
    cursor: 'pointer',
    transition: 'all 0.2s',
    _disabled: {
      opacity: 0.5,
      cursor: 'not-allowed',
    },
    _focusVisible: {
      outline: '2px solid',
      outlineColor: 'brand.focusRing',
      outlineOffset: '2px',
    },
  },

  variants: {
    variant: {
      solid: {
        bg: 'brand.solid',
        color: 'brand.contrast',
        _hover: { bg: 'brand.emphasized' },
      },
      outline: {
        borderWidth: '1px',
        borderColor: 'brand.solid',
        color: 'brand.fg',
        _hover: { bg: 'brand.subtle' },
      },
      ghost: {
        color: 'brand.fg',
        _hover: { bg: 'brand.subtle' },
      },
      link: {
        color: 'brand.fg',
        _hover: { textDecoration: 'underline' },
      },
    },

    size: {
      xs: { h: '6', px: '2', fontSize: 'xs' },
      sm: { h: '8', px: '3', fontSize: 'sm' },
      md: { h: '10', px: '4', fontSize: 'md' },
      lg: { h: '12', px: '6', fontSize: 'lg' },
      xl: { h: '14', px: '8', fontSize: 'xl' },
    },
  },

  compoundVariants: [
    {
      variant: 'solid',
      size: 'lg',
      css: {
        fontWeight: 'bold',
      },
    },
  ],

  defaultVariants: {
    variant: 'solid',
    size: 'md',
  },
})

// Add to theme
const config = defineConfig({
  theme: {
    recipes: {
      button: buttonRecipe,
    },
  },
})
```

### Slot Recipe (Multi-Part)

```tsx
import { defineSlotRecipe } from '@chakra-ui/react'

const cardRecipe = defineSlotRecipe({
  className: 'card',
  slots: ['root', 'header', 'body', 'footer', 'title', 'description'],

  base: {
    root: {
      bg: 'bg',
      borderRadius: 'xl',
      overflow: 'hidden',
    },
    header: {
      p: '4',
      borderBottomWidth: '1px',
      borderColor: 'border',
    },
    body: {
      p: '4',
    },
    footer: {
      p: '4',
      borderTopWidth: '1px',
      borderColor: 'border',
    },
    title: {
      fontWeight: 'semibold',
      fontSize: 'lg',
    },
    description: {
      color: 'fg.muted',
      fontSize: 'sm',
    },
  },

  variants: {
    variant: {
      elevated: {
        root: { shadow: 'lg' },
      },
      outline: {
        root: {
          borderWidth: '1px',
          borderColor: 'border',
        },
      },
      filled: {
        root: { bg: 'bg.muted' },
        header: { borderColor: 'transparent' },
        footer: { borderColor: 'transparent' },
      },
    },

    size: {
      sm: {
        root: { borderRadius: 'lg' },
        header: { p: '3' },
        body: { p: '3' },
        footer: { p: '3' },
        title: { fontSize: 'md' },
      },
      md: {},
      lg: {
        header: { p: '6' },
        body: { p: '6' },
        footer: { p: '6' },
        title: { fontSize: 'xl' },
      },
    },
  },

  defaultVariants: {
    variant: 'elevated',
    size: 'md',
  },
})
```

## Breakpoints

```tsx
const config = defineConfig({
  theme: {
    breakpoints: {
      sm: '480px',
      md: '768px',
      lg: '992px',
      xl: '1280px',
      '2xl': '1536px',
    },
  },
})

// Usage
<Box
  width={{ base: '100%', md: '50%', lg: '33%' }}
  display={{ base: 'block', md: 'flex' }}
/>
```

## Global Styles

```tsx
const config = defineConfig({
  globalCss: {
    'html, body': {
      bg: 'bg',
      color: 'fg',
      fontFamily: 'body',
      lineHeight: 'normal',
    },
    '*::selection': {
      bg: 'brand.subtle',
      color: 'brand.fg',
    },
    a: {
      color: 'brand.fg',
      _hover: { textDecoration: 'underline' },
    },
  },
})
```

## Layer Styles

```tsx
const config = defineConfig({
  theme: {
    layerStyles: {
      card: {
        bg: 'bg',
        borderRadius: 'xl',
        shadow: 'md',
        p: '4',
      },
      subtle: {
        bg: 'bg.subtle',
        borderRadius: 'lg',
      },
    },
  },
})

// Usage
<Box layerStyle="card">Card content</Box>
```

## Text Styles

```tsx
const config = defineConfig({
  theme: {
    textStyles: {
      h1: {
        fontSize: { base: '3xl', md: '4xl', lg: '5xl' },
        fontWeight: 'bold',
        lineHeight: 'tight',
      },
      h2: {
        fontSize: { base: '2xl', md: '3xl' },
        fontWeight: 'semibold',
        lineHeight: 'tight',
      },
      body: {
        fontSize: 'md',
        lineHeight: 'relaxed',
      },
      caption: {
        fontSize: 'sm',
        color: 'fg.muted',
      },
    },
  },
})

// Usage
<Text textStyle="h1">Heading</Text>
<Text textStyle="body">Paragraph text</Text>
```

## Conditions

```tsx
const config = defineConfig({
  conditions: {
    light: '[data-theme=light] &',
    dark: '[data-theme=dark] &',
    rtl: '[dir=rtl] &',
    ltr: '[dir=ltr] &',
    hover: '&:is(:hover, [data-hover])',
    focus: '&:is(:focus, [data-focus])',
    focusVisible: '&:is(:focus-visible, [data-focus-visible])',
    disabled: '&:is(:disabled, [disabled], [data-disabled])',
  },
})
```

## Using Theme Tokens in Code

```tsx
import { useToken, useTheme } from '@chakra-ui/react'

function Component() {
  // Get single token value
  const [brandColor] = useToken('colors', ['brand.500'])

  // Get multiple tokens
  const [sm, md, lg] = useToken('spacing', ['sm', 'md', 'lg'])

  // Access full theme
  const theme = useTheme()

  return <Box bg={brandColor} p={md} />
}
```

## CSS Variables

Chakra generates CSS variables automatically:

```css
:root {
  --app-colors-brand-500: #0073e6;
  --app-spacing-md: 1rem;
  --app-radii-lg: 0.5rem;
}
```

Access in custom CSS:

```css
.custom-element {
  background: var(--app-colors-brand-500);
  padding: var(--app-spacing-md);
}
```
