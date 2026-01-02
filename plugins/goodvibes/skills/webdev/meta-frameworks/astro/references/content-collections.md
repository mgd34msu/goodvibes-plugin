# Astro Content Collections Deep Dive

## Collection Configuration

### Basic Setup

```typescript
// src/content.config.ts
import { defineCollection, z, reference } from 'astro:content';
import { glob, file } from 'astro/loaders';

// Blog collection from Markdown files
const blog = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/blog' }),
  schema: z.object({
    title: z.string(),
    description: z.string().max(160),
    pubDate: z.coerce.date(),
    updatedDate: z.coerce.date().optional(),
    heroImage: z.string().optional(),
    tags: z.array(z.string()).default([]),
    author: reference('authors'), // Reference another collection
    draft: z.boolean().default(false),
  }),
});

// Authors from JSON file
const authors = defineCollection({
  loader: file('./src/data/authors.json'),
  schema: z.object({
    name: z.string(),
    email: z.string().email(),
    bio: z.string(),
    avatar: z.string().url(),
  }),
});

// Products from external API
const products = defineCollection({
  loader: async () => {
    const response = await fetch('https://api.example.com/products');
    const data = await response.json();
    return data.map((product: any) => ({
      id: product.id.toString(),
      ...product,
    }));
  },
  schema: z.object({
    name: z.string(),
    price: z.number(),
    description: z.string(),
    inStock: z.boolean(),
  }),
});

export const collections = { blog, authors, products };
```

### Loaders

**Glob Loader (Files)**
```typescript
const docs = defineCollection({
  loader: glob({
    pattern: '**/*.{md,mdx}',
    base: './src/content/docs',
  }),
  schema: z.object({
    title: z.string(),
    order: z.number().default(0),
  }),
});
```

**File Loader (Single File)**
```typescript
// For JSON/YAML arrays
const navigation = defineCollection({
  loader: file('./src/data/navigation.json'),
  schema: z.object({
    label: z.string(),
    href: z.string(),
    icon: z.string().optional(),
  }),
});
```

**Custom Loader (API/CMS)**
```typescript
const posts = defineCollection({
  loader: async () => {
    const response = await fetch('https://cms.example.com/api/posts');
    const posts = await response.json();

    return posts.map((post: any) => ({
      id: post.slug,
      slug: post.slug,
      body: post.content,
      data: {
        title: post.title,
        pubDate: new Date(post.published_at),
      },
    }));
  },
  schema: z.object({
    title: z.string(),
    pubDate: z.date(),
  }),
});
```

## Schema Patterns

### Common Field Types

```typescript
const blog = defineCollection({
  schema: z.object({
    // Strings
    title: z.string(),
    slug: z.string().regex(/^[a-z0-9-]+$/),
    description: z.string().max(160),

    // Numbers
    order: z.number().int().positive(),
    rating: z.number().min(1).max(5),

    // Dates (auto-coerce from strings)
    pubDate: z.coerce.date(),
    updatedDate: z.coerce.date().optional(),

    // Booleans
    draft: z.boolean().default(false),
    featured: z.boolean().default(false),

    // Arrays
    tags: z.array(z.string()).default([]),
    categories: z.array(z.enum(['tech', 'life', 'travel'])),

    // Enums
    status: z.enum(['draft', 'published', 'archived']),

    // Objects
    author: z.object({
      name: z.string(),
      email: z.string().email(),
    }),

    // Optional with default
    language: z.string().default('en'),

    // Nullable
    externalUrl: z.string().url().nullable(),
  }),
});
```

### Image Schema

```typescript
import { defineCollection, z } from 'astro:content';
import { image } from 'astro:schema';

const blog = defineCollection({
  schema: ({ image }) => z.object({
    title: z.string(),
    // Validates image exists and provides optimization
    cover: image(),
    // Optional image
    thumbnail: image().optional(),
    // With dimensions
    hero: image().refine((img) => img.width >= 1200, {
      message: 'Hero image must be at least 1200px wide',
    }),
  }),
});
```

### References Between Collections

```typescript
import { defineCollection, z, reference } from 'astro:content';

const authors = defineCollection({
  loader: glob({ pattern: '*.json', base: './src/content/authors' }),
  schema: z.object({
    name: z.string(),
    bio: z.string(),
  }),
});

const posts = defineCollection({
  loader: glob({ pattern: '*.md', base: './src/content/posts' }),
  schema: z.object({
    title: z.string(),
    // Single reference
    author: reference('authors'),
    // Multiple references
    relatedPosts: z.array(reference('posts')).default([]),
    // Optional reference
    reviewer: reference('authors').optional(),
  }),
});
```

**Resolving references:**
```astro
---
import { getEntry } from 'astro:content';

const post = await getEntry('posts', 'my-post');
const author = await getEntry(post.data.author);
---

<article>
  <h1>{post.data.title}</h1>
  <p>By {author.data.name}</p>
</article>
```

## Querying Collections

### Get All Entries

```astro
---
import { getCollection } from 'astro:content';

// All entries
const allPosts = await getCollection('blog');

// With filter
const publishedPosts = await getCollection('blog', ({ data }) => {
  return data.draft !== true && data.pubDate <= new Date();
});

// Sort by date
const sortedPosts = publishedPosts.sort(
  (a, b) => b.data.pubDate.valueOf() - a.data.pubDate.valueOf()
);
---
```

### Get Single Entry

```astro
---
import { getEntry } from 'astro:content';

// By ID/slug
const post = await getEntry('blog', 'getting-started');

// By reference
const author = await getEntry(post.data.author);
---
```

### Filtering and Grouping

```typescript
// Filter by tag
const reactPosts = await getCollection('blog', ({ data }) => {
  return data.tags.includes('react');
});

// Group by year
const postsByYear = allPosts.reduce((acc, post) => {
  const year = post.data.pubDate.getFullYear();
  acc[year] = acc[year] || [];
  acc[year].push(post);
  return acc;
}, {} as Record<number, typeof allPosts>);

// Get unique tags
const allTags = [...new Set(allPosts.flatMap((post) => post.data.tags))];

// Paginate
const pageSize = 10;
const page = 1;
const paginatedPosts = sortedPosts.slice(
  (page - 1) * pageSize,
  page * pageSize
);
```

## Rendering Content

### Markdown/MDX

```astro
---
import { getEntry } from 'astro:content';

const post = await getEntry('blog', 'my-post');
const { Content, headings, remarkPluginFrontmatter } = await post.render();
---

<article>
  <h1>{post.data.title}</h1>

  <!-- Table of contents from headings -->
  <nav>
    <ul>
      {headings.map((h) => (
        <li style={`margin-left: ${(h.depth - 2) * 1rem}`}>
          <a href={`#${h.slug}`}>{h.text}</a>
        </li>
      ))}
    </ul>
  </nav>

  <!-- Rendered content -->
  <Content />
</article>
```

### Custom Components in MDX

```astro
---
import { getEntry } from 'astro:content';
import Callout from '../components/Callout.astro';
import CodeBlock from '../components/CodeBlock.astro';

const post = await getEntry('blog', 'my-post');
const { Content } = await post.render();
---

<Content components={{
  Callout,
  pre: CodeBlock,
}} />
```

## Dynamic Routes

### Generate Pages

```astro
---
// src/pages/blog/[...slug].astro
import { getCollection } from 'astro:content';
import BlogLayout from '../../layouts/BlogLayout.astro';

export async function getStaticPaths() {
  const posts = await getCollection('blog', ({ data }) => {
    return data.draft !== true;
  });

  return posts.map((post) => ({
    params: { slug: post.slug },
    props: { post },
  }));
}

const { post } = Astro.props;
const { Content } = await post.render();
---

<BlogLayout post={post}>
  <Content />
</BlogLayout>
```

### Tag Pages

```astro
---
// src/pages/tags/[tag].astro
import { getCollection } from 'astro:content';

export async function getStaticPaths() {
  const posts = await getCollection('blog');
  const tags = [...new Set(posts.flatMap((post) => post.data.tags))];

  return tags.map((tag) => ({
    params: { tag },
    props: {
      posts: posts.filter((post) => post.data.tags.includes(tag)),
    },
  }));
}

const { tag } = Astro.params;
const { posts } = Astro.props;
---

<h1>Posts tagged: {tag}</h1>
<ul>
  {posts.map((post) => (
    <li>
      <a href={`/blog/${post.slug}`}>{post.data.title}</a>
    </li>
  ))}
</ul>
```

### Pagination

```astro
---
// src/pages/blog/[...page].astro
import { getCollection } from 'astro:content';

export async function getStaticPaths({ paginate }) {
  const posts = await getCollection('blog');
  const sortedPosts = posts.sort(
    (a, b) => b.data.pubDate.valueOf() - a.data.pubDate.valueOf()
  );

  return paginate(sortedPosts, { pageSize: 10 });
}

const { page } = Astro.props;
---

<ul>
  {page.data.map((post) => (
    <li>
      <a href={`/blog/${post.slug}`}>{post.data.title}</a>
    </li>
  ))}
</ul>

<nav>
  {page.url.prev && <a href={page.url.prev}>Previous</a>}
  <span>Page {page.currentPage} of {page.lastPage}</span>
  {page.url.next && <a href={page.url.next}>Next</a>}
</nav>
```

## RSS Feeds

```typescript
// src/pages/rss.xml.ts
import rss from '@astrojs/rss';
import { getCollection } from 'astro:content';

export async function GET(context) {
  const posts = await getCollection('blog', ({ data }) => !data.draft);

  return rss({
    title: 'My Blog',
    description: 'A blog about web development',
    site: context.site,
    items: posts.map((post) => ({
      title: post.data.title,
      description: post.data.description,
      pubDate: post.data.pubDate,
      link: `/blog/${post.slug}/`,
    })),
  });
}
```

## Type Safety

```typescript
// src/types.ts
import type { CollectionEntry } from 'astro:content';

export type BlogPost = CollectionEntry<'blog'>;
export type Author = CollectionEntry<'authors'>;

// In components
interface Props {
  post: BlogPost;
}
```
