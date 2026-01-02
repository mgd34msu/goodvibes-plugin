# Auth0 Actions

## Overview

Auth0 Actions are custom Node.js functions that execute at specific points in the authentication pipeline. They replace Rules and Hooks.

## Action Triggers

| Trigger | When It Runs |
|---------|--------------|
| Login / Post Login | After user authentication |
| Machine to Machine | After M2M token request |
| Pre User Registration | Before user is created |
| Post User Registration | After user is created |
| Post Change Password | After password change |
| Send Phone Message | When sending SMS/voice |
| Credentials Exchange | During OAuth token exchange |

## Creating Actions

### Dashboard

1. Actions > Library > Create Action
2. Select trigger
3. Write code
4. Deploy

### Basic Structure

```javascript
exports.onExecutePostLogin = async (event, api) => {
  // event contains user and request context
  // api provides methods to modify tokens/user
}
```

## Post Login Action Examples

### Add Custom Claims

```javascript
exports.onExecutePostLogin = async (event, api) => {
  const namespace = 'https://myapp.com'

  // Add roles to tokens
  if (event.authorization) {
    api.idToken.setCustomClaim(`${namespace}/roles`, event.authorization.roles)
    api.accessToken.setCustomClaim(`${namespace}/roles`, event.authorization.roles)
  }

  // Add user metadata
  api.idToken.setCustomClaim(`${namespace}/user_metadata`, event.user.user_metadata)
}
```

### Enrich User Profile

```javascript
const axios = require('axios')

exports.onExecutePostLogin = async (event, api) => {
  // Skip if already enriched
  if (event.user.app_metadata?.enriched) return

  try {
    const response = await axios.get(
      `https://api.myapp.com/users/${event.user.email}`
    )

    api.user.setAppMetadata('company', response.data.company)
    api.user.setAppMetadata('department', response.data.department)
    api.user.setAppMetadata('enriched', true)
  } catch (error) {
    // Continue even if enrichment fails
    console.log('Enrichment failed:', error.message)
  }
}
```

### Block Users

```javascript
exports.onExecutePostLogin = async (event, api) => {
  // Block specific domains
  const domain = event.user.email?.split('@')[1]
  if (domain === 'blocked.com') {
    api.access.deny('Access denied for this domain')
    return
  }

  // Require email verification
  if (!event.user.email_verified) {
    api.access.deny('Please verify your email first')
    return
  }

  // Block suspicious IPs
  const blockedIPs = ['1.2.3.4', '5.6.7.8']
  if (blockedIPs.includes(event.request.ip)) {
    api.access.deny('Access denied')
    return
  }
}
```

### Force MFA

```javascript
exports.onExecutePostLogin = async (event, api) => {
  // Require MFA for admins
  const roles = event.authorization?.roles || []

  if (roles.includes('admin')) {
    if (!event.authentication?.methods?.some(m => m.name === 'mfa')) {
      api.authentication.challengeWith({ type: 'otp' })
      return
    }
  }
}
```

### Conditional Access

```javascript
exports.onExecutePostLogin = async (event, api) => {
  // Require MFA from new devices
  const isNewDevice = event.authentication?.methods?.every(
    m => m.name !== 'mfa'
  )

  if (isNewDevice && event.stats.logins_count > 0) {
    api.authentication.challengeWith({ type: 'otp' })
    return
  }

  // Restrict by time
  const hour = new Date().getUTCHours()
  if (hour < 6 || hour > 22) {
    api.access.deny('Login not allowed outside business hours')
    return
  }
}
```

## Pre User Registration

### Validate Registration

```javascript
exports.onExecutePreUserRegistration = async (event, api) => {
  // Block disposable emails
  const disposableDomains = ['tempmail.com', 'throwaway.com']
  const domain = event.user.email?.split('@')[1]

  if (disposableDomains.includes(domain)) {
    api.access.deny('invalid_email', 'Disposable emails not allowed')
    return
  }

  // Set default metadata
  api.user.setAppMetadata('plan', 'free')
  api.user.setAppMetadata('signup_date', new Date().toISOString())
}
```

## Post User Registration

### Welcome Email & Sync

```javascript
const axios = require('axios')

exports.onExecutePostUserRegistration = async (event, api) => {
  // Sync to CRM
  await axios.post('https://api.myapp.com/users', {
    email: event.user.email,
    name: event.user.name,
    auth0_id: event.user.user_id
  })

  // Trigger welcome email
  await axios.post('https://api.myapp.com/email/welcome', {
    email: event.user.email,
    name: event.user.name
  })
}
```

## Secrets

Store sensitive values in Action Secrets:

```javascript
exports.onExecutePostLogin = async (event, api) => {
  const apiKey = event.secrets.MY_API_KEY

  const response = await axios.get('https://api.example.com', {
    headers: { 'X-API-Key': apiKey }
  })
}
```

## Dependencies

Add npm packages in the Action editor's Modules tab:

```javascript
const axios = require('axios')
const _ = require('lodash')

exports.onExecutePostLogin = async (event, api) => {
  // Use dependencies
}
```

## Event Object

Key properties available in `event`:

```javascript
event.user.email
event.user.name
event.user.user_id
event.user.email_verified
event.user.app_metadata
event.user.user_metadata
event.authorization.roles
event.request.ip
event.request.geoip.country_code
event.connection.name
event.organization?.id
event.organization?.name
event.stats.logins_count
event.authentication?.methods
event.secrets.MY_SECRET
```

## API Object

Methods available on `api`:

```javascript
// Tokens
api.idToken.setCustomClaim(key, value)
api.accessToken.setCustomClaim(key, value)

// Access control
api.access.deny(reason)

// MFA
api.authentication.challengeWith({ type: 'otp' })
api.authentication.recordMethod('mfa')

// User metadata
api.user.setAppMetadata(key, value)
api.user.setUserMetadata(key, value)

// Redirect
api.redirect.sendUserTo(url, { query: { token } })
api.redirect.canRedirect() // Check if redirect is allowed
```

## Testing Actions

Use the Action editor's Test feature:

```javascript
// Test event
{
  "user": {
    "email": "test@example.com",
    "email_verified": true,
    "user_id": "auth0|123"
  },
  "authorization": {
    "roles": ["admin"]
  }
}
```

## Best Practices

1. **Keep actions fast** - Under 10 seconds
2. **Handle errors gracefully** - Don't break login
3. **Use secrets** - Never hardcode credentials
4. **Test thoroughly** - Use test runner
5. **Log sparingly** - Avoid sensitive data
6. **Version control** - Export actions as code
