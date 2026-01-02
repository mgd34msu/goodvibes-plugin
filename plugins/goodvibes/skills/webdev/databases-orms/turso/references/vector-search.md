# Turso Vector Search

## Overview

Turso has native vector support built into libSQL, enabling similarity search for AI applications without external vector databases.

## Vector Column Types

```sql
-- Create table with vector column
CREATE TABLE documents (
  id INTEGER PRIMARY KEY,
  content TEXT,
  embedding F32_BLOB(1536)  -- 32-bit floats, 1536 dimensions (OpenAI)
);

-- Other vector types
-- F32_BLOB(n) - 32-bit floating point (most common)
-- F64_BLOB(n) - 64-bit floating point (higher precision)
-- I8_BLOB(n)  - 8-bit integer (smaller storage)
```

## Inserting Vectors

```typescript
import { createClient } from '@libsql/client'
import OpenAI from 'openai'

const client = createClient({
  url: process.env.TURSO_DATABASE_URL!,
  authToken: process.env.TURSO_AUTH_TOKEN!
})

const openai = new OpenAI()

// Get embedding from OpenAI
async function getEmbedding(text: string): Promise<number[]> {
  const response = await openai.embeddings.create({
    model: 'text-embedding-3-small',
    input: text
  })
  return response.data[0].embedding
}

// Insert document with embedding
async function insertDocument(content: string) {
  const embedding = await getEmbedding(content)

  await client.execute({
    sql: 'INSERT INTO documents (content, embedding) VALUES (?, vector(?))',
    args: [content, JSON.stringify(embedding)]
  })
}

// Batch insert
async function insertDocuments(contents: string[]) {
  const embeddings = await Promise.all(
    contents.map(c => getEmbedding(c))
  )

  await client.batch(
    contents.map((content, i) => ({
      sql: 'INSERT INTO documents (content, embedding) VALUES (?, vector(?))',
      args: [content, JSON.stringify(embeddings[i])]
    })),
    'write'
  )
}
```

## Similarity Search

### Cosine Distance

Best for normalized embeddings (most common):

```typescript
async function searchSimilar(query: string, limit = 10) {
  const queryEmbedding = await getEmbedding(query)

  const { rows } = await client.execute({
    sql: `
      SELECT
        id,
        content,
        vector_distance_cos(embedding, vector(?)) as distance
      FROM documents
      ORDER BY distance ASC
      LIMIT ?
    `,
    args: [JSON.stringify(queryEmbedding), limit]
  })

  return rows
}
```

### Euclidean Distance

```sql
SELECT
  content,
  vector_distance_l2(embedding, vector(?)) as distance
FROM documents
ORDER BY distance ASC
LIMIT 10
```

### With Threshold

```typescript
async function searchWithThreshold(query: string, maxDistance = 0.3) {
  const queryEmbedding = await getEmbedding(query)

  const { rows } = await client.execute({
    sql: `
      SELECT
        id,
        content,
        vector_distance_cos(embedding, vector(?)) as distance
      FROM documents
      WHERE vector_distance_cos(embedding, vector(?)) < ?
      ORDER BY distance ASC
    `,
    args: [
      JSON.stringify(queryEmbedding),
      JSON.stringify(queryEmbedding),
      maxDistance
    ]
  })

  return rows
}
```

## RAG Implementation

### Setup

```sql
-- Documents table
CREATE TABLE documents (
  id INTEGER PRIMARY KEY,
  title TEXT,
  content TEXT,
  source TEXT,
  embedding F32_BLOB(1536),
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- Chunks for long documents
CREATE TABLE chunks (
  id INTEGER PRIMARY KEY,
  document_id INTEGER REFERENCES documents(id),
  chunk_index INTEGER,
  content TEXT,
  embedding F32_BLOB(1536)
);
```

### Chunking and Indexing

```typescript
function chunkText(text: string, maxChunkSize = 500, overlap = 50): string[] {
  const chunks: string[] = []
  let start = 0

  while (start < text.length) {
    const end = Math.min(start + maxChunkSize, text.length)
    chunks.push(text.slice(start, end))
    start = end - overlap
  }

  return chunks
}

async function indexDocument(title: string, content: string, source: string) {
  // Insert document
  const docResult = await client.execute({
    sql: 'INSERT INTO documents (title, content, source) VALUES (?, ?, ?) RETURNING id',
    args: [title, content, source]
  })
  const docId = docResult.rows[0].id

  // Chunk and embed
  const chunks = chunkText(content)
  const embeddings = await Promise.all(chunks.map(c => getEmbedding(c)))

  // Insert chunks
  await client.batch(
    chunks.map((chunk, i) => ({
      sql: 'INSERT INTO chunks (document_id, chunk_index, content, embedding) VALUES (?, ?, ?, vector(?))',
      args: [docId, i, chunk, JSON.stringify(embeddings[i])]
    })),
    'write'
  )

  return docId
}
```

### Retrieval

```typescript
async function retrieveContext(query: string, topK = 5) {
  const queryEmbedding = await getEmbedding(query)

  const { rows } = await client.execute({
    sql: `
      SELECT
        c.content,
        d.title,
        d.source,
        vector_distance_cos(c.embedding, vector(?)) as distance
      FROM chunks c
      JOIN documents d ON c.document_id = d.id
      ORDER BY distance ASC
      LIMIT ?
    `,
    args: [JSON.stringify(queryEmbedding), topK]
  })

  return rows
}
```

### Generate Answer

```typescript
async function answerQuestion(question: string) {
  // Retrieve relevant context
  const context = await retrieveContext(question)

  // Build prompt
  const contextText = context
    .map(c => `[${c.title}]: ${c.content}`)
    .join('\n\n')

  const response = await openai.chat.completions.create({
    model: 'gpt-4-turbo-preview',
    messages: [
      {
        role: 'system',
        content: `Answer questions using only the provided context. If the answer isn't in the context, say "I don't know."

Context:
${contextText}`
      },
      {
        role: 'user',
        content: question
      }
    ]
  })

  return {
    answer: response.choices[0].message.content,
    sources: context.map(c => c.source)
  }
}
```

## Hybrid Search

Combine vector similarity with keyword matching:

```typescript
async function hybridSearch(query: string) {
  const queryEmbedding = await getEmbedding(query)
  const keywords = query.toLowerCase().split(' ').filter(w => w.length > 3)

  const { rows } = await client.execute({
    sql: `
      SELECT
        id,
        content,
        vector_distance_cos(embedding, vector(?)) as vector_score,
        (
          SELECT COUNT(*) FROM (
            SELECT 1 WHERE content LIKE '%' || ? || '%'
            UNION ALL
            SELECT 1 WHERE content LIKE '%' || ? || '%'
          )
        ) as keyword_matches
      FROM documents
      ORDER BY
        (vector_score * 0.7) - (keyword_matches * 0.3) ASC
      LIMIT 10
    `,
    args: [JSON.stringify(queryEmbedding), ...keywords.slice(0, 2)]
  })

  return rows
}
```

## Vector Index (Future)

Currently, Turso performs full scans for vector search. For large datasets:

1. **Filter first** - Reduce candidates with WHERE clauses
2. **Limit scope** - Search within categories/partitions
3. **Cache embeddings** - Reuse computed embeddings

```sql
-- Filter to reduce search space
SELECT content, vector_distance_cos(embedding, vector(?)) as distance
FROM documents
WHERE category = 'technology'  -- Filter first
  AND created_at > '2024-01-01'
ORDER BY distance ASC
LIMIT 10
```

## Best Practices

1. **Normalize embeddings** - Consistent similarity scores
2. **Batch embedding requests** - Reduce API calls
3. **Store embedding metadata** - Model version, dimensions
4. **Handle null embeddings** - Documents pending embedding
5. **Use appropriate dimensions** - Match your model

```sql
-- Track embedding metadata
CREATE TABLE documents (
  id INTEGER PRIMARY KEY,
  content TEXT,
  embedding F32_BLOB(1536),
  embedding_model TEXT DEFAULT 'text-embedding-3-small',
  embedded_at TEXT
);
```
