# styled-components Patterns

Advanced patterns and best practices.

## Design System Components

### Button System

```tsx
import styled, { css } from 'styled-components';

const sizes = {
  sm: css`
    padding: 8px 16px;
    font-size: 14px;
  `,
  md: css`
    padding: 12px 24px;
    font-size: 16px;
  `,
  lg: css`
    padding: 16px 32px;
    font-size: 18px;
  `,
};

const variants = {
  primary: css`
    background: ${props => props.theme.colors.primary};
    color: white;
    border: none;

    &:hover:not(:disabled) {
      background: ${props => props.theme.colors.primaryDark};
    }
  `,
  secondary: css`
    background: ${props => props.theme.colors.secondary};
    color: ${props => props.theme.colors.text};
    border: none;

    &:hover:not(:disabled) {
      background: ${props => props.theme.colors.secondaryDark};
    }
  `,
  outline: css`
    background: transparent;
    color: ${props => props.theme.colors.primary};
    border: 2px solid ${props => props.theme.colors.primary};

    &:hover:not(:disabled) {
      background: ${props => props.theme.colors.primaryLight};
    }
  `,
  ghost: css`
    background: transparent;
    color: ${props => props.theme.colors.primary};
    border: none;

    &:hover:not(:disabled) {
      background: ${props => props.theme.colors.primaryLight};
    }
  `,
};

interface ButtonProps {
  $variant?: keyof typeof variants;
  $size?: keyof typeof sizes;
  $fullWidth?: boolean;
}

export const Button = styled.button<ButtonProps>`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  border-radius: ${props => props.theme.borderRadius.md};
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s ease;

  ${props => sizes[props.$size || 'md']}
  ${props => variants[props.$variant || 'primary']}
  ${props => props.$fullWidth && css`width: 100%;`}

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  &:focus-visible {
    outline: 2px solid ${props => props.theme.colors.primary};
    outline-offset: 2px;
  }
`;
```

### Input System

```tsx
const inputBase = css`
  width: 100%;
  padding: 12px 16px;
  font-size: 16px;
  border: 1px solid ${props => props.theme.colors.border};
  border-radius: ${props => props.theme.borderRadius.md};
  background: ${props => props.theme.colors.background};
  color: ${props => props.theme.colors.text};
  transition: border-color 0.2s, box-shadow 0.2s;

  &::placeholder {
    color: ${props => props.theme.colors.textMuted};
  }

  &:focus {
    outline: none;
    border-color: ${props => props.theme.colors.primary};
    box-shadow: 0 0 0 3px ${props => props.theme.colors.primaryLight};
  }

  &:disabled {
    background: ${props => props.theme.colors.backgroundMuted};
    cursor: not-allowed;
  }
`;

interface InputWrapperProps {
  $hasError?: boolean;
}

export const Input = styled.input<InputWrapperProps>`
  ${inputBase}

  ${props => props.$hasError && css`
    border-color: ${props => props.theme.colors.error};

    &:focus {
      border-color: ${props => props.theme.colors.error};
      box-shadow: 0 0 0 3px ${props => props.theme.colors.errorLight};
    }
  `}
`;

export const Textarea = styled.textarea<InputWrapperProps>`
  ${inputBase}
  min-height: 120px;
  resize: vertical;

  ${props => props.$hasError && css`
    border-color: ${props => props.theme.colors.error};
  `}
`;
```

## Layout Components

### Flexbox Utilities

```tsx
interface FlexProps {
  $direction?: 'row' | 'column';
  $align?: 'start' | 'center' | 'end' | 'stretch' | 'baseline';
  $justify?: 'start' | 'center' | 'end' | 'between' | 'around' | 'evenly';
  $gap?: string;
  $wrap?: boolean;
}

const alignMap = {
  start: 'flex-start',
  center: 'center',
  end: 'flex-end',
  stretch: 'stretch',
  baseline: 'baseline',
};

const justifyMap = {
  start: 'flex-start',
  center: 'center',
  end: 'flex-end',
  between: 'space-between',
  around: 'space-around',
  evenly: 'space-evenly',
};

export const Flex = styled.div<FlexProps>`
  display: flex;
  flex-direction: ${props => props.$direction || 'row'};
  align-items: ${props => alignMap[props.$align || 'stretch']};
  justify-content: ${props => justifyMap[props.$justify || 'start']};
  gap: ${props => props.$gap || '0'};
  flex-wrap: ${props => props.$wrap ? 'wrap' : 'nowrap'};
`;

export const Stack = styled(Flex).attrs({ $direction: 'column' })``;
export const HStack = styled(Flex).attrs({ $direction: 'row' })``;
export const VStack = styled(Flex).attrs({ $direction: 'column' })``;
```

### Grid System

```tsx
interface GridProps {
  $columns?: number | string;
  $gap?: string;
  $minItemWidth?: string;
}

export const Grid = styled.div<GridProps>`
  display: grid;
  gap: ${props => props.$gap || '16px'};

  ${props => {
    if (props.$minItemWidth) {
      return css`
        grid-template-columns: repeat(
          auto-fit,
          minmax(${props.$minItemWidth}, 1fr)
        );
      `;
    }
    if (typeof props.$columns === 'number') {
      return css`
        grid-template-columns: repeat(${props.$columns}, 1fr);
      `;
    }
    return css`
      grid-template-columns: ${props.$columns || '1fr'};
    `;
  }}
`;
```

## Responsive Design

### Breakpoint System

```tsx
const breakpoints = {
  sm: '640px',
  md: '768px',
  lg: '1024px',
  xl: '1280px',
  '2xl': '1536px',
};

type Breakpoint = keyof typeof breakpoints;

export const media = {
  up: (bp: Breakpoint) => `@media (min-width: ${breakpoints[bp]})`,
  down: (bp: Breakpoint) => `@media (max-width: ${breakpoints[bp]})`,
  between: (min: Breakpoint, max: Breakpoint) =>
    `@media (min-width: ${breakpoints[min]}) and (max-width: ${breakpoints[max]})`,
};

// Usage
const Container = styled.div`
  padding: 16px;

  ${media.up('md')} {
    padding: 24px;
  }

  ${media.up('lg')} {
    padding: 32px;
    max-width: 1200px;
    margin: 0 auto;
  }
`;
```

### Responsive Props

```tsx
type ResponsiveValue<T> = T | Partial<Record<Breakpoint, T>>;

function responsive<T>(
  prop: ResponsiveValue<T>,
  cssProperty: string,
  transform: (value: T) => string = String
) {
  if (typeof prop === 'object' && prop !== null) {
    return Object.entries(prop).map(([bp, value]) => {
      if (bp === 'base') {
        return `${cssProperty}: ${transform(value as T)};`;
      }
      return `
        ${media.up(bp as Breakpoint)} {
          ${cssProperty}: ${transform(value as T)};
        }
      `;
    }).join('\n');
  }
  return `${cssProperty}: ${transform(prop)};`;
}

// Usage
interface BoxProps {
  $padding?: ResponsiveValue<string>;
}

const Box = styled.div<BoxProps>`
  ${props => props.$padding && responsive(props.$padding, 'padding')}
`;

<Box $padding={{ base: '16px', md: '24px', lg: '32px' }} />
```

## Component Composition

### Compound Components

```tsx
const CardRoot = styled.div`
  background: white;
  border-radius: 8px;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
  overflow: hidden;
`;

const CardHeader = styled.div`
  padding: 16px 20px;
  border-bottom: 1px solid ${props => props.theme.colors.border};
`;

const CardBody = styled.div`
  padding: 20px;
`;

const CardFooter = styled.div`
  padding: 16px 20px;
  border-top: 1px solid ${props => props.theme.colors.border};
  background: ${props => props.theme.colors.backgroundMuted};
`;

export const Card = Object.assign(CardRoot, {
  Header: CardHeader,
  Body: CardBody,
  Footer: CardFooter,
});

// Usage
<Card>
  <Card.Header>Title</Card.Header>
  <Card.Body>Content</Card.Body>
  <Card.Footer>Actions</Card.Footer>
</Card>
```

### Slot Pattern

```tsx
interface DialogProps {
  children: React.ReactNode;
}

const DialogOverlay = styled.div`
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
`;

const DialogContent = styled.div`
  background: white;
  border-radius: 12px;
  max-width: 500px;
  width: 90%;
  max-height: 85vh;
  overflow: auto;
`;

const DialogTitle = styled.h2`
  margin: 0;
  padding: 20px;
  font-size: 18px;
  border-bottom: 1px solid #e5e7eb;
`;

const DialogDescription = styled.div`
  padding: 20px;
`;

const DialogActions = styled.div`
  padding: 16px 20px;
  display: flex;
  justify-content: flex-end;
  gap: 12px;
  border-top: 1px solid #e5e7eb;
`;

export const Dialog = {
  Root: DialogOverlay,
  Content: DialogContent,
  Title: DialogTitle,
  Description: DialogDescription,
  Actions: DialogActions,
};
```

## Animation Patterns

### Transition Components

```tsx
const fadeIn = keyframes`
  from { opacity: 0; }
  to { opacity: 1; }
`;

const slideUp = keyframes`
  from {
    opacity: 0;
    transform: translateY(20px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
`;

interface AnimatedProps {
  $delay?: number;
  $duration?: number;
}

export const FadeIn = styled.div<AnimatedProps>`
  animation: ${fadeIn} ${props => props.$duration || 0.3}s ease-out;
  animation-delay: ${props => props.$delay || 0}s;
  animation-fill-mode: both;
`;

export const SlideUp = styled.div<AnimatedProps>`
  animation: ${slideUp} ${props => props.$duration || 0.4}s ease-out;
  animation-delay: ${props => props.$delay || 0}s;
  animation-fill-mode: both;
`;
```

### Staggered Animation

```tsx
const StaggerContainer = styled.div`
  display: flex;
  flex-direction: column;
  gap: 16px;
`;

const StaggerItem = styled.div<{ $index: number }>`
  animation: ${slideUp} 0.4s ease-out;
  animation-delay: ${props => props.$index * 0.1}s;
  animation-fill-mode: both;
`;

// Usage
function List({ items }) {
  return (
    <StaggerContainer>
      {items.map((item, index) => (
        <StaggerItem key={item.id} $index={index}>
          {item.content}
        </StaggerItem>
      ))}
    </StaggerContainer>
  );
}
```

## Testing Utilities

### Test IDs

```tsx
const Button = styled.button.attrs<{ testId?: string }>(props => ({
  'data-testid': props.testId,
}))`
  /* styles */
`;

// Usage
<Button testId="submit-button">Submit</Button>

// Test
screen.getByTestId('submit-button');
```

### Style Assertions

```tsx
import 'jest-styled-components';

test('renders primary button', () => {
  render(<Button $variant="primary">Click</Button>);

  const button = screen.getByRole('button');
  expect(button).toHaveStyleRule('background', '#3b82f6');
});

test('renders with theme', () => {
  render(
    <ThemeProvider theme={theme}>
      <Button $variant="primary">Click</Button>
    </ThemeProvider>
  );

  const button = screen.getByRole('button');
  expect(button).toHaveStyleRule('background', theme.colors.primary);
});
```

## Performance Tips

### Avoid Recreating Components

```tsx
// Bad - recreates on every render
function Component() {
  const Wrapper = styled.div`
    padding: 16px;
  `;

  return <Wrapper>...</Wrapper>;
}

// Good - defined outside
const Wrapper = styled.div`
  padding: 16px;
`;

function Component() {
  return <Wrapper>...</Wrapper>;
}
```

### Use CSS Variables for Dynamic Values

```tsx
// Less efficient - recreates styles
const Box = styled.div<{ $color: string }>`
  background: ${props => props.$color};
`;

// More efficient - uses CSS variables
const Box = styled.div<{ $color: string }>`
  background: var(--box-color);
`;

function Component({ color }) {
  return <Box style={{ '--box-color': color } as React.CSSProperties} />;
}
```

### Memoize Complex Interpolations

```tsx
import { useMemo } from 'react';

function Component({ items }) {
  const dynamicStyles = useMemo(() => css`
    ${items.map((item, i) => css`
      &:nth-child(${i + 1}) {
        background: ${item.color};
      }
    `)}
  `, [items]);

  return <List $styles={dynamicStyles}>...</List>;
}
```
