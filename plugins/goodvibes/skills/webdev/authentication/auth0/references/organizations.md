# Auth0 Organizations & SSO

## Organizations Overview

Auth0 Organizations allow you to manage B2B customers with:
- Isolated user populations per organization
- Custom branding per organization
- Multiple connection types (SSO, social, database)
- Role-based access within organizations

## Setup Organizations

### Create Organization

1. Go to Auth0 Dashboard > Organizations
2. Click "Create Organization"
3. Set name, display name, and branding

### Assign Connections

Enable authentication methods per organization:
- Enterprise SSO (SAML, OIDC)
- Social connections
- Database connections

## Login to Organization

### By Organization ID

```typescript
// app/auth/[auth0]/route.ts
import { handleAuth, handleLogin } from '@auth0/nextjs-auth0'

export const GET = handleAuth({
  login: handleLogin({
    authorizationParams: {
      organization: 'org_abc123'
    }
  })
})
```

### By Organization Name

```typescript
handleLogin({
  authorizationParams: {
    organization_name: 'acme-corp'
  }
})
```

### Dynamic Organization Selection

```typescript
// app/login/page.tsx
'use client'
import { useState } from 'react'

export default function LoginPage() {
  const [orgName, setOrgName] = useState('')

  return (
    <form action={`/auth/login?organization=${orgName}`}>
      <input
        type="text"
        placeholder="Organization name"
        value={orgName}
        onChange={(e) => setOrgName(e.target.value)}
      />
      <button type="submit">Login</button>
    </form>
  )
}
```

```typescript
// app/auth/[auth0]/route.ts
import { handleAuth, handleLogin } from '@auth0/nextjs-auth0'
import { NextRequest } from 'next/server'

export const GET = handleAuth({
  login: async (req: NextRequest) => {
    const org = req.nextUrl.searchParams.get('organization')
    return handleLogin(req, {
      authorizationParams: {
        organization: org || undefined
      }
    })
  }
})
```

## Organization Invitations

### Create Invitation

```typescript
// lib/auth0-management.ts
import { ManagementClient } from 'auth0'

const management = new ManagementClient({
  domain: process.env.AUTH0_DOMAIN!,
  clientId: process.env.AUTH0_MGMT_CLIENT_ID!,
  clientSecret: process.env.AUTH0_MGMT_CLIENT_SECRET!
})

export async function inviteToOrganization(
  orgId: string,
  email: string,
  roles: string[] = []
) {
  return management.organizations.createInvitation(
    { id: orgId },
    {
      inviter: { name: 'Admin' },
      invitee: { email },
      client_id: process.env.AUTH0_CLIENT_ID!,
      roles,
      send_invitation_email: true
    }
  )
}
```

### Accept Invitation

Users click the invitation link and are redirected to complete signup.

## Organization Roles

### Assign Roles

```typescript
export async function assignOrgRole(
  orgId: string,
  userId: string,
  roleIds: string[]
) {
  return management.organizations.addMemberRoles(
    { id: orgId, user_id: userId },
    { roles: roleIds }
  )
}
```

### Check Organization Roles

```typescript
// lib/auth.ts
import { getSession } from '@auth0/nextjs-auth0'

export async function getOrgRoles() {
  const session = await getSession()
  if (!session) return []

  return session.user['org_roles'] || []
}
```

### Add Roles to Token

Create an Auth0 Action (Login flow):

```javascript
exports.onExecutePostLogin = async (event, api) => {
  if (event.organization) {
    const roles = event.authorization?.roles || []
    api.idToken.setCustomClaim('org_roles', roles)
    api.idToken.setCustomClaim('org_id', event.organization.id)
    api.idToken.setCustomClaim('org_name', event.organization.name)
  }
}
```

## Enterprise SSO (SAML)

### Configure SAML Connection

1. Organizations > [Org] > Connections > Enable Connections
2. Add new Enterprise Connection > SAML
3. Configure with IdP metadata

### Connection Settings

```json
{
  "signinEndpoint": "https://idp.example.com/saml/sso",
  "signoutEndpoint": "https://idp.example.com/saml/slo",
  "certificate": "-----BEGIN CERTIFICATE-----...",
  "idpDomain": "example.com"
}
```

### Force SSO for Domain

```typescript
handleLogin({
  authorizationParams: {
    organization: 'org_123',
    connection: 'saml-enterprise' // Force specific connection
  }
})
```

## Organization Branding

### Custom Login Page

Organizations can have custom:
- Logo
- Primary color
- Background color
- Custom domain

### Access Branding in UI

```typescript
// Get organization metadata from session
const session = await getSession()
const orgId = session?.user.org_id
const orgName = session?.user.org_name
```

## Multi-Tenant Patterns

### Subdomain-Based

```typescript
// middleware.ts
import { NextRequest, NextResponse } from 'next/server'

export function middleware(req: NextRequest) {
  const hostname = req.headers.get('host') || ''
  const subdomain = hostname.split('.')[0]

  if (subdomain && subdomain !== 'www' && subdomain !== 'app') {
    // Store org in cookie or header for auth
    const response = NextResponse.next()
    response.cookies.set('org_name', subdomain)
    return response
  }
}
```

### Path-Based

```typescript
// app/[org]/layout.tsx
export default async function OrgLayout({
  children,
  params
}: {
  children: React.ReactNode
  params: { org: string }
}) {
  const session = await getSession()
  const userOrg = session?.user.org_name

  if (userOrg !== params.org) {
    redirect('/unauthorized')
  }

  return children
}
```

## Management API

### List Organization Members

```typescript
export async function getOrgMembers(orgId: string) {
  const members = await management.organizations.getMembers({ id: orgId })
  return members.data
}
```

### Remove Member

```typescript
export async function removeOrgMember(orgId: string, userId: string) {
  await management.organizations.deleteMembers(
    { id: orgId },
    { members: [userId] }
  )
}
```

### List User's Organizations

```typescript
export async function getUserOrganizations(userId: string) {
  const orgs = await management.users.getUserOrganizations({ id: userId })
  return orgs.data
}
```

## Best Practices

1. **Use organization_name** for user-friendly URLs
2. **Store org_id in session** via Actions
3. **Validate org membership** server-side
4. **Enable JIT provisioning** for SSO users
5. **Use invitation flow** for controlled access
6. **Implement org switching** for multi-org users
