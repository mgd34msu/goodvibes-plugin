---
name: tailwindcss
description: Styles web applications with Tailwind CSS using utility classes, responsive design, custom themes, and component patterns. Use when setting up Tailwind, creating layouts, implementing responsive designs, or customizing themes.
---

# Tailwind CSS

Utility-first CSS framework for rapidly building custom designs without writing CSS.

## Quick Start

**Install with Vite:**
```bash
npm install -D tailwindcss postcss autoprefixer
npx tailwindcss init -p
```

**Configure tailwind.config.js:**
```javascript
/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {},
  },
  plugins: [],
}
```

**Add to CSS:**
```css
/* src/index.css */
@tailwind base;
@tailwind components;
@tailwind utilities;
```

## Core Concepts

### Utility Classes

```html
<!-- Instead of custom CSS -->
<div class="flex items-center justify-between p-4 bg-white rounded-lg shadow-md">
  <h2 class="text-xl font-semibold text-gray-800">Title</h2>
  <button class="px-4 py-2 text-white bg-blue-500 rounded hover:bg-blue-600">
    Action
  </button>
</div>
```

### Responsive Design

Mobile-first breakpoints:

| Prefix | Min Width | CSS |
|--------|-----------|-----|
| (none) | 0px | Default (mobile) |
| sm | 640px | @media (min-width: 640px) |
| md | 768px | @media (min-width: 768px) |
| lg | 1024px | @media (min-width: 1024px) |
| xl | 1280px | @media (min-width: 1280px) |
| 2xl | 1536px | @media (min-width: 1536px) |

```html
<!-- Stack on mobile, row on md+ -->
<div class="flex flex-col md:flex-row gap-4">
  <div class="w-full md:w-1/3">Sidebar</div>
  <div class="w-full md:w-2/3">Content</div>
</div>
```

### State Variants

```html
<!-- Hover -->
<button class="bg-blue-500 hover:bg-blue-600">Hover me</button>

<!-- Focus -->
<input class="border focus:border-blue-500 focus:ring-2 focus:ring-blue-200" />

<!-- Active -->
<button class="bg-blue-500 active:bg-blue-700">Click me</button>

<!-- Disabled -->
<button class="bg-blue-500 disabled:bg-gray-400 disabled:cursor-not-allowed">
  Disabled
</button>

<!-- Group hover -->
<div class="group">
  <h3 class="group-hover:text-blue-500">Title</h3>
  <p class="group-hover:text-gray-600">Description</p>
</div>

<!-- Peer state -->
<input class="peer" type="checkbox" />
<span class="peer-checked:text-green-500">Checked!</span>
```

### Dark Mode

```javascript
// tailwind.config.js
export default {
  darkMode: 'class', // or 'media'
}
```

```html
<div class="bg-white dark:bg-gray-800 text-gray-900 dark:text-white">
  Content adapts to dark mode
</div>
```

## Layout

### Flexbox

```html
<!-- Centered content -->
<div class="flex items-center justify-center h-screen">
  Centered
</div>

<!-- Space between -->
<div class="flex justify-between items-center">
  <span>Left</span>
  <span>Right</span>
</div>

<!-- Wrap items -->
<div class="flex flex-wrap gap-4">
  <div class="w-32 h-32 bg-blue-500"></div>
  <div class="w-32 h-32 bg-blue-500"></div>
  <div class="w-32 h-32 bg-blue-500"></div>
</div>

<!-- Column layout -->
<div class="flex flex-col gap-4">
  <div>Item 1</div>
  <div>Item 2</div>
</div>
```

### Grid

```html
<!-- Basic grid -->
<div class="grid grid-cols-3 gap-4">
  <div>1</div>
  <div>2</div>
  <div>3</div>
</div>

<!-- Responsive grid -->
<div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
  <div>Card 1</div>
  <div>Card 2</div>
  <div>Card 3</div>
  <div>Card 4</div>
</div>

<!-- Column span -->
<div class="grid grid-cols-4 gap-4">
  <div class="col-span-2">Spans 2 columns</div>
  <div>1 column</div>
  <div>1 column</div>
</div>

<!-- Auto-fill responsive -->
<div class="grid grid-cols-[repeat(auto-fill,minmax(250px,1fr))] gap-4">
  <!-- Items auto-fit to container -->
</div>
```

### Container

```html
<!-- Centered container -->
<div class="container mx-auto px-4">
  Content
</div>

<!-- With max-width -->
<div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
  Content
</div>
```

## Spacing

### Padding & Margin

```html
<!-- All sides -->
<div class="p-4">Padding 1rem</div>
<div class="m-4">Margin 1rem</div>

<!-- Specific sides -->
<div class="pt-4 pb-2 px-6">Top, bottom, horizontal</div>
<div class="mt-4 mb-2 mx-auto">Margin variations</div>

<!-- Negative margin -->
<div class="-mt-4">Negative top margin</div>

<!-- Space between children -->
<div class="space-y-4">
  <div>Item 1</div>
  <div>Item 2</div>
  <div>Item 3</div>
</div>
```

### Sizing

```html
<!-- Width -->
<div class="w-full">100%</div>
<div class="w-1/2">50%</div>
<div class="w-64">16rem (256px)</div>
<div class="w-screen">100vw</div>
<div class="max-w-md">Max 28rem</div>
<div class="min-w-0">Min 0</div>

<!-- Height -->
<div class="h-screen">100vh</div>
<div class="h-full">100%</div>
<div class="min-h-screen">Min 100vh</div>
```

## Typography

```html
<!-- Font size -->
<p class="text-xs">Extra small</p>
<p class="text-sm">Small</p>
<p class="text-base">Base (1rem)</p>
<p class="text-lg">Large</p>
<p class="text-xl">Extra large</p>
<p class="text-2xl">2x large</p>

<!-- Font weight -->
<p class="font-light">Light</p>
<p class="font-normal">Normal</p>
<p class="font-medium">Medium</p>
<p class="font-semibold">Semibold</p>
<p class="font-bold">Bold</p>

<!-- Text color -->
<p class="text-gray-500">Gray 500</p>
<p class="text-blue-600">Blue 600</p>

<!-- Line height -->
<p class="leading-tight">Tight line height</p>
<p class="leading-relaxed">Relaxed line height</p>

<!-- Text alignment -->
<p class="text-left">Left</p>
<p class="text-center">Center</p>
<p class="text-right">Right</p>

<!-- Text decoration -->
<p class="underline">Underlined</p>
<p class="line-through">Strikethrough</p>

<!-- Truncate -->
<p class="truncate">Long text that will be truncated...</p>
<p class="line-clamp-2">Multi-line truncation...</p>
```

## Colors

### Background & Text

```html
<!-- Solid colors -->
<div class="bg-blue-500 text-white">Blue background</div>
<div class="bg-gray-100 text-gray-800">Light gray</div>

<!-- Opacity -->
<div class="bg-blue-500/50">50% opacity</div>
<div class="text-gray-900/75">75% opacity</div>

<!-- Gradient -->
<div class="bg-gradient-to-r from-blue-500 to-purple-500">
  Gradient
</div>
<div class="bg-gradient-to-br from-pink-500 via-red-500 to-yellow-500">
  Three-color gradient
</div>
```

### Border

```html
<!-- Border color -->
<div class="border border-gray-300">Default border</div>
<div class="border-2 border-blue-500">Blue border</div>
<div class="border-l-4 border-blue-500">Left accent</div>

<!-- Border radius -->
<div class="rounded">0.25rem</div>
<div class="rounded-lg">0.5rem</div>
<div class="rounded-full">Full circle</div>
<div class="rounded-t-lg">Top only</div>
```

## Effects

### Shadows

```html
<div class="shadow-sm">Small shadow</div>
<div class="shadow">Default shadow</div>
<div class="shadow-md">Medium shadow</div>
<div class="shadow-lg">Large shadow</div>
<div class="shadow-xl">Extra large shadow</div>
<div class="shadow-2xl">2XL shadow</div>
```

### Opacity

```html
<div class="opacity-50">50% opacity</div>
<div class="opacity-75">75% opacity</div>
<div class="hover:opacity-100">Hover for full opacity</div>
```

### Transitions

```html
<!-- Basic transition -->
<button class="transition-colors duration-200 bg-blue-500 hover:bg-blue-600">
  Smooth color change
</button>

<!-- Transform -->
<div class="transition-transform hover:scale-105 hover:-translate-y-1">
  Lift on hover
</div>

<!-- All properties -->
<div class="transition-all duration-300 ease-in-out">
  Animate everything
</div>
```

## Component Patterns

### Card

```html
<div class="bg-white rounded-lg shadow-md overflow-hidden">
  <img class="w-full h-48 object-cover" src="image.jpg" alt="" />
  <div class="p-6">
    <h3 class="text-xl font-semibold mb-2">Card Title</h3>
    <p class="text-gray-600 mb-4">Card description goes here.</p>
    <button class="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600">
      Action
    </button>
  </div>
</div>
```

### Button Variants

```html
<!-- Primary -->
<button class="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 focus:ring-2 focus:ring-blue-300 focus:outline-none transition-colors">
  Primary
</button>

<!-- Secondary -->
<button class="px-4 py-2 bg-gray-200 text-gray-800 rounded-lg hover:bg-gray-300 focus:ring-2 focus:ring-gray-300 focus:outline-none transition-colors">
  Secondary
</button>

<!-- Outline -->
<button class="px-4 py-2 border-2 border-blue-500 text-blue-500 rounded-lg hover:bg-blue-50 focus:ring-2 focus:ring-blue-300 focus:outline-none transition-colors">
  Outline
</button>

<!-- Ghost -->
<button class="px-4 py-2 text-blue-500 rounded-lg hover:bg-blue-50 focus:ring-2 focus:ring-blue-300 focus:outline-none transition-colors">
  Ghost
</button>
```

### Input

```html
<div class="space-y-2">
  <label class="block text-sm font-medium text-gray-700">
    Email
  </label>
  <input
    type="email"
    class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-colors"
    placeholder="you@example.com"
  />
  <p class="text-sm text-gray-500">We'll never share your email.</p>
</div>
```

### Badge

```html
<span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
  Badge
</span>

<span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
  Success
</span>

<span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800">
  Error
</span>
```

### Alert

```html
<div class="p-4 bg-blue-50 border-l-4 border-blue-500 text-blue-700">
  <p class="font-medium">Information</p>
  <p class="text-sm">This is an informational alert.</p>
</div>

<div class="p-4 bg-red-50 border-l-4 border-red-500 text-red-700">
  <p class="font-medium">Error</p>
  <p class="text-sm">Something went wrong.</p>
</div>
```

## Custom Configuration

### Extend Theme

```javascript
// tailwind.config.js
export default {
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#f0f9ff',
          500: '#3b82f6',
          900: '#1e3a8a',
        },
      },
      fontFamily: {
        sans: ['Inter', 'sans-serif'],
      },
      spacing: {
        '128': '32rem',
      },
      borderRadius: {
        '4xl': '2rem',
      },
    },
  },
}
```

### Custom Utilities

```javascript
// tailwind.config.js
export default {
  plugins: [
    function({ addUtilities }) {
      addUtilities({
        '.text-shadow': {
          'text-shadow': '2px 2px 4px rgba(0, 0, 0, 0.1)',
        },
      });
    },
  ],
}
```

### @apply in CSS

```css
/* Create reusable component classes */
@layer components {
  .btn {
    @apply px-4 py-2 rounded-lg font-medium transition-colors;
  }

  .btn-primary {
    @apply bg-blue-500 text-white hover:bg-blue-600;
  }

  .input {
    @apply w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none;
  }
}
```

## Plugins

### Official Plugins

```bash
npm install @tailwindcss/forms @tailwindcss/typography @tailwindcss/aspect-ratio
```

```javascript
// tailwind.config.js
export default {
  plugins: [
    require('@tailwindcss/forms'),
    require('@tailwindcss/typography'),
    require('@tailwindcss/aspect-ratio'),
  ],
}
```

### Typography Plugin

```html
<article class="prose lg:prose-xl">
  <h1>Article Title</h1>
  <p>Paragraph with <a href="#">links</a> and formatting.</p>
  <ul>
    <li>List item 1</li>
    <li>List item 2</li>
  </ul>
</article>
```

## Best Practices

1. **Mobile-first** - Start with mobile styles, add breakpoint prefixes for larger screens
2. **Use design tokens** - Extend theme for consistent colors, spacing
3. **Extract components** - Use @apply for repeated patterns
4. **Purge unused CSS** - Configure content paths correctly
5. **Avoid arbitrary values** - Use theme values when possible

## Common Mistakes

| Mistake | Fix |
|---------|-----|
| Not configuring content | Add all file paths to content array |
| Overusing @apply | Only for truly repeated patterns |
| Ignoring responsive design | Use breakpoint prefixes |
| Custom CSS instead of utilities | Use Tailwind utilities first |
| Not using dark mode | Add dark: variants |

## Reference Files

- [references/responsive.md](references/responsive.md) - Responsive patterns
- [references/components.md](references/components.md) - Common component patterns
- [references/configuration.md](references/configuration.md) - Advanced configuration
