# AI Integration Patterns Reference

Comprehensive guide for AI/LLM integration decisions and patterns.

## Provider Comparison

### OpenAI vs Anthropic vs Local Models

| Feature | OpenAI | Anthropic | Local (Ollama) |
|---------|--------|-----------|----------------|
| **Model Quality** | Excellent (GPT-4) | Excellent (Claude Opus) | Good (Llama 3, Mistral) |
| **Speed** | Fast (Turbo models) | Fast (Haiku), Slow (Opus) | Variable (hardware dependent) |
| **Cost** | Medium-High | Medium-High | Free (hardware costs) |
| **Context Window** | 128K tokens | 200K tokens | 32K-128K tokens |
| **Function Calling** | Excellent | Good | Limited |
| **Streaming** | Yes | Yes | Yes |
| **Vision** | Yes (GPT-4V) | Yes (Claude 3) | Limited |
| **Privacy** | Cloud-based | Cloud-based | Fully local |
| **Rate Limits** | Tier-based | Tier-based | None |

### Model Selection Matrix

| Use Case | Recommended Model | Rationale |
|----------|-------------------|----------|
| Chat interface | GPT-4o or Claude Sonnet | Best balance of quality and speed |
| Code generation | GPT-4 or Claude Opus | Superior reasoning for complex code |
| Simple Q&A | GPT-4o-mini or Claude Haiku | Cost-effective for simple tasks |
| Long documents | Claude Opus (200K context) | Largest context window |
| Vision tasks | GPT-4V or Claude 3 Opus | Native multimodal support |
| Function calling | GPT-4o | Best tool use support |
| Privacy-critical | Ollama (Llama 3) | Runs fully local |
| High-volume | Claude Haiku | Lowest cost at scale |

### Cost Comparison (per 1M tokens)

| Model | Input | Output | Use Case |
|-------|-------|--------|----------|
| **OpenAI** |
| GPT-4o | $2.50 | $10 | High-quality tasks |
| GPT-4 | $30 | $60 | Complex reasoning |
| GPT-4o-mini | $0.15 | $0.60 | Simple tasks |
| **Anthropic** |
| Claude Opus | $15 | $75 | Highest quality |
| Claude Sonnet | $3 | $15 | Balanced |
| Claude Haiku | $0.25 | $1.25 | High-volume |
| **Local** |
| Ollama | $0 | $0 | Hardware costs only |

## Streaming Implementation Patterns

### Pattern 1: Server-Sent Events (SSE)

**When to use:**
- Browser-based clients
- Simple one-way streaming
- No need for request/response multiplexing

**Implementation:**

```typescript
// Server
// Note: EventSource uses GET. For POST-based streaming, use fetch with ReadableStream reader.
// This example shows the fetch approach for compatibility with POST route handlers.
export async function POST(req: Request) {
  const stream = await openai.chat.completions.create({
    model: 'gpt-4o',
    messages,
    stream: true,
  });

  const encoder = new TextEncoder();

  return new Response(
    new ReadableStream({
      async start(controller) {
        for await (const chunk of stream) {
          const content = chunk.choices[0]?.delta?.content || '';
          if (content) {
            controller.enqueue(
              encoder.encode(`data: ${JSON.stringify({ content })}\n\n`)
            );
          }
        }
        controller.enqueue(encoder.encode('data: [DONE]\n\n'));
        controller.close();
      },
    }),
    {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    }
  );
}

// Client
const eventSource = new EventSource('/api/stream');
eventSource.onmessage = (event) => {
  if (event.data === '[DONE]') {
    eventSource.close();
    return;
  }
  const { content } = JSON.parse(event.data);
  // Update UI with content
};
```

### Pattern 2: Vercel AI SDK (Recommended)

**When to use:**
- React applications
- Need built-in hooks and state management
- Want simplified streaming setup

**Implementation:**

```typescript
// Server
import { streamText } from 'ai';
import { openai } from '@ai-sdk/openai';

export async function POST(req: Request) {
  const { messages } = await req.json();
  
  const result = streamText({
    model: openai('gpt-4o'),
    messages,
  });
  
  return result.toDataStreamResponse();
}

// Client
import { useChat } from 'ai/react';

export function Chat() {
  const { messages, input, handleInputChange, handleSubmit, isLoading } = useChat();
  
  return (
    <div>
      {messages.map((m) => (
        <div key={m.id}>{m.content}</div>
      ))}
      <form onSubmit={handleSubmit}>
        <input value={input} onChange={handleInputChange} />
      </form>
    </div>
  );
}
```

### Pattern 3: WebSockets

**When to use:**
- Bidirectional streaming required
- Real-time collaboration features
- Multiple concurrent streams

**Implementation:**

```typescript
// Server (using ws library)
import { WebSocketServer } from 'ws';

const wss = new WebSocketServer({ port: 8080 });

wss.on('connection', (ws) => {
  ws.on('message', async (data) => {
    const { messages } = JSON.parse(data.toString());
    
    const stream = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages,
      stream: true,
    });
    
    for await (const chunk of stream) {
      const content = chunk.choices[0]?.delta?.content || '';
      if (content) {
        ws.send(JSON.stringify({ type: 'content', content }));
      }
    }
    
    ws.send(JSON.stringify({ type: 'done' }));
  });
});

// Client
const ws = new WebSocket('ws://localhost:8080'); // Development only -- use wss:// with proper host in production

ws.onmessage = (event) => {
  const data = JSON.parse(event.data);
  if (data.type === 'content') {
    // Update UI with data.content
  } else if (data.type === 'done') {
    // Stream complete
  }
};

ws.send(JSON.stringify({ messages }));
```

## RAG Architecture

### High-Level Pipeline

```
[Documents] --> [Chunking] --> [Embedding] --> [Vector Store]
                                                      |
[User Query] --> [Embedding] --> [Similarity Search] -+
                                         |
                                         v
                               [Retrieved Chunks]
                                         |
                                         v
                        [LLM with Context] --> [Response]
```

### Chunking Strategies

| Strategy | Chunk Size | Overlap | Use Case |
|----------|-----------|---------|----------|
| Fixed size | 1000 chars | 200 chars | General documents |
| Sentence-based | Variable | 1-2 sentences | Natural language |
| Paragraph-based | Variable | None | Structured docs |
| Code-aware | Variable | Function scope | Code documentation |
| Markdown-aware | Variable | Header hierarchy | Technical docs |

**Implementation:**

```typescript
import { RecursiveCharacterTextSplitter } from 'langchain/text_splitter';

const splitter = new RecursiveCharacterTextSplitter({
  chunkSize: 1000,
  chunkOverlap: 200,
  separators: ['\n\n', '\n', ' ', ''],
});

const chunks = await splitter.createDocuments([text]);
```

### Embedding Models

| Model | Dimensions | Cost (per 1M tokens) | Quality |
|-------|-----------|---------------------|----------|
| text-embedding-3-small | 1536 | $0.02 | Good |
| text-embedding-3-large | 3072 | $0.13 | Excellent |
| text-embedding-ada-002 | 1536 | $0.10 | Good (legacy) |

**Recommendation:** Use `text-embedding-3-small` for most use cases. Upgrade to `large` only if retrieval quality is insufficient.

## Vector Database Comparison

### Feature Matrix

| Feature | Pinecone | pgvector | Weaviate | Milvus |
|---------|----------|----------|----------|--------|
| **Type** | Managed | PostgreSQL extension | Self-hosted/Cloud | Self-hosted/Cloud |
| **Scale** | Billions | Millions | Billions | Billions |
| **Similarity** | Cosine, Euclidean, Dot | Cosine, L2, Inner | Cosine, L2 | Multiple |
| **Filtering** | Metadata filters | SQL WHERE | GraphQL filters | Boolean expressions |
| **Hybrid Search** | No | Manual | Yes | Yes |
| **Cost** | Pay per pod | PostgreSQL cost | Self-host or cloud | Self-host or cloud |
| **Latency** | <100ms | Variable | <50ms | <50ms |
| **Setup** | Easy (API key) | Medium (extension) | Medium (docker) | Complex |

### Decision Tree

```
Do you already use PostgreSQL?
|-- YES --> Use pgvector
|-- NO
    |-- Need managed service?
        |-- YES --> Pinecone
        |-- NO
            |-- Need hybrid search?
                |-- YES --> Weaviate
                |-- NO --> Milvus (for scale) or Weaviate
```

### Pinecone Setup

```typescript
import { Pinecone } from '@pinecone-database/pinecone';

const pinecone = new Pinecone({ apiKey: process.env.PINECONE_API_KEY! });
const index = pinecone.index('documents');

// Upsert vectors
await index.upsert([{
  id: 'doc1',
  values: embedding,
  metadata: { text, source: 'docs' },
}]);

// Query
const results = await index.query({
  vector: queryEmbedding,
  topK: 5,
  includeMetadata: true,
});
```

### pgvector Setup

```sql
-- Enable extension
CREATE EXTENSION vector;

-- Create table
CREATE TABLE documents (
  id SERIAL PRIMARY KEY,
  content TEXT,
  embedding vector(1536),
  metadata JSONB
);

-- Create index
CREATE INDEX ON documents USING ivfflat (embedding vector_cosine_ops)
WITH (lists = 100);

-- Query
SELECT id, content, 1 - (embedding <=> $1::vector) AS similarity
FROM documents
ORDER BY embedding <=> $1::vector
LIMIT 5;
```

### Weaviate Setup

```typescript
import weaviate from 'weaviate-ts-client';

const client = weaviate.client({
  scheme: 'https',
  host: process.env.WEAVIATE_HOST!,
});

// Hybrid search (semantic + keyword)
const result = await client.graphql
  .get()
  .withClassName('Document')
  .withHybrid({ query, alpha: 0.5 })
  .withFields('content metadata _additional { score }')
  .withLimit(5)
  .do();
```

## Prompt Engineering Patterns

### System Prompts

**Pattern 1: Role + Task + Constraints**

```typescript
const systemPrompt = `
You are an expert technical writer.

Your task is to explain complex concepts in simple terms.

Constraints:
- Use analogies when helpful
- Avoid jargon unless necessary
- Keep responses under 200 words
- Always provide examples
`;
```

**Pattern 2: Few-Shot Examples**

```typescript
const systemPrompt = `
Convert natural language to SQL queries.

Examples:
Input: "Show me all users who signed up last month"
Output: SELECT * FROM users WHERE created_at >= DATE_TRUNC('month', CURRENT_DATE - INTERVAL '1 month');

Input: "Count orders by status"
Output: SELECT status, COUNT(*) FROM orders GROUP BY status;

Now convert the following query:
`;
```

### Context Management

**Sliding Window (for long conversations):**

```typescript
function getContextWindow(messages: Message[], maxTokens: number = 4000) {
  const reversed = [...messages].reverse();
  const selected: Message[] = [];
  let tokens = 0;
  
  for (const msg of reversed) {
    const msgTokens = estimateTokens(msg.content);
    if (tokens + msgTokens > maxTokens) break;
    selected.unshift(msg);
    tokens += msgTokens;
  }
  
  return selected;
}
```

**Summarization (compress old messages):**

```typescript
async function compressHistory(messages: Message[]) {
  const toCompress = messages.slice(0, -10); // Keep last 10
  
  const summary = await generateText({
    model: openai('gpt-4o-mini'),
    prompt: `Summarize this conversation concisely:\n${toCompress.map(m => `${m.role}: ${m.content}`).join('\n')}`,
  });
  
  return [
    { role: 'system', content: `Previous conversation summary: ${summary}` },
    ...messages.slice(-10),
  ];
}
```

## Security Checklist

### API Key Security

- [ ] No API keys in source code
- [ ] Keys stored in environment variables
- [ ] .env files in .gitignore
- [ ] .env.example documents required keys (without values)
- [ ] Separate keys for dev/staging/prod
- [ ] Keys rotated regularly
- [ ] API key monitoring enabled

### Prompt Injection Prevention

```typescript
// Detect injection patterns
function detectInjection(input: string): boolean {
  const patterns = [
    /ignore (previous|above|all) (instructions|prompts)/i,
    /you are now/i,
    /new instructions:/i,
    /system: /i,
  ];
  return patterns.some(p => p.test(input));
}

// Sanitize input
function sanitize(input: string): string {
  return input
    .replace(/[<>]/g, '')
    .replace(/system:/gi, '')
    .slice(0, 10000);
}

// Use in handler
if (detectInjection(userInput)) {
  throw new Error('Potential prompt injection detected');
}

const safe = sanitize(userInput);
```

### Rate Limiting

```typescript
import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL!,
  token: process.env.UPSTASH_REDIS_REST_TOKEN!,
});

const ratelimit = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(10, '60 s'),
});

// In handler
const { success } = await ratelimit.limit(identifier);
if (!success) {
  return new Response('Rate limit exceeded', { status: 429 });
}
```

### Content Filtering

```typescript
import OpenAI from 'openai';

const openai = new OpenAI();

async function moderateContent(text: string) {
  const moderation = await openai.moderations.create({ input: text });
  const result = moderation.results[0];
  
  if (result.flagged) {
    const categories = Object.entries(result.categories)
      .filter(([_, flagged]) => flagged)
      .map(([category]) => category);
    
    throw new Error(`Content flagged: ${categories.join(', ')}`);
  }
}

// Use before processing
await moderateContent(userInput);
```

## Common Anti-Patterns

### Anti-Pattern 1: Not Streaming

**Bad:**
```typescript
const completion = await openai.chat.completions.create({
  model: 'gpt-4o',
  messages,
});
return completion.choices[0].message.content;
```

**Good:**
```typescript
const stream = await openai.chat.completions.create({
  model: 'gpt-4o',
  messages,
  stream: true,
});
return new ReadableStream(/* stream chunks */);
```

### Anti-Pattern 2: Ignoring Errors

**Bad:**
```typescript
const result = await streamText({ model, messages });
return result.toDataStreamResponse();
```

**Good:**
```typescript
try {
  const result = await streamText({ model, messages });
  return result.toDataStreamResponse();
} catch (error) {
  if (error.status === 429) {
    // Rate limit - retry with backoff
    await sleep(1000);
    return retry();
  }
  console.error('AI error:', error);
  return new Response('AI service unavailable', { status: 503 });
}
```

### Anti-Pattern 3: No Cost Tracking

**Bad:**
```typescript
await streamText({ model: 'gpt-4o', messages });
```

**Good:**
```typescript
const result = await streamText({ model: 'gpt-4o', messages });
const { usage } = await result.response;
await trackCost('gpt-4o', usage.promptTokens, usage.completionTokens);
```

### Anti-Pattern 4: Trusting User Input

**Bad:**
```typescript
const messages = [{ role: 'user', content: userInput }];
```

**Good:**
```typescript
const sanitized = sanitizeInput(userInput);
if (detectInjection(sanitized)) {
  throw new Error('Invalid input');
}
const messages = [{ role: 'user', content: sanitized }];
```

### Anti-Pattern 5: Not Chunking Documents

**Bad:**
```typescript
const embedding = await generateEmbedding(entireDocument); // 50K tokens
```

**Good:**
```typescript
const chunks = await chunkDocument(entireDocument);
for (const chunk of chunks) {
  const embedding = await generateEmbedding(chunk.content);
  await storeEmbedding(chunk.id, embedding);
}
```

## Testing Strategies

### Mock LLM Responses

```typescript
import { vi } from 'vitest';

vi.mock('ai', () => ({
  streamText: vi.fn(() => ({
    toDataStreamResponse: () => new Response('mocked'),
  })),
}));

test('chat endpoint returns response', async () => {
  const response = await POST(mockRequest);
  expect(response.ok).toBe(true);
});
```

### Deterministic Testing

```typescript
// Use temperature: 0 for reproducible results
const result = await generateText({
  model: openai('gpt-4o-mini'),
  prompt: 'What is 2+2?',
  temperature: 0,
  seed: 12345, // Some providers support seed
});

expect(result.text).toContain('4');
```

### Cost-Controlled Testing

```typescript
// Use cheaper models in tests
const model = process.env.NODE_ENV === 'test'
  ? openai('gpt-4o-mini')
  : openai('gpt-4o');

// Or mock entirely
if (process.env.MOCK_AI === 'true') {
  return mockResponse;
}
```

## Performance Optimization

### Caching Strategies

**Semantic cache (cache similar prompts):**

```typescript
import { createSemanticCache } from '@upstash/semantic-cache';

const cache = createSemanticCache({
  redis,
  similarity: 0.95,
});

const cached = await cache.get(prompt);
if (cached) return cached;

const result = await generateText({ model, prompt });
await cache.set(prompt, result, { ex: 3600 });
```

**Embedding cache:**

```typescript
const cacheKey = `emb:${hashText(text)}`;
const cached = await redis.get(cacheKey);
if (cached) return JSON.parse(cached);

const embedding = await generateEmbedding(text);
await redis.set(cacheKey, JSON.stringify(embedding), { ex: 86400 });
```

### Batch Processing

```typescript
// Instead of sequential
for (const text of texts) {
  await generateEmbedding(text); // Slow!
}

// Batch API calls
const embeddings = await Promise.all(
  texts.map(text => generateEmbedding(text))
);

// Or use native batch endpoints
const { data } = await openai.embeddings.create({
  model: 'text-embedding-3-small',
  input: texts, // Array of texts
});
```

## Additional Resources

- [Vercel AI SDK Docs](https://sdk.vercel.ai/docs)
- [OpenAI Best Practices](https://platform.openai.com/docs/guides/production-best-practices)
- [Anthropic Prompt Engineering](https://docs.anthropic.com/claude/docs/prompt-engineering)
- [LangChain Docs](https://js.langchain.com/docs/)
- [Pinecone Learning Center](https://www.pinecone.io/learn/)
