---
name: postgresql
description: Works with PostgreSQL including queries, migrations, indexes, and performance tuning. Use when designing database schemas, writing SQL queries, optimizing performance, or managing PostgreSQL databases.
---

# PostgreSQL

Powerful, open source object-relational database system.

## Quick Start

**Install node-postgres:**
```bash
npm install pg
npm install -D @types/pg
```

**Connect:**
```typescript
import { Pool } from 'pg';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  // Or individual settings:
  // host: 'localhost',
  // port: 5432,
  // database: 'mydb',
  // user: 'postgres',
  // password: 'password',
  max: 20,
  idleTimeoutMillis: 30000,
});

// Query
const result = await pool.query('SELECT NOW()');
console.log(result.rows[0]);
```

## Basic Queries

### SELECT

```typescript
// Simple query
const { rows } = await pool.query('SELECT * FROM users');

// With parameters (prevents SQL injection)
const { rows } = await pool.query(
  'SELECT * FROM users WHERE id = $1',
  [userId]
);

// Multiple parameters
const { rows } = await pool.query(
  'SELECT * FROM users WHERE name = $1 AND age > $2',
  [name, minAge]
);

// With type
interface User {
  id: string;
  name: string;
  email: string;
}

const { rows } = await pool.query<User>(
  'SELECT id, name, email FROM users WHERE id = $1',
  [userId]
);
```

### INSERT

```typescript
// Insert and return
const { rows } = await pool.query(
  `INSERT INTO users (name, email) VALUES ($1, $2) RETURNING *`,
  ['John', 'john@example.com']
);
const newUser = rows[0];

// Insert multiple
const { rows } = await pool.query(
  `INSERT INTO users (name, email) VALUES
   ($1, $2), ($3, $4), ($5, $6)
   RETURNING *`,
  ['John', 'john@example.com', 'Jane', 'jane@example.com', 'Bob', 'bob@example.com']
);

// Insert with ON CONFLICT (upsert)
const { rows } = await pool.query(
  `INSERT INTO users (id, name, email)
   VALUES ($1, $2, $3)
   ON CONFLICT (id) DO UPDATE SET
     name = EXCLUDED.name,
     email = EXCLUDED.email
   RETURNING *`,
  [userId, name, email]
);
```

### UPDATE

```typescript
// Update with returning
const { rows, rowCount } = await pool.query(
  `UPDATE users SET name = $1, updated_at = NOW()
   WHERE id = $2 RETURNING *`,
  [newName, userId]
);

// Update multiple conditions
await pool.query(
  `UPDATE orders SET status = $1
   WHERE user_id = $2 AND status = $3`,
  ['shipped', userId, 'pending']
);
```

### DELETE

```typescript
// Delete with returning
const { rows } = await pool.query(
  'DELETE FROM users WHERE id = $1 RETURNING *',
  [userId]
);

// Soft delete
await pool.query(
  'UPDATE users SET deleted_at = NOW() WHERE id = $1',
  [userId]
);
```

## Schema Design

### Create Tables

```sql
-- Users table
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email VARCHAR(255) UNIQUE NOT NULL,
  name VARCHAR(255) NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Posts table with foreign key
CREATE TABLE posts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title VARCHAR(255) NOT NULL,
  content TEXT,
  published BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Many-to-many relationship
CREATE TABLE post_tags (
  post_id UUID REFERENCES posts(id) ON DELETE CASCADE,
  tag_id UUID REFERENCES tags(id) ON DELETE CASCADE,
  PRIMARY KEY (post_id, tag_id)
);

-- Enum type
CREATE TYPE order_status AS ENUM ('pending', 'processing', 'shipped', 'delivered');

CREATE TABLE orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  status order_status DEFAULT 'pending',
  total DECIMAL(10, 2) NOT NULL
);
```

### Indexes

```sql
-- B-tree index (default)
CREATE INDEX idx_users_email ON users(email);

-- Unique index
CREATE UNIQUE INDEX idx_users_email_unique ON users(email);

-- Composite index
CREATE INDEX idx_posts_user_created ON posts(user_id, created_at DESC);

-- Partial index
CREATE INDEX idx_posts_published ON posts(user_id) WHERE published = true;

-- GIN index for JSONB
CREATE INDEX idx_products_metadata ON products USING GIN(metadata);

-- GIN index for full-text search
CREATE INDEX idx_posts_search ON posts USING GIN(to_tsvector('english', title || ' ' || content));

-- Expression index
CREATE INDEX idx_users_email_lower ON users(LOWER(email));
```

## Transactions

```typescript
const client = await pool.connect();

try {
  await client.query('BEGIN');

  const { rows: [order] } = await client.query(
    'INSERT INTO orders (user_id, total) VALUES ($1, $2) RETURNING *',
    [userId, total]
  );

  await client.query(
    'INSERT INTO order_items (order_id, product_id, quantity) VALUES ($1, $2, $3)',
    [order.id, productId, quantity]
  );

  await client.query(
    'UPDATE products SET stock = stock - $1 WHERE id = $2',
    [quantity, productId]
  );

  await client.query('COMMIT');
  return order;
} catch (error) {
  await client.query('ROLLBACK');
  throw error;
} finally {
  client.release();
}
```

### Transaction Helper

```typescript
async function withTransaction<T>(
  callback: (client: PoolClient) => Promise<T>
): Promise<T> {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

// Usage
const order = await withTransaction(async (client) => {
  const { rows: [order] } = await client.query(
    'INSERT INTO orders ...',
    [...]
  );
  await client.query('INSERT INTO order_items ...', [...]);
  return order;
});
```

## Advanced Queries

### JOINs

```sql
-- Inner join
SELECT u.name, p.title
FROM users u
INNER JOIN posts p ON u.id = p.user_id
WHERE p.published = true;

-- Left join with aggregation
SELECT u.name, COUNT(p.id) as post_count
FROM users u
LEFT JOIN posts p ON u.id = p.user_id
GROUP BY u.id
ORDER BY post_count DESC;

-- Multiple joins
SELECT o.id, u.name, p.name as product, oi.quantity
FROM orders o
JOIN users u ON o.user_id = u.id
JOIN order_items oi ON o.id = oi.order_id
JOIN products p ON oi.product_id = p.id;
```

### Subqueries

```sql
-- Scalar subquery
SELECT name,
  (SELECT COUNT(*) FROM posts WHERE user_id = users.id) as post_count
FROM users;

-- IN subquery
SELECT * FROM users
WHERE id IN (
  SELECT user_id FROM orders WHERE total > 100
);

-- EXISTS subquery
SELECT * FROM users u
WHERE EXISTS (
  SELECT 1 FROM posts p
  WHERE p.user_id = u.id AND p.published = true
);
```

### Common Table Expressions (CTEs)

```sql
-- Simple CTE
WITH active_users AS (
  SELECT * FROM users WHERE last_login > NOW() - INTERVAL '30 days'
)
SELECT * FROM active_users WHERE email LIKE '%@gmail.com';

-- Recursive CTE
WITH RECURSIVE category_tree AS (
  SELECT id, name, parent_id, 0 as level
  FROM categories
  WHERE parent_id IS NULL

  UNION ALL

  SELECT c.id, c.name, c.parent_id, ct.level + 1
  FROM categories c
  JOIN category_tree ct ON c.parent_id = ct.id
)
SELECT * FROM category_tree;
```

### Window Functions

```sql
-- Row number
SELECT
  name,
  ROW_NUMBER() OVER (ORDER BY score DESC) as rank
FROM users;

-- Running total
SELECT
  date,
  amount,
  SUM(amount) OVER (ORDER BY date) as running_total
FROM transactions;

-- Partitioned ranking
SELECT
  department,
  name,
  salary,
  RANK() OVER (PARTITION BY department ORDER BY salary DESC) as dept_rank
FROM employees;

-- Lead/Lag
SELECT
  date,
  value,
  LAG(value) OVER (ORDER BY date) as previous_value,
  value - LAG(value) OVER (ORDER BY date) as change
FROM metrics;
```

### JSONB Operations

```sql
-- Store JSON
INSERT INTO products (name, metadata)
VALUES ('Widget', '{"color": "red", "size": "large"}');

-- Query JSON
SELECT * FROM products WHERE metadata->>'color' = 'red';
SELECT * FROM products WHERE metadata @> '{"color": "red"}';

-- Update JSON
UPDATE products
SET metadata = jsonb_set(metadata, '{price}', '29.99')
WHERE id = 1;

-- Extract nested value
SELECT metadata->'dimensions'->>'width' as width FROM products;

-- Array operations
SELECT * FROM products WHERE metadata->'tags' ? 'sale';
```

### Full-Text Search

```sql
-- Create search vector column
ALTER TABLE posts ADD COLUMN search_vector tsvector;

UPDATE posts SET search_vector =
  to_tsvector('english', coalesce(title, '') || ' ' || coalesce(content, ''));

CREATE INDEX idx_posts_search ON posts USING GIN(search_vector);

-- Search
SELECT * FROM posts
WHERE search_vector @@ to_tsquery('english', 'postgresql & performance');

-- With ranking
SELECT
  title,
  ts_rank(search_vector, query) as rank
FROM posts, to_tsquery('english', 'postgresql') query
WHERE search_vector @@ query
ORDER BY rank DESC;
```

## Migrations

### With node-pg-migrate

```bash
npm install node-pg-migrate
```

```javascript
// migrations/1_create_users.js
exports.up = (pgm) => {
  pgm.createTable('users', {
    id: {
      type: 'uuid',
      primaryKey: true,
      default: pgm.func('gen_random_uuid()'),
    },
    email: { type: 'varchar(255)', notNull: true, unique: true },
    name: { type: 'varchar(255)', notNull: true },
    created_at: {
      type: 'timestamptz',
      notNull: true,
      default: pgm.func('now()'),
    },
  });

  pgm.createIndex('users', 'email');
};

exports.down = (pgm) => {
  pgm.dropTable('users');
};
```

```bash
# Run migrations
npx node-pg-migrate up

# Rollback
npx node-pg-migrate down
```

## Performance

### EXPLAIN ANALYZE

```sql
EXPLAIN ANALYZE SELECT * FROM users WHERE email = 'test@example.com';

-- With more detail
EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)
SELECT * FROM users WHERE email = 'test@example.com';
```

### Query Optimization

```sql
-- Use specific columns instead of *
SELECT id, name, email FROM users;

-- Use LIMIT for pagination
SELECT * FROM posts ORDER BY created_at DESC LIMIT 10 OFFSET 20;

-- Use keyset pagination for large datasets
SELECT * FROM posts
WHERE created_at < $1
ORDER BY created_at DESC
LIMIT 10;

-- Use EXISTS instead of IN for subqueries
SELECT * FROM users u
WHERE EXISTS (SELECT 1 FROM orders o WHERE o.user_id = u.id);
```

## Best Practices

1. **Always use parameterized queries** - Prevent SQL injection
2. **Use connection pooling** - Reuse connections
3. **Add appropriate indexes** - Based on query patterns
4. **Use transactions** - For data integrity
5. **Monitor slow queries** - Use pg_stat_statements

## Common Mistakes

| Mistake | Fix |
|---------|-----|
| String concatenation in queries | Use parameterized queries |
| SELECT * | Select specific columns |
| Missing indexes | Add indexes for WHERE/JOIN columns |
| N+1 queries | Use JOINs or batch queries |
| Large OFFSET | Use keyset pagination |

## Reference Files

- [references/indexes.md](references/indexes.md) - Index types and usage
- [references/performance.md](references/performance.md) - Query optimization
- [references/migrations.md](references/migrations.md) - Migration patterns
