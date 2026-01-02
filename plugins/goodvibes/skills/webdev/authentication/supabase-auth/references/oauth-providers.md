# Supabase OAuth Providers

## Supported Providers

- Apple
- Azure
- Bitbucket
- Discord
- Facebook
- Figma
- GitHub
- GitLab
- Google
- Kakao
- Keycloak
- LinkedIn (OIDC)
- Notion
- Slack (OIDC)
- Spotify
- Twitch
- Twitter
- WorkOS
- Zoom

## Configuration

### Enable Provider in Dashboard

1. Authentication > Providers
2. Enable desired provider
3. Enter Client ID and Client Secret
4. Configure callback URL

### Callback URL Format

```
https://your-project.supabase.co/auth/v1/callback
```

## Provider Setup

### Google

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create OAuth 2.0 Client ID
3. Set authorized redirect URI to Supabase callback

```typescript
const { error } = await supabase.auth.signInWithOAuth({
  provider: 'google',
  options: {
    scopes: 'email profile',
    queryParams: {
      access_type: 'offline',
      prompt: 'consent'
    }
  }
})
```

### GitHub

1. GitHub Settings > Developer settings > OAuth Apps
2. Set callback URL

```typescript
const { error } = await supabase.auth.signInWithOAuth({
  provider: 'github',
  options: {
    scopes: 'read:user user:email'
  }
})
```

### Discord

1. Discord Developer Portal > Applications
2. OAuth2 > Add redirect

```typescript
const { error } = await supabase.auth.signInWithOAuth({
  provider: 'discord',
  options: {
    scopes: 'identify email'
  }
})
```

### Apple

1. Apple Developer > Certificates, IDs & Profiles
2. Create Services ID with Sign in with Apple

```typescript
const { error } = await supabase.auth.signInWithOAuth({
  provider: 'apple',
  options: {
    scopes: 'email name'
  }
})
```

### Twitter/X

1. Twitter Developer Portal
2. OAuth 2.0 settings

```typescript
const { error } = await supabase.auth.signInWithOAuth({
  provider: 'twitter'
})
```

## Custom OAuth Provider

Use OIDC for providers not directly supported:

```typescript
// Dashboard: Add custom OIDC provider
// Then use:
const { error } = await supabase.auth.signInWithOAuth({
  provider: 'your-custom-provider'
})
```

## Access Provider Data

### Get Provider Token

```typescript
const { data: { session } } = await supabase.auth.getSession()

// Access token from provider
const providerToken = session?.provider_token
const providerRefreshToken = session?.provider_refresh_token

// Use to call provider APIs
const response = await fetch('https://api.github.com/user', {
  headers: {
    Authorization: `Bearer ${providerToken}`
  }
})
```

### User Identities

```typescript
const { data: { user } } = await supabase.auth.getUser()

// All linked identities
const identities = user?.identities

// Find specific provider
const googleIdentity = identities?.find(i => i.provider === 'google')

// Provider user ID
const googleUserId = googleIdentity?.identity_data?.sub

// Provider metadata
const avatarUrl = user?.user_metadata?.avatar_url
const fullName = user?.user_metadata?.full_name
```

## Linking Identities

### Link Additional Provider

```typescript
const { error } = await supabase.auth.linkIdentity({
  provider: 'github'
})
// Redirects user to provider, then back
```

### Unlink Provider

```typescript
const { error } = await supabase.auth.unlinkIdentity({
  provider: 'github'
})
```

## Server-Side OAuth

### PKCE Flow

```typescript
// Generate code verifier and challenge
const { data, error } = await supabase.auth.signInWithOAuth({
  provider: 'google',
  options: {
    redirectTo: 'https://myapp.com/auth/callback',
    skipBrowserRedirect: true
  }
})

// Redirect user to data.url
// Handle callback on server
```

### Token Exchange

```typescript
// app/auth/callback/route.ts
import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const code = searchParams.get('code')

  if (code) {
    const supabase = await createClient()
    const { error } = await supabase.auth.exchangeCodeForSession(code)

    if (!error) {
      return NextResponse.redirect(new URL('/dashboard', request.url))
    }
  }

  return NextResponse.redirect(new URL('/auth/error', request.url))
}
```

## Common Patterns

### Social Login Buttons

```typescript
'use client'
import { createClient } from '@/lib/supabase/client'

const providers = ['google', 'github', 'discord'] as const

export function SocialLogin() {
  const supabase = createClient()

  const signIn = (provider: typeof providers[number]) => {
    supabase.auth.signInWithOAuth({
      provider,
      options: {
        redirectTo: `${window.location.origin}/auth/callback`
      }
    })
  }

  return (
    <div>
      {providers.map(provider => (
        <button key={provider} onClick={() => signIn(provider)}>
          Continue with {provider}
        </button>
      ))}
    </div>
  )
}
```

### Combined Email + Social

```typescript
export function AuthForm() {
  return (
    <div>
      <EmailPasswordForm />
      <div>or</div>
      <SocialLogin />
    </div>
  )
}
```

## Troubleshooting

### Common Issues

1. **Redirect URI mismatch** - Ensure exact match in provider settings
2. **Missing scopes** - Request necessary permissions
3. **CORS errors** - Check allowed origins
4. **Token expired** - Provider tokens are not auto-refreshed

### Debug Mode

```typescript
const supabase = createClient(url, key, {
  auth: {
    debug: true
  }
})
```
