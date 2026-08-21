/**
 * Read/write classification tests for the `db_query` gate.
 *
 * The bypasses at the top of each block are shapes the first-keyword classifier
 * reported as reads: a write inside a CTE body, a write behind a second
 * statement, `EXPLAIN ANALYZE` (which executes on PostgreSQL), ATTACH, and a
 * PRAGMA assignment. The false-positive block pins the other side, since a gate
 * that calls ordinary SELECTs writes is useless.
 */

import { describe, it, expect } from 'vitest';
import {
  isWriteOperation,
  isReadOnlyQuery,
  hasLimitClause,
  addLimitClause,
  statementCount,
  analyzeQuery,
} from '../db/query-analysis.js';

describe('isWriteOperation', () => {
  describe('writes hidden inside a CTE body', () => {
    it('classifies a DELETE CTE feeding a SELECT as a write', () => {
      expect(
        isWriteOperation('WITH deleted AS (DELETE FROM users RETURNING *) SELECT * FROM deleted'),
      ).toBe(true);
    });

    it('classifies an UPDATE CTE feeding a SELECT as a write', () => {
      expect(
        isWriteOperation('WITH u AS (UPDATE orders SET total = 0 RETURNING id) SELECT count(*) FROM u'),
      ).toBe(true);
    });

    it('classifies an INSERT CTE feeding a SELECT as a write', () => {
      expect(
        isWriteOperation("WITH i AS (INSERT INTO audit (msg) VALUES ('x') RETURNING id) SELECT * FROM i"),
      ).toBe(true);
    });

    it('classifies a MATERIALIZED write CTE as a write', () => {
      expect(
        isWriteOperation('WITH d AS MATERIALIZED (DELETE FROM users RETURNING *) SELECT * FROM d'),
      ).toBe(true);
    });

    it('classifies a write CTE nested inside a read CTE as a write', () => {
      expect(
        isWriteOperation(
          'WITH outer_cte AS (WITH inner_cte AS (DELETE FROM users RETURNING *) SELECT * FROM inner_cte) SELECT * FROM outer_cte',
        ),
      ).toBe(true);
    });

    it('still classifies a write after the CTE closes as a write', () => {
      expect(isWriteOperation('WITH x AS (SELECT 1 AS a) DELETE FROM users')).toBe(true);
    });
  });

  describe('writes hidden behind another statement', () => {
    it('classifies a trailing DROP after a SELECT as a write', () => {
      expect(isWriteOperation('SELECT 1; DROP TABLE users')).toBe(true);
    });

    it('classifies a trailing DELETE after a semicolon and newline as a write', () => {
      expect(isWriteOperation('SELECT name FROM users;\nDELETE FROM users')).toBe(true);
    });
  });

  describe('writes hidden behind EXPLAIN', () => {
    it('classifies EXPLAIN ANALYZE DELETE as a write', () => {
      expect(isWriteOperation('EXPLAIN ANALYZE DELETE FROM users')).toBe(true);
    });

    it('classifies EXPLAIN with an option list wrapping a write as a write', () => {
      expect(isWriteOperation('EXPLAIN (ANALYZE, BUFFERS) UPDATE users SET name = NULL')).toBe(true);
    });

    it('classifies EXPLAIN wrapping a write CTE as a write', () => {
      expect(
        isWriteOperation('EXPLAIN ANALYZE WITH d AS (DELETE FROM users RETURNING *) SELECT * FROM d'),
      ).toBe(true);
    });
  });

  describe('statements that reach outside the named connection', () => {
    it('classifies ATTACH DATABASE as a write', () => {
      expect(isWriteOperation("ATTACH DATABASE '/tmp/other.db' AS other")).toBe(true);
    });

    it('classifies DETACH as a write', () => {
      expect(isWriteOperation('DETACH DATABASE other')).toBe(true);
    });

    it('classifies COPY as a write', () => {
      expect(isWriteOperation("COPY users FROM '/tmp/users.csv'")).toBe(true);
    });

    it('classifies CALL as a write', () => {
      expect(isWriteOperation('CALL purge_everything()')).toBe(true);
    });
  });

  describe('PRAGMA', () => {
    it('classifies a PRAGMA assignment as a write', () => {
      expect(isWriteOperation('PRAGMA journal_mode = WAL')).toBe(true);
    });

    it('leaves a PRAGMA read classified as a read', () => {
      expect(isWriteOperation('PRAGMA table_info(users)')).toBe(false);
      expect(isReadOnlyQuery('PRAGMA table_info(users)')).toBe(true);
    });
  });

  describe('plain writes stay writes', () => {
    it.each([
      'DELETE FROM users',
      'UPDATE users SET name = NULL',
      "INSERT INTO users (name) VALUES ('x')",
      'DROP TABLE users',
      'CREATE TABLE t (id INTEGER)',
      'ALTER TABLE t ADD COLUMN x TEXT',
      'TRUNCATE TABLE users',
      'VACUUM',
      'GRANT SELECT ON users TO bob',
    ])('classifies %s as a write', (sql) => {
      expect(isWriteOperation(sql)).toBe(true);
    });
  });

  describe('reads stay reads', () => {
    it.each([
      'SELECT * FROM users',
      "SELECT REPLACE(name, 'a', 'b') FROM users",
      'SELECT TRUNCATE(1.5, 1)',
      "SELECT INSERT('abcd', 1, 2, 'zz')",
      "SELECT 'DELETE FROM users' AS spooky",
      "SELECT * FROM users WHERE name = 'DROP TABLE users'",
      'SELECT CASE WHEN (id) THEN 1 ELSE (2) END FROM users',
      'SELECT created_at, updated_at, deleted_at FROM users',
      'WITH x AS (SELECT 1 AS a) SELECT * FROM x',
      'SELECT * FROM users WHERE id IN (SELECT id FROM admins)',
      'EXPLAIN QUERY PLAN SELECT * FROM users',
      'EXPLAIN (ANALYZE, BUFFERS) SELECT 1',
      '-- a leading comment\nSELECT 1',
      '/* block */ SELECT 1',
      'SELECT 1; SELECT 2',
    ])('classifies %s as a read', (sql) => {
      expect(isWriteOperation(sql)).toBe(false);
    });

    it('does not treat a keyword inside a quoted identifier as a statement', () => {
      expect(isWriteOperation('SELECT "delete" FROM users')).toBe(false);
      expect(isWriteOperation('SELECT `update` FROM users')).toBe(false);
    });

    it('does not treat a keyword inside a dollar-quoted body as a statement', () => {
      expect(isWriteOperation('SELECT $tag$ DELETE FROM users $tag$ AS body')).toBe(false);
    });
  });

  describe('unterminated quoting fails closed', () => {
    it('treats an unterminated block comment as hiding nothing readable', () => {
      // The comment swallows the rest, so there is no statement left to run.
      expect(isReadOnlyQuery('SELECT 1 /* never closed DELETE FROM users')).toBe(true);
    });

    it('classifies a write that follows a single-line comment', () => {
      expect(isWriteOperation('-- SELECT 1\nDELETE FROM users')).toBe(true);
    });
  });
});

describe('isReadOnlyQuery', () => {
  it('rejects a query whose CTE writes', () => {
    expect(isReadOnlyQuery('WITH d AS (DELETE FROM users RETURNING *) SELECT * FROM d')).toBe(false);
  });

  it('rejects a multi-statement query with a write in it', () => {
    expect(isReadOnlyQuery('SELECT 1; DELETE FROM users')).toBe(false);
  });

  it('rejects a PRAGMA assignment', () => {
    expect(isReadOnlyQuery('PRAGMA journal_mode = WAL')).toBe(false);
  });

  it('accepts SELECT, VALUES, SHOW and EXPLAIN reads', () => {
    expect(isReadOnlyQuery('SELECT 1')).toBe(true);
    expect(isReadOnlyQuery('VALUES (1), (2)')).toBe(true);
    expect(isReadOnlyQuery('SHOW TABLES')).toBe(true);
    expect(isReadOnlyQuery('EXPLAIN SELECT 1')).toBe(true);
  });

  it('rejects an empty query', () => {
    expect(isReadOnlyQuery('   ')).toBe(false);
  });
});

describe('statementCount', () => {
  it('ignores semicolons inside literals and comments', () => {
    expect(statementCount("SELECT ';;;' AS a -- ;;;\n")).toBe(1);
    expect(statementCount('SELECT 1; SELECT 2;')).toBe(2);
  });
});

describe('addLimitClause', () => {
  it('adds a LIMIT to a single SELECT', () => {
    expect(addLimitClause('SELECT * FROM users', 10)).toBe('SELECT * FROM users\nLIMIT 10');
  });

  it('leaves a query that already has a LIMIT alone', () => {
    expect(addLimitClause('SELECT * FROM users LIMIT 5', 10)).toBe('SELECT * FROM users LIMIT 5');
  });

  it('refuses to append to a multi-statement query', () => {
    const sql = 'SELECT 1; SELECT 2';
    expect(addLimitClause(sql, 10)).toBe(sql);
  });

  it('appends on a new line so a trailing comment cannot swallow the clause', () => {
    expect(addLimitClause('SELECT * FROM users -- newest first', 10)).toBe(
      'SELECT * FROM users -- newest first\nLIMIT 10',
    );
  });

  it('does not append to a write', () => {
    expect(addLimitClause('DELETE FROM users', 10)).toBe('DELETE FROM users');
  });
});

describe('hasLimitClause', () => {
  it('ignores the word LIMIT inside a string literal', () => {
    expect(hasLimitClause("SELECT 'LIMIT 5' AS a FROM users")).toBe(false);
  });

  it('finds numeric, placeholder and ALL forms', () => {
    expect(hasLimitClause('SELECT 1 LIMIT 5')).toBe(true);
    expect(hasLimitClause('SELECT 1 LIMIT $1')).toBe(true);
    expect(hasLimitClause('SELECT 1 LIMIT ?')).toBe(true);
    expect(hasLimitClause('SELECT 1 LIMIT ALL')).toBe(true);
  });
});

describe('analyzeQuery', () => {
  it('reports a write CTE as a write and not a select', () => {
    expect(analyzeQuery('WITH d AS (DELETE FROM users RETURNING *) SELECT * FROM d')).toEqual({
      isWrite: true,
      isSelect: false,
      hasLimit: false,
    });
  });
});

describe('ordinary reads are never called writes', () => {
  // A gate that blocks real SELECTs is as bad as one that lets writes through,
  // so the shapes people actually send are pinned here too.
  it.each([
    'SELECT * FROM users u JOIN orders o ON o.user_id = u.id WHERE o.total > 100 ORDER BY o.created_at DESC',
    "SELECT date_trunc('day', created_at) AS d, count(*) FROM events GROUP BY 1 HAVING count(*) > 5",
    'WITH RECURSIVE tree AS (SELECT id, parent_id FROM nodes WHERE parent_id IS NULL UNION ALL SELECT n.id, n.parent_id FROM nodes n JOIN tree t ON n.parent_id = t.id) SELECT * FROM tree',
    "SELECT coalesce(replace(lower(name), ' ', '-'), 'unknown') AS slug FROM products",
    'SELECT (SELECT count(*) FROM orders WHERE user_id = u.id) AS n FROM users u',
    "SELECT jsonb_build_object('a', 1) -> 'a'",
    'SELECT * FROM t WHERE (a, b) IN ((1, 2), (3, 4))',
    'SELECT CASE WHEN (x > 0) THEN (1) ELSE (0) END AS flag FROM t',
    'SELECT array_agg(x ORDER BY x) FILTER (WHERE x IS NOT NULL) FROM t',
    'SELECT * FROM generate_series(1, 10) AS g(i)',
    'SELECT row_number() OVER (PARTITION BY a ORDER BY b) FROM t',
    "select * from information_schema.columns where table_name = 'users'",
    'EXPLAIN (FORMAT JSON) SELECT 1',
    'EXPLAIN ANALYZE SELECT count(*) FROM users',
    'PRAGMA foreign_key_list(users)',
    'SHOW COLUMNS FROM users',
    'DESCRIBE users',
    'SELECT * FROM t /* inline comment */ WHERE id = 1',
    'SELECT * FROM t -- trailing comment',
  ])('%s', (sql) => {
    expect(isWriteOperation(sql)).toBe(false);
  });
});
