# Turso Embedded Replicas

## Overview

Embedded replicas are local SQLite database files that sync with your Turso primary database. They provide:

- **Zero latency reads** - Data is local
- **Offline capability** - Works without network
- **Reduced costs** - Fewer remote queries
- **Sync on demand** - Control when to update

## How It Works

```
┌─────────────────┐         ┌─────────────────┐
│   Your App      │         │  Turso Cloud    │
│                 │  sync   │                 │
│  ┌───────────┐  │ ──────> │  Primary DB     │
│  │ Local     │  │ <────── │                 │
│  │ Replica   │  │         │  ┌──────────┐   │
│  └───────────┘  │         │  │ Replicas │   │
│                 │         │  └──────────┘   │
└─────────────────┘         └─────────────────┘
```

- **Reads**: Served from local replica (instant)
- **Writes**: Sent to primary, then synced back
- **Sync**: Pull changes from primary to local

## Setup

### Basic Configuration

```typescript
import { createClient } from '@libsql/client'

const client = createClient({
  url: 'file:local-replica.db',           // Local SQLite file
  syncUrl: process.env.TURSO_DATABASE_URL!, // Remote Turso URL
  authToken: process.env.TURSO_AUTH_TOKEN!
})

// Initial sync
await client.sync()
```

### With Auto-Sync Interval

```typescript
const client = createClient({
  url: 'file:data/app.db',
  syncUrl: process.env.TURSO_DATABASE_URL!,
  authToken: process.env.TURSO_AUTH_TOKEN!,
  syncInterval: 60  // Sync every 60 seconds
})
```

### In-Memory Replica

```typescript
const client = createClient({
  url: ':memory:',  // In-memory SQLite
  syncUrl: process.env.TURSO_DATABASE_URL!,
  authToken: process.env.TURSO_AUTH_TOKEN!
})
```

## Sync Strategies

### On-Demand Sync

```typescript
// Sync before critical reads
await client.sync()
const { rows } = await client.execute('SELECT * FROM orders WHERE status = ?', ['pending'])
```

### Periodic Background Sync

```typescript
// Start background sync
const syncInterval = setInterval(async () => {
  try {
    await client.sync()
    console.log('Synced at', new Date().toISOString())
  } catch (error) {
    console.error('Sync failed:', error)
  }
}, 60000) // Every minute

// Cleanup
process.on('SIGTERM', () => clearInterval(syncInterval))
```

### Event-Driven Sync

```typescript
// Sync after important writes
async function createOrder(orderData: OrderData) {
  // Write goes to primary
  await client.execute({
    sql: 'INSERT INTO orders (user_id, total) VALUES (?, ?)',
    args: [orderData.userId, orderData.total]
  })

  // Sync to get the write locally
  await client.sync()

  // Now local replica has the new order
}
```

### Sync After Writes Pattern

```typescript
class SyncingClient {
  private client: Client
  private dirty = false

  constructor(config: Config) {
    this.client = createClient(config)
  }

  async execute(sql: string, args?: any[]) {
    const result = await this.client.execute({ sql, args })

    // Track if this was a write
    if (sql.trim().match(/^(INSERT|UPDATE|DELETE)/i)) {
      this.dirty = true
    }

    return result
  }

  async syncIfDirty() {
    if (this.dirty) {
      await this.client.sync()
      this.dirty = false
    }
  }
}
```

## Platform Integration

### Node.js Server

```typescript
// server.ts
import { createClient } from '@libsql/client'
import express from 'express'

const client = createClient({
  url: 'file:./data/app.db',
  syncUrl: process.env.TURSO_DATABASE_URL!,
  authToken: process.env.TURSO_AUTH_TOKEN!
})

// Initial sync on startup
await client.sync()

const app = express()

// Sync periodically
setInterval(() => client.sync(), 30000)

app.get('/users', async (req, res) => {
  // Reads from local replica - instant
  const { rows } = await client.execute('SELECT * FROM users')
  res.json(rows)
})

app.post('/users', async (req, res) => {
  // Writes go to primary
  await client.execute({
    sql: 'INSERT INTO users (email) VALUES (?)',
    args: [req.body.email]
  })

  // Sync to get the write locally
  await client.sync()

  res.json({ success: true })
})
```

### Electron App

```typescript
// main.ts
import { createClient } from '@libsql/client'
import { app } from 'electron'
import path from 'path'

const dbPath = path.join(app.getPath('userData'), 'data.db')

const client = createClient({
  url: `file:${dbPath}`,
  syncUrl: process.env.TURSO_DATABASE_URL!,
  authToken: process.env.TURSO_AUTH_TOKEN!
})

// Sync on app start
app.whenReady().then(async () => {
  await client.sync()
})

// Sync before quit
app.on('before-quit', async (event) => {
  event.preventDefault()
  await client.sync()
  app.exit()
})

// Expose to renderer via IPC
ipcMain.handle('db:query', async (event, sql, args) => {
  const result = await client.execute({ sql, args })
  return result.rows
})
```

### Docker Container

```dockerfile
# Dockerfile
FROM node:20-alpine

WORKDIR /app

# Create directory for replica
RUN mkdir -p /data

COPY package*.json ./
RUN npm install

COPY . .

# Replica stored in volume
ENV TURSO_LOCAL_DB="file:/data/replica.db"

CMD ["node", "server.js"]
```

```yaml
# docker-compose.yml
services:
  app:
    build: .
    volumes:
      - db-data:/data
    environment:
      - TURSO_DATABASE_URL=${TURSO_DATABASE_URL}
      - TURSO_AUTH_TOKEN=${TURSO_AUTH_TOKEN}

volumes:
  db-data:
```

## Read-Your-Writes

Ensure you see your own writes immediately:

```typescript
async function createAndFetch(data: Data) {
  // Write
  const insertResult = await client.execute({
    sql: 'INSERT INTO items (name) VALUES (?) RETURNING id',
    args: [data.name]
  })

  const id = insertResult.rows[0].id

  // Sync to get the write in local replica
  await client.sync()

  // Now we can read it locally
  const { rows } = await client.execute({
    sql: 'SELECT * FROM items WHERE id = ?',
    args: [id]
  })

  return rows[0]
}
```

## Conflict Resolution

Turso uses last-write-wins at the primary. For optimistic updates:

```typescript
async function updateWithVersion(id: number, newValue: string, expectedVersion: number) {
  const result = await client.execute({
    sql: 'UPDATE items SET value = ?, version = version + 1 WHERE id = ? AND version = ?',
    args: [newValue, id, expectedVersion]
  })

  if (result.rowsAffected === 0) {
    // Sync and retry - someone else updated
    await client.sync()
    throw new Error('Conflict - item was modified')
  }

  await client.sync()
}
```

## Performance Comparison

| Operation | Remote DB | Embedded Replica |
|-----------|-----------|------------------|
| Simple SELECT | 20-100ms | <1ms |
| JOIN query | 50-200ms | 1-5ms |
| INSERT | 30-150ms | 30-150ms (same) |
| Read after write | 50-200ms | <1ms (after sync) |

## Best Practices

1. **Sync at app startup** - Ensure fresh data
2. **Sync before offline** - Prepare for disconnection
3. **Sync after critical writes** - Read-your-writes consistency
4. **Use intervals wisely** - Balance freshness vs. bandwidth
5. **Handle sync failures gracefully** - Retry with backoff
6. **Persist replica location** - Reuse between restarts

## Limitations

- Writes still require network (to primary)
- Sync can fail if offline
- Large databases take longer to sync
- No partial sync - full sync each time
