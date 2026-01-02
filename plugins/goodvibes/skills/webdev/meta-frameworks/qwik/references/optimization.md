# Qwik Optimization

## Bundle Analysis

```bash
# Build with stats
npm run build -- --stats

# Analyze bundle
npx vite-bundle-visualizer
```

## Code Splitting Strategies

### Component Level

```tsx
// Each component$ is its own chunk
export const HeavyChart = component$(() => {
  // This code only loads when component renders
  return <Chart data={data} />;
});
```

### Event Handler Level

```tsx
export default component$(() => {
  return (
    <button onClick$={async () => {
      // Chart library loads on click
      const { Chart } = await import('chart.js');
      new Chart(canvas, config);
    }}>
      Show Chart
    </button>
  );
});
```

### Route Level

```
# Each route is automatically split
src/routes/
  index.tsx      # Chunk A
  about/
    index.tsx    # Chunk B
  products/
    index.tsx    # Chunk C
```

## Lazy Loading Third-Party Libraries

```tsx
import { component$, useVisibleTask$, useSignal } from '@builder.io/qwik';

export default component$(() => {
  const mapContainer = useSignal<HTMLElement>();

  useVisibleTask$(async () => {
    // Load library only when needed
    const L = await import('leaflet');

    if (mapContainer.value) {
      const map = L.map(mapContainer.value).setView([51.505, -0.09], 13);
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(map);
    }
  });

  return <div ref={mapContainer} style={{ height: '400px' }} />;
});
```

## Image Optimization

```tsx
import { component$ } from '@builder.io/qwik';

export default component$(() => {
  return (
    <picture>
      <source
        srcset="/images/hero.avif"
        type="image/avif"
      />
      <source
        srcset="/images/hero.webp"
        type="image/webp"
      />
      <img
        src="/images/hero.jpg"
        alt="Hero"
        width={1200}
        height={600}
        loading="lazy"
        decoding="async"
      />
    </picture>
  );
});
```

## Minimize useVisibleTask$

```tsx
// BAD - Runs on every page load
useVisibleTask$(() => {
  // Initialize analytics
});

// GOOD - Use routeLoader$ for data
export const useAnalytics = routeLoader$(async () => {
  return getAnalyticsConfig();
});

// GOOD - Use event handlers for interactions
<button onClick$={() => trackClick()}>Click</button>
```

## Serialization Optimization

```tsx
import { component$, useSignal, noSerialize, NoSerialize } from '@builder.io/qwik';

export default component$(() => {
  // Mark non-serializable objects
  const ws = useSignal<NoSerialize<WebSocket>>();

  useVisibleTask$(() => {
    ws.value = noSerialize(new WebSocket('wss://example.com'));

    return () => ws.value?.close();
  });

  return <div>WebSocket connected</div>;
});
```

## Prefetch Strategies

```tsx
// vite.config.ts
import { qwikCity } from '@builder.io/qwik-city/vite';

export default defineConfig({
  plugins: [
    qwikCity({
      // Prefetch strategy
      prefetch: {
        strategy: 'speed', // 'speed' | 'none'
        symbolsEndpoint: 'auto',
      },
    }),
  ],
});
```

## Reducing Initial Payload

```tsx
// Move heavy initialization to events
export default component$(() => {
  const editor = useSignal<EditorInstance>();

  return (
    <div
      onClick$={async () => {
        if (!editor.value) {
          // Load editor on first interaction
          const { createEditor } = await import('./editor');
          editor.value = createEditor();
        }
        editor.value.focus();
      }}
    >
      Click to edit
    </div>
  );
});
```

## Service Worker Configuration

```typescript
// src/routes/service-worker.ts
import { setupServiceWorker } from '@builder.io/qwik-city/service-worker';

setupServiceWorker();

addEventListener('install', () => self.skipWaiting());
addEventListener('activate', () => self.clients.claim());
```

## Performance Monitoring

```tsx
import { component$ } from '@builder.io/qwik';
import { routeLoader$ } from '@builder.io/qwik-city';

export const onRequest = ({ request, next, platform }) => {
  const start = Date.now();

  return next().then((response) => {
    const duration = Date.now() - start;
    console.log(`${request.url} - ${duration}ms`);
    return response;
  });
};
```
