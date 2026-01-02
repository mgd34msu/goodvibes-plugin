# Sass Module System

Modern @use and @forward module system.

## @use Rule

### Basic Import

```scss
// _colors.scss
$primary: #3b82f6;
$secondary: #6b7280;

@function get-color($name) {
  @if $name == 'primary' { @return $primary; }
  @if $name == 'secondary' { @return $secondary; }
}

// main.scss
@use 'colors';

.button {
  background: colors.$primary;
  color: colors.get-color('secondary');
}
```

### Custom Namespace

```scss
// Short alias
@use 'design-tokens/colors' as c;
.element { color: c.$primary; }

// No namespace (use sparingly)
@use 'colors' as *;
.element { color: $primary; }
```

### Private Members

```scss
// _internal.scss
// Prefix with _ or - for private
$-internal-value: 100px;
$_also-private: 200px;
$public-value: 300px;

// Using file - only $public-value is accessible
@use 'internal';
.element {
  width: internal.$public-value; // Works
  // width: internal.$-internal-value; // Error!
}
```

## @forward Rule

### Re-exporting

```scss
// _tokens/_colors.scss
$primary: #3b82f6;
$secondary: #6b7280;

// _tokens/_spacing.scss
$sm: 8px;
$md: 16px;
$lg: 24px;

// _tokens/_index.scss
@forward 'colors';
@forward 'spacing';

// main.scss - single import gets all
@use 'tokens';

.card {
  padding: tokens.$md;
  background: tokens.$primary;
}
```

### Controlling Visibility

```scss
// Only expose specific members
@forward 'colors' show $primary, $secondary;

// Hide specific members
@forward 'colors' hide $internal-color;
```

### Adding Prefix

```scss
// _tokens/_index.scss
@forward 'colors' as color-*;
@forward 'spacing' as space-*;

// main.scss
@use 'tokens';

.element {
  color: tokens.$color-primary;
  padding: tokens.$space-md;
}
```

## Module Configuration

### Default Values

```scss
// _config.scss
$border-radius: 4px !default;
$primary-color: blue !default;
$font-family: sans-serif !default;
```

### Configuring at Use

```scss
// main.scss
@use 'config' with (
  $border-radius: 8px,
  $primary-color: #3b82f6
);

.button {
  border-radius: config.$border-radius;
  background: config.$primary-color;
}
```

### Forwarding with Configuration

```scss
// _library/_config.scss
$primary: blue !default;
$secondary: gray !default;

// _library/_index.scss
@forward 'config';

// main.scss
@use 'library' with (
  $primary: #3b82f6
);
```

## Built-in Modules

```scss
@use 'sass:math';
@use 'sass:string';
@use 'sass:color';
@use 'sass:list';
@use 'sass:map';
@use 'sass:selector';
@use 'sass:meta';

// Math
$width: math.div(100%, 3);
$clamped: math.clamp(10px, 5vw, 50px);
$rounded: math.round(10.6);

// String
$upper: string.to-upper-case('hello');
$length: string.length('hello');

// Color
$lighter: color.adjust($primary, $lightness: 20%);
$mixed: color.mix($primary, $secondary, 50%);

// List
$first: list.nth($items, 1);
$joined: list.join($a, $b);

// Map
$value: map.get($colors, 'primary');
$merged: map.merge($base, $overrides);
$keys: map.keys($colors);
```

## File Resolution

### Partials

```
styles/
  _variables.scss    # Partial (won't compile alone)
  _mixins.scss       # Partial
  main.scss          # Entry point (compiles)
```

### Index Files

```
styles/
  tokens/
    _colors.scss
    _spacing.scss
    _index.scss      # Auto-loaded when importing 'tokens'
  main.scss
```

```scss
// main.scss
@use 'tokens';  // Loads tokens/_index.scss
```

### Load Paths

```bash
# Sass CLI
sass --load-path=node_modules main.scss output.css

# Vite/Webpack config
sassOptions: {
  includePaths: ['node_modules']
}
```

## Migration from @import

### Before (deprecated)

```scss
// old-style.scss
@import 'variables';
@import 'mixins';

// Variables are global
.element {
  color: $primary;
  @include button;
}
```

### After (modern)

```scss
// new-style.scss
@use 'variables' as v;
@use 'mixins' as m;

// Variables are namespaced
.element {
  color: v.$primary;
  @include m.button;
}
```

### Migration Tool

```bash
npm install -g sass-migrator
sass-migrator module --migrate-deps main.scss
```

## Module Patterns

### Central Export

```scss
// _index.scss (library entry point)
@forward 'tokens';
@forward 'mixins';
@forward 'functions';

// Consumer
@use 'library';

.element {
  @include library.flex-center;
  color: library.$primary;
}
```

### Configuration Layer

```scss
// _theme.scss
$colors: () !default;
$spacing: () !default;

$-defaults: (
  'colors': (
    'primary': blue,
    'secondary': gray,
  ),
  'spacing': (
    'sm': 8px,
    'md': 16px,
  ),
);

$theme: map.deep-merge($-defaults, (
  'colors': $colors,
  'spacing': $spacing,
));

// Consumer
@use 'theme' with (
  $colors: (
    'primary': #3b82f6,
  ),
);
```

### Scoped Dependencies

```scss
// _button.scss
@use 'tokens' as t;
@use 'mixins' as m;

.button {
  @include m.reset-button;
  padding: t.$spacing-md;
  background: t.$color-primary;
}
```

## Common Issues

### Circular Dependencies

```scss
// Avoid: a.scss uses b.scss, b.scss uses a.scss

// Solution: Extract shared code
// _shared.scss - common dependencies
// _a.scss - uses shared
// _b.scss - uses shared
```

### Double Loading

```scss
// Module only loads once, even if @use'd multiple times

// _config.scss
$counter: 0;

// Will only run once, $counter stays 0
@use 'config';
@use 'config';
```
