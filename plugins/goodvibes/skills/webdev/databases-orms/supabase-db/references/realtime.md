# Supabase Realtime

## Overview

Supabase Realtime enables listening to database changes, broadcasting messages, and tracking presence - all over WebSockets.

## Database Changes (Postgres Changes)

### Enable Realtime on Table

```sql
-- Via SQL
ALTER PUBLICATION supabase_realtime ADD TABLE messages;

-- Or enable in Dashboard under Table settings
```

### Subscribe to Changes

```typescript
import { createClient, RealtimeChannel } from '@supabase/supabase-js'

const supabase = createClient(url, key)

// All events on a table
const channel = supabase
  .channel('schema-db-changes')
  .on(
    'postgres_changes',
    { event: '*', schema: 'public', table: 'messages' },
    (payload) => {
      console.log('Change received:', payload)
      // payload.eventType: 'INSERT' | 'UPDATE' | 'DELETE'
      // payload.new: new record (INSERT, UPDATE)
      // payload.old: old record (UPDATE, DELETE)
    }
  )
  .subscribe()
```

### Filter Changes

```typescript
// Filter by column value
const channel = supabase
  .channel('room-messages')
  .on(
    'postgres_changes',
    {
      event: 'INSERT',
      schema: 'public',
      table: 'messages',
      filter: 'room_id=eq.room-123'
    },
    handleNewMessage
  )
  .subscribe()

// Multiple filters on same table
const channel = supabase
  .channel('user-activity')
  .on(
    'postgres_changes',
    {
      event: 'INSERT',
      schema: 'public',
      table: 'notifications',
      filter: 'user_id=eq.my-user-id'
    },
    handleNotification
  )
  .on(
    'postgres_changes',
    {
      event: 'UPDATE',
      schema: 'public',
      table: 'messages',
      filter: 'recipient_id=eq.my-user-id'
    },
    handleMessageUpdate
  )
  .subscribe()
```

### Handle Subscription Status

```typescript
const channel = supabase
  .channel('my-channel')
  .on('postgres_changes', { event: '*', schema: 'public', table: 'posts' }, handler)
  .subscribe((status) => {
    if (status === 'SUBSCRIBED') {
      console.log('Connected and listening')
    }
    if (status === 'CHANNEL_ERROR') {
      console.log('Failed to subscribe')
    }
    if (status === 'TIMED_OUT') {
      console.log('Connection timed out')
    }
    if (status === 'CLOSED') {
      console.log('Channel closed')
    }
  })
```

## Broadcast

Send messages without database persistence. Great for ephemeral data like cursor positions, typing indicators, game state.

```typescript
// Create channel
const channel = supabase.channel('room-1')

// Listen for messages
channel.on('broadcast', { event: 'cursor-move' }, ({ payload }) => {
  console.log('Cursor:', payload.x, payload.y)
})

// Subscribe before sending
await channel.subscribe()

// Send message
channel.send({
  type: 'broadcast',
  event: 'cursor-move',
  payload: { x: 100, y: 200, userId: 'abc' }
})
```

### Broadcast with Acknowledgment

```typescript
const channel = supabase.channel('room-1', {
  config: { broadcast: { ack: true } }
})

await channel.subscribe()

// Returns when server acknowledges
const result = await channel.send({
  type: 'broadcast',
  event: 'message',
  payload: { text: 'Hello!' }
})

if (result === 'ok') {
  console.log('Message delivered')
}
```

## Presence

Track and sync shared state across clients - perfect for showing who's online, active users in a document, etc.

```typescript
const channel = supabase.channel('room-1')

// Track presence state
channel.on('presence', { event: 'sync' }, () => {
  const state = channel.presenceState()
  console.log('Current users:', state)
  // { 'user-1': [{ online_at: '...', user_id: 'user-1' }], ... }
})

// User joined
channel.on('presence', { event: 'join' }, ({ key, newPresences }) => {
  console.log('User joined:', key, newPresences)
})

// User left
channel.on('presence', { event: 'leave' }, ({ key, leftPresences }) => {
  console.log('User left:', key, leftPresences)
})

// Subscribe and track
await channel.subscribe(async (status) => {
  if (status === 'SUBSCRIBED') {
    await channel.track({
      user_id: currentUser.id,
      online_at: new Date().toISOString()
    })
  }
})

// Update presence
await channel.track({
  user_id: currentUser.id,
  online_at: new Date().toISOString(),
  status: 'away'
})

// Untrack (go offline)
await channel.untrack()
```

## React Integration

```typescript
import { useEffect, useState } from 'react'
import { supabase } from './supabase'

function useMessages(roomId: string) {
  const [messages, setMessages] = useState<Message[]>([])

  useEffect(() => {
    // Initial fetch
    const fetchMessages = async () => {
      const { data } = await supabase
        .from('messages')
        .select('*')
        .eq('room_id', roomId)
        .order('created_at')

      if (data) setMessages(data)
    }
    fetchMessages()

    // Real-time subscription
    const channel = supabase
      .channel(`room-${roomId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          filter: `room_id=eq.${roomId}`
        },
        (payload) => {
          setMessages((prev) => [...prev, payload.new as Message])
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [roomId])

  return messages
}
```

## Best Practices

### 1. Clean Up Subscriptions

```typescript
// Component unmount
useEffect(() => {
  const channel = supabase.channel('my-channel').subscribe()

  return () => {
    supabase.removeChannel(channel)
  }
}, [])

// Or remove all channels
supabase.removeAllChannels()
```

### 2. Handle Reconnection

```typescript
const channel = supabase
  .channel('important-updates')
  .on('postgres_changes', config, handler)
  .subscribe((status) => {
    if (status === 'CHANNEL_ERROR') {
      // Exponential backoff retry
      setTimeout(() => {
        channel.subscribe()
      }, 1000)
    }
  })
```

### 3. Debounce High-Frequency Updates

```typescript
import { debounce } from 'lodash-es'

const sendCursor = debounce((x: number, y: number) => {
  channel.send({
    type: 'broadcast',
    event: 'cursor',
    payload: { x, y }
  })
}, 50)

document.onmousemove = (e) => {
  sendCursor(e.clientX, e.clientY)
}
```

### 4. Use Specific Filters

```typescript
// BAD: Subscribes to all messages
.on('postgres_changes', { event: '*', schema: 'public', table: 'messages' }, handler)

// GOOD: Subscribe only to relevant messages
.on('postgres_changes', {
  event: 'INSERT',
  schema: 'public',
  table: 'messages',
  filter: `room_id=eq.${roomId}`
}, handler)
```

### 5. Enable RLS for Realtime

Realtime respects Row Level Security. Ensure appropriate policies exist:

```sql
-- Users only receive updates for messages they can see
CREATE POLICY "Users see room messages"
ON messages FOR SELECT
TO authenticated
USING (
  room_id IN (
    SELECT room_id FROM room_members
    WHERE user_id = (SELECT auth.uid())
  )
);
```

## Limits

- Max 100 concurrent connections per client (browser tab)
- Max 100 channels per connection
- Message size limit: 1MB
- Broadcast rate limit: 100 messages/second per channel
