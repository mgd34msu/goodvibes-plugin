---
name: redis
description: Uses Redis for caching, sessions, pub/sub, and data structures with Node.js. Use when implementing caching, session storage, real-time messaging, or high-performance data storage.
---

# Redis

In-memory data store for caching, sessions, and real-time features.

## Quick Start

**Install:**
```bash
npm install redis
```

**Connect:**
```typescript
import { createClient } from 'redis';

const redis = createClient({
  url: process.env.REDIS_URL || 'redis://localhost:6379',
});

redis.on('error', (err) => console.error('Redis error:', err));
redis.on('connect', () => console.log('Redis connected'));

await redis.connect();
```

## Basic Operations

### Strings

```typescript
// Set value
await redis.set('key', 'value');

// Set with expiration (seconds)
await redis.setEx('key', 3600, 'value');

// Set with expiration (milliseconds)
await redis.pSetEx('key', 60000, 'value');

// Set if not exists
await redis.setNX('key', 'value');

// Get value
const value = await redis.get('key');

// Get multiple
const values = await redis.mGet(['key1', 'key2', 'key3']);

// Increment
await redis.incr('counter');
await redis.incrBy('counter', 5);
await redis.incrByFloat('counter', 1.5);

// Decrement
await redis.decr('counter');
await redis.decrBy('counter', 5);

// Append
await redis.append('key', ' more text');

// Get length
const length = await redis.strLen('key');
```

### Key Operations

```typescript
// Check existence
const exists = await redis.exists('key');

// Delete
await redis.del('key');
await redis.del(['key1', 'key2']);

// Set expiration
await redis.expire('key', 3600);        // seconds
await redis.pExpire('key', 60000);      // milliseconds
await redis.expireAt('key', timestamp); // Unix timestamp

// Get TTL
const ttl = await redis.ttl('key');     // seconds
const pttl = await redis.pTtl('key');   // milliseconds

// Remove expiration
await redis.persist('key');

// Rename
await redis.rename('oldKey', 'newKey');

// Find keys (use carefully in production)
const keys = await redis.keys('user:*');

// Scan (safer for production)
for await (const key of redis.scanIterator({ MATCH: 'user:*' })) {
  console.log(key);
}
```

### Hashes

```typescript
// Set field
await redis.hSet('user:1', 'name', 'John');

// Set multiple fields
await redis.hSet('user:1', {
  name: 'John',
  email: 'john@example.com',
  age: '30',
});

// Get field
const name = await redis.hGet('user:1', 'name');

// Get all fields
const user = await redis.hGetAll('user:1');
// { name: 'John', email: 'john@example.com', age: '30' }

// Get multiple fields
const values = await redis.hmGet('user:1', ['name', 'email']);

// Check field exists
const exists = await redis.hExists('user:1', 'name');

// Increment field
await redis.hIncrBy('user:1', 'age', 1);

// Delete field
await redis.hDel('user:1', 'email');

// Get all field names
const fields = await redis.hKeys('user:1');

// Get all values
const vals = await redis.hVals('user:1');
```

### Lists

```typescript
// Push to left (prepend)
await redis.lPush('queue', 'item1');
await redis.lPush('queue', ['item2', 'item3']);

// Push to right (append)
await redis.rPush('queue', 'item');

// Pop from left
const item = await redis.lPop('queue');

// Pop from right
const item = await redis.rPop('queue');

// Blocking pop (with timeout)
const result = await redis.blPop('queue', 5);

// Get range
const items = await redis.lRange('queue', 0, -1); // All items
const items = await redis.lRange('queue', 0, 9);  // First 10

// Get length
const length = await redis.lLen('queue');

// Get by index
const item = await redis.lIndex('queue', 0);

// Set by index
await redis.lSet('queue', 0, 'new-value');

// Trim list
await redis.lTrim('queue', 0, 99); // Keep first 100
```

### Sets

```typescript
// Add members
await redis.sAdd('tags', 'redis');
await redis.sAdd('tags', ['nodejs', 'typescript']);

// Check membership
const isMember = await redis.sIsMember('tags', 'redis');

// Get all members
const members = await redis.sMembers('tags');

// Get random member
const random = await redis.sRandMember('tags');

// Remove member
await redis.sRem('tags', 'nodejs');

// Get count
const count = await redis.sCard('tags');

// Set operations
const union = await redis.sUnion(['set1', 'set2']);
const intersection = await redis.sInter(['set1', 'set2']);
const difference = await redis.sDiff(['set1', 'set2']);
```

### Sorted Sets

```typescript
// Add with score
await redis.zAdd('leaderboard', { score: 100, value: 'user:1' });
await redis.zAdd('leaderboard', [
  { score: 200, value: 'user:2' },
  { score: 150, value: 'user:3' },
]);

// Get range by rank (ascending)
const top10 = await redis.zRange('leaderboard', 0, 9);

// Get range with scores
const top10 = await redis.zRangeWithScores('leaderboard', 0, 9);
// [{ score: 100, value: 'user:1' }, ...]

// Get range by rank (descending)
const top10 = await redis.zRange('leaderboard', 0, 9, { REV: true });

// Get range by score
const users = await redis.zRangeByScore('leaderboard', 100, 200);

// Get rank
const rank = await redis.zRank('leaderboard', 'user:1');
const revRank = await redis.zRevRank('leaderboard', 'user:1');

// Get score
const score = await redis.zScore('leaderboard', 'user:1');

// Increment score
await redis.zIncrBy('leaderboard', 10, 'user:1');

// Remove member
await redis.zRem('leaderboard', 'user:1');

// Get count
const count = await redis.zCard('leaderboard');
```

## Caching Patterns

### Cache-Aside

```typescript
async function getUser(userId: string): Promise<User> {
  const cacheKey = `user:${userId}`;

  // Try cache first
  const cached = await redis.get(cacheKey);
  if (cached) {
    return JSON.parse(cached);
  }

  // Fetch from database
  const user = await db.users.findUnique({ where: { id: userId } });

  if (user) {
    // Store in cache
    await redis.setEx(cacheKey, 3600, JSON.stringify(user));
  }

  return user;
}

async function updateUser(userId: string, data: Partial<User>) {
  // Update database
  const user = await db.users.update({
    where: { id: userId },
    data,
  });

  // Invalidate cache
  await redis.del(`user:${userId}`);

  return user;
}
```

### Cache with Wrapper

```typescript
async function withCache<T>(
  key: string,
  ttl: number,
  fn: () => Promise<T>
): Promise<T> {
  const cached = await redis.get(key);

  if (cached) {
    return JSON.parse(cached);
  }

  const result = await fn();
  await redis.setEx(key, ttl, JSON.stringify(result));

  return result;
}

// Usage
const user = await withCache(
  `user:${userId}`,
  3600,
  () => db.users.findUnique({ where: { id: userId } })
);
```

## Session Storage

### Express Session

```typescript
import session from 'express-session';
import RedisStore from 'connect-redis';

const redisStore = new RedisStore({
  client: redis,
  prefix: 'session:',
});

app.use(
  session({
    store: redisStore,
    secret: process.env.SESSION_SECRET!,
    resave: false,
    saveUninitialized: false,
    cookie: {
      secure: process.env.NODE_ENV === 'production',
      httpOnly: true,
      maxAge: 24 * 60 * 60 * 1000, // 24 hours
    },
  })
);
```

## Pub/Sub

### Publisher

```typescript
const publisher = createClient({ url: process.env.REDIS_URL });
await publisher.connect();

// Publish message
await publisher.publish('notifications', JSON.stringify({
  type: 'NEW_MESSAGE',
  userId: '123',
  content: 'Hello!',
}));
```

### Subscriber

```typescript
const subscriber = createClient({ url: process.env.REDIS_URL });
await subscriber.connect();

// Subscribe to channel
await subscriber.subscribe('notifications', (message) => {
  const data = JSON.parse(message);
  console.log('Received:', data);
});

// Subscribe to pattern
await subscriber.pSubscribe('user:*', (message, channel) => {
  console.log(`${channel}: ${message}`);
});

// Unsubscribe
await subscriber.unsubscribe('notifications');
```

## Rate Limiting

### Sliding Window

```typescript
async function rateLimit(
  key: string,
  limit: number,
  windowMs: number
): Promise<boolean> {
  const now = Date.now();
  const windowStart = now - windowMs;

  // Remove old entries
  await redis.zRemRangeByScore(key, '-inf', windowStart);

  // Count requests in window
  const count = await redis.zCard(key);

  if (count >= limit) {
    return false; // Rate limited
  }

  // Add current request
  await redis.zAdd(key, { score: now, value: `${now}` });
  await redis.pExpire(key, windowMs);

  return true;
}

// Usage in middleware
app.use(async (req, res, next) => {
  const key = `ratelimit:${req.ip}`;
  const allowed = await rateLimit(key, 100, 60000); // 100 req/min

  if (!allowed) {
    return res.status(429).json({ error: 'Too many requests' });
  }

  next();
});
```

### Token Bucket

```typescript
async function tokenBucket(
  key: string,
  maxTokens: number,
  refillRate: number
): Promise<boolean> {
  const now = Date.now();
  const data = await redis.hGetAll(key);

  let tokens = maxTokens;
  let lastRefill = now;

  if (data.tokens) {
    const elapsed = now - parseInt(data.lastRefill);
    const refill = (elapsed / 1000) * refillRate;
    tokens = Math.min(maxTokens, parseFloat(data.tokens) + refill);
    lastRefill = parseInt(data.lastRefill);
  }

  if (tokens < 1) {
    return false;
  }

  await redis.hSet(key, {
    tokens: String(tokens - 1),
    lastRefill: String(now),
  });
  await redis.expire(key, 3600);

  return true;
}
```

## Distributed Locks

```typescript
async function acquireLock(
  lockKey: string,
  ttl: number
): Promise<string | null> {
  const lockValue = crypto.randomUUID();

  const acquired = await redis.set(lockKey, lockValue, {
    NX: true,
    PX: ttl,
  });

  return acquired ? lockValue : null;
}

async function releaseLock(lockKey: string, lockValue: string): Promise<void> {
  // Only release if we own the lock
  const script = `
    if redis.call("get", KEYS[1]) == ARGV[1] then
      return redis.call("del", KEYS[1])
    else
      return 0
    end
  `;

  await redis.eval(script, {
    keys: [lockKey],
    arguments: [lockValue],
  });
}

// Usage
const lockValue = await acquireLock('order:123', 5000);
if (lockValue) {
  try {
    await processOrder('123');
  } finally {
    await releaseLock('order:123', lockValue);
  }
}
```

## Best Practices

1. **Use connection pooling** - Reuse connections
2. **Set TTL on keys** - Prevent memory leaks
3. **Use pipelines for batching** - Reduce round trips
4. **Use hashes for objects** - More efficient than JSON strings
5. **Monitor memory usage** - Redis is memory-bound

## Common Mistakes

| Mistake | Fix |
|---------|-----|
| Keys without TTL | Always set expiration |
| Using KEYS in production | Use SCAN instead |
| Large values | Keep values under 1MB |
| Not handling errors | Add error event listener |
| Single connection for pub/sub | Use separate connections |

## Reference Files

- [references/patterns.md](references/patterns.md) - Caching patterns
- [references/data-structures.md](references/data-structures.md) - Data structure usage
- [references/cluster.md](references/cluster.md) - Redis cluster setup
