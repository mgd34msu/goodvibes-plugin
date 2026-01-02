# vanilla-extract Sprinkles

Build your own zero-runtime atomic CSS framework.

## Installation

```bash
npm install @vanilla-extract/sprinkles
```

## Basic Setup

```typescript
// sprinkles.css.ts
import { defineProperties, createSprinkles } from '@vanilla-extract/sprinkles';

// Define spacing scale
const space = {
  none: '0',
  px: '1px',
  1: '4px',
  2: '8px',
  3: '12px',
  4: '16px',
  5: '20px',
  6: '24px',
  8: '32px',
  10: '40px',
  12: '48px',
};

// Define color palette
const colors = {
  transparent: 'transparent',
  white: '#ffffff',
  black: '#000000',
  gray50: '#f9fafb',
  gray100: '#f3f4f6',
  gray200: '#e5e7eb',
  gray500: '#6b7280',
  gray900: '#1f2937',
  blue500: '#3b82f6',
  blue600: '#2563eb',
  red500: '#ef4444',
  green500: '#10b981',
};

// Responsive properties
const responsiveProperties = defineProperties({
  conditions: {
    mobile: {},
    tablet: { '@media': '(min-width: 768px)' },
    desktop: { '@media': '(min-width: 1024px)' },
  },
  defaultCondition: 'mobile',
  properties: {
    display: ['none', 'block', 'flex', 'grid', 'inline', 'inline-flex'],
    flexDirection: ['row', 'column', 'row-reverse', 'column-reverse'],
    alignItems: ['stretch', 'flex-start', 'center', 'flex-end', 'baseline'],
    justifyContent: ['flex-start', 'center', 'flex-end', 'space-between', 'space-around'],
    flexWrap: ['wrap', 'nowrap'],
    gap: space,
    padding: space,
    paddingTop: space,
    paddingBottom: space,
    paddingLeft: space,
    paddingRight: space,
    margin: space,
    marginTop: space,
    marginBottom: space,
    marginLeft: space,
    marginRight: space,
    width: ['100%', 'auto'],
    height: ['100%', 'auto'],
    position: ['relative', 'absolute', 'fixed', 'sticky'],
  },
  shorthands: {
    p: ['padding'],
    pt: ['paddingTop'],
    pb: ['paddingBottom'],
    pl: ['paddingLeft'],
    pr: ['paddingRight'],
    px: ['paddingLeft', 'paddingRight'],
    py: ['paddingTop', 'paddingBottom'],
    m: ['margin'],
    mt: ['marginTop'],
    mb: ['marginBottom'],
    ml: ['marginLeft'],
    mr: ['marginRight'],
    mx: ['marginLeft', 'marginRight'],
    my: ['marginTop', 'marginBottom'],
  },
});

// Color properties (non-responsive typically)
const colorProperties = defineProperties({
  properties: {
    color: colors,
    backgroundColor: colors,
    borderColor: colors,
  },
});

// Typography
const typographyProperties = defineProperties({
  properties: {
    fontSize: {
      xs: '12px',
      sm: '14px',
      base: '16px',
      lg: '18px',
      xl: '20px',
      '2xl': '24px',
      '3xl': '30px',
    },
    fontWeight: {
      normal: '400',
      medium: '500',
      semibold: '600',
      bold: '700',
    },
    lineHeight: {
      tight: '1.25',
      normal: '1.5',
      relaxed: '1.75',
    },
    textAlign: ['left', 'center', 'right'],
  },
});

export const sprinkles = createSprinkles(
  responsiveProperties,
  colorProperties,
  typographyProperties
);

export type Sprinkles = Parameters<typeof sprinkles>[0];
```

## Usage

### In Components

```tsx
import { sprinkles } from './sprinkles.css';

function Card({ children }: { children: React.ReactNode }) {
  return (
    <div className={sprinkles({
      p: 4,
      backgroundColor: 'white',
      display: 'flex',
      flexDirection: 'column',
      gap: 3,
    })}>
      {children}
    </div>
  );
}
```

### Responsive Values

```tsx
<div className={sprinkles({
  padding: {
    mobile: 2,
    tablet: 4,
    desktop: 6,
  },
  display: {
    mobile: 'block',
    tablet: 'flex',
  },
  flexDirection: {
    tablet: 'row',
  },
  gap: {
    mobile: 2,
    tablet: 4,
  },
})}>
```

### With Style Function

```typescript
// component.css.ts
import { style } from '@vanilla-extract/css';
import { sprinkles } from './sprinkles.css';

export const card = style([
  sprinkles({
    p: 4,
    backgroundColor: 'white',
  }),
  {
    borderRadius: 8,
    boxShadow: '0 2px 4px rgba(0, 0, 0, 0.1)',
    // Non-sprinkle properties
  },
]);
```

## Shorthands

Define property aliases:

```typescript
const properties = defineProperties({
  properties: {
    paddingTop: space,
    paddingBottom: space,
    paddingLeft: space,
    paddingRight: space,
  },
  shorthands: {
    p: ['paddingTop', 'paddingBottom', 'paddingLeft', 'paddingRight'],
    px: ['paddingLeft', 'paddingRight'],
    py: ['paddingTop', 'paddingBottom'],
  },
});

// Usage
sprinkles({ px: 4, py: 2 })
// Expands to paddingLeft, paddingRight: 16px, paddingTop, paddingBottom: 8px
```

## Conditional Properties

Different values at different conditions:

```typescript
const properties = defineProperties({
  conditions: {
    default: {},
    hover: { selector: '&:hover' },
    focus: { selector: '&:focus' },
    active: { selector: '&:active' },
  },
  defaultCondition: 'default',
  properties: {
    backgroundColor: colors,
    transform: {
      none: 'none',
      scale: 'scale(1.05)',
    },
  },
});

// Usage
sprinkles({
  backgroundColor: {
    default: 'gray100',
    hover: 'gray200',
    active: 'gray300',
  },
  transform: {
    hover: 'scale',
  },
})
```

## Custom Conditions

```typescript
const properties = defineProperties({
  conditions: {
    lightMode: { '@media': '(prefers-color-scheme: light)' },
    darkMode: { '@media': '(prefers-color-scheme: dark)' },
  },
  defaultCondition: 'lightMode',
  properties: {
    backgroundColor: colors,
    color: colors,
  },
});

sprinkles({
  backgroundColor: {
    lightMode: 'white',
    darkMode: 'gray900',
  },
  color: {
    lightMode: 'gray900',
    darkMode: 'white',
  },
})
```

## Box Component Pattern

```tsx
// Box.tsx
import { sprinkles, Sprinkles } from './sprinkles.css';
import { AllHTMLAttributes, createElement, ElementType } from 'react';

interface BoxProps extends Sprinkles {
  as?: ElementType;
  children?: React.ReactNode;
  className?: string;
}

export function Box({
  as = 'div',
  children,
  className,
  ...sprinklesProps
}: BoxProps) {
  const sprinkleClasses = sprinkles(sprinklesProps);
  const combinedClassName = className
    ? `${sprinkleClasses} ${className}`
    : sprinkleClasses;

  return createElement(as, { className: combinedClassName }, children);
}

// Usage
<Box
  as="section"
  display="flex"
  flexDirection={{ mobile: 'column', tablet: 'row' }}
  gap={4}
  p={{ mobile: 3, desktop: 6 }}
  backgroundColor="gray50"
>
  Content
</Box>
```

## Combining with Recipes

```typescript
import { recipe } from '@vanilla-extract/recipes';
import { sprinkles } from './sprinkles.css';

export const button = recipe({
  base: [
    sprinkles({
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
    }),
    {
      border: 'none',
      cursor: 'pointer',
      fontWeight: 600,
    },
  ],

  variants: {
    size: {
      sm: sprinkles({ px: 3, py: 1, fontSize: 'sm' }),
      md: sprinkles({ px: 4, py: 2, fontSize: 'base' }),
      lg: sprinkles({ px: 6, py: 3, fontSize: 'lg' }),
    },
    color: {
      primary: sprinkles({
        backgroundColor: 'blue500',
        color: 'white'
      }),
      secondary: sprinkles({
        backgroundColor: 'gray200',
        color: 'gray900'
      }),
    },
  },

  defaultVariants: {
    size: 'md',
    color: 'primary',
  },
});
```

## TypeScript Integration

```typescript
import { sprinkles, Sprinkles } from './sprinkles.css';

// Props that accept sprinkle values
interface ComponentProps extends Sprinkles {
  title: string;
}

// Partial sprinkles
interface CardProps extends Partial<Sprinkles> {
  children: React.ReactNode;
}

// Pick specific sprinkles
type SpacingProps = Pick<Sprinkles, 'p' | 'px' | 'py' | 'm' | 'mx' | 'my'>;

interface BoxProps extends SpacingProps {
  children: React.ReactNode;
}
```

## Performance Considerations

1. **Static generation** - All classes generated at build time
2. **No runtime overhead** - Just string concatenation
3. **Tree-shakeable** - Only used utilities in bundle
4. **Cache-friendly** - Same props = same class names

## Best Practices

1. **Define tokens** - Use consistent scales
2. **Limit conditions** - Too many bloat CSS
3. **Use shorthands** - Better DX
4. **Combine with style()** - For complex styles
5. **Type your sprinkles** - Export Sprinkles type

## Common Patterns

### Flex Utilities

```typescript
const flexProperties = defineProperties({
  properties: {
    display: ['flex', 'inline-flex'],
    flexDirection: ['row', 'column'],
    alignItems: ['stretch', 'center', 'flex-start', 'flex-end'],
    justifyContent: ['flex-start', 'center', 'flex-end', 'space-between'],
    flexWrap: ['wrap', 'nowrap'],
    gap: space,
  },
});
```

### Grid Utilities

```typescript
const gridProperties = defineProperties({
  properties: {
    display: ['grid'],
    gridTemplateColumns: {
      1: 'repeat(1, 1fr)',
      2: 'repeat(2, 1fr)',
      3: 'repeat(3, 1fr)',
      4: 'repeat(4, 1fr)',
    },
    gridGap: space,
  },
});
```

### Visibility

```typescript
const visibilityProperties = defineProperties({
  conditions: {
    mobile: {},
    tablet: { '@media': '(min-width: 768px)' },
    desktop: { '@media': '(min-width: 1024px)' },
  },
  properties: {
    display: ['none', 'block', 'flex'],
  },
});

// Hide on mobile, show on tablet+
sprinkles({
  display: { mobile: 'none', tablet: 'block' },
})
```
