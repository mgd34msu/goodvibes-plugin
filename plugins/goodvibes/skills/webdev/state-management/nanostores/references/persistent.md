# Nanostores Persistent

Smart store persistence with localStorage, cross-tab sync, and custom storage engines.

## Installation

```bash
npm install @nanostores/persistent
```

## Persistent Atom

Store primitive values with automatic localStorage sync.

```typescript
import { persistentAtom } from '@nanostores/persistent';

// Simple string value
export const $locale = persistentAtom('locale', 'en');

// With JSON encoding for complex types
export const $favorites = persistentAtom<string[]>('favorites', [], {
  encode: JSON.stringify,
  decode: JSON.parse,
});

// Boolean shorthand
import { persistentBoolean } from '@nanostores/persistent';
export const $darkMode = persistentBoolean('dark-mode');
```

## Persistent Map

Each property stored in separate localStorage key with prefix.

```typescript
import { persistentMap } from '@nanostores/persistent';

interface Settings {
  theme: 'light' | 'dark' | 'auto';
  fontSize: number;
  notifications: boolean;
}

export const $settings = persistentMap<Settings>('settings:', {
  theme: 'auto',
  fontSize: 16,
  notifications: true,
});

// Updates only 'settings:theme' key
$settings.setKey('theme', 'dark');

// Keys in localStorage:
// - settings:theme = "dark"
// - settings:fontSize = 16
// - settings:notifications = true
```

## Cross-Tab Synchronization

Enabled by default. Changes in one tab propagate to all others.

```typescript
// Tab 1
$settings.setKey('theme', 'dark');

// Tab 2 automatically receives update via storage event
```

Disable for draft content:

```typescript
export const $draft = persistentAtom('article-draft', '', {
  listen: false, // No cross-tab sync
});
```

## Custom Encoding

Handle special types like Date:

```typescript
interface Session {
  token: string;
  expiresAt: Date;
}

export const $session = persistentAtom<Session | null>('session', null, {
  encode(value) {
    if (!value) return '';
    return JSON.stringify({
      ...value,
      expiresAt: value.expiresAt.toISOString(),
    });
  },
  decode(value) {
    if (!value) return null;
    const parsed = JSON.parse(value);
    return {
      ...parsed,
      expiresAt: new Date(parsed.expiresAt),
    };
  },
});
```

## Custom Storage Engines

Replace localStorage with any storage backend.

### SessionStorage

```typescript
import { setPersistentEngine } from '@nanostores/persistent';

setPersistentEngine(sessionStorage, {
  addEventListener: (key, cb) => {
    // sessionStorage doesn't fire cross-tab events
  },
  removeEventListener: () => {},
  perKey: false,
});
```

### AsyncStorage (React Native)

```typescript
import AsyncStorage from '@react-native-async-storage/async-storage';
import { setPersistentEngine } from '@nanostores/persistent';

const asyncStorageAdapter = {
  getItem: (key: string) => AsyncStorage.getItem(key),
  setItem: (key: string, value: string) => AsyncStorage.setItem(key, value),
  removeItem: (key: string) => AsyncStorage.removeItem(key),
};

// Note: AsyncStorage is async, needs wrapper
```

### Memory Storage (Testing)

```typescript
import {
  useTestStorageEngine,
  setTestStorageKey,
  cleanTestStorage,
  getTestStorage,
} from '@nanostores/persistent';

beforeAll(() => {
  useTestStorageEngine();
});

afterEach(() => {
  cleanTestStorage();
});

it('persists settings', () => {
  $settings.setKey('theme', 'dark');

  expect(getTestStorage()).toEqual({
    'settings:theme': '"dark"',
  });
});

it('loads from storage', () => {
  setTestStorageKey('settings:theme', '"light"');

  expect($settings.get().theme).toBe('light');
});
```

### IndexedDB

```typescript
import { openDB } from 'idb';
import { setPersistentEngine } from '@nanostores/persistent';

const dbPromise = openDB('app-store', 1, {
  upgrade(db) {
    db.createObjectStore('keyval');
  },
});

const idbStorage = {
  async getItem(key: string) {
    return (await dbPromise).get('keyval', key);
  },
  async setItem(key: string, value: string) {
    return (await dbPromise).put('keyval', value, key);
  },
  async removeItem(key: string) {
    return (await dbPromise).delete('keyval', key);
  },
};
```

## Server-Side Rendering

Works safely in SSR - uses empty object when localStorage unavailable.

```typescript
// Server-side: initialize from request
if (typeof window === 'undefined') {
  $locale.set(getLocaleFromRequest(req));
}

// Client-side: hydrates from localStorage
// If values differ, localStorage wins
```

Hydration pattern:

```tsx
function App() {
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setHydrated(true);
  }, []);

  // Show placeholder until client state loads
  if (!hydrated) {
    return <Skeleton />;
  }

  return <ActualApp />;
}
```

## Migration

Handle schema changes:

```typescript
const CURRENT_VERSION = 2;

export const $settings = persistentAtom<Settings>('settings', defaultSettings, {
  encode(value) {
    return JSON.stringify({ version: CURRENT_VERSION, data: value });
  },
  decode(stored) {
    if (!stored) return defaultSettings;

    const { version, data } = JSON.parse(stored);

    // Migrate v1 -> v2
    if (version === 1) {
      return {
        ...data,
        newField: 'default', // Added in v2
      };
    }

    return data;
  },
});
```

## Expiration

Implement TTL:

```typescript
interface StoredWithExpiry<T> {
  value: T;
  expiry: number;
}

export const $cache = persistentAtom<CacheData | null>('cache', null, {
  encode(value) {
    if (!value) return '';
    return JSON.stringify({
      value,
      expiry: Date.now() + 60 * 60 * 1000, // 1 hour
    } as StoredWithExpiry<CacheData>);
  },
  decode(stored) {
    if (!stored) return null;
    const { value, expiry } = JSON.parse(stored) as StoredWithExpiry<CacheData>;
    if (Date.now() > expiry) return null;
    return value;
  },
});
```

## Size Considerations

localStorage has ~5MB limit. For large data:

```typescript
// Compress with lz-string
import { compress, decompress } from 'lz-string';

export const $largeData = persistentAtom<LargeObject>('data', defaultData, {
  encode: (v) => compress(JSON.stringify(v)),
  decode: (v) => JSON.parse(decompress(v) || '{}'),
});
```

## Security Notes

- Never store sensitive data (tokens, passwords) in localStorage
- localStorage is accessible to any script on the domain
- For auth tokens, prefer httpOnly cookies
- If you must store tokens, encrypt them:

```typescript
// DON'T: Store raw tokens
export const $token = persistentAtom('token', ''); // Vulnerable to XSS

// If you must store tokens, use encrypted storage
// But prefer server-side session management
```
