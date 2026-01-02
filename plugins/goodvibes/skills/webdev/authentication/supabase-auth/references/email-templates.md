# Supabase Email Templates

## Template Types

- **Confirm signup** - Email verification on registration
- **Invite user** - Admin invitation to join
- **Magic Link** - Passwordless login
- **Change Email Address** - Email change confirmation
- **Reset Password** - Password recovery

## Customizing Templates

### Dashboard

Authentication > Email Templates > Select template

### Template Variables

| Variable | Description |
|----------|-------------|
| `{{ .SiteURL }}` | Your app's URL |
| `{{ .ConfirmationURL }}` | Full confirmation link |
| `{{ .Token }}` | Verification token |
| `{{ .TokenHash }}` | Token hash for API |
| `{{ .Email }}` | User's email |
| `{{ .RedirectTo }}` | After-confirmation redirect |

## Example Templates

### Confirm Signup

```html
<h2>Confirm your signup</h2>
<p>Follow this link to confirm your account:</p>
<p><a href="{{ .ConfirmationURL }}">Confirm your email</a></p>
```

### Magic Link

```html
<h2>Your magic link</h2>
<p>Click to sign in:</p>
<p><a href="{{ .ConfirmationURL }}">Sign in to MyApp</a></p>
<p>This link expires in 24 hours.</p>
```

### Reset Password

```html
<h2>Reset your password</h2>
<p>Someone requested a password reset for your account.</p>
<p><a href="{{ .ConfirmationURL }}">Reset Password</a></p>
<p>If you didn't request this, ignore this email.</p>
```

## Custom SMTP

### Configure SMTP

Dashboard > Project Settings > Auth > SMTP Settings

```
Host: smtp.sendgrid.net
Port: 587
Username: apikey
Password: your-sendgrid-api-key
Sender email: noreply@myapp.com
Sender name: MyApp
```

### Supported Providers

- SendGrid
- Mailgun
- AWS SES
- Resend
- Postmark
- Any SMTP server

## Email Redirect URLs

### Configure Allowed URLs

Dashboard > Authentication > URL Configuration

```
Site URL: https://myapp.com
Redirect URLs:
  - https://myapp.com/auth/callback
  - https://myapp.com/auth/confirm
  - http://localhost:3000/auth/callback (dev)
```

### Dynamic Redirects

```typescript
await supabase.auth.signUp({
  email: 'user@example.com',
  password: 'password',
  options: {
    emailRedirectTo: 'https://myapp.com/welcome'
  }
})
```

## Handling Email Confirmation

### Check Email Confirmed

```typescript
const { data: { user } } = await supabase.auth.getUser()

if (!user?.email_confirmed_at) {
  // Email not confirmed
  return <ResendConfirmation />
}
```

### Resend Confirmation

```typescript
const { error } = await supabase.auth.resend({
  type: 'signup',
  email: 'user@example.com',
  options: {
    emailRedirectTo: 'https://myapp.com/welcome'
  }
})
```

## Confirmation Flow

### Token-Based (Server-Side)

```typescript
// app/auth/confirm/route.ts
import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const token_hash = searchParams.get('token_hash')
  const type = searchParams.get('type')
  const next = searchParams.get('next') ?? '/'

  if (token_hash && type) {
    const supabase = await createClient()
    const { error } = await supabase.auth.verifyOtp({
      type,
      token_hash
    })

    if (!error) {
      return NextResponse.redirect(new URL(next, request.url))
    }
  }

  return NextResponse.redirect(new URL('/auth/error', request.url))
}
```

### Link-Based (Client-Side)

```typescript
// Email template uses {{ .ConfirmationURL }}
// User clicks, Supabase handles verification
// Redirected to your site with session
```

## Invite Users

### Send Invitation

```typescript
// Requires service role key
const { data, error } = await supabaseAdmin.auth.admin.inviteUserByEmail(
  'newuser@example.com',
  {
    redirectTo: 'https://myapp.com/setup-account'
  }
)
```

### Handle Invitation

```typescript
// app/setup-account/page.tsx
'use client'
import { useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

export default function SetupAccount() {
  const searchParams = useSearchParams()
  const supabase = createClient()

  const handleSetup = async (password: string) => {
    const { error } = await supabase.auth.updateUser({
      password
    })

    if (!error) {
      window.location.href = '/dashboard'
    }
  }

  return <PasswordSetupForm onSubmit={handleSetup} />
}
```

## Rate Limiting

Email sending is rate limited:
- Confirm signup: 1 per 60 seconds per email
- Magic link: 1 per 60 seconds per email
- Password reset: 1 per 60 seconds per email

Handle in UI:

```typescript
const [cooldown, setCooldown] = useState(false)

const resend = async () => {
  const { error } = await supabase.auth.resend({
    type: 'signup',
    email
  })

  if (error?.message.includes('rate')) {
    setCooldown(true)
    setTimeout(() => setCooldown(false), 60000)
  }
}
```

## Testing Emails

### Local Development

Use Supabase CLI with Inbucket:

```bash
supabase start
# Inbucket UI at http://localhost:54324
```

### Mailtrap for Staging

Configure SMTP with Mailtrap credentials for testing.
