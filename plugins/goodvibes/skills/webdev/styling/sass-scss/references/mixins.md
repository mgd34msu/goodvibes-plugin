# Sass Mixins Library

Reusable mixin patterns for common styling needs.

## Layout Mixins

### Flexbox

```scss
@mixin flex($direction: row, $align: stretch, $justify: flex-start) {
  display: flex;
  flex-direction: $direction;
  align-items: $align;
  justify-content: $justify;
}

@mixin flex-center {
  display: flex;
  align-items: center;
  justify-content: center;
}

@mixin flex-between {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

// Usage
.container {
  @include flex(column, center, center);
}

.header {
  @include flex-between;
}
```

### Grid

```scss
@mixin grid($columns: 1, $gap: 16px) {
  display: grid;
  grid-template-columns: repeat($columns, 1fr);
  gap: $gap;
}

@mixin grid-auto($min-width: 250px, $gap: 16px) {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax($min-width, 1fr));
  gap: $gap;
}

// Usage
.products {
  @include grid-auto(300px, 24px);
}
```

### Container

```scss
@mixin container($max-width: 1200px, $padding: 16px) {
  width: 100%;
  max-width: $max-width;
  margin-left: auto;
  margin-right: auto;
  padding-left: $padding;
  padding-right: $padding;
}
```

## Responsive Mixins

### Breakpoints

```scss
$breakpoints: (
  'xs': 0,
  'sm': 640px,
  'md': 768px,
  'lg': 1024px,
  'xl': 1280px,
  '2xl': 1536px,
);

@mixin breakpoint-up($name) {
  $value: map-get($breakpoints, $name);
  @if $value == 0 {
    @content;
  } @else {
    @media (min-width: $value) {
      @content;
    }
  }
}

@mixin breakpoint-down($name) {
  $value: map-get($breakpoints, $name);
  @media (max-width: $value - 1px) {
    @content;
  }
}

@mixin breakpoint-between($min, $max) {
  $min-value: map-get($breakpoints, $min);
  $max-value: map-get($breakpoints, $max);
  @media (min-width: $min-value) and (max-width: $max-value - 1px) {
    @content;
  }
}

// Usage
.sidebar {
  display: none;

  @include breakpoint-up('lg') {
    display: block;
    width: 300px;
  }
}
```

### Hide/Show

```scss
@mixin hide-on($breakpoint) {
  @include breakpoint-up($breakpoint) {
    display: none !important;
  }
}

@mixin show-on($breakpoint) {
  display: none !important;

  @include breakpoint-up($breakpoint) {
    display: block !important;
  }
}
```

## Typography Mixins

### Font Styles

```scss
@mixin heading($size: 24px, $weight: 700) {
  font-size: $size;
  font-weight: $weight;
  line-height: 1.2;
}

@mixin body-text($size: 16px) {
  font-size: $size;
  line-height: 1.6;
}

@mixin truncate($lines: 1) {
  @if $lines == 1 {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  } @else {
    display: -webkit-box;
    -webkit-line-clamp: $lines;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }
}

// Usage
.title {
  @include heading(32px);
  @include truncate(2);
}
```

### Font Face

```scss
@mixin font-face($name, $path, $weight: 400, $style: normal) {
  @font-face {
    font-family: $name;
    font-weight: $weight;
    font-style: $style;
    font-display: swap;
    src: url('#{$path}.woff2') format('woff2'),
         url('#{$path}.woff') format('woff');
  }
}

// Usage
@include font-face('Inter', '/fonts/Inter-Regular', 400);
@include font-face('Inter', '/fonts/Inter-Bold', 700);
```

## Visual Mixins

### Shadows

```scss
@mixin shadow($level: 1) {
  @if $level == 1 {
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.12);
  } @else if $level == 2 {
    box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
  } @else if $level == 3 {
    box-shadow: 0 10px 25px rgba(0, 0, 0, 0.15);
  }
}

// Usage
.card {
  @include shadow(2);

  &:hover {
    @include shadow(3);
  }
}
```

### Gradients

```scss
@mixin gradient($start, $end, $direction: to right) {
  background: linear-gradient($direction, $start, $end);
}

@mixin gradient-text($start, $end) {
  background: linear-gradient(to right, $start, $end);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}
```

### Overlay

```scss
@mixin overlay($color: black, $opacity: 0.5) {
  position: relative;

  &::before {
    content: '';
    position: absolute;
    inset: 0;
    background: rgba($color, $opacity);
    pointer-events: none;
  }
}
```

## Interactive Mixins

### Transitions

```scss
@mixin transition($properties: all, $duration: 0.2s, $timing: ease) {
  transition-property: $properties;
  transition-duration: $duration;
  transition-timing-function: $timing;
}

// Usage
.button {
  @include transition(background-color, 0.15s, ease-out);
}
```

### Focus Styles

```scss
@mixin focus-ring($color: #3b82f6, $offset: 2px) {
  &:focus {
    outline: none;
  }

  &:focus-visible {
    outline: 2px solid $color;
    outline-offset: $offset;
  }
}

// Usage
.button {
  @include focus-ring;
}
```

### Hover Effect

```scss
@mixin hover-lift($distance: -2px, $shadow: true) {
  transition: transform 0.2s ease, box-shadow 0.2s ease;

  &:hover {
    transform: translateY($distance);

    @if $shadow {
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
    }
  }
}
```

## Utility Mixins

### Reset Buttons

```scss
@mixin reset-button {
  appearance: none;
  background: transparent;
  border: none;
  padding: 0;
  margin: 0;
  font: inherit;
  color: inherit;
  cursor: pointer;

  &:focus {
    outline: none;
  }
}
```

### Visually Hidden

```scss
@mixin visually-hidden {
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

### Aspect Ratio

```scss
@mixin aspect-ratio($width, $height) {
  aspect-ratio: #{$width} / #{$height};

  // Fallback for older browsers
  @supports not (aspect-ratio: 1) {
    &::before {
      content: '';
      float: left;
      padding-top: percentage($height / $width);
    }

    &::after {
      content: '';
      display: block;
      clear: both;
    }
  }
}
```

### Scrollbar Styling

```scss
@mixin custom-scrollbar($width: 8px, $thumb: #888, $track: #f1f1f1) {
  &::-webkit-scrollbar {
    width: $width;
    height: $width;
  }

  &::-webkit-scrollbar-track {
    background: $track;
  }

  &::-webkit-scrollbar-thumb {
    background: $thumb;
    border-radius: $width / 2;
  }

  scrollbar-width: thin;
  scrollbar-color: $thumb $track;
}
```

## Pattern Mixins

### Card Component

```scss
@mixin card($padding: 16px, $radius: 8px, $shadow: 1) {
  padding: $padding;
  border-radius: $radius;
  background: white;
  @include shadow($shadow);
}
```

### Button Base

```scss
@mixin button-base {
  @include reset-button;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 12px 24px;
  border-radius: 8px;
  font-weight: 600;
  @include transition(background-color, transform);
  @include focus-ring;

  &:active {
    transform: scale(0.98);
  }

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
}
```
