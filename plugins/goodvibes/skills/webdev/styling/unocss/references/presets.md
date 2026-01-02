# UnoCSS Presets

Pre-configured rule bundles for common use cases.

## Official Presets

### preset-uno

Default preset with Tailwind/Windi/Bootstrap compatibility:

```typescript
import { defineConfig, presetUno } from 'unocss';

export default defineConfig({
  presets: [
    presetUno({
      // Options
      dark: 'class', // or 'media'
      variablePrefix: 'un-',
      prefix: '',
    }),
  ],
});
```

Supports:
- Tailwind: `ml-3`, `text-blue-500`, `flex`
- Windi: `mt-10px`, `text-red-500/80`
- Bootstrap: `ms-2`, `fw-bold`
- Tachyons: `ma4`, `ph3`

### preset-wind

Tailwind CSS compatible:

```typescript
import { defineConfig, presetWind } from 'unocss';

export default defineConfig({
  presets: [
    presetWind({
      // Tailwind v4 compat mode
      // experimentalV4: true,
    }),
  ],
});
```

### preset-mini

Minimal essential utilities:

```typescript
import { defineConfig, presetMini } from 'unocss';

export default defineConfig({
  presets: [
    presetMini({
      dark: 'class',
    }),
  ],
});
```

Includes:
- Colors, spacing, sizing
- Flexbox, grid basics
- Text utilities
- No arbitrary values support

### preset-icons

Pure CSS icons from 100+ icon sets:

```bash
# Install icon collections
npm install -D @iconify-json/heroicons
npm install -D @iconify-json/lucide
npm install -D @iconify-json/mdi
npm install -D @iconify-json/simple-icons
```

```typescript
import { defineConfig, presetIcons } from 'unocss';

export default defineConfig({
  presets: [
    presetIcons({
      scale: 1.2,
      cdn: 'https://esm.sh/',
      extraProperties: {
        display: 'inline-block',
        'vertical-align': 'middle',
      },
      collections: {
        // Custom icon collection
        custom: {
          logo: '<svg>...</svg>',
        },
      },
    }),
  ],
});
```

Usage:
```html
<span class="i-heroicons-check-circle" />
<span class="i-lucide-settings text-2xl text-gray-500" />
<span class="i-mdi-home hover:i-mdi-home-outline" />
<span class="i-custom-logo" />
```

### preset-attributify

Use HTML attributes for styling:

```typescript
import { defineConfig, presetAttributify, presetUno } from 'unocss';

export default defineConfig({
  presets: [
    presetAttributify({
      prefix: 'un-',  // Optional prefix
      prefixedOnly: false,
      strict: false,
    }),
    presetUno(),
  ],
});
```

Usage:
```html
<button
  bg="blue-500 hover:blue-600"
  text="white sm"
  font="bold"
  p="x-4 y-2"
  border="rounded-lg"
  flex="~ items-center gap-2"
>
  <span i-heroicons-check />
  Confirm
</button>
```

### preset-typography

Prose/article styling:

```typescript
import { defineConfig, presetTypography } from 'unocss';

export default defineConfig({
  presets: [
    presetTypography({
      // Custom element styles
      cssExtend: {
        'a': {
          color: '#3b82f6',
          'text-decoration': 'underline',
        },
        'code': {
          background: '#f3f4f6',
          padding: '0.25rem 0.5rem',
          'border-radius': '0.25rem',
        },
      },
    }),
  ],
});
```

Usage:
```html
<article class="prose prose-lg dark:prose-invert max-w-none">
  <h1>Article Title</h1>
  <p>Beautifully styled content...</p>
</article>
```

### preset-web-fonts

Web font loading:

```typescript
import { defineConfig, presetWebFonts } from 'unocss';

export default defineConfig({
  presets: [
    presetWebFonts({
      provider: 'google',
      fonts: {
        sans: 'Inter:400,500,600,700',
        mono: 'Fira Code:400,600',
        display: {
          name: 'Poppins',
          weights: ['400', '600', '700'],
        },
      },
    }),
  ],
});
```

Usage:
```html
<p class="font-sans">Inter text</p>
<code class="font-mono">Fira Code</code>
<h1 class="font-display">Poppins heading</h1>
```

### preset-tagify

Use tags instead of classes:

```typescript
import { defineConfig, presetTagify } from 'unocss';

export default defineConfig({
  presets: [
    presetTagify({
      prefix: 'un-',
    }),
  ],
});
```

Usage:
```html
<un-flex>
  <un-text-lg>Large text</un-text-lg>
  <un-bg-blue-500 un-p-4>Blue box</un-bg-blue-500>
</un-flex>
```

## Creating Custom Presets

```typescript
import { Preset } from 'unocss';

function myPreset(): Preset {
  return {
    name: 'my-preset',

    // Rules
    rules: [
      ['custom-class', { color: 'red' }],
      [/^m-(\d+)$/, ([, d]) => ({ margin: `${d}px` })],
    ],

    // Shortcuts
    shortcuts: {
      btn: 'px-4 py-2 rounded-lg',
    },

    // Variants
    variants: [
      // Custom variant
    ],

    // Theme
    theme: {
      colors: {
        brand: '#ff0000',
      },
    },

    // Preflights (global styles)
    preflights: [
      {
        getCSS: () => `
          body { font-family: system-ui; }
        `,
      },
    ],
  };
}

// Use
export default defineConfig({
  presets: [
    myPreset(),
    presetUno(),
  ],
});
```

## Combining Presets

```typescript
import {
  defineConfig,
  presetUno,
  presetAttributify,
  presetIcons,
  presetTypography,
  presetWebFonts,
} from 'unocss';

export default defineConfig({
  presets: [
    presetUno(),
    presetAttributify(),
    presetIcons({
      scale: 1.2,
    }),
    presetTypography(),
    presetWebFonts({
      fonts: {
        sans: 'Inter',
      },
    }),
  ],
});
```

## Preset Order

Later presets override earlier ones:

```typescript
export default defineConfig({
  presets: [
    presetMini(),     // Base
    presetUno(),      // Extends mini
    myCustomPreset(), // Can override both
  ],
});
```

## Disabling Default Preset

```typescript
// Only use specified presets
export default defineConfig({
  presets: [
    // No presetUno() means no defaults
    presetMini(),
  ],
});
```
