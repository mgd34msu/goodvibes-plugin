---
name: supabase-db
description: Implements Supabase PostgreSQL database with JavaScript client, Row Level Security, real-time subscriptions, and edge functions. Use when building apps with Supabase, implementing RLS policies, or needing real-time database features.
---

# Supabase Database

Supabase provides a full PostgreSQL database with automatic REST/GraphQL APIs, real-time subscriptions, Row Level Security, and edge functions.

## Quick Start

```bash
npm install @supabase/supabase-js
```

```typescript
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_ANON_KEY!
)
```

## CRUD Operations

### Select (Read)

```typescript
// Select all columns
const { data, error } = await supabase
  .from('users')
  .select('*')

// Select specific columns
const { data, error } = await supabase
  .from('users')
  .select('id, name, email')

// Select with relations
const { data, error } = await supabase
  .from('posts')
  .select(`
    id,
    title,
    author:users(name, email),
    comments(id, body)
  `)

// Filtering
const { data, error } = await supabase
  .from('users')
  .select('*')
  .eq('status', 'active')
  .gt('age', 18)
  .order('created_at', { ascending: false })
  .limit(10)

// Single record
const { data, error } = await supabase
  .from('users')
  .select('*')
  .eq('id', userId)
  .single()
```

### Insert (Create)

```typescript
// Insert single record
const { data, error } = await supabase
  .from('users')
  .insert({
    name: 'John Doe',
    email: 'john@example.com'
  })
  .select()

// Insert multiple records
const { data, error } = await supabase
  .from('users')
  .insert([
    { name: 'Alice', email: 'alice@example.com' },
    { name: 'Bob', email: 'bob@example.com' }
  ])
  .select()

// Upsert (insert or update)
const { data, error } = await supabase
  .from('users')
  .upsert({
    id: 1,
    name: 'Updated Name',
    email: 'updated@example.com'
  })
  .select()
```

### Update

```typescript
// Update by condition
const { data, error } = await supabase
  .from('users')
  .update({ status: 'inactive' })
  .eq('id', userId)
  .select()

// Update multiple records
const { data, error } = await supabase
  .from('users')
  .update({ verified: true })
  .in('id', [1, 2, 3])
  .select()
```

### Delete

```typescript
const { error } = await supabase
  .from('users')
  .delete()
  .eq('id', userId)

// Soft delete pattern
const { error } = await supabase
  .from('users')
  .update({ deleted_at: new Date().toISOString() })
  .eq('id', userId)
```

## Row Level Security (RLS)

RLS enforces authorization at the database level. **Always enable RLS on public tables.**

### Enable RLS

```sql
-- Enable RLS on table
ALTER TABLE users ENABLE ROW LEVEL SECURITY;

-- Force RLS for table owner too
ALTER TABLE users FORCE ROW LEVEL SECURITY;
```

### Policy Patterns

```sql
-- Public read access
CREATE POLICY "Public profiles visible"
ON profiles FOR SELECT
TO anon, authenticated
USING (true);

-- Users can only read their own data
CREATE POLICY "Users read own data"
ON users FOR SELECT
TO authenticated
USING ((SELECT auth.uid()) = id);

-- Users can insert their own data
CREATE POLICY "Users create own profile"
ON profiles FOR INSERT
TO authenticated
WITH CHECK ((SELECT auth.uid()) = user_id);

-- Users can update their own data
CREATE POLICY "Users update own data"
ON profiles FOR UPDATE
TO authenticated
USING ((SELECT auth.uid()) = user_id)
WITH CHECK ((SELECT auth.uid()) = user_id);

-- Users can delete their own data
CREATE POLICY "Users delete own data"
ON profiles FOR DELETE
TO authenticated
USING ((SELECT auth.uid()) = user_id);

-- Role-based access using JWT claims
CREATE POLICY "Admins have full access"
ON users FOR ALL
TO authenticated
USING (
  (SELECT auth.jwt() ->> 'role') = 'admin'
);

-- Team-based access
CREATE POLICY "Team members access"
ON projects FOR SELECT
TO authenticated
USING (
  team_id IN (
    SELECT team_id FROM team_members
    WHERE user_id = (SELECT auth.uid())
  )
);
```

### RLS Performance Tips

```sql
-- GOOD: Wrap auth functions in SELECT for caching
USING ((SELECT auth.uid()) = user_id)

-- BAD: Direct function call
USING (auth.uid() = user_id)

-- Add indexes on columns used in policies
CREATE INDEX idx_profiles_user_id ON profiles(user_id);
```

## Real-time Subscriptions

```typescript
// Subscribe to all changes
const channel = supabase
  .channel('table-changes')
  .on(
    'postgres_changes',
    {
      event: '*',
      schema: 'public',
      table: 'messages'
    },
    (payload) => {
      console.log('Change:', payload)
    }
  )
  .subscribe()

// Subscribe to specific events
const channel = supabase
  .channel('new-messages')
  .on(
    'postgres_changes',
    {
      event: 'INSERT',
      schema: 'public',
      table: 'messages',
      filter: 'room_id=eq.123'
    },
    (payload) => {
      console.log('New message:', payload.new)
    }
  )
  .subscribe()

// Broadcast messages (no database)
const channel = supabase.channel('room-1')
channel.on('broadcast', { event: 'cursor' }, (payload) => {
  console.log('Cursor:', payload)
})
await channel.subscribe()

// Send broadcast
channel.send({
  type: 'broadcast',
  event: 'cursor',
  payload: { x: 100, y: 200 }
})

// Cleanup
supabase.removeChannel(channel)
```

## TypeScript Types

```typescript
// Generate types from database
// npx supabase gen types typescript --project-id your-project > types/supabase.ts

import { Database } from './types/supabase'

const supabase = createClient<Database>(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_ANON_KEY!
)

// Typed queries
type User = Database['public']['Tables']['users']['Row']
type InsertUser = Database['public']['Tables']['users']['Insert']
type UpdateUser = Database['public']['Tables']['users']['Update']

const { data } = await supabase
  .from('users')
  .select('*')
  .returns<User[]>()
```

## Database Functions (RPC)

```sql
-- Create a function
CREATE OR REPLACE FUNCTION get_user_stats(user_id UUID)
RETURNS JSON AS $$
  SELECT json_build_object(
    'post_count', (SELECT COUNT(*) FROM posts WHERE author_id = user_id),
    'follower_count', (SELECT COUNT(*) FROM follows WHERE following_id = user_id)
  );
$$ LANGUAGE SQL SECURITY DEFINER;
```

```typescript
// Call the function
const { data, error } = await supabase
  .rpc('get_user_stats', { user_id: '123' })
```

## Advanced Queries

```typescript
// Full-text search
const { data } = await supabase
  .from('posts')
  .select('*')
  .textSearch('title', 'serverless database')

// Range queries
const { data } = await supabase
  .from('events')
  .select('*')
  .gte('start_date', '2024-01-01')
  .lte('end_date', '2024-12-31')

// Pattern matching
const { data } = await supabase
  .from('users')
  .select('*')
  .ilike('name', '%john%')

// JSON queries
const { data } = await supabase
  .from('users')
  .select('*')
  .contains('metadata', { role: 'admin' })

// Count
const { count } = await supabase
  .from('users')
  .select('*', { count: 'exact', head: true })
```

## Server-Side Usage

```typescript
// Use service role key for admin operations (bypasses RLS)
import { createClient } from '@supabase/supabase-js'

const supabaseAdmin = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY! // Keep secret!
)

// Admin operations bypass RLS
const { data } = await supabaseAdmin
  .from('users')
  .select('*')
```

## Error Handling

```typescript
const { data, error } = await supabase
  .from('users')
  .select('*')

if (error) {
  if (error.code === 'PGRST116') {
    // No rows found
  } else if (error.code === '42501') {
    // RLS policy violation
  } else {
    console.error('Database error:', error.message)
  }
  return
}

// data is available here
```

## Common Patterns

### Pagination

```typescript
const PAGE_SIZE = 10

async function getPage(page: number) {
  const from = page * PAGE_SIZE
  const to = from + PAGE_SIZE - 1

  const { data, error, count } = await supabase
    .from('posts')
    .select('*', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(from, to)

  return {
    data,
    totalPages: Math.ceil((count || 0) / PAGE_SIZE)
  }
}
```

### Cursor-Based Pagination

```typescript
async function getNextPage(cursor?: string) {
  let query = supabase
    .from('posts')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(10)

  if (cursor) {
    query = query.lt('created_at', cursor)
  }

  const { data } = await query
  const nextCursor = data?.[data.length - 1]?.created_at

  return { data, nextCursor }
}
```

## References

- [Row Level Security Patterns](references/rls-patterns.md)
- [Real-time Best Practices](references/realtime.md)
