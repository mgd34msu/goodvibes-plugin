# Next.js Server Actions Patterns

## Core Concepts

Server Actions are async functions that run on the server, invokable from client via POST request.

```tsx
// app/actions.ts
'use server'

export async function createItem(formData: FormData) {
  const name = formData.get('name') as string
  await db.items.create({ data: { name } })
}
```

## Form Patterns

### Basic Form

```tsx
// app/actions.ts
'use server'

import { revalidatePath } from 'next/cache'

export async function createPost(formData: FormData) {
  await db.posts.create({
    data: {
      title: formData.get('title') as string,
      content: formData.get('content') as string,
    },
  })

  revalidatePath('/posts')
}
```

```tsx
// app/posts/new/page.tsx
import { createPost } from '@/app/actions'

export default function NewPost() {
  return (
    <form action={createPost}>
      <input name="title" required />
      <textarea name="content" required />
      <button type="submit">Create</button>
    </form>
  )
}
```

### With Validation (Zod)

```tsx
// app/actions.ts
'use server'

import { z } from 'zod'

const PostSchema = z.object({
  title: z.string().min(1, 'Title required').max(100),
  content: z.string().min(1, 'Content required'),
})

export type PostState = {
  errors?: {
    title?: string[]
    content?: string[]
  }
  message?: string
}

export async function createPost(
  prevState: PostState,
  formData: FormData
): Promise<PostState> {
  const validated = PostSchema.safeParse({
    title: formData.get('title'),
    content: formData.get('content'),
  })

  if (!validated.success) {
    return {
      errors: validated.error.flatten().fieldErrors,
    }
  }

  try {
    await db.posts.create({ data: validated.data })
    revalidatePath('/posts')
    return { message: 'Post created' }
  } catch (e) {
    return { message: 'Database error' }
  }
}
```

```tsx
// app/posts/new/page.tsx
'use client'

import { useActionState } from 'react'
import { createPost, type PostState } from '@/app/actions'

const initialState: PostState = {}

export default function NewPost() {
  const [state, formAction, pending] = useActionState(createPost, initialState)

  return (
    <form action={formAction}>
      <div>
        <input name="title" />
        {state.errors?.title && (
          <p className="text-red-500">{state.errors.title[0]}</p>
        )}
      </div>

      <div>
        <textarea name="content" />
        {state.errors?.content && (
          <p className="text-red-500">{state.errors.content[0]}</p>
        )}
      </div>

      <button disabled={pending}>
        {pending ? 'Creating...' : 'Create Post'}
      </button>

      {state.message && <p>{state.message}</p>}
    </form>
  )
}
```

### With Redirect

```tsx
'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'

export async function createPost(formData: FormData) {
  const post = await db.posts.create({
    data: {
      title: formData.get('title') as string,
    },
  })

  revalidatePath('/posts')
  redirect(`/posts/${post.id}`) // Must be after revalidatePath
}
```

## Non-Form Invocation

### Event Handlers

```tsx
'use client'

import { incrementLike } from '@/app/actions'

export function LikeButton({ postId }: { postId: string }) {
  const handleClick = async () => {
    await incrementLike(postId)
  }

  return <button onClick={handleClick}>Like</button>
}
```

```tsx
// app/actions.ts
'use server'

export async function incrementLike(postId: string) {
  await db.posts.update({
    where: { id: postId },
    data: { likes: { increment: 1 } },
  })

  revalidatePath('/posts')
}
```

### With Arguments (bind)

```tsx
'use client'

import { deletePost } from '@/app/actions'

export function DeleteButton({ postId }: { postId: string }) {
  const deleteWithId = deletePost.bind(null, postId)

  return (
    <form action={deleteWithId}>
      <button type="submit">Delete</button>
    </form>
  )
}
```

## Optimistic Updates

```tsx
'use client'

import { useOptimistic } from 'react'
import { addTodo, type Todo } from '@/app/actions'

export function TodoList({ todos }: { todos: Todo[] }) {
  const [optimisticTodos, addOptimisticTodo] = useOptimistic(
    todos,
    (state, newTodo: string) => [
      ...state,
      { id: 'temp', text: newTodo, pending: true },
    ]
  )

  async function formAction(formData: FormData) {
    const text = formData.get('text') as string
    addOptimisticTodo(text)
    await addTodo(text)
  }

  return (
    <>
      <form action={formAction}>
        <input name="text" />
        <button>Add</button>
      </form>

      <ul>
        {optimisticTodos.map((todo) => (
          <li key={todo.id} className={todo.pending ? 'opacity-50' : ''}>
            {todo.text}
          </li>
        ))}
      </ul>
    </>
  )
}
```

## Progress & Loading States

### useFormStatus

```tsx
'use client'

import { useFormStatus } from 'react-dom'

function SubmitButton() {
  const { pending } = useFormStatus()

  return (
    <button disabled={pending}>
      {pending ? 'Submitting...' : 'Submit'}
    </button>
  )
}

export function Form({ action }) {
  return (
    <form action={action}>
      <input name="name" />
      <SubmitButton />
    </form>
  )
}
```

### useTransition

```tsx
'use client'

import { useTransition } from 'react'
import { updateUser } from '@/app/actions'

export function UpdateButton({ userId }) {
  const [isPending, startTransition] = useTransition()

  const handleClick = () => {
    startTransition(async () => {
      await updateUser(userId)
    })
  }

  return (
    <button onClick={handleClick} disabled={isPending}>
      {isPending ? 'Updating...' : 'Update'}
    </button>
  )
}
```

## Error Handling

### Try-Catch Pattern

```tsx
'use server'

export type ActionResult<T> =
  | { success: true; data: T }
  | { success: false; error: string }

export async function createPost(formData: FormData): Promise<ActionResult<Post>> {
  try {
    const post = await db.posts.create({
      data: {
        title: formData.get('title') as string,
      },
    })

    revalidatePath('/posts')
    return { success: true, data: post }
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === 'P2002') {
        return { success: false, error: 'Title already exists' }
      }
    }
    return { success: false, error: 'Failed to create post' }
  }
}
```

### With Error Boundary

```tsx
// app/posts/error.tsx
'use client'

export default function Error({
  error,
  reset,
}: {
  error: Error
  reset: () => void
}) {
  return (
    <div>
      <h2>Failed to submit</h2>
      <p>{error.message}</p>
      <button onClick={reset}>Try again</button>
    </div>
  )
}
```

## Authentication

### Protected Actions

```tsx
'use server'

import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'

export async function createPost(formData: FormData) {
  const session = await auth()

  if (!session) {
    redirect('/login')
  }

  await db.posts.create({
    data: {
      title: formData.get('title') as string,
      authorId: session.user.id,
    },
  })

  revalidatePath('/posts')
}
```

### Role-Based Actions

```tsx
'use server'

import { auth } from '@/lib/auth'

export async function deletePost(postId: string) {
  const session = await auth()

  if (!session) {
    throw new Error('Unauthorized')
  }

  const post = await db.posts.findUnique({ where: { id: postId } })

  if (post.authorId !== session.user.id && session.user.role !== 'admin') {
    throw new Error('Forbidden')
  }

  await db.posts.delete({ where: { id: postId } })
  revalidatePath('/posts')
}
```

## Cookies & Headers

```tsx
'use server'

import { cookies, headers } from 'next/headers'

export async function setTheme(theme: string) {
  const cookieStore = await cookies()
  cookieStore.set('theme', theme, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 60 * 60 * 24 * 365, // 1 year
  })
}

export async function getClientInfo() {
  const headersList = await headers()
  const userAgent = headersList.get('user-agent')
  const ip = headersList.get('x-forwarded-for')

  return { userAgent, ip }
}
```

## File Uploads

```tsx
'use server'

import { writeFile } from 'fs/promises'
import { join } from 'path'

export async function uploadFile(formData: FormData) {
  const file = formData.get('file') as File

  if (!file) {
    return { error: 'No file provided' }
  }

  const bytes = await file.arrayBuffer()
  const buffer = Buffer.from(bytes)

  const path = join(process.cwd(), 'public', 'uploads', file.name)
  await writeFile(path, buffer)

  return { success: true, path: `/uploads/${file.name}` }
}
```

## Best Practices

1. **Always validate input** - Use Zod or similar
2. **Return typed results** - Use discriminated unions
3. **Revalidate before redirect** - `revalidatePath` then `redirect`
4. **Handle errors gracefully** - Return error states, don't throw
5. **Use `bind` for arguments** - Clean way to pass IDs
6. **Protect sensitive actions** - Check auth in every action
7. **Keep actions focused** - One action per mutation type
