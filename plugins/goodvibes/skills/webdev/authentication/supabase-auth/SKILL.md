---
name: supabase-auth
description: Implements Supabase Authentication with email, OAuth, magic links, and phone auth. Use when building apps with Supabase, needing auth integrated with Row Level Security, or implementing passwordless login.
---

# Supabase Auth

Supabase Auth provides authentication integrated with PostgreSQL Row Level Security. Supports email/password, magic links, OTP, OAuth, and anonymous sign-in.

## Quick Start

```bash
npm install @supabase/supabase-js
```

```typescript
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)
```

## Email/Password Authentication

### Sign Up

```typescript
const { data, error } = await supabase.auth.signUp({
  email: 'user@example.com',
  password: 'secure-password',
  options: {
    data: {
      full_name: 'John Doe',
      avatar_url: 'https://example.com/avatar.png'
    },
    emailRedirectTo: 'https://myapp.com/welcome'
  }
})

if (error) {
  console.error('Sign up error:', error.message)
} else {
  console.log('Check email for confirmation')
}
```

### Sign In

```typescript
const { data, error } = await supabase.auth.signInWithPassword({
  email: 'user@example.com',
  password: 'secure-password'
})

if (error) {
  console.error('Sign in error:', error.message)
} else {
  console.log('User:', data.user)
  console.log('Session:', data.session)
}
```

### Sign Out

```typescript
const { error } = await supabase.auth.signOut()

// Sign out from all devices
const { error } = await supabase.auth.signOut({ scope: 'global' })
```

## Magic Link (Passwordless)

```typescript
const { error } = await supabase.auth.signInWithOtp({
  email: 'user@example.com',
  options: {
    emailRedirectTo: 'https://myapp.com/auth/callback'
  }
})

if (!error) {
  console.log('Check email for magic link')
}
```

## Phone/SMS Authentication

```typescript
// Send OTP
const { error } = await supabase.auth.signInWithOtp({
  phone: '+1234567890'
})

// Verify OTP
const { data, error } = await supabase.auth.verifyOtp({
  phone: '+1234567890',
  token: '123456',
  type: 'sms'
})
```

## OAuth (Social Login)

### Sign In with Provider

```typescript
const { data, error } = await supabase.auth.signInWithOAuth({
  provider: 'google',
  options: {
    redirectTo: 'https://myapp.com/auth/callback',
    scopes: 'email profile',
    queryParams: {
      access_type: 'offline',
      prompt: 'consent'
    }
  }
})

// Providers: google, github, discord, facebook, twitter,
// apple, azure, gitlab, bitbucket, linkedin, notion, slack, spotify, twitch, zoom
```

### Handle OAuth Callback

```typescript
// app/auth/callback/route.ts (Next.js App Router)
import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const next = searchParams.get('next') ?? '/'

  if (code) {
    const supabase = await createClient()
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error) {
      return NextResponse.redirect(`${origin}${next}`)
    }
  }

  return NextResponse.redirect(`${origin}/auth/error`)
}
```

## Anonymous Sign In

```typescript
// Enable in Dashboard: Authentication > Providers > Anonymous

const { data, error } = await supabase.auth.signInAnonymously()

// Convert anonymous to permanent user
const { error: linkError } = await supabase.auth.updateUser({
  email: 'user@example.com',
  password: 'new-password'
})
```

## Session Management

### Get Session

```typescript
// Get current session
const { data: { session } } = await supabase.auth.getSession()

// Get current user
const { data: { user } } = await supabase.auth.getUser()
```

### Listen to Auth Changes

```typescript
const { data: { subscription } } = supabase.auth.onAuthStateChange(
  (event, session) => {
    console.log('Auth event:', event)
    // Events: SIGNED_IN, SIGNED_OUT, TOKEN_REFRESHED,
    // USER_UPDATED, PASSWORD_RECOVERY

    if (event === 'SIGNED_IN') {
      console.log('User signed in:', session?.user)
    }

    if (event === 'SIGNED_OUT') {
      console.log('User signed out')
    }
  }
)

// Cleanup
subscription.unsubscribe()
```

### Refresh Session

```typescript
const { data, error } = await supabase.auth.refreshSession()
```

## Password Recovery

### Send Reset Email

```typescript
const { error } = await supabase.auth.resetPasswordForEmail(
  'user@example.com',
  {
    redirectTo: 'https://myapp.com/auth/reset-password'
  }
)
```

### Update Password

```typescript
// After user clicks reset link and is redirected
const { error } = await supabase.auth.updateUser({
  password: 'new-secure-password'
})
```

## Update User

```typescript
// Update email (sends confirmation)
const { data, error } = await supabase.auth.updateUser({
  email: 'new@example.com'
})

// Update password
const { data, error } = await supabase.auth.updateUser({
  password: 'new-password'
})

// Update metadata
const { data, error } = await supabase.auth.updateUser({
  data: {
    full_name: 'Jane Doe',
    avatar_url: 'https://example.com/new-avatar.png'
  }
})
```

## Next.js Integration

### Server-Side Client

```typescript
// lib/supabase/server.ts
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

export async function createClient() {
  const cookieStore = await cookies()

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          } catch {
            // Ignore in Server Components
          }
        },
      },
    }
  )
}
```

### Browser Client

```typescript
// lib/supabase/client.ts
import { createBrowserClient } from '@supabase/ssr'

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}
```

### Middleware

```typescript
// middleware.ts
import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          )
          response = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  // Refresh session
  await supabase.auth.getUser()

  return response
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
```

### Protected Server Component

```typescript
// app/dashboard/page.tsx
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

export default async function Dashboard() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  return <div>Welcome, {user.email}</div>
}
```

## React Hooks

### Auth Context

```typescript
// contexts/auth-context.tsx
'use client'
import { createContext, useContext, useEffect, useState } from 'react'
import { User, Session } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/client'

type AuthContextType = {
  user: User | null
  session: Session | null
  loading: boolean
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  session: null,
  loading: true
})

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)
  const supabase = createClient()

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      setUser(session?.user ?? null)
      setLoading(false)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        setSession(session)
        setUser(session?.user ?? null)
      }
    )

    return () => subscription.unsubscribe()
  }, [])

  return (
    <AuthContext.Provider value={{ user, session, loading }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
```

### Usage

```typescript
'use client'
import { useAuth } from '@/contexts/auth-context'

export default function Profile() {
  const { user, loading } = useAuth()

  if (loading) return <div>Loading...</div>
  if (!user) return <div>Not logged in</div>

  return <div>Hello, {user.email}</div>
}
```

## Multi-Factor Authentication

### Enroll TOTP

```typescript
// Start enrollment
const { data, error } = await supabase.auth.mfa.enroll({
  factorType: 'totp',
  friendlyName: 'Authenticator App'
})

// data contains:
// - id: factor ID
// - totp.qr_code: QR code SVG
// - totp.secret: manual entry secret
// - totp.uri: otpauth:// URI

// Verify enrollment
const { data: challenge } = await supabase.auth.mfa.challenge({
  factorId: data.id
})

const { data: verify, error } = await supabase.auth.mfa.verify({
  factorId: data.id,
  challengeId: challenge.id,
  code: '123456'
})
```

### Challenge During Login

```typescript
const { data, error } = await supabase.auth.signInWithPassword({
  email: 'user@example.com',
  password: 'password'
})

if (data.session === null && data.user) {
  // MFA required
  const factors = await supabase.auth.mfa.listFactors()
  const totpFactor = factors.data.totp[0]

  const { data: challenge } = await supabase.auth.mfa.challenge({
    factorId: totpFactor.id
  })

  // Get code from user, then verify
  const { data: session, error } = await supabase.auth.mfa.verify({
    factorId: totpFactor.id,
    challengeId: challenge.id,
    code: userEnteredCode
  })
}
```

## Row Level Security Integration

Auth integrates seamlessly with RLS:

```sql
-- Users can only read their own data
CREATE POLICY "Users read own data"
ON profiles FOR SELECT
TO authenticated
USING ((SELECT auth.uid()) = user_id);

-- Check auth in policies
CREATE POLICY "Authenticated users insert"
ON posts FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = author_id);
```

## Admin Operations

Use service role for admin operations:

```typescript
import { createClient } from '@supabase/supabase-js'

const supabaseAdmin = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  }
)

// Admin operations
const { data, error } = await supabaseAdmin.auth.admin.listUsers()

// Create user
const { data, error } = await supabaseAdmin.auth.admin.createUser({
  email: 'user@example.com',
  password: 'password',
  email_confirm: true
})

// Delete user
await supabaseAdmin.auth.admin.deleteUser(userId)
```

## Best Practices

1. **Use SSR package** - `@supabase/ssr` for server-side
2. **Middleware for session refresh** - Keep sessions alive
3. **Combine with RLS** - Database-level security
4. **Handle auth state changes** - Update UI reactively
5. **Use service role carefully** - Only server-side, never expose

## References

- [OAuth Providers](references/oauth-providers.md)
- [Email Templates](references/email-templates.md)
