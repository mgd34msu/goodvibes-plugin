# SolidStart Streaming SSR

## Suspense Boundaries

```tsx
import { Suspense } from "solid-js";
import { createAsync, query } from "@solidjs/router";

const getSlowData = query(async () => {
  "use server";
  await new Promise((r) => setTimeout(r, 2000));
  return await db.analytics.aggregate();
}, "analytics");

const getFastData = query(async () => {
  "use server";
  return await db.summary.findFirst();
}, "summary");

export default function Dashboard() {
  const slow = createAsync(() => getSlowData());
  const fast = createAsync(() => getFastData());

  return (
    <div>
      {/* Fast data renders immediately */}
      <Suspense fallback={<div>Loading summary...</div>}>
        <Summary data={fast()} />
      </Suspense>

      {/* Slow data streams in later */}
      <Suspense fallback={<AnalyticsSkeleton />}>
        <Analytics data={slow()} />
      </Suspense>
    </div>
  );
}
```

## Nested Suspense

```tsx
export default function ProductPage() {
  const product = createAsync(() => getProduct(params.id));
  const reviews = createAsync(() => getReviews(params.id));
  const recommendations = createAsync(() => getRecommendations(params.id));

  return (
    <Suspense fallback={<ProductSkeleton />}>
      <Show when={product()}>
        {(p) => (
          <div>
            <ProductDetails product={p()} />

            {/* Reviews stream after product */}
            <Suspense fallback={<ReviewsSkeleton />}>
              <Reviews reviews={reviews()} />
            </Suspense>

            {/* Recommendations stream last */}
            <Suspense fallback={<RecommendationsSkeleton />}>
              <Recommendations items={recommendations()} />
            </Suspense>
          </div>
        )}
      </Show>
    </Suspense>
  );
}
```

## Progressive Enhancement

```tsx
import { Show, Suspense } from "solid-js";
import { createAsync, query, A } from "@solidjs/router";

const getComments = query(async (postId: string) => {
  "use server";
  return await db.comments.findMany({ where: { postId } });
}, "comments");

export default function BlogPost() {
  const post = createAsync(() => getPost(params.slug));
  const comments = createAsync(() => getComments(params.slug));

  return (
    <article>
      {/* Critical content - no suspense */}
      <h1>{post()?.title}</h1>
      <div innerHTML={post()?.content} />

      {/* Non-critical - streamed */}
      <section>
        <h2>Comments</h2>
        <Suspense
          fallback={
            <div>
              <p>Loading comments...</p>
              {/* Progressive fallback with link */}
              <noscript>
                <A href={`/blog/${params.slug}/comments`}>
                  View comments
                </A>
              </noscript>
            </div>
          }
        >
          <CommentList comments={comments()} />
        </Suspense>
      </section>
    </article>
  );
}
```

## Error Boundaries with Streaming

```tsx
import { ErrorBoundary, Suspense } from "solid-js";

export default function Page() {
  return (
    <div>
      <ErrorBoundary
        fallback={(err, reset) => (
          <div class="error">
            <p>Failed to load: {err.message}</p>
            <button onClick={reset}>Retry</button>
          </div>
        )}
      >
        <Suspense fallback={<Loading />}>
          <DataComponent />
        </Suspense>
      </ErrorBoundary>
    </div>
  );
}
```

## Deferred Loading

```tsx
import { createSignal, Show, Suspense } from "solid-js";
import { createAsync, query } from "@solidjs/router";

const getHeavyData = query(async () => {
  "use server";
  return await computeExpensiveAnalytics();
}, "heavy");

export default function Dashboard() {
  const [showAnalytics, setShowAnalytics] = createSignal(false);

  return (
    <div>
      <button onClick={() => setShowAnalytics(true)}>
        Show Analytics
      </button>

      <Show when={showAnalytics()}>
        <Suspense fallback={<AnalyticsSkeleton />}>
          <HeavyAnalytics />
        </Suspense>
      </Show>
    </div>
  );
}

function HeavyAnalytics() {
  const data = createAsync(() => getHeavyData());

  return (
    <Show when={data()}>
      {(d) => <AnalyticsChart data={d()} />}
    </Show>
  );
}
```

## Streaming with Parallel Fetches

```tsx
import { createAsync, query } from "@solidjs/router";

// These queries run in parallel on the server
const getUser = query(async (id: string) => {
  "use server";
  return db.users.findUnique({ where: { id } });
}, "user");

const getPosts = query(async (userId: string) => {
  "use server";
  return db.posts.findMany({ where: { authorId: userId } });
}, "posts");

const getNotifications = query(async (userId: string) => {
  "use server";
  return db.notifications.findMany({ where: { userId } });
}, "notifications");

export default function Profile() {
  // All three requests start simultaneously
  const user = createAsync(() => getUser(params.id));
  const posts = createAsync(() => getPosts(params.id));
  const notifications = createAsync(() => getNotifications(params.id));

  return (
    <div>
      <Suspense fallback={<UserSkeleton />}>
        <UserHeader user={user()} />
      </Suspense>

      <div class="grid">
        <Suspense fallback={<PostsSkeleton />}>
          <PostsList posts={posts()} />
        </Suspense>

        <Suspense fallback={<NotificationsSkeleton />}>
          <NotificationsList notifications={notifications()} />
        </Suspense>
      </div>
    </div>
  );
}
```

## SuspenseList (Coordinated Loading)

```tsx
import { SuspenseList, Suspense } from "solid-js";

export default function Feed() {
  return (
    <SuspenseList revealOrder="forwards" tail="collapsed">
      <Suspense fallback={<PostSkeleton />}>
        <Post id="1" />
      </Suspense>
      <Suspense fallback={<PostSkeleton />}>
        <Post id="2" />
      </Suspense>
      <Suspense fallback={<PostSkeleton />}>
        <Post id="3" />
      </Suspense>
    </SuspenseList>
  );
}
```

## Optimistic UI with Streaming

```tsx
import { createSignal, Show } from "solid-js";
import { action, useSubmission, revalidate } from "@solidjs/router";

const addComment = action(async (formData: FormData) => {
  "use server";
  const comment = await db.comments.create({
    data: {
      content: formData.get("content") as string,
      postId: formData.get("postId") as string,
    },
  });
  revalidate("comments");
  return comment;
});

export default function CommentForm(props: { postId: string }) {
  const submission = useSubmission(addComment);
  const [optimistic, setOptimistic] = createSignal<string | null>(null);

  return (
    <div>
      {/* Show optimistic comment */}
      <Show when={optimistic()}>
        <div class="comment optimistic">
          {optimistic()}
          <span class="pending">Posting...</span>
        </div>
      </Show>

      <form
        action={addComment}
        method="post"
        onSubmit={(e) => {
          const form = e.currentTarget;
          const content = new FormData(form).get("content") as string;
          setOptimistic(content);
        }}
        ref={(el) => {
          // Clear on success
          if (submission.result && !submission.pending) {
            el.reset();
            setOptimistic(null);
          }
        }}
      >
        <input type="hidden" name="postId" value={props.postId} />
        <textarea name="content" required />
        <button type="submit" disabled={submission.pending}>
          Post Comment
        </button>
      </form>
    </div>
  );
}
```
