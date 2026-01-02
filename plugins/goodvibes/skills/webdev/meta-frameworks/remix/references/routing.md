# Remix Routing Deep Dive

## File Naming Conventions

### Basic Routes

```
app/routes/
  _index.tsx          # /
  about.tsx           # /about
  contact.tsx         # /contact
```

### Dot Delimiters (URL Segments)

```
app/routes/
  concerts.trending.tsx    # /concerts/trending
  concerts.salt-lake-city.tsx  # /concerts/salt-lake-city
```

### Dynamic Segments

```
app/routes/
  concerts.$city.tsx       # /concerts/:city
  concerts.$city.$date.tsx # /concerts/:city/:date
```

Access params:
```tsx
export const loader = async ({ params }: LoaderFunctionArgs) => {
  const { city, date } = params;
  return json({ city, date });
};
```

### Optional Segments

```
app/routes/
  ($lang).about.tsx        # /about OR /en/about OR /fr/about
  ($lang)._index.tsx       # / OR /en OR /fr
```

```tsx
export const loader = async ({ params }: LoaderFunctionArgs) => {
  const lang = params.lang ?? "en";
  return json({ lang });
};
```

### Splat Routes (Catch-All)

```
app/routes/
  $.tsx                    # Matches everything
  files.$.tsx              # /files/* (e.g., /files/docs/report.pdf)
```

```tsx
export const loader = async ({ params }: LoaderFunctionArgs) => {
  // params["*"] contains the rest of the path
  const filePath = params["*"]; // "docs/report.pdf"
  return json({ filePath });
};
```

## Nested Routes

### Layout Routes

```
app/routes/
  dashboard.tsx           # Layout (has <Outlet />)
  dashboard._index.tsx    # /dashboard
  dashboard.settings.tsx  # /dashboard/settings
  dashboard.users.tsx     # /dashboard/users
```

```tsx
// app/routes/dashboard.tsx
import { Outlet, NavLink } from "@remix-run/react";

export default function DashboardLayout() {
  return (
    <div className="flex">
      <nav className="w-64 bg-gray-100 p-4">
        <NavLink
          to="/dashboard"
          end
          className={({ isActive }) =>
            isActive ? "text-blue-600 font-bold" : ""
          }
        >
          Overview
        </NavLink>
        <NavLink
          to="/dashboard/settings"
          className={({ isActive }) =>
            isActive ? "text-blue-600 font-bold" : ""
          }
        >
          Settings
        </NavLink>
      </nav>
      <main className="flex-1 p-4">
        <Outlet />
      </main>
    </div>
  );
}
```

### Escaping Layout Nesting

Use trailing underscore to break out of layout:

```
app/routes/
  dashboard.tsx             # Layout
  dashboard._index.tsx      # Uses layout - /dashboard
  dashboard.settings.tsx    # Uses layout - /dashboard/settings
  dashboard_.print.tsx      # NO layout - /dashboard/print
```

### Pathless Layout Routes

Use underscore prefix for layouts without URL segment:

```
app/routes/
  _auth.tsx                 # Layout (no URL segment)
  _auth.login.tsx           # /login (uses _auth layout)
  _auth.register.tsx        # /register (uses _auth layout)
```

```tsx
// app/routes/_auth.tsx
export default function AuthLayout() {
  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="w-full max-w-md">
        <Outlet />
      </div>
    </div>
  );
}
```

## Route Groups

Organize routes without affecting URLs using parentheses:

```
app/routes/
  (marketing)/
    _index.tsx              # /
    about.tsx               # /about
    pricing.tsx             # /pricing
  (app)/
    dashboard.tsx           # /dashboard
    dashboard.settings.tsx  # /dashboard/settings
```

## Index Routes

Index routes render in parent's `<Outlet />` when at exact parent path:

```
app/routes/
  posts.tsx              # /posts layout
  posts._index.tsx       # /posts (index - default child)
  posts.$id.tsx          # /posts/:id
```

**?index query parameter:**
When submitting forms, use `?index` to target index route:

```tsx
// Targets posts._index.tsx action
<Form method="post" action="/posts?index">
```

## Resource Routes

Routes without default export = no UI, just loader/action:

```tsx
// app/routes/api.users.tsx
import { json } from "@remix-run/node";

export const loader = async () => {
  const users = await db.users.findMany();
  return json(users);
};

// No default export = resource route
```

### File Downloads

```tsx
// app/routes/reports.$id.pdf.tsx
export const loader = async ({ params }: LoaderFunctionArgs) => {
  const report = await generatePDF(params.id);

  return new Response(report, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="report-${params.id}.pdf"`,
    },
  });
};
```

### Image Generation

```tsx
// app/routes/og.$slug.png.tsx
export const loader = async ({ params }: LoaderFunctionArgs) => {
  const image = await generateOGImage(params.slug);

  return new Response(image, {
    headers: {
      "Content-Type": "image/png",
      "Cache-Control": "public, max-age=31536000",
    },
  });
};
```

## Navigation

### Link Component

```tsx
import { Link, NavLink } from "@remix-run/react";

// Basic link
<Link to="/about">About</Link>

// With params
<Link to={`/posts/${post.slug}`}>{post.title}</Link>

// Relative links
<Link to="edit">Edit</Link>  // Relative to current route
<Link to="../">Back</Link>   // Up one level

// NavLink with active state
<NavLink
  to="/posts"
  className={({ isActive, isPending }) =>
    isPending ? "pending" : isActive ? "active" : ""
  }
>
  Posts
</NavLink>
```

### Programmatic Navigation

```tsx
import { useNavigate } from "@remix-run/react";

function Component() {
  const navigate = useNavigate();

  const handleClick = () => {
    navigate("/dashboard");
  };

  // With options
  const handleReplace = () => {
    navigate("/login", { replace: true });
  };

  // Relative navigation
  const goBack = () => {
    navigate(-1);
  };

  return <button onClick={handleClick}>Go to Dashboard</button>;
}
```

### Redirects

```tsx
// In loader
export const loader = async ({ request }: LoaderFunctionArgs) => {
  const user = await getUser(request);
  if (!user) {
    throw redirect("/login");
  }
  return json({ user });
};

// In action
export const action = async ({ request }: ActionFunctionArgs) => {
  await createPost(request);
  return redirect("/posts");
};

// With headers
return redirect("/dashboard", {
  headers: {
    "Set-Cookie": await commitSession(session),
  },
});
```

## Route Module API

### Exports

| Export | Purpose |
|--------|---------|
| `loader` | GET data fetching |
| `action` | Non-GET mutations |
| `default` | Component to render |
| `ErrorBoundary` | Error UI |
| `meta` | Page metadata |
| `links` | Page links/stylesheets |
| `headers` | HTTP headers |
| `handle` | Custom route data |
| `shouldRevalidate` | Control revalidation |

### handle Export

Share data across routes:

```tsx
// app/routes/posts.tsx
export const handle = {
  breadcrumb: () => <Link to="/posts">Posts</Link>,
};

// app/routes/posts.$id.tsx
export const handle = {
  breadcrumb: (match) => <span>{match.data.post.title}</span>,
};

// In root/layout
import { useMatches } from "@remix-run/react";

function Breadcrumbs() {
  const matches = useMatches();

  return (
    <nav>
      {matches
        .filter((match) => match.handle?.breadcrumb)
        .map((match, index) => (
          <span key={index}>{match.handle.breadcrumb(match)}</span>
        ))}
    </nav>
  );
}
```

### shouldRevalidate

Control when routes refetch data:

```tsx
export function shouldRevalidate({
  currentUrl,
  nextUrl,
  formMethod,
  defaultShouldRevalidate,
}) {
  // Don't revalidate on search param changes
  if (currentUrl.pathname === nextUrl.pathname) {
    return false;
  }

  // Don't revalidate on GET submissions
  if (formMethod === "GET") {
    return false;
  }

  return defaultShouldRevalidate;
}
```
