---
name: vercel-ai-sdk
description: Builds AI-powered applications with Vercel AI SDK including streaming responses, chat interfaces, and model integration. Use when integrating LLMs, building chat applications, streaming AI responses, or implementing AI features in React.
---

# Vercel AI SDK

Library for building AI-powered streaming text and chat applications.

## Quick Start

**Install:**
```bash
npm install ai @ai-sdk/openai
```

**Environment:**
```bash
# .env.local
OPENAI_API_KEY=sk-...
```

## Core Concepts

### generateText

```typescript
import { generateText } from 'ai';
import { openai } from '@ai-sdk/openai';

const { text } = await generateText({
  model: openai('gpt-4-turbo'),
  prompt: 'What is the capital of France?',
});

console.log(text); // "The capital of France is Paris."
```

### streamText

```typescript
import { streamText } from 'ai';
import { openai } from '@ai-sdk/openai';

const result = streamText({
  model: openai('gpt-4-turbo'),
  prompt: 'Write a poem about coding.',
});

for await (const textPart of result.textStream) {
  process.stdout.write(textPart);
}
```

### generateObject

```typescript
import { generateObject } from 'ai';
import { openai } from '@ai-sdk/openai';
import { z } from 'zod';

const { object } = await generateObject({
  model: openai('gpt-4-turbo'),
  schema: z.object({
    recipe: z.object({
      name: z.string(),
      ingredients: z.array(z.string()),
      steps: z.array(z.string()),
    }),
  }),
  prompt: 'Generate a recipe for chocolate chip cookies.',
});

console.log(object.recipe.name);
```

## Chat Applications

### API Route (Next.js)

```typescript
// app/api/chat/route.ts
import { streamText } from 'ai';
import { openai } from '@ai-sdk/openai';

export async function POST(req: Request) {
  const { messages } = await req.json();

  const result = streamText({
    model: openai('gpt-4-turbo'),
    system: 'You are a helpful assistant.',
    messages,
  });

  return result.toDataStreamResponse();
}
```

### React Component

```tsx
'use client';

import { useChat } from 'ai/react';

export function Chat() {
  const { messages, input, handleInputChange, handleSubmit, isLoading } =
    useChat();

  return (
    <div className="flex flex-col h-screen">
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.map((message) => (
          <div
            key={message.id}
            className={`p-4 rounded-lg ${
              message.role === 'user'
                ? 'bg-blue-100 ml-auto max-w-[80%]'
                : 'bg-gray-100 mr-auto max-w-[80%]'
            }`}
          >
            <p className="text-sm font-medium">
              {message.role === 'user' ? 'You' : 'AI'}
            </p>
            <p>{message.content}</p>
          </div>
        ))}
      </div>

      <form onSubmit={handleSubmit} className="p-4 border-t">
        <div className="flex gap-2">
          <input
            value={input}
            onChange={handleInputChange}
            placeholder="Type a message..."
            className="flex-1 px-4 py-2 border rounded-lg"
            disabled={isLoading}
          />
          <button
            type="submit"
            disabled={isLoading}
            className="px-4 py-2 bg-blue-500 text-white rounded-lg disabled:opacity-50"
          >
            {isLoading ? 'Sending...' : 'Send'}
          </button>
        </div>
      </form>
    </div>
  );
}
```

### useChat Options

```tsx
const {
  messages,           // Chat messages array
  input,              // Current input value
  handleInputChange,  // Input change handler
  handleSubmit,       // Form submit handler
  isLoading,          // Loading state
  error,              // Error state
  reload,             // Regenerate last response
  stop,               // Stop streaming
  setMessages,        // Manually set messages
  append,             // Append message programmatically
} = useChat({
  api: '/api/chat',
  initialMessages: [],
  id: 'unique-chat-id',
  onResponse: (response) => {
    console.log('Response started');
  },
  onFinish: (message) => {
    console.log('Finished:', message);
  },
  onError: (error) => {
    console.error('Error:', error);
  },
});
```

## Text Completion

### useCompletion Hook

```tsx
'use client';

import { useCompletion } from 'ai/react';

export function Autocomplete() {
  const { completion, input, handleInputChange, handleSubmit, isLoading } =
    useCompletion({
      api: '/api/completion',
    });

  return (
    <div>
      <form onSubmit={handleSubmit}>
        <textarea
          value={input}
          onChange={handleInputChange}
          placeholder="Start typing..."
          className="w-full p-4 border rounded"
        />
        <button type="submit" disabled={isLoading}>
          Complete
        </button>
      </form>

      {completion && (
        <div className="mt-4 p-4 bg-gray-100 rounded">
          {completion}
        </div>
      )}
    </div>
  );
}
```

### API Route

```typescript
// app/api/completion/route.ts
import { streamText } from 'ai';
import { openai } from '@ai-sdk/openai';

export async function POST(req: Request) {
  const { prompt } = await req.json();

  const result = streamText({
    model: openai('gpt-4-turbo'),
    prompt,
  });

  return result.toDataStreamResponse();
}
```

## Model Providers

### OpenAI

```typescript
import { openai } from '@ai-sdk/openai';

// GPT-4 Turbo
const model = openai('gpt-4-turbo');

// GPT-4o
const model = openai('gpt-4o');

// GPT-3.5 Turbo
const model = openai('gpt-3.5-turbo');
```

### Anthropic

```bash
npm install @ai-sdk/anthropic
```

```typescript
import { anthropic } from '@ai-sdk/anthropic';

const model = anthropic('claude-3-5-sonnet-20241022');
const model = anthropic('claude-3-opus-20240229');
```

### Google

```bash
npm install @ai-sdk/google
```

```typescript
import { google } from '@ai-sdk/google';

const model = google('gemini-1.5-pro');
const model = google('gemini-1.5-flash');
```

### Multiple Providers

```typescript
import { openai } from '@ai-sdk/openai';
import { anthropic } from '@ai-sdk/anthropic';

// Switch models easily
const model = process.env.USE_CLAUDE
  ? anthropic('claude-3-5-sonnet-20241022')
  : openai('gpt-4-turbo');

const { text } = await generateText({
  model,
  prompt: 'Hello, world!',
});
```

## Structured Output

### With Zod Schema

```typescript
import { generateObject } from 'ai';
import { openai } from '@ai-sdk/openai';
import { z } from 'zod';

const ProductSchema = z.object({
  name: z.string(),
  description: z.string(),
  price: z.number(),
  category: z.enum(['electronics', 'clothing', 'food']),
  tags: z.array(z.string()),
});

const { object: product } = await generateObject({
  model: openai('gpt-4-turbo'),
  schema: ProductSchema,
  prompt: 'Generate a product listing for wireless headphones.',
});

// product is fully typed
console.log(product.name, product.price);
```

### Streaming Objects

```typescript
import { streamObject } from 'ai';

const result = streamObject({
  model: openai('gpt-4-turbo'),
  schema: ProductSchema,
  prompt: 'Generate a product listing.',
});

for await (const partialObject of result.partialObjectStream) {
  console.log(partialObject);
  // { name: "Wire..." }
  // { name: "Wireless", description: "High..." }
  // { name: "Wireless", description: "High quality...", price: 99 }
}
```

## Tools / Function Calling

### Define Tools

```typescript
import { generateText, tool } from 'ai';
import { openai } from '@ai-sdk/openai';
import { z } from 'zod';

const result = await generateText({
  model: openai('gpt-4-turbo'),
  tools: {
    weather: tool({
      description: 'Get the weather in a location',
      parameters: z.object({
        location: z.string().describe('The city and state'),
      }),
      execute: async ({ location }) => {
        // Call weather API
        return { temperature: 72, condition: 'Sunny' };
      },
    }),
    search: tool({
      description: 'Search the web for information',
      parameters: z.object({
        query: z.string().describe('The search query'),
      }),
      execute: async ({ query }) => {
        // Call search API
        return { results: ['Result 1', 'Result 2'] };
      },
    }),
  },
  prompt: 'What is the weather in San Francisco?',
});

console.log(result.text);
console.log(result.toolResults);
```

### Multi-Step Tool Usage

```typescript
const result = await generateText({
  model: openai('gpt-4-turbo'),
  tools: { weather, search },
  maxSteps: 5, // Allow multiple tool calls
  prompt: 'Compare the weather in SF and NYC, then search for indoor activities.',
});
```

## Server Actions

```typescript
// app/actions.ts
'use server';

import { generateText, streamText } from 'ai';
import { openai } from '@ai-sdk/openai';
import { createStreamableValue } from 'ai/rsc';

export async function generateSummary(text: string) {
  const { text: summary } = await generateText({
    model: openai('gpt-4-turbo'),
    prompt: `Summarize this text: ${text}`,
  });

  return summary;
}

export async function streamSummary(text: string) {
  const stream = createStreamableValue('');

  (async () => {
    const result = streamText({
      model: openai('gpt-4-turbo'),
      prompt: `Summarize this text: ${text}`,
    });

    for await (const chunk of result.textStream) {
      stream.update(chunk);
    }

    stream.done();
  })();

  return stream.value;
}
```

```tsx
// app/page.tsx
'use client';

import { useActionState } from 'react';
import { readStreamableValue } from 'ai/rsc';
import { streamSummary } from './actions';

export function SummaryForm() {
  const [summary, setSummary] = useState('');

  async function handleSubmit(formData: FormData) {
    const text = formData.get('text') as string;
    const stream = await streamSummary(text);

    for await (const chunk of readStreamableValue(stream)) {
      setSummary((prev) => prev + chunk);
    }
  }

  return (
    <form action={handleSubmit}>
      <textarea name="text" />
      <button type="submit">Summarize</button>
      <p>{summary}</p>
    </form>
  );
}
```

## RAG Pattern

```typescript
import { generateText, embed } from 'ai';
import { openai } from '@ai-sdk/openai';

// Embed query
const { embedding } = await embed({
  model: openai.embedding('text-embedding-3-small'),
  value: 'What is the return policy?',
});

// Search vector database
const relevantDocs = await vectorDb.search(embedding, { limit: 5 });

// Generate with context
const { text } = await generateText({
  model: openai('gpt-4-turbo'),
  system: `Answer based on this context:\n${relevantDocs.join('\n')}`,
  prompt: 'What is the return policy?',
});
```

## Error Handling

```tsx
const { messages, error, reload } = useChat({
  onError: (error) => {
    console.error('Chat error:', error);
  },
});

if (error) {
  return (
    <div>
      <p>Something went wrong: {error.message}</p>
      <button onClick={() => reload()}>Retry</button>
    </div>
  );
}
```

## Best Practices

1. **Stream responses** - Better UX for long generations
2. **Use structured output** - Type-safe AI responses
3. **Implement error handling** - AI calls can fail
4. **Set max tokens** - Control costs and response length
5. **Use system prompts** - Guide model behavior

## Common Mistakes

| Mistake | Fix |
|---------|-----|
| Not streaming | Use streamText for better UX |
| Missing error handling | Add onError callbacks |
| Exposing API keys | Keep keys server-side only |
| No loading states | Check isLoading |
| Long prompts in client | Move to server actions |

## Reference Files

- [references/patterns.md](references/patterns.md) - Common AI patterns
- [references/providers.md](references/providers.md) - Model provider setup
- [references/rag.md](references/rag.md) - RAG implementation
