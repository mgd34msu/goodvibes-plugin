# Firebase Admin SDK

## Overview

The Firebase Admin SDK provides privileged access to Firebase services from trusted environments (servers, cloud functions). Use it for:

- Custom token generation
- ID token verification
- User management
- Custom claims
- Session cookies

## Installation

```bash
npm install firebase-admin
```

## Initialization

### Using Service Account

```typescript
// lib/firebase-admin.ts
import { initializeApp, getApps, cert } from 'firebase-admin/app'
import { getAuth } from 'firebase-admin/auth'

const serviceAccount = JSON.parse(
  process.env.FIREBASE_SERVICE_ACCOUNT_KEY || '{}'
)

const app = getApps().length === 0
  ? initializeApp({
      credential: cert(serviceAccount)
    })
  : getApps()[0]

export const adminAuth = getAuth(app)
```

### Using Application Default Credentials

```typescript
import { initializeApp, applicationDefault } from 'firebase-admin/app'

initializeApp({
  credential: applicationDefault(),
  projectId: process.env.FIREBASE_PROJECT_ID
})
```

## User Management

### Get User

```typescript
// By UID
const user = await adminAuth.getUser(uid)

// By email
const user = await adminAuth.getUserByEmail(email)

// By phone
const user = await adminAuth.getUserByPhoneNumber('+1234567890')
```

### Create User

```typescript
const user = await adminAuth.createUser({
  email: 'user@example.com',
  password: 'password123',
  displayName: 'John Doe',
  photoURL: 'https://example.com/photo.jpg',
  emailVerified: true
})

console.log('Created user:', user.uid)
```

### Update User

```typescript
await adminAuth.updateUser(uid, {
  email: 'new@example.com',
  displayName: 'New Name',
  password: 'newPassword',
  emailVerified: true,
  disabled: false
})
```

### Delete User

```typescript
await adminAuth.deleteUser(uid)

// Delete multiple
await adminAuth.deleteUsers([uid1, uid2, uid3])
```

### List Users

```typescript
// List first 1000 users
const listUsersResult = await adminAuth.listUsers(1000)
listUsersResult.users.forEach(user => {
  console.log(user.uid, user.email)
})

// Paginate
let pageToken: string | undefined
do {
  const result = await adminAuth.listUsers(1000, pageToken)
  result.users.forEach(user => console.log(user.uid))
  pageToken = result.pageToken
} while (pageToken)
```

## Custom Claims

### Set Claims

```typescript
// Set role
await adminAuth.setCustomUserClaims(uid, { role: 'admin' })

// Set multiple
await adminAuth.setCustomUserClaims(uid, {
  role: 'admin',
  accessLevel: 5,
  department: 'engineering'
})
```

### Read Claims

```typescript
const user = await adminAuth.getUser(uid)
console.log(user.customClaims?.role)
```

### Remove Claims

```typescript
// Set to null to remove
await adminAuth.setCustomUserClaims(uid, { role: null })

// Or clear all
await adminAuth.setCustomUserClaims(uid, {})
```

### Propagate Claims

After setting claims, client needs fresh token:

```typescript
// Client-side: force token refresh
await auth.currentUser?.getIdToken(true)
```

## Token Verification

### Verify ID Token

```typescript
async function verifyIdToken(idToken: string) {
  try {
    const decodedToken = await adminAuth.verifyIdToken(idToken)
    return {
      uid: decodedToken.uid,
      email: decodedToken.email,
      role: decodedToken.role // custom claim
    }
  } catch (error) {
    throw new Error('Invalid token')
  }
}
```

### Check Token Revocation

```typescript
const decodedToken = await adminAuth.verifyIdToken(idToken, true)
// Throws if token revoked
```

### Revoke Tokens

```typescript
await adminAuth.revokeRefreshTokens(uid)
```

## Session Cookies

### Create Session Cookie

```typescript
import { cookies } from 'next/headers'

export async function createSession(idToken: string) {
  const expiresIn = 60 * 60 * 24 * 5 * 1000 // 5 days

  const sessionCookie = await adminAuth.createSessionCookie(idToken, {
    expiresIn
  })

  cookies().set('session', sessionCookie, {
    maxAge: expiresIn / 1000,
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/'
  })
}
```

### Verify Session Cookie

```typescript
export async function getSessionUser() {
  const session = cookies().get('session')?.value

  if (!session) return null

  try {
    const decodedClaims = await adminAuth.verifySessionCookie(session, true)
    return decodedClaims
  } catch (error) {
    return null
  }
}
```

### Clear Session

```typescript
export async function clearSession() {
  cookies().delete('session')
}
```

## Custom Tokens

### Create Custom Token

```typescript
// Simple token
const customToken = await adminAuth.createCustomToken(uid)

// With claims
const customToken = await adminAuth.createCustomToken(uid, {
  premiumAccount: true,
  role: 'admin'
})
```

### Client Signs In

```typescript
import { signInWithCustomToken } from 'firebase/auth'

const { user } = await signInWithCustomToken(auth, customToken)
```

## API Route Examples

### Protect API Route

```typescript
// app/api/protected/route.ts
import { adminAuth } from '@/lib/firebase-admin'
import { headers } from 'next/headers'

export async function GET() {
  const authHeader = headers().get('Authorization')
  const token = authHeader?.replace('Bearer ', '')

  if (!token) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const decoded = await adminAuth.verifyIdToken(token)
    return Response.json({ uid: decoded.uid })
  } catch {
    return Response.json({ error: 'Invalid token' }, { status: 401 })
  }
}
```

### Admin-Only Route

```typescript
export async function POST(request: Request) {
  const token = headers().get('Authorization')?.replace('Bearer ', '')

  if (!token) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const decoded = await adminAuth.verifyIdToken(token)

  if (decoded.role !== 'admin') {
    return Response.json({ error: 'Forbidden' }, { status: 403 })
  }

  // Admin logic here
}
```

## Import/Export Users

### Import Users

```typescript
const users = [
  {
    uid: 'uid1',
    email: 'user1@example.com',
    passwordHash: Buffer.from('password-hash'),
    passwordSalt: Buffer.from('salt')
  },
  {
    uid: 'uid2',
    email: 'user2@example.com',
    passwordHash: Buffer.from('password-hash'),
    passwordSalt: Buffer.from('salt')
  }
]

const result = await adminAuth.importUsers(users, {
  hash: {
    algorithm: 'BCRYPT'
  }
})

console.log(`Successfully imported ${result.successCount} users`)
console.log(`Failed to import ${result.failureCount} users`)
```

## Best Practices

1. **Keep service account key secret** - Environment variables only
2. **Verify tokens in API routes** - Never trust client
3. **Use session cookies for web** - More secure than client tokens
4. **Check token revocation** - For sensitive operations
5. **Set appropriate claim sizes** - Max 1KB per user
6. **Refresh claims promptly** - After role changes
