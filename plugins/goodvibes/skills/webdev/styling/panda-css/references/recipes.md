# Panda CSS Recipes

Multi-variant component styles with type safety.

## Recipe API (cva)

### Basic Structure

```typescript
import { cva } from '../styled-system/css';

export const button = cva({
  // Applied to all variants
  base: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 'md',
    fontWeight: 'semibold',
    cursor: 'pointer',
    transition: 'all 0.2s',
  },

  // Variant definitions
  variants: {
    variant: {
      solid: {
        bg: 'blue.500',
        color: 'white',
        _hover: { bg: 'blue.600' },
      },
      outline: {
        border: '2px solid',
        borderColor: 'blue.500',
        color: 'blue.500',
        _hover: { bg: 'blue.50' },
      },
      ghost: {
        color: 'blue.500',
        _hover: { bg: 'blue.50' },
      },
    },
    size: {
      sm: { px: '3', py: '1.5', fontSize: 'sm' },
      md: { px: '4', py: '2', fontSize: 'md' },
      lg: { px: '6', py: '3', fontSize: 'lg' },
    },
    disabled: {
      true: {
        opacity: '0.5',
        cursor: 'not-allowed',
        pointerEvents: 'none',
      },
    },
  },

  // Styles when variants combine
  compoundVariants: [
    {
      variant: 'solid',
      size: 'lg',
      css: { boxShadow: 'lg' },
    },
    {
      variant: 'outline',
      disabled: true,
      css: { borderColor: 'gray.300' },
    },
  ],

  // Default selections
  defaultVariants: {
    variant: 'solid',
    size: 'md',
  },
});
```

### Using Recipes

```tsx
import { button } from './button.recipe';

// Basic usage
<button className={button()}>Default Button</button>

// With variants
<button className={button({ variant: 'outline', size: 'lg' })}>
  Large Outline
</button>

// Boolean variant
<button className={button({ disabled: true })}>
  Disabled
</button>
```

## TypeScript Integration

### Extract Variant Types

```typescript
import { cva, type RecipeVariantProps } from '../styled-system/css';

const button = cva({
  // ...recipe definition
});

export type ButtonVariants = RecipeVariantProps<typeof button>;
// {
//   variant?: 'solid' | 'outline' | 'ghost';
//   size?: 'sm' | 'md' | 'lg';
//   disabled?: boolean;
// }
```

### Component Props

```tsx
import { button, type ButtonVariants } from './button.recipe';

interface ButtonProps extends ButtonVariants {
  children: React.ReactNode;
  onClick?: () => void;
}

export function Button({
  variant,
  size,
  disabled,
  children,
  onClick,
}: ButtonProps) {
  return (
    <button
      className={button({ variant, size, disabled })}
      onClick={onClick}
      disabled={disabled}
    >
      {children}
    </button>
  );
}
```

## Slot Recipes (sva)

For multi-part components:

```typescript
import { sva } from '../styled-system/css';

const card = sva({
  // Define component parts
  slots: ['root', 'header', 'title', 'body', 'footer'],

  // Base styles for each slot
  base: {
    root: {
      borderRadius: 'lg',
      overflow: 'hidden',
      bg: 'white',
      boxShadow: 'md',
    },
    header: {
      p: '4',
      borderBottom: '1px solid',
      borderColor: 'gray.200',
    },
    title: {
      fontSize: 'lg',
      fontWeight: 'semibold',
    },
    body: {
      p: '4',
    },
    footer: {
      p: '4',
      borderTop: '1px solid',
      borderColor: 'gray.200',
      bg: 'gray.50',
    },
  },

  // Variants affect all slots
  variants: {
    size: {
      sm: {
        root: { maxW: 'sm' },
        header: { p: '3' },
        title: { fontSize: 'md' },
        body: { p: '3' },
        footer: { p: '3' },
      },
      lg: {
        root: { maxW: 'lg' },
        header: { p: '6' },
        title: { fontSize: 'xl' },
        body: { p: '6' },
        footer: { p: '4' },
      },
    },
    variant: {
      elevated: {
        root: { boxShadow: 'lg' },
      },
      outline: {
        root: {
          boxShadow: 'none',
          border: '1px solid',
          borderColor: 'gray.200',
        },
      },
    },
  },
});
```

### Using Slot Recipes

```tsx
import { card } from './card.recipe';

function Card({ size, variant, title, children, actions }) {
  const styles = card({ size, variant });

  return (
    <div className={styles.root}>
      <div className={styles.header}>
        <h2 className={styles.title}>{title}</h2>
      </div>
      <div className={styles.body}>{children}</div>
      {actions && (
        <div className={styles.footer}>{actions}</div>
      )}
    </div>
  );
}
```

## Config Recipes

Define in panda.config.ts:

```typescript
// panda.config.ts
export default defineConfig({
  theme: {
    extend: {
      recipes: {
        button: {
          className: 'btn',
          description: 'Button component recipe',
          base: {
            display: 'inline-flex',
            alignItems: 'center',
          },
          variants: {
            size: {
              sm: { h: '8', px: '3', fontSize: 'sm' },
              md: { h: '10', px: '4', fontSize: 'md' },
              lg: { h: '12', px: '6', fontSize: 'lg' },
            },
          },
          defaultVariants: {
            size: 'md',
          },
        },
      },
      slotRecipes: {
        card: {
          className: 'card',
          slots: ['root', 'header', 'body'],
          base: {
            root: { borderRadius: 'lg' },
            header: { p: '4' },
            body: { p: '4' },
          },
        },
      },
    },
  },
});
```

Use generated recipe:

```tsx
import { button } from '../styled-system/recipes';

<button className={button({ size: 'lg' })}>Click</button>
```

## Composing Recipes

### With css()

```typescript
import { cva } from '../styled-system/css';
import { css } from '../styled-system/css';

const baseButton = cva({
  base: { borderRadius: 'md' },
  variants: {
    size: {
      sm: { p: '2' },
      md: { p: '4' },
    },
  },
});

// Extend with additional styles
function Button({ size, className, ...props }) {
  return (
    <button
      className={css(
        baseButton.raw({ size }),
        { fontWeight: 'bold' },
        className
      )}
      {...props}
    />
  );
}
```

### Merging Recipes

```typescript
const iconButton = cva({
  base: {
    ...button.raw({ size: 'md' }).base,
    p: '2',
    aspectRatio: '1',
  },
  variants: {
    ...button.raw({}).variants,
    rounded: {
      true: { borderRadius: 'full' },
    },
  },
});
```

## Dynamic Recipes

```tsx
function DynamicButton({ color, children }) {
  // Dynamic values still work
  return (
    <button className={css({
      bg: `${color}.500`,
      _hover: { bg: `${color}.600` },
      // ...other styles
    })}>
      {children}
    </button>
  );
}
```

## Best Practices

1. **Use recipes for reusable components** - Buttons, cards, inputs
2. **Use slot recipes for multi-part** - Dialogs, dropdowns, complex cards
3. **Define in config for sharing** - Library components
4. **Keep variants focused** - One concern per variant
5. **Use compound variants sparingly** - Only for true combinations

## Common Recipes

### Input Recipe

```typescript
const input = cva({
  base: {
    w: 'full',
    px: '4',
    py: '2',
    border: '1px solid',
    borderColor: 'gray.300',
    borderRadius: 'md',
    bg: 'white',
    _focus: {
      outline: 'none',
      borderColor: 'blue.500',
      ring: '2',
      ringColor: 'blue.200',
    },
    _disabled: {
      bg: 'gray.100',
      cursor: 'not-allowed',
    },
  },
  variants: {
    error: {
      true: {
        borderColor: 'red.500',
        _focus: {
          borderColor: 'red.500',
          ringColor: 'red.200',
        },
      },
    },
    size: {
      sm: { h: '8', fontSize: 'sm' },
      md: { h: '10', fontSize: 'md' },
      lg: { h: '12', fontSize: 'lg' },
    },
  },
  defaultVariants: {
    size: 'md',
  },
});
```

### Badge Recipe

```typescript
const badge = cva({
  base: {
    display: 'inline-flex',
    alignItems: 'center',
    px: '2',
    py: '0.5',
    borderRadius: 'full',
    fontSize: 'xs',
    fontWeight: 'medium',
  },
  variants: {
    variant: {
      solid: {},
      outline: { border: '1px solid' },
      subtle: {},
    },
    colorScheme: {
      gray: {},
      blue: {},
      green: {},
      red: {},
    },
  },
  compoundVariants: [
    { variant: 'solid', colorScheme: 'blue', css: { bg: 'blue.500', color: 'white' } },
    { variant: 'solid', colorScheme: 'green', css: { bg: 'green.500', color: 'white' } },
    { variant: 'solid', colorScheme: 'red', css: { bg: 'red.500', color: 'white' } },
    { variant: 'outline', colorScheme: 'blue', css: { borderColor: 'blue.500', color: 'blue.500' } },
    { variant: 'subtle', colorScheme: 'blue', css: { bg: 'blue.100', color: 'blue.700' } },
  ],
  defaultVariants: {
    variant: 'subtle',
    colorScheme: 'gray',
  },
});
```
