# Qwik Advanced Patterns

## Resource Management

```tsx
import { component$, useResource$, Resource } from '@builder.io/qwik';

export default component$(() => {
  const productResource = useResource$<Product>(async ({ track, cleanup }) => {
    const id = track(() => productId.value);

    const controller = new AbortController();
    cleanup(() => controller.abort());

    const res = await fetch(`/api/products/${id}`, {
      signal: controller.signal,
    });

    return res.json();
  });

  return (
    <Resource
      value={productResource}
      onPending={() => <div class="skeleton" />}
      onRejected={(error) => <div class="error">{error.message}</div>}
      onResolved={(product) => (
        <div>
          <h1>{product.name}</h1>
          <p>${product.price}</p>
        </div>
      )}
    />
  );
});
```

## Prefetching

```tsx
// src/routes/layout.tsx
import { component$, Slot } from '@builder.io/qwik';
import { Link, useLocation } from '@builder.io/qwik-city';

export default component$(() => {
  const loc = useLocation();

  return (
    <div>
      <nav>
        {/* Prefetch on hover/focus */}
        <Link href="/products" prefetch>Products</Link>

        {/* Prefetch with custom strategy */}
        <Link href="/about" prefetch={{ strategy: 'visible' }}>
          About
        </Link>
      </nav>
      <Slot />
    </div>
  );
});
```

## Streaming SSR

```tsx
// src/routes/products/index.tsx
import { component$ } from '@builder.io/qwik';
import { routeLoader$ } from '@builder.io/qwik-city';

// Data streams as it resolves
export const useProducts = routeLoader$(async () => {
  const products = await fetchProducts(); // Slow operation
  return products;
});

export const useFeatured = routeLoader$(async () => {
  const featured = await fetchFeatured(); // Fast operation
  return featured;
});

export default component$(() => {
  const products = useProducts();
  const featured = useFeatured();

  return (
    <div>
      {/* Featured loads first, products stream in */}
      <section class="featured">
        {featured.value.map((item) => (
          <ProductCard key={item.id} product={item} />
        ))}
      </section>

      <section class="all-products">
        {products.value.map((item) => (
          <ProductCard key={item.id} product={item} />
        ))}
      </section>
    </div>
  );
});
```

## Server$ Functions

```tsx
import { component$, useSignal } from '@builder.io/qwik';
import { server$ } from '@builder.io/qwik-city';

// Runs exclusively on server
const processPayment = server$(async function (amount: number, token: string) {
  // Access server-only APIs
  const stripe = new Stripe(this.env.get('STRIPE_SECRET_KEY'));

  const payment = await stripe.paymentIntents.create({
    amount,
    currency: 'usd',
    payment_method: token,
    confirm: true,
  });

  return { success: true, id: payment.id };
});

export default component$(() => {
  const result = useSignal<{ success: boolean; id?: string } | null>(null);

  return (
    <button onClick$={async () => {
      result.value = await processPayment(1000, 'tok_visa');
    }}>
      Pay $10
    </button>
  );
});
```

## Optimistic Updates

```tsx
import { component$, useSignal } from '@builder.io/qwik';
import { routeAction$, Form } from '@builder.io/qwik-city';

export const useLikePost = routeAction$(async (data, { fail }) => {
  const result = await db.posts.update({
    where: { id: data.postId },
    data: { likes: { increment: 1 } },
  });

  if (!result) {
    return fail(500, { error: 'Failed to like post' });
  }

  return { likes: result.likes };
});

export default component$(() => {
  const action = useLikePost();
  const optimisticLikes = useSignal(initialLikes);

  return (
    <Form
      action={action}
      onSubmit$={() => {
        // Optimistic update
        optimisticLikes.value++;
      }}
      onSubmitCompleted$={({ detail }) => {
        if (detail.status === 'success') {
          // Sync with server
          optimisticLikes.value = detail.value.likes;
        } else {
          // Rollback
          optimisticLikes.value--;
        }
      }}
    >
      <input type="hidden" name="postId" value={postId} />
      <button type="submit">
        Like ({optimisticLikes.value})
      </button>
    </Form>
  );
});
```

## QRL Serialization

```tsx
import { component$, $, QRL } from '@builder.io/qwik';

interface ButtonProps {
  onClick$?: QRL<() => void>;
  label: string;
}

// QRL props maintain serialization
export const Button = component$<ButtonProps>((props) => {
  return (
    <button onClick$={props.onClick$}>
      {props.label}
    </button>
  );
});

// Usage - handler is serializable
<Button
  label="Save"
  onClick$={$(() => {
    saveData();
  })}
/>
```

## Inline Components

```tsx
import { component$, useSignal } from '@builder.io/qwik';

export default component$(() => {
  const items = useSignal(['A', 'B', 'C']);

  // Inline component - useful for render functions
  const Item = ({ item, index }: { item: string; index: number }) => (
    <li key={index}>{item}</li>
  );

  return (
    <ul>
      {items.value.map((item, index) => (
        <Item item={item} index={index} />
      ))}
    </ul>
  );
});
```

## Error Boundaries

```tsx
import { component$, Slot, useErrorBoundary } from '@builder.io/qwik';

export const ErrorBoundary = component$(() => {
  const error = useErrorBoundary();

  if (error.value) {
    return (
      <div class="error-container">
        <h2>Something went wrong</h2>
        <pre>{error.value.message}</pre>
        <button onClick$={() => error.value = undefined}>
          Try Again
        </button>
      </div>
    );
  }

  return <Slot />;
});

// Usage
<ErrorBoundary>
  <RiskyComponent />
</ErrorBoundary>
```

## Progressive Enhancement

```tsx
import { component$ } from '@builder.io/qwik';
import { Form, routeAction$ } from '@builder.io/qwik-city';

export const useSubmit = routeAction$(async (data) => {
  await processForm(data);
  return { success: true };
});

export default component$(() => {
  const action = useSubmit();

  return (
    // Works without JavaScript!
    <Form action={action}>
      <input name="email" type="email" required />
      <button type="submit">Subscribe</button>
    </Form>
  );
});
```
