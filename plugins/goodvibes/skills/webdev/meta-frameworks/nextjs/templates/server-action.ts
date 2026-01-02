// Next.js Server Action Template
// Location: app/actions.ts or app/[feature]/actions.ts

'use server'

import { revalidatePath, revalidateTag } from 'next/cache'
import { redirect } from 'next/navigation'
import { cookies } from 'next/headers'
import { z } from 'zod'

// ===========================================
// Type Definitions
// ===========================================

// Generic action result type
export type ActionResult<T = void> =
  | { success: true; data: T }
  | { success: false; error: string; fieldErrors?: Record<string, string[]> }

// Form state for useActionState hook
export type FormState = {
  message?: string
  errors?: Record<string, string[]>
  success?: boolean
}

// ===========================================
// Validation Schemas
// ===========================================

const CreateItemSchema = z.object({
  title: z
    .string()
    .min(1, 'Title is required')
    .max(100, 'Title must be less than 100 characters'),
  description: z
    .string()
    .min(1, 'Description is required')
    .max(500, 'Description must be less than 500 characters'),
  category: z.enum(['general', 'important', 'urgent'], {
    errorMap: () => ({ message: 'Please select a valid category' }),
  }),
})

const UpdateItemSchema = CreateItemSchema.partial()

// ===========================================
// Basic CRUD Actions
// ===========================================

/**
 * Create a new item
 */
export async function createItem(formData: FormData): Promise<ActionResult<{ id: string }>> {
  // Validate input
  const validated = CreateItemSchema.safeParse({
    title: formData.get('title'),
    description: formData.get('description'),
    category: formData.get('category'),
  })

  if (!validated.success) {
    return {
      success: false,
      error: 'Validation failed',
      fieldErrors: validated.error.flatten().fieldErrors,
    }
  }

  try {
    // Create item in database
    // const item = await db.items.create({ data: validated.data })
    const item = { id: 'new-id' } // Placeholder

    // Revalidate cache
    revalidatePath('/items')
    revalidateTag('items')

    return { success: true, data: { id: item.id } }
  } catch (error) {
    console.error('Failed to create item:', error)
    return { success: false, error: 'Failed to create item' }
  }
}

/**
 * Update an existing item
 */
export async function updateItem(
  id: string,
  formData: FormData
): Promise<ActionResult> {
  const validated = UpdateItemSchema.safeParse({
    title: formData.get('title') || undefined,
    description: formData.get('description') || undefined,
    category: formData.get('category') || undefined,
  })

  if (!validated.success) {
    return {
      success: false,
      error: 'Validation failed',
      fieldErrors: validated.error.flatten().fieldErrors,
    }
  }

  try {
    // Update item in database
    // await db.items.update({ where: { id }, data: validated.data })

    revalidatePath(`/items/${id}`)
    revalidatePath('/items')
    revalidateTag('items')

    return { success: true, data: undefined }
  } catch (error) {
    console.error('Failed to update item:', error)
    return { success: false, error: 'Failed to update item' }
  }
}

/**
 * Delete an item
 */
export async function deleteItem(id: string): Promise<ActionResult> {
  try {
    // Delete from database
    // await db.items.delete({ where: { id } })

    revalidatePath('/items')
    revalidateTag('items')

    return { success: true, data: undefined }
  } catch (error) {
    console.error('Failed to delete item:', error)
    return { success: false, error: 'Failed to delete item' }
  }
}

// ===========================================
// Form Action with useActionState Pattern
// ===========================================

const initialState: FormState = {}

/**
 * Server action compatible with useActionState hook
 */
export async function submitForm(
  prevState: FormState,
  formData: FormData
): Promise<FormState> {
  const validated = CreateItemSchema.safeParse({
    title: formData.get('title'),
    description: formData.get('description'),
    category: formData.get('category'),
  })

  if (!validated.success) {
    return {
      success: false,
      errors: validated.error.flatten().fieldErrors,
    }
  }

  try {
    // Process form data
    // await db.items.create({ data: validated.data })

    revalidatePath('/items')

    return {
      success: true,
      message: 'Item created successfully',
    }
  } catch (error) {
    return {
      success: false,
      message: 'An error occurred',
    }
  }
}

// ===========================================
// Action with Redirect
// ===========================================

/**
 * Create item and redirect to detail page
 */
export async function createAndRedirect(formData: FormData): Promise<void> {
  const validated = CreateItemSchema.safeParse({
    title: formData.get('title'),
    description: formData.get('description'),
    category: formData.get('category'),
  })

  if (!validated.success) {
    // Can't return errors with redirect, use different pattern
    throw new Error('Validation failed')
  }

  // Create item
  // const item = await db.items.create({ data: validated.data })
  const item = { id: 'new-id' } // Placeholder

  // IMPORTANT: revalidate BEFORE redirect
  revalidatePath('/items')

  // Redirect to new item
  redirect(`/items/${item.id}`)
}

// ===========================================
// Action with Authentication
// ===========================================

/**
 * Protected action requiring authentication
 */
export async function protectedAction(formData: FormData): Promise<ActionResult> {
  // Check authentication
  const cookieStore = await cookies()
  const sessionToken = cookieStore.get('session')?.value

  if (!sessionToken) {
    redirect('/login')
  }

  // Verify session
  // const session = await verifySession(sessionToken)
  // if (!session) {
  //   redirect('/login')
  // }

  // Perform action
  try {
    // await db.items.create({ data: { ...validated.data, userId: session.userId } })
    revalidatePath('/items')
    return { success: true, data: undefined }
  } catch (error) {
    return { success: false, error: 'Action failed' }
  }
}

// ===========================================
// Action with bind() Pattern
// ===========================================

/**
 * Delete action to be used with bind()
 *
 * Usage in component:
 * const deleteWithId = deleteItemById.bind(null, item.id)
 * <form action={deleteWithId}>
 *   <button type="submit">Delete</button>
 * </form>
 */
export async function deleteItemById(
  id: string,
  formData: FormData
): Promise<ActionResult> {
  try {
    // await db.items.delete({ where: { id } })
    revalidatePath('/items')
    return { success: true, data: undefined }
  } catch (error) {
    return { success: false, error: 'Failed to delete' }
  }
}

// ===========================================
// Cookie Management
// ===========================================

export async function setTheme(theme: 'light' | 'dark'): Promise<void> {
  const cookieStore = await cookies()

  cookieStore.set('theme', theme, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 60 * 60 * 24 * 365, // 1 year
    path: '/',
  })

  revalidatePath('/')
}

export async function clearSession(): Promise<void> {
  const cookieStore = await cookies()
  cookieStore.delete('session')
  redirect('/login')
}

// ===========================================
// File Upload Action
// ===========================================

export async function uploadFile(
  formData: FormData
): Promise<ActionResult<{ url: string }>> {
  const file = formData.get('file') as File | null

  if (!file) {
    return { success: false, error: 'No file provided' }
  }

  // Validate file
  const maxSize = 5 * 1024 * 1024 // 5MB
  if (file.size > maxSize) {
    return { success: false, error: 'File too large (max 5MB)' }
  }

  const allowedTypes = ['image/jpeg', 'image/png', 'image/webp']
  if (!allowedTypes.includes(file.type)) {
    return { success: false, error: 'Invalid file type' }
  }

  try {
    // Upload to storage (e.g., S3, Cloudinary)
    // const url = await uploadToStorage(file)

    return { success: true, data: { url: '/placeholder.jpg' } }
  } catch (error) {
    return { success: false, error: 'Upload failed' }
  }
}
