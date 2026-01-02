# Remix Data Flow

## Request/Response Cycle

```
Browser Request
      │
      ▼
┌─────────────┐
│   Loader    │  ← GET requests
└─────────────┘
      │
      ▼
┌─────────────┐
│  Component  │  ← useLoaderData()
└─────────────┘
      │
      ▼
HTML Response


Form Submit (POST)
      │
      ▼
┌─────────────┐
│   Action    │  ← POST/PUT/PATCH/DELETE
└─────────────┘
      │
      ▼
┌─────────────┐
│   Loader    │  ← Revalidation
└─────────────┘
      │
      ▼
┌─────────────┐
│  Component  │  ← Fresh data
└─────────────┘
```

## Loader Patterns

### Basic Data Fetching

```tsx
import { json } from "@remix-run/node";
import { useLoaderData } from "@remix-run/react";

export const loader = async () => {
  const data = await fetchData();
  return json(data);
};

export default function Page() {
  const data = useLoaderData<typeof loader>();
  return <div>{data.title}</div>;
}
```

### Parallel Data Loading

```tsx
export const loader = async () => {
  // These run in parallel
  const [users, posts, comments] = await Promise.all([
    db.users.findMany(),
    db.posts.findMany(),
    db.comments.findMany(),
  ]);

  return json({ users, posts, comments });
};
```

### Conditional Loading

```tsx
export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);
  const tab = url.searchParams.get("tab") ?? "overview";

  let data;
  switch (tab) {
    case "users":
      data = await db.users.findMany();
      break;
    case "posts":
      data = await db.posts.findMany();
      break;
    default:
      data = await getOverview();
  }

  return json({ tab, data });
};
```

### Headers from Loader

```tsx
export const loader = async () => {
  const data = await getData();

  return json(data, {
    headers: {
      "Cache-Control": "public, max-age=300",
      "X-Custom-Header": "value",
    },
  });
};
```

## Action Patterns

### Form Data Processing

```tsx
export const action = async ({ request }: ActionFunctionArgs) => {
  const formData = await request.formData();

  // Get single value
  const name = formData.get("name") as string;

  // Get multiple values (checkboxes)
  const tags = formData.getAll("tags") as string[];

  // Get file
  const file = formData.get("avatar") as File;

  return json({ success: true });
};
```

### JSON Body Processing

```tsx
export const action = async ({ request }: ActionFunctionArgs) => {
  const body = await request.json();

  // Process JSON body
  const result = await processData(body);

  return json(result);
};
```

### Validation with Zod

```tsx
import { z } from "zod";

const CreatePostSchema = z.object({
  title: z.string().min(1, "Title required").max(100),
  content: z.string().min(1, "Content required"),
  published: z.coerce.boolean().default(false),
});

export const action = async ({ request }: ActionFunctionArgs) => {
  const formData = await request.formData();
  const data = Object.fromEntries(formData);

  const result = CreatePostSchema.safeParse(data);

  if (!result.success) {
    return json(
      { errors: result.error.flatten().fieldErrors },
      { status: 400 }
    );
  }

  const post = await db.posts.create({ data: result.data });
  return redirect(`/posts/${post.id}`);
};
```

### Multiple Actions Pattern

```tsx
const ActionSchema = z.discriminatedUnion("intent", [
  z.object({
    intent: z.literal("create"),
    title: z.string(),
  }),
  z.object({
    intent: z.literal("update"),
    id: z.string(),
    title: z.string(),
  }),
  z.object({
    intent: z.literal("delete"),
    id: z.string(),
  }),
]);

export const action = async ({ request }: ActionFunctionArgs) => {
  const formData = await request.formData();
  const data = Object.fromEntries(formData);
  const parsed = ActionSchema.parse(data);

  switch (parsed.intent) {
    case "create":
      return createItem(parsed);
    case "update":
      return updateItem(parsed);
    case "delete":
      return deleteItem(parsed);
  }
};
```

## Revalidation

### Automatic Revalidation

After actions, Remix automatically revalidates loaders:

```tsx
// After action completes, this loader runs again
export const loader = async () => {
  return json(await db.posts.findMany());
};

export const action = async ({ request }: ActionFunctionArgs) => {
  await db.posts.create({ ... });
  return json({ success: true });
  // ↑ After this, loader automatically reruns
};
```

### Manual Revalidation

```tsx
import { useRevalidator } from "@remix-run/react";

function Component() {
  const revalidator = useRevalidator();

  return (
    <button
      onClick={() => revalidator.revalidate()}
      disabled={revalidator.state === "loading"}
    >
      Refresh Data
    </button>
  );
}
```

### Controlling Revalidation

```tsx
export function shouldRevalidate({
  formAction,
  formMethod,
  defaultShouldRevalidate,
}: ShouldRevalidateFunctionArgs) {
  // Skip revalidation for specific actions
  if (formAction === "/api/analytics") {
    return false;
  }

  // Only revalidate on mutations
  if (formMethod === "GET") {
    return false;
  }

  return defaultShouldRevalidate;
}
```

## useFetcher

### Non-Navigation Data Loading

```tsx
function SearchResults() {
  const fetcher = useFetcher<typeof loader>();

  useEffect(() => {
    fetcher.load("/api/search?q=react");
  }, []);

  if (fetcher.state === "loading") {
    return <Spinner />;
  }

  return <ResultsList results={fetcher.data?.results} />;
}
```

### Inline Form Submissions

```tsx
function DeleteButton({ id }: { id: string }) {
  const fetcher = useFetcher();
  const isDeleting = fetcher.state !== "idle";

  return (
    <fetcher.Form method="post" action={`/items/${id}/delete`}>
      <button type="submit" disabled={isDeleting}>
        {isDeleting ? "Deleting..." : "Delete"}
      </button>
    </fetcher.Form>
  );
}
```

### Multiple Fetchers

```tsx
function TodoList({ todos }: { todos: Todo[] }) {
  return (
    <ul>
      {todos.map((todo) => (
        <TodoItem key={todo.id} todo={todo} />
      ))}
    </ul>
  );
}

function TodoItem({ todo }: { todo: Todo }) {
  // Each item has its own fetcher
  const fetcher = useFetcher();

  const optimisticCompleted = fetcher.formData
    ? fetcher.formData.get("completed") === "true"
    : todo.completed;

  return (
    <li>
      <fetcher.Form method="post">
        <input type="hidden" name="id" value={todo.id} />
        <input
          type="checkbox"
          name="completed"
          value="true"
          checked={optimisticCompleted}
          onChange={(e) => fetcher.submit(e.target.form)}
        />
        {todo.title}
      </fetcher.Form>
    </li>
  );
}
```

## Deferred Data (Streaming)

### Basic Streaming

```tsx
import { defer } from "@remix-run/node";
import { Await, useLoaderData } from "@remix-run/react";
import { Suspense } from "react";

export const loader = async () => {
  // Fast data - await it
  const criticalData = await getCriticalData();

  // Slow data - don't await, stream it
  const slowData = getSlowData();

  return defer({
    criticalData,
    slowData, // Promise, not awaited
  });
};

export default function Page() {
  const { criticalData, slowData } = useLoaderData<typeof loader>();

  return (
    <div>
      {/* Renders immediately */}
      <Header data={criticalData} />

      {/* Streams when ready */}
      <Suspense fallback={<Skeleton />}>
        <Await
          resolve={slowData}
          errorElement={<ErrorMessage />}
        >
          {(data) => <SlowComponent data={data} />}
        </Await>
      </Suspense>
    </div>
  );
}
```

### Error Handling with Await

```tsx
<Suspense fallback={<Loading />}>
  <Await
    resolve={slowData}
    errorElement={<p>Failed to load data</p>}
  >
    {(data) => <DataComponent data={data} />}
  </Await>
</Suspense>
```

### Multiple Deferred Values

```tsx
export const loader = async () => {
  return defer({
    critical: await getCritical(),
    recommendations: getRecommendations(), // Slow
    analytics: getAnalytics(), // Slow
  });
};

export default function Page() {
  const { critical, recommendations, analytics } = useLoaderData<typeof loader>();

  return (
    <div>
      <MainContent data={critical} />

      <Suspense fallback={<RecommendationsSkeleton />}>
        <Await resolve={recommendations}>
          {(data) => <Recommendations data={data} />}
        </Await>
      </Suspense>

      <Suspense fallback={<AnalyticsSkeleton />}>
        <Await resolve={analytics}>
          {(data) => <Analytics data={data} />}
        </Await>
      </Suspense>
    </div>
  );
}
```

## Type Safety

### Typed Loader Data

```tsx
import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData } from "@remix-run/react";

interface Post {
  id: string;
  title: string;
  content: string;
}

export const loader = async ({ params }: LoaderFunctionArgs) => {
  const post = await db.posts.findUnique({
    where: { id: params.id },
  }) as Post | null;

  if (!post) {
    throw new Response("Not Found", { status: 404 });
  }

  return json({ post });
};

export default function PostPage() {
  // Type is inferred from loader
  const { post } = useLoaderData<typeof loader>();

  return <h1>{post.title}</h1>;
}
```

### Typed Action Data

```tsx
type ActionData = {
  errors?: {
    title?: string;
    content?: string;
  };
  success?: boolean;
};

export const action = async ({ request }: ActionFunctionArgs) => {
  // ... validation
  return json<ActionData>({ errors: { title: "Required" } });
};

export default function Form() {
  const actionData = useActionData<ActionData>();

  return (
    <form method="post">
      <input name="title" />
      {actionData?.errors?.title && <p>{actionData.errors.title}</p>}
    </form>
  );
}
```
