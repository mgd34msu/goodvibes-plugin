# Passport.js OAuth Integration

## Available Strategies

Popular OAuth strategies:

| Provider | Package | Scope |
|----------|---------|-------|
| Google | passport-google-oauth20 | profile, email |
| GitHub | passport-github2 | user:email |
| Facebook | passport-facebook | email |
| Twitter | passport-twitter | - |
| Discord | passport-discord | identify, email |
| LinkedIn | passport-linkedin-oauth2 | r_emailaddress, r_liteprofile |
| Microsoft | passport-azure-ad | openid, profile, email |
| Apple | passport-apple | name, email |

## Standard OAuth Flow

```
User clicks "Login with Google"
    ↓
App redirects to Google
    ↓
User authenticates with Google
    ↓
Google redirects to callback URL with code
    ↓
Passport exchanges code for tokens
    ↓
Passport calls verify callback with profile
    ↓
App creates/finds user, starts session
```

## Generic Strategy Template

```typescript
import passport from 'passport'

passport.use(new ProviderStrategy({
    clientID: process.env.PROVIDER_CLIENT_ID!,
    clientSecret: process.env.PROVIDER_CLIENT_SECRET!,
    callbackURL: '/auth/provider/callback',
    scope: ['email', 'profile']
  },
  async (accessToken, refreshToken, profile, done) => {
    try {
      // 1. Check for existing user with this provider ID
      let user = await db.user.findFirst({
        where: { providerId: profile.id }
      })

      // 2. Check for existing user with same email
      if (!user && profile.emails?.[0]) {
        user = await db.user.findFirst({
          where: { email: profile.emails[0].value }
        })

        // Link provider to existing account
        if (user) {
          await db.user.update({
            where: { id: user.id },
            data: { providerId: profile.id }
          })
        }
      }

      // 3. Create new user if none found
      if (!user) {
        user = await db.user.create({
          data: {
            email: profile.emails?.[0].value,
            name: profile.displayName,
            avatar: profile.photos?.[0]?.value,
            providerId: profile.id,
            provider: 'provider'
          }
        })
      }

      done(null, user)
    } catch (error) {
      done(error as Error)
    }
  }
))
```

## Discord Strategy

```bash
npm install passport-discord
```

```typescript
import { Strategy as DiscordStrategy, Profile } from 'passport-discord'

passport.use(new DiscordStrategy({
    clientID: process.env.DISCORD_CLIENT_ID!,
    clientSecret: process.env.DISCORD_CLIENT_SECRET!,
    callbackURL: '/auth/discord/callback',
    scope: ['identify', 'email', 'guilds']
  },
  async (accessToken, refreshToken, profile: Profile, done) => {
    try {
      const user = await findOrCreateUser({
        discordId: profile.id,
        email: profile.email,
        username: profile.username,
        avatar: profile.avatar
          ? `https://cdn.discordapp.com/avatars/${profile.id}/${profile.avatar}.png`
          : null,
        guilds: profile.guilds // Array of guilds
      })

      done(null, user)
    } catch (error) {
      done(error as Error)
    }
  }
))

router.get('/auth/discord',
  passport.authenticate('discord')
)

router.get('/auth/discord/callback',
  passport.authenticate('discord', { failureRedirect: '/login' }),
  (req, res) => res.redirect('/dashboard')
)
```

## Twitter Strategy

```bash
npm install passport-twitter
```

```typescript
import { Strategy as TwitterStrategy } from 'passport-twitter'

passport.use(new TwitterStrategy({
    consumerKey: process.env.TWITTER_CONSUMER_KEY!,
    consumerSecret: process.env.TWITTER_CONSUMER_SECRET!,
    callbackURL: '/auth/twitter/callback',
    includeEmail: true
  },
  async (token, tokenSecret, profile, done) => {
    try {
      const user = await findOrCreateUser({
        twitterId: profile.id,
        username: profile.username,
        displayName: profile.displayName,
        email: profile.emails?.[0]?.value,
        avatar: profile.photos?.[0]?.value
      })

      done(null, user)
    } catch (error) {
      done(error as Error)
    }
  }
))
```

## Apple Sign In

```bash
npm install passport-apple
```

```typescript
import AppleStrategy from 'passport-apple'

passport.use(new AppleStrategy({
    clientID: process.env.APPLE_CLIENT_ID!, // Services ID
    teamID: process.env.APPLE_TEAM_ID!,
    keyID: process.env.APPLE_KEY_ID!,
    privateKeyString: process.env.APPLE_PRIVATE_KEY!,
    callbackURL: '/auth/apple/callback',
    scope: ['name', 'email']
  },
  async (accessToken, refreshToken, idToken, profile, done) => {
    try {
      // Apple only sends name on first login
      const user = await findOrCreateUser({
        appleId: profile.id,
        email: profile.email,
        name: profile.name
          ? `${profile.name.firstName} ${profile.name.lastName}`
          : undefined
      })

      done(null, user)
    } catch (error) {
      done(error as Error)
    }
  }
))

// Apple requires POST for callback
router.post('/auth/apple/callback',
  passport.authenticate('apple', { failureRedirect: '/login' }),
  (req, res) => res.redirect('/dashboard')
)
```

## Microsoft/Azure AD

```bash
npm install passport-azure-ad
```

```typescript
import { OIDCStrategy } from 'passport-azure-ad'

passport.use(new OIDCStrategy({
    identityMetadata: `https://login.microsoftonline.com/${process.env.AZURE_TENANT_ID}/v2.0/.well-known/openid-configuration`,
    clientID: process.env.AZURE_CLIENT_ID!,
    clientSecret: process.env.AZURE_CLIENT_SECRET!,
    responseType: 'code id_token',
    responseMode: 'form_post',
    redirectUrl: '/auth/microsoft/callback',
    scope: ['profile', 'email', 'openid'],
    passReqToCallback: false
  },
  async (iss, sub, profile, accessToken, refreshToken, done) => {
    try {
      const user = await findOrCreateUser({
        microsoftId: profile.oid,
        email: profile._json.email,
        name: profile.displayName
      })

      done(null, user)
    } catch (error) {
      done(error as Error)
    }
  }
))
```

## Store Access Tokens

For accessing provider APIs later:

```typescript
passport.use(new GoogleStrategy({
    // ...config
  },
  async (accessToken, refreshToken, profile, done) => {
    const user = await db.user.upsert({
      where: { googleId: profile.id },
      create: {
        googleId: profile.id,
        email: profile.emails[0].value,
        googleAccessToken: accessToken,
        googleRefreshToken: refreshToken
      },
      update: {
        googleAccessToken: accessToken,
        googleRefreshToken: refreshToken
      }
    })

    done(null, user)
  }
))

// Later: use stored tokens
async function getGoogleCalendar(userId: string) {
  const user = await db.user.findUnique({ where: { id: userId } })

  const response = await fetch('https://www.googleapis.com/calendar/v3/calendars/primary/events', {
    headers: {
      Authorization: `Bearer ${user.googleAccessToken}`
    }
  })

  return response.json()
}
```

## Handle Account Linking

```typescript
// middleware to require auth for linking
function requireAuth(req, res, next) {
  if (!req.isAuthenticated()) {
    // Store intended link in session
    req.session.linkProvider = req.params.provider
    return res.redirect('/login')
  }
  next()
}

// Link additional provider
router.get('/link/:provider', requireAuth, (req, res, next) => {
  passport.authenticate(req.params.provider)(req, res, next)
})

// In strategy callback
async (accessToken, refreshToken, profile, done) => {
  try {
    // Check if linking to existing user
    if (req.user) {
      await db.user.update({
        where: { id: req.user.id },
        data: { providerId: profile.id }
      })
      return done(null, req.user)
    }

    // Normal login/signup flow
    const user = await findOrCreateUser(profile)
    done(null, user)
  } catch (error) {
    done(error)
  }
}
```

## Error Handling

```typescript
router.get('/auth/google/callback',
  passport.authenticate('google', { failureRedirect: '/login' }),
  (req, res) => {
    res.redirect('/dashboard')
  }
)

// Custom error handling
router.get('/auth/google/callback', (req, res, next) => {
  passport.authenticate('google', (err, user, info) => {
    if (err) {
      console.error('OAuth error:', err)
      return res.redirect('/login?error=oauth_failed')
    }

    if (!user) {
      return res.redirect('/login?error=no_user')
    }

    req.logIn(user, (err) => {
      if (err) {
        return res.redirect('/login?error=session_failed')
      }
      res.redirect('/dashboard')
    })
  })(req, res, next)
})
```

## State Parameter

Prevent CSRF in OAuth flow:

```typescript
passport.use(new GoogleStrategy({
    clientID: process.env.GOOGLE_CLIENT_ID!,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    callbackURL: '/auth/google/callback',
    state: true  // Enable state parameter
  },
  // ...verify callback
))
```
