# Passport.js Session Management

## Session Configuration

### Basic Session Setup

```typescript
import session from 'express-session'

app.use(session({
  secret: process.env.SESSION_SECRET!,
  resave: false,
  saveUninitialized: false,
  name: 'sessionId', // Custom cookie name
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    maxAge: 24 * 60 * 60 * 1000, // 24 hours
    sameSite: 'lax'
  }
}))
```

### Configuration Options

| Option | Description | Recommendation |
|--------|-------------|----------------|
| secret | Key for signing session | Long random string |
| resave | Save session on every request | false |
| saveUninitialized | Save empty sessions | false |
| cookie.secure | Require HTTPS | true in production |
| cookie.httpOnly | No JavaScript access | true |
| cookie.sameSite | CSRF protection | 'lax' or 'strict' |
| cookie.maxAge | Cookie lifetime | Set based on needs |

## Session Stores

### Memory Store (Development Only)

```typescript
// Default - DO NOT use in production
app.use(session({
  secret: process.env.SESSION_SECRET!,
  resave: false,
  saveUninitialized: false
}))
```

### Redis Store

```bash
npm install connect-redis redis
```

```typescript
import RedisStore from 'connect-redis'
import { createClient } from 'redis'

const redisClient = createClient({
  url: process.env.REDIS_URL
})

redisClient.on('error', (err) => console.log('Redis error:', err))
await redisClient.connect()

app.use(session({
  store: new RedisStore({
    client: redisClient,
    prefix: 'sess:',
    ttl: 86400 // 1 day in seconds
  }),
  secret: process.env.SESSION_SECRET!,
  resave: false,
  saveUninitialized: false
}))
```

### PostgreSQL Store

```bash
npm install connect-pg-simple
```

```typescript
import pgSession from 'connect-pg-simple'
import pg from 'pg'

const pgPool = new pg.Pool({
  connectionString: process.env.DATABASE_URL
})

const PostgresStore = pgSession(session)

app.use(session({
  store: new PostgresStore({
    pool: pgPool,
    tableName: 'user_sessions',
    createTableIfMissing: true
  }),
  secret: process.env.SESSION_SECRET!,
  resave: false,
  saveUninitialized: false
}))
```

### MongoDB Store

```bash
npm install connect-mongo
```

```typescript
import MongoStore from 'connect-mongo'

app.use(session({
  store: MongoStore.create({
    mongoUrl: process.env.MONGODB_URL,
    collectionName: 'sessions',
    ttl: 24 * 60 * 60 // 1 day
  }),
  secret: process.env.SESSION_SECRET!,
  resave: false,
  saveUninitialized: false
}))
```

## Serialize/Deserialize

### Basic Serialization

```typescript
// Store user ID in session
passport.serializeUser((user: any, done) => {
  done(null, user.id)
})

// Retrieve user from ID
passport.deserializeUser(async (id: string, done) => {
  try {
    const user = await db.user.findUnique({ where: { id } })
    done(null, user)
  } catch (error) {
    done(error)
  }
})
```

### With Caching

```typescript
import { LRUCache } from 'lru-cache'

const userCache = new LRUCache<string, User>({
  max: 500,
  ttl: 1000 * 60 * 5 // 5 minutes
})

passport.deserializeUser(async (id: string, done) => {
  try {
    // Check cache first
    let user = userCache.get(id)

    if (!user) {
      user = await db.user.findUnique({ where: { id } })
      if (user) {
        userCache.set(id, user)
      }
    }

    done(null, user)
  } catch (error) {
    done(error)
  }
})

// Invalidate cache on user update
async function updateUser(id: string, data: UpdateData) {
  const user = await db.user.update({ where: { id }, data })
  userCache.delete(id)
  return user
}
```

## Session Regeneration

Regenerate session ID after login to prevent session fixation:

```typescript
router.post('/login', (req, res, next) => {
  passport.authenticate('local', (err, user, info) => {
    if (err) return next(err)
    if (!user) return res.status(401).json({ error: info?.message })

    // Regenerate session
    req.session.regenerate((err) => {
      if (err) return next(err)

      req.logIn(user, (err) => {
        if (err) return next(err)
        res.json({ user })
      })
    })
  })(req, res, next)
})
```

## Session Data

### Store Additional Data

```typescript
// After login
router.post('/login', (req, res, next) => {
  passport.authenticate('local', (err, user, info) => {
    // ...auth logic

    req.logIn(user, (err) => {
      if (err) return next(err)

      // Store additional data
      req.session.loginTime = new Date()
      req.session.ipAddress = req.ip

      res.json({ user })
    })
  })(req, res, next)
})

// Access later
app.get('/session-info', (req, res) => {
  res.json({
    loginTime: req.session.loginTime,
    ipAddress: req.session.ipAddress
  })
})
```

### TypeScript Session Types

```typescript
// types/session.d.ts
import 'express-session'

declare module 'express-session' {
  interface SessionData {
    loginTime?: Date
    ipAddress?: string
    returnTo?: string
  }
}
```

## Session Timeout

### Sliding Expiration

```typescript
app.use((req, res, next) => {
  if (req.session && req.isAuthenticated()) {
    // Reset expiration on activity
    req.session.touch()
  }
  next()
})
```

### Idle Timeout

```typescript
const IDLE_TIMEOUT = 30 * 60 * 1000 // 30 minutes

app.use((req, res, next) => {
  if (req.session && req.user) {
    const now = Date.now()
    const lastActivity = req.session.lastActivity || now

    if (now - lastActivity > IDLE_TIMEOUT) {
      return req.logout((err) => {
        if (err) return next(err)
        res.redirect('/login?expired=true')
      })
    }

    req.session.lastActivity = now
  }
  next()
})
```

## Multiple Sessions

### Track Active Sessions

```typescript
// Store session IDs per user
async function trackSession(userId: string, sessionId: string) {
  await redis.sadd(`user:${userId}:sessions`, sessionId)
}

// In serializeUser
passport.serializeUser(async (user: any, done) => {
  done(null, user.id)
})

// After login
req.logIn(user, async (err) => {
  if (err) return next(err)
  await trackSession(user.id, req.session.id)
  res.json({ user })
})
```

### Invalidate All Sessions

```typescript
async function invalidateAllSessions(userId: string) {
  const sessionIds = await redis.smembers(`user:${userId}:sessions`)

  for (const sessionId of sessionIds) {
    await redis.del(`sess:${sessionId}`)
  }

  await redis.del(`user:${userId}:sessions`)
}

// Logout everywhere
router.post('/logout-all', async (req, res) => {
  const userId = (req.user as any).id
  await invalidateAllSessions(userId)
  req.logout(() => res.json({ message: 'Logged out everywhere' }))
})
```

## Security Best Practices

### 1. Rotate Session Secret

```typescript
// Use multiple secrets (newest first)
app.use(session({
  secret: [
    process.env.SESSION_SECRET_NEW!,
    process.env.SESSION_SECRET_OLD!
  ],
  // ...rest
}))
```

### 2. Secure Cookie Settings

```typescript
app.use(session({
  cookie: {
    secure: true,          // HTTPS only
    httpOnly: true,        // No JS access
    sameSite: 'strict',    // CSRF protection
    domain: '.myapp.com',  // Subdomain sharing
    path: '/'
  }
}))
```

### 3. Trust Proxy

```typescript
// Behind load balancer
app.set('trust proxy', 1)

app.use(session({
  cookie: {
    secure: true // Works with trust proxy
  }
}))
```

### 4. Session Fixation Prevention

```typescript
// Always regenerate on authentication
req.session.regenerate((err) => {
  if (err) return next(err)
  req.logIn(user, next)
})
```

## Debugging

```typescript
// Log session operations
app.use((req, res, next) => {
  console.log('Session ID:', req.session.id)
  console.log('Session data:', req.session)
  console.log('Authenticated:', req.isAuthenticated())
  next()
})
```
