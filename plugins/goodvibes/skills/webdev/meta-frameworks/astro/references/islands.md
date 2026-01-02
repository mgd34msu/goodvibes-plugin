# Astro Islands Architecture

## Core Concept

Islands architecture renders most of your page as static HTML, with isolated "islands" of interactivity that hydrate independently.

```
┌─────────────────────────────────────────┐
│  Static HTML (no JS)                    │
│  ┌─────────────────────────────────┐    │
│  │  Header (static)                │    │
│  └─────────────────────────────────┘    │
│                                         │
│  ┌──────────┐  ┌────────────────────┐   │
│  │  Island  │  │  Static Content    │   │
│  │  (React) │  │                    │   │
│  │  client: │  │                    │   │
│  │  load    │  │                    │   │
│  └──────────┘  └────────────────────┘   │
│                                         │
│  ┌─────────────────────────────────┐    │
│  │  Island (Vue)                   │    │
│  │  client:visible                 │    │
│  └─────────────────────────────────┘    │
│                                         │
│  Footer (static)                        │
└─────────────────────────────────────────┘
```

## Client Directives

### client:load

Loads and hydrates immediately on page load.

```astro
---
import Counter from '../components/Counter.tsx';
---

<!-- Critical interactive component above the fold -->
<Counter client:load initialCount={0} />
```

**Use for:**
- Above-the-fold interactive content
- Navigation menus with dropdowns
- Critical forms
- Components users interact with immediately

### client:idle

Loads after the main thread is idle (using `requestIdleCallback`).

```astro
---
import Newsletter from '../components/Newsletter.tsx';
---

<!-- Non-critical but visible component -->
<Newsletter client:idle />
```

**Use for:**
- Secondary interactive elements
- Components that don't need immediate interaction
- Analytics widgets
- Social share buttons

### client:visible

Loads when the component enters the viewport (using `IntersectionObserver`).

```astro
---
import Comments from '../components/Comments.tsx';
---

<!-- Below-the-fold interactive component -->
<Comments client:visible postId={post.id} />
```

**Use for:**
- Below-the-fold content
- Comment sections
- Related posts carousels
- Any component not immediately visible

**With rootMargin:**
```astro
<!-- Load 200px before entering viewport -->
<HeavyComponent client:visible={{ rootMargin: '200px' }} />
```

### client:media

Loads when a media query matches.

```astro
---
import MobileNav from '../components/MobileNav.tsx';
import DesktopNav from '../components/DesktopNav.tsx';
---

<!-- Only load on mobile -->
<MobileNav client:media="(max-width: 768px)" />

<!-- Only load on desktop -->
<DesktopNav client:media="(min-width: 769px)" />
```

**Use for:**
- Mobile-only components
- Desktop-only features
- Responsive interactive elements
- Print-specific functionality

### client:only

Renders only on the client, skipping SSR entirely.

```astro
---
import ClientOnlyChart from '../components/Chart.tsx';
---

<!-- No SSR, renders only in browser -->
<ClientOnlyChart client:only="react" data={chartData} />
```

**Use for:**
- Components that depend on browser APIs
- Libraries that don't support SSR
- Canvas/WebGL components
- Components with hydration issues

**Framework specification is required:**
```astro
<ReactComponent client:only="react" />
<VueComponent client:only="vue" />
<SvelteComponent client:only="svelte" />
<SolidComponent client:only="solid-js" />
```

## Framework Components

### React

```bash
npx astro add react
```

```tsx
// src/components/Counter.tsx
import { useState } from 'react';

interface Props {
  initialCount: number;
}

export default function Counter({ initialCount }: Props) {
  const [count, setCount] = useState(initialCount);

  return (
    <button onClick={() => setCount(count + 1)}>
      Count: {count}
    </button>
  );
}
```

```astro
---
import Counter from '../components/Counter.tsx';
---

<Counter client:load initialCount={0} />
```

### Vue

```bash
npx astro add vue
```

```vue
<!-- src/components/Counter.vue -->
<script setup lang="ts">
import { ref } from 'vue';

const props = defineProps<{
  initialCount: number;
}>();

const count = ref(props.initialCount);
</script>

<template>
  <button @click="count++">Count: {{ count }}</button>
</template>
```

### Svelte

```bash
npx astro add svelte
```

```svelte
<!-- src/components/Counter.svelte -->
<script lang="ts">
  export let initialCount: number;
  let count = initialCount;
</script>

<button on:click={() => count++}>
  Count: {count}
</button>
```

### SolidJS

```bash
npx astro add solid
```

```tsx
// src/components/Counter.tsx
import { createSignal } from 'solid-js';

interface Props {
  initialCount: number;
}

export default function Counter(props: Props) {
  const [count, setCount] = createSignal(props.initialCount);

  return (
    <button onClick={() => setCount(count() + 1)}>
      Count: {count()}
    </button>
  );
}
```

## Passing Data to Islands

### Props

```astro
---
import ProductCard from '../components/ProductCard.tsx';

const product = await getProduct(id);
---

<ProductCard
  client:visible
  id={product.id}
  name={product.name}
  price={product.price}
  inStock={product.inStock}
/>
```

### Slots (Children)

```astro
---
import Modal from '../components/Modal.tsx';
---

<Modal client:load title="Confirm Action">
  <p>Are you sure you want to proceed?</p>
  <button>Cancel</button>
  <button>Confirm</button>
</Modal>
```

```tsx
// Modal.tsx
import type { ReactNode } from 'react';

interface Props {
  title: string;
  children: ReactNode;
}

export default function Modal({ title, children }: Props) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      <button onClick={() => setIsOpen(true)}>Open</button>
      {isOpen && (
        <dialog open>
          <h2>{title}</h2>
          {children}
        </dialog>
      )}
    </>
  );
}
```

### Named Slots

```astro
<Card client:visible>
  <span slot="header">Card Title</span>
  <p>Card content</p>
  <button slot="footer">Action</button>
</Card>
```

## Server Islands

Server islands render dynamic content separately, allowing personalized content without blocking the main page.

```astro
---
import Avatar from '../components/Avatar.astro';
import CartCount from '../components/CartCount.astro';
---

<!-- Page renders immediately, these load separately -->
<Avatar server:defer>
  <span slot="fallback">Loading...</span>
</Avatar>

<CartCount server:defer>
  <span slot="fallback">Cart (0)</span>
</CartCount>
```

**Use for:**
- User-specific content (avatars, cart counts)
- Real-time data (stock levels, prices)
- A/B test variants
- Personalized recommendations

## Performance Patterns

### Progressive Hydration

```astro
---
import Header from '../components/Header.astro';
import Hero from '../components/Hero.tsx';
import Features from '../components/Features.tsx';
import Testimonials from '../components/Testimonials.tsx';
import ContactForm from '../components/ContactForm.tsx';
import Footer from '../components/Footer.astro';
---

<!-- Static - no JS -->
<Header />

<!-- Immediate - critical above fold -->
<Hero client:load />

<!-- Idle - visible but not critical -->
<Features client:idle />

<!-- Visible - below fold -->
<Testimonials client:visible />
<ContactForm client:visible />

<!-- Static - no JS -->
<Footer />
```

### Shared State Between Islands

```tsx
// src/stores/cart.ts
import { atom } from 'nanostores';

export const cartItems = atom<CartItem[]>([]);

export function addToCart(item: CartItem) {
  cartItems.set([...cartItems.get(), item]);
}
```

```tsx
// src/components/AddToCartButton.tsx
import { useStore } from '@nanostores/react';
import { cartItems, addToCart } from '../stores/cart';

export default function AddToCartButton({ product }) {
  const handleClick = () => {
    addToCart(product);
  };

  return <button onClick={handleClick}>Add to Cart</button>;
}
```

```tsx
// src/components/CartCount.tsx
import { useStore } from '@nanostores/react';
import { cartItems } from '../stores/cart';

export default function CartCount() {
  const items = useStore(cartItems);
  return <span>Cart ({items.length})</span>;
}
```

### Mixing Frameworks

```astro
---
// Each framework loads only its runtime
import ReactHeader from '../components/Header.tsx';
import VueSlider from '../components/Slider.vue';
import SvelteForm from '../components/Form.svelte';
---

<ReactHeader client:load />
<VueSlider client:visible images={gallery} />
<SvelteForm client:visible />
```

## Debugging Islands

### Check Hydration

```tsx
// Add to component
import { useEffect, useState } from 'react';

export default function Component() {
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setHydrated(true);
  }, []);

  return (
    <div data-hydrated={hydrated}>
      {hydrated ? 'Hydrated!' : 'SSR'}
    </div>
  );
}
```

### Bundle Analysis

```bash
# See what's in your bundles
npx astro build
# Check .astro/chunks for bundle sizes
```

## Anti-Patterns

### Over-hydration

```astro
<!-- BAD: Hydrating static content -->
<StaticCard client:load>
  <h2>Title</h2>
  <p>Static content that never changes</p>
</StaticCard>

<!-- GOOD: Only hydrate interactive parts -->
<div class="card">
  <h2>Title</h2>
  <p>Static content</p>
  <LikeButton client:visible />
</div>
```

### Wrong Directive Choice

```astro
<!-- BAD: Heavy component loads immediately -->
<HeavyChart client:load data={data} />

<!-- GOOD: Defer until visible -->
<HeavyChart client:visible data={data} />

<!-- BAD: Critical component waits for visibility -->
<LoginButton client:visible />

<!-- GOOD: Critical component loads immediately -->
<LoginButton client:load />
```
