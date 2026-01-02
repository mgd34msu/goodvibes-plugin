# CSS Modules Composition

Advanced patterns for sharing and composing styles.

## Composition Rules

### Order Requirement

`composes` must appear before other declarations:

```css
/* Correct */
.button {
  composes: base from './base.module.css';
  background: blue;
  color: white;
}

/* Incorrect - will fail */
.button {
  background: blue;
  composes: base from './base.module.css'; /* Error! */
}
```

### Single Class Selectors Only

Composition works only with single class selectors:

```css
/* Correct */
.button {
  composes: base;
}

/* Won't work - complex selectors */
.button:hover { }
.container .button { }
#myButton { }
button { }
```

## Composition Patterns

### Design Token Classes

```css
/* tokens.module.css */
.colorPrimary {
  color: #3b82f6;
}

.colorSecondary {
  color: #6b7280;
}

.colorSuccess {
  color: #10b981;
}

.colorError {
  color: #ef4444;
}

.spacingSm {
  padding: 8px;
}

.spacingMd {
  padding: 16px;
}

.spacingLg {
  padding: 24px;
}
```

```css
/* Button.module.css */
.button {
  composes: spacingMd from './tokens.module.css';
  border: none;
  border-radius: 6px;
  cursor: pointer;
}

.primary {
  composes: button;
  composes: colorPrimary from './tokens.module.css';
  background: #dbeafe;
}
```

### Typography System

```css
/* typography.module.css */
.base {
  font-family: system-ui, -apple-system, sans-serif;
  line-height: 1.5;
}

.heading {
  composes: base;
  font-weight: 700;
  line-height: 1.2;
}

.h1 {
  composes: heading;
  font-size: 2.5rem;
}

.h2 {
  composes: heading;
  font-size: 2rem;
}

.h3 {
  composes: heading;
  font-size: 1.5rem;
}

.body {
  composes: base;
  font-size: 1rem;
}

.small {
  composes: base;
  font-size: 0.875rem;
}

.caption {
  composes: base;
  font-size: 0.75rem;
  color: #6b7280;
}
```

### Layout Utilities

```css
/* layout.module.css */
.flexRow {
  display: flex;
  flex-direction: row;
}

.flexCol {
  display: flex;
  flex-direction: column;
}

.flexCenter {
  display: flex;
  align-items: center;
  justify-content: center;
}

.flexBetween {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.gap1 { gap: 4px; }
.gap2 { gap: 8px; }
.gap3 { gap: 12px; }
.gap4 { gap: 16px; }
```

```css
/* Header.module.css */
.header {
  composes: flexBetween from './layout.module.css';
  padding: 16px 24px;
  background: white;
  border-bottom: 1px solid #e5e7eb;
}

.nav {
  composes: flexRow gap4 from './layout.module.css';
}
```

### State Classes

```css
/* states.module.css */
.disabled {
  opacity: 0.5;
  cursor: not-allowed;
  pointer-events: none;
}

.loading {
  position: relative;
  pointer-events: none;
}

.hidden {
  display: none;
}

.visuallyHidden {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}
```

## Global Composition

### From Global Reset

```css
/* global.css (not a module) */
.reset-button {
  appearance: none;
  background: transparent;
  border: none;
  padding: 0;
  margin: 0;
  font: inherit;
  cursor: pointer;
}

.reset-list {
  list-style: none;
  padding: 0;
  margin: 0;
}
```

```css
/* Button.module.css */
.button {
  composes: reset-button from global;
  padding: 12px 24px;
  background: #3b82f6;
  color: white;
  border-radius: 6px;
}
```

### From Third-Party Libraries

```css
/* Card.module.css */
.card {
  /* Compose from a global utility library */
  composes: shadow-md rounded-lg from global;
  padding: 16px;
}
```

## Multi-File Composition

### Organized by Concern

```
styles/
  tokens/
    colors.module.css
    spacing.module.css
    typography.module.css
  mixins/
    layout.module.css
    states.module.css
  components/
    Button.module.css
    Card.module.css
```

```css
/* Button.module.css */
.button {
  composes: spacingMd from '../tokens/spacing.module.css';
  composes: fontMd fontBold from '../tokens/typography.module.css';
  composes: transition from '../mixins/states.module.css';
}
```

### Index Re-export Pattern

```css
/* tokens/index.module.css */
.colorPrimary { composes: colorPrimary from './colors.module.css'; }
.colorSecondary { composes: colorSecondary from './colors.module.css'; }
.spacingMd { composes: spacingMd from './spacing.module.css'; }
.fontBold { composes: fontBold from './typography.module.css'; }
```

```css
/* Button.module.css - cleaner imports */
.button {
  composes: colorPrimary spacingMd fontBold from '../tokens/index.module.css';
}
```

## Avoiding Circular Dependencies

### Problem

```css
/* a.module.css */
.classA {
  composes: classB from './b.module.css';
}

/* b.module.css */
.classB {
  composes: classA from './a.module.css'; /* Circular! */
}
```

### Solution - Extract Shared

```css
/* shared.module.css */
.base {
  /* shared properties */
}

/* a.module.css */
.classA {
  composes: base from './shared.module.css';
}

/* b.module.css */
.classB {
  composes: base from './shared.module.css';
}
```

## Property Conflicts

When composing, property order matters:

```css
/* base.module.css */
.base {
  color: red;
  background: white;
}

/* Button.module.css */
.button {
  composes: base from './base.module.css';
  color: blue; /* Overrides red from base */
  /* background remains white */
}
```

**Cross-file conflict (undefined order):**

```css
.button {
  composes: styleA from './a.module.css';
  composes: styleB from './b.module.css';
  /* If both define 'color', result is undefined */
}
```

**Solution:** Avoid conflicting properties or be explicit:

```css
.button {
  composes: styleA from './a.module.css';
  composes: styleB from './b.module.css';
  color: blue; /* Explicitly set to avoid ambiguity */
}
```

## Testing Composed Styles

```typescript
import styles from './Button.module.css';

// Composed classes result in multiple class names
console.log(styles.button);
// Output: "Button_button__abc123 shared_base__def456 tokens_spacing__ghi789"

// Test that composition includes expected classes
expect(styles.button).toContain('base');
expect(styles.button).toContain('spacing');
```

## Performance Considerations

1. **Build time** - Composition resolved at build time, no runtime cost
2. **Output size** - Each composed class adds to the className string
3. **Specificity** - All composed classes have equal specificity
4. **Caching** - Shared modules cached by bundler
