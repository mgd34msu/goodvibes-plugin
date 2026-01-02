# Modern Async Patterns

## Async Iteration

```javascript
// Async generator
async function* fetchPages(baseUrl) {
  let page = 1;
  while (true) {
    const response = await fetch(`${baseUrl}?page=${page}`);
    const data = await response.json();

    if (data.items.length === 0) break;

    yield data.items;
    page++;
  }
}

// Consume with for-await-of
async function getAllItems(url) {
  const allItems = [];
  for await (const items of fetchPages(url)) {
    allItems.push(...items);
  }
  return allItems;
}
```

## Concurrent Limiting

```javascript
async function limitConcurrency(tasks, limit) {
  const results = [];
  const executing = new Set();

  for (const task of tasks) {
    const promise = task().then(result => {
      executing.delete(promise);
      return result;
    });

    results.push(promise);
    executing.add(promise);

    if (executing.size >= limit) {
      await Promise.race(executing);
    }
  }

  return Promise.all(results);
}

// Usage
const urls = ['url1', 'url2', 'url3', 'url4', 'url5'];
const tasks = urls.map(url => () => fetch(url));
const responses = await limitConcurrency(tasks, 2);
```

## Retry Pattern

```javascript
async function retry(fn, maxAttempts = 3, delay = 1000) {
  let lastError;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;

      if (attempt < maxAttempts) {
        const backoff = delay * Math.pow(2, attempt - 1);
        await new Promise(r => setTimeout(r, backoff));
      }
    }
  }

  throw new Error(`Failed after ${maxAttempts} attempts`, { cause: lastError });
}

// Usage
const data = await retry(
  () => fetch('/api/data').then(r => r.json()),
  3,
  1000
);
```

## Timeout Pattern

```javascript
function timeout(ms, message = 'Operation timed out') {
  const { promise, reject } = Promise.withResolvers();
  setTimeout(() => reject(new Error(message)), ms);
  return promise;
}

async function fetchWithTimeout(url, ms = 5000) {
  const controller = new AbortController();

  try {
    return await Promise.race([
      fetch(url, { signal: controller.signal }),
      timeout(ms).catch(err => {
        controller.abort();
        throw err;
      })
    ]);
  } catch (error) {
    controller.abort();
    throw error;
  }
}
```

## Debounce Promise

```javascript
function debounceAsync(fn, wait) {
  let pending = null;
  let lastArgs = null;

  return async function(...args) {
    lastArgs = args;

    if (pending) {
      return pending;
    }

    await new Promise(r => setTimeout(r, wait));

    if (lastArgs === args) {
      pending = fn(...args).finally(() => {
        pending = null;
      });
      return pending;
    }
  };
}

const debouncedSearch = debounceAsync(
  query => fetch(`/search?q=${query}`),
  300
);
```

## Queue Pattern

```javascript
class AsyncQueue {
  #queue = [];
  #processing = false;

  async add(task) {
    const { promise, resolve, reject } = Promise.withResolvers();

    this.#queue.push({ task, resolve, reject });
    this.#process();

    return promise;
  }

  async #process() {
    if (this.#processing) return;
    this.#processing = true;

    while (this.#queue.length > 0) {
      const { task, resolve, reject } = this.#queue.shift();
      try {
        const result = await task();
        resolve(result);
      } catch (error) {
        reject(error);
      }
    }

    this.#processing = false;
  }
}

const queue = new AsyncQueue();
queue.add(() => fetch('/api/1'));
queue.add(() => fetch('/api/2'));
```

## Mutex/Lock Pattern

```javascript
class Mutex {
  #locked = false;
  #waiting = [];

  async acquire() {
    while (this.#locked) {
      const { promise, resolve } = Promise.withResolvers();
      this.#waiting.push(resolve);
      await promise;
    }
    this.#locked = true;
  }

  release() {
    this.#locked = false;
    if (this.#waiting.length > 0) {
      const next = this.#waiting.shift();
      next();
    }
  }

  async run(fn) {
    await this.acquire();
    try {
      return await fn();
    } finally {
      this.release();
    }
  }
}

const mutex = new Mutex();

// Ensures only one write at a time
async function writeFile(path, content) {
  await mutex.run(async () => {
    await fs.writeFile(path, content);
  });
}
```

## Batch Pattern

```javascript
class BatchProcessor {
  #queue = [];
  #timer = null;
  #processor;
  #maxSize;
  #maxWait;

  constructor(processor, { maxSize = 10, maxWait = 50 } = {}) {
    this.#processor = processor;
    this.#maxSize = maxSize;
    this.#maxWait = maxWait;
  }

  add(item) {
    const { promise, resolve, reject } = Promise.withResolvers();
    this.#queue.push({ item, resolve, reject });

    if (this.#queue.length >= this.#maxSize) {
      this.#flush();
    } else if (!this.#timer) {
      this.#timer = setTimeout(() => this.#flush(), this.#maxWait);
    }

    return promise;
  }

  async #flush() {
    clearTimeout(this.#timer);
    this.#timer = null;

    const batch = this.#queue.splice(0, this.#maxSize);
    const items = batch.map(b => b.item);

    try {
      const results = await this.#processor(items);
      batch.forEach((b, i) => b.resolve(results[i]));
    } catch (error) {
      batch.forEach(b => b.reject(error));
    }
  }
}

// Batch API calls
const batcher = new BatchProcessor(
  async (ids) => {
    const response = await fetch('/api/batch', {
      method: 'POST',
      body: JSON.stringify({ ids })
    });
    return response.json();
  },
  { maxSize: 50, maxWait: 100 }
);

// Individual calls get batched automatically
const user1 = await batcher.add(1);
const user2 = await batcher.add(2);
```
