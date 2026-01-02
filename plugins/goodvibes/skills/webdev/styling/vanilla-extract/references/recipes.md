# vanilla-extract Recipes

Multi-variant component styles with type-safe runtime API.

## Installation

```bash
npm install @vanilla-extract/recipes
```

## Basic Recipe

```typescript
// card.css.ts
import { recipe } from '@vanilla-extract/recipes';

export const card = recipe({
  base: {
    borderRadius: 8,
    padding: 16,
    transition: 'all 0.2s ease',
  },

  variants: {
    variant: {
      elevated: {
        backgroundColor: 'white',
        boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
      },
      outlined: {
        backgroundColor: 'transparent',
        border: '1px solid #e5e7eb',
      },
      filled: {
        backgroundColor: '#f3f4f6',
        border: 'none',
      },
    },

    interactive: {
      true: {
        cursor: 'pointer',
        ':hover': {
          transform: 'translateY(-2px)',
        },
      },
    },
  },

  defaultVariants: {
    variant: 'elevated',
    interactive: false,
  },
});
```

## Compound Variants

Apply styles when multiple variants match:

```typescript
import { recipe } from '@vanilla-extract/recipes';

export const button = recipe({
  base: {
    padding: '12px 24px',
    borderRadius: 8,
    fontWeight: 600,
    border: 'none',
  },

  variants: {
    color: {
      brand: { backgroundColor: '#3b82f6', color: 'white' },
      accent: { backgroundColor: '#8b5cf6', color: 'white' },
      neutral: { backgroundColor: '#e5e7eb', color: '#1f2937' },
    },
    size: {
      small: { fontSize: 14, padding: '8px 16px' },
      medium: { fontSize: 16, padding: '12px 24px' },
      large: { fontSize: 18, padding: '16px 32px' },
    },
    rounded: {
      true: { borderRadius: 9999 },
    },
  },

  compoundVariants: [
    // Large brand button gets shadow
    {
      variants: { color: 'brand', size: 'large' },
      style: {
        boxShadow: '0 4px 14px rgba(59, 130, 246, 0.4)',
      },
    },
    // Rounded + large gets extra padding
    {
      variants: { rounded: true, size: 'large' },
      style: {
        paddingLeft: 40,
        paddingRight: 40,
      },
    },
    // Neutral + rounded gets border
    {
      variants: { color: 'neutral', rounded: true },
      style: {
        border: '2px solid #d1d5db',
      },
    },
  ],

  defaultVariants: {
    color: 'brand',
    size: 'medium',
  },
});
```

## Type Extraction

```typescript
import { recipe, RecipeVariants } from '@vanilla-extract/recipes';

export const button = recipe({
  // ...recipe definition
});

// Extract variant types
export type ButtonVariants = RecipeVariants<typeof button>;

// ButtonVariants = {
//   color?: 'brand' | 'accent' | 'neutral';
//   size?: 'small' | 'medium' | 'large';
//   rounded?: boolean;
// }
```

**Use in component:**
```tsx
import { button, type ButtonVariants } from './button.css';

interface ButtonProps extends ButtonVariants {
  children: React.ReactNode;
  onClick?: () => void;
}

export function Button({
  color,
  size,
  rounded,
  children,
  onClick
}: ButtonProps) {
  return (
    <button
      className={button({ color, size, rounded })}
      onClick={onClick}
    >
      {children}
    </button>
  );
}
```

## Accessing Class Names

```typescript
const buttonRecipe = recipe({
  base: { padding: 16 },
  variants: {
    color: {
      primary: { backgroundColor: 'blue' },
      secondary: { backgroundColor: 'gray' },
    },
  },
});

// Access internal class names
buttonRecipe.classNames.base;
// => "button_base__1a2b3c"

buttonRecipe.classNames.variants.color.primary;
// => "button_color_primary__4d5e6f"
```

## Combining with Sprinkles

```typescript
import { recipe } from '@vanilla-extract/recipes';
import { sprinkles } from './sprinkles.css';

export const box = recipe({
  base: [
    sprinkles({ padding: 'md' }),
    { borderRadius: 8 },
  ],

  variants: {
    color: {
      primary: sprinkles({ backgroundColor: 'primary', color: 'white' }),
      secondary: sprinkles({ backgroundColor: 'secondary', color: 'text' }),
    },
    spacing: {
      compact: sprinkles({ padding: 'sm', gap: 'sm' }),
      comfortable: sprinkles({ padding: 'lg', gap: 'md' }),
    },
  },
});
```

## Extending Recipes

```typescript
import { recipe } from '@vanilla-extract/recipes';
import { style } from '@vanilla-extract/css';

// Base button recipe
const baseButton = recipe({
  base: {
    padding: '12px 24px',
    borderRadius: 8,
    fontWeight: 600,
    cursor: 'pointer',
  },
  variants: {
    size: {
      sm: { fontSize: 14 },
      md: { fontSize: 16 },
      lg: { fontSize: 18 },
    },
  },
});

// Extended icon button
const iconOverride = style({
  display: 'inline-flex',
  alignItems: 'center',
  gap: 8,
});

export const iconButton = recipe({
  base: [baseButton.classNames.base, iconOverride],

  variants: {
    size: {
      sm: baseButton.classNames.variants.size.sm,
      md: baseButton.classNames.variants.size.md,
      lg: baseButton.classNames.variants.size.lg,
    },
    iconPosition: {
      left: {},
      right: { flexDirection: 'row-reverse' },
    },
  },
});
```

## Boolean Variants

```typescript
export const input = recipe({
  base: {
    padding: '12px 16px',
    border: '1px solid #e5e7eb',
    borderRadius: 6,
    fontSize: 16,
  },

  variants: {
    disabled: {
      true: {
        opacity: 0.5,
        cursor: 'not-allowed',
        backgroundColor: '#f3f4f6',
      },
    },
    error: {
      true: {
        borderColor: '#ef4444',
        ':focus': {
          boxShadow: '0 0 0 3px rgba(239, 68, 68, 0.2)',
        },
      },
    },
    fullWidth: {
      true: {
        width: '100%',
      },
    },
  },

  compoundVariants: [
    {
      variants: { disabled: true, error: true },
      style: {
        borderColor: '#e5e7eb', // Reset error border when disabled
      },
    },
  ],
});

// Usage
input({ disabled: true, error: true, fullWidth: true })
```

## Responsive Variants

Combine with sprinkles for responsive patterns:

```typescript
import { recipe } from '@vanilla-extract/recipes';
import { sprinkles } from './sprinkles.css';

export const stack = recipe({
  base: {
    display: 'flex',
  },

  variants: {
    direction: {
      horizontal: sprinkles({
        flexDirection: { mobile: 'column', tablet: 'row' },
      }),
      vertical: {
        flexDirection: 'column',
      },
    },
    spacing: {
      sm: sprinkles({ gap: 'sm' }),
      md: sprinkles({ gap: 'md' }),
      lg: sprinkles({ gap: { mobile: 'md', desktop: 'lg' } }),
    },
    align: {
      start: { alignItems: 'flex-start' },
      center: { alignItems: 'center' },
      end: { alignItems: 'flex-end' },
    },
  },

  defaultVariants: {
    direction: 'vertical',
    spacing: 'md',
    align: 'start',
  },
});
```

## Testing Recipes

```typescript
import { button } from './button.css';

describe('button recipe', () => {
  it('returns base class without variants', () => {
    const result = button();
    expect(result).toContain('button_base');
  });

  it('includes variant classes', () => {
    const result = button({ color: 'primary', size: 'large' });
    expect(result).toContain('color_primary');
    expect(result).toContain('size_large');
  });

  it('applies compound variants', () => {
    const result = button({ color: 'brand', size: 'large' });
    expect(result).toContain('compound');
  });

  it('uses default variants', () => {
    const withDefaults = button();
    const explicit = button({ color: 'brand', size: 'medium' });
    expect(withDefaults).toBe(explicit);
  });
});
```

## Performance Tips

1. **Define outside render** - Recipes are static, define at module level
2. **Memoize variant objects** - If passing objects, memoize them
3. **Use sparingly** - For complex variants; use `styleVariants` for simple cases
4. **Combine wisely** - Mix with sprinkles for responsive utilities
