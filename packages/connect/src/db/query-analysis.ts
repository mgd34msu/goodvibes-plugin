/**
 * SQL read/write classification and LIMIT handling for connect `db_query`.
 *
 * This is the gate that enforces the read-only default, so it is written to
 * fail closed: anything it cannot prove is a read is reported as a write and
 * therefore needs the caller's `write:true` plus a target that permits writes.
 *
 * The v1 port classified by looking at the first keyword plus a `) KEYWORD`
 * regex for CTEs. That let a write ride inside a CTE body
 * (`WITH d AS (DELETE ... RETURNING *) SELECT * FROM d`), behind a second
 * statement (`SELECT 1; DROP TABLE t`), or behind `EXPLAIN ANALYZE`, which
 * actually executes its statement on PostgreSQL. Classification now runs over a
 * normalized token stream instead: comments, string literals, dollar-quoted
 * bodies and quoted identifiers are replaced with inert placeholders, the text
 * is split into statements, EXPLAIN wrappers are unwrapped, and a write keyword
 * is honoured wherever a statement can begin (statement start, and after `(` or
 * `)`, which is where CTE bodies open and close).
 */

import {
  WRITE_KEYWORDS,
  FUNCTION_LIKE_WRITE_KEYWORDS,
  EXPLAIN_OPTION_WORDS,
  READ_STATEMENT_STARTERS,
} from './constants.js';

const WRITE_KEYWORD_SET = new Set(WRITE_KEYWORDS.map((k) => k.toUpperCase()));
const FUNCTION_LIKE_SET = new Set(FUNCTION_LIKE_WRITE_KEYWORDS.map((k) => k.toUpperCase()));
const EXPLAIN_OPTION_SET = new Set(EXPLAIN_OPTION_WORDS.map((k) => k.toUpperCase()));
const READ_STARTER_SET = new Set(READ_STATEMENT_STARTERS.map((k) => k.toUpperCase()));

/** Placeholder standing in for any string literal that was removed. */
const LITERAL = ' _lit ';
/** Placeholder standing in for any quoted identifier that was removed. */
const IDENTIFIER = ' _id ';

const TOKEN_RE = /[A-Za-z_][A-Za-z_0-9$]*|[();,]|[^\s]/g;

/**
 * Strip comments and replace every quoted run with an inert placeholder, so no
 * keyword scan can be fooled by text that only looks like SQL.
 * @param sql - raw query text
 */
export function normalizeSql(sql: string): string {
  let out = '';
  let i = 0;
  const n = sql.length;

  while (i < n) {
    const c = sql[i];
    const next = i + 1 < n ? sql[i + 1] : '';

    if ((c === '-' && next === '-') || c === '#') {
      while (i < n && sql[i] !== '\n') {i++;}
      out += ' ';
      continue;
    }

    if (c === '/' && next === '*') {
      // A block comment ends at the first `*/`. PostgreSQL would nest, but
      // MySQL and SQLite would not, and ending early only ever leaves MORE text
      // for the keyword scan to see.
      const end = sql.indexOf('*/', i + 2);
      i = end === -1 ? n : end + 2;
      out += ' ';
      continue;
    }

    if (c === '$') {
      const dollarTag = /^\$[A-Za-z_][A-Za-z_0-9]*\$|^\$\$/.exec(sql.slice(i));
      if (dollarTag) {
        const tag = dollarTag[0];
        const end = sql.indexOf(tag, i + tag.length);
        i = end === -1 ? n : end + tag.length;
        out += LITERAL;
        continue;
      }
    }

    if (c === "'" || c === '"' || c === '`') {
      const quote = c;
      i++;
      while (i < n) {
        if (sql[i] === '\\' && quote !== '"') {
          i += 2;
          continue;
        }
        if (sql[i] === quote) {
          if (sql[i + 1] === quote) {
            i += 2;
            continue;
          }
          i++;
          break;
        }
        i++;
      }
      out += quote === "'" ? LITERAL : IDENTIFIER;
      continue;
    }

    out += c;
    i++;
  }

  return out;
}

/** Split normalized SQL into individual statements. */
function splitStatements(normalized: string): string[] {
  return normalized
    .split(';')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

/** Tokenize normalized SQL; words are upper-cased, punctuation kept as-is. */
function tokenize(normalized: string): string[] {
  const tokens: string[] = [];
  TOKEN_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = TOKEN_RE.exec(normalized)) !== null) {
    tokens.push(match[0].toUpperCase());
  }
  return tokens;
}

/**
 * Index of the first token of the statement an EXPLAIN wraps. `EXPLAIN ANALYZE`
 * executes its statement on PostgreSQL, so the wrapper must never hide the
 * classification of what is inside it.
 */
function skipExplainWrapper(tokens: string[]): number {
  if (tokens[0] !== 'EXPLAIN') {return 0;}
  let i = 1;
  while (i < tokens.length) {
    const t = tokens[i];
    if (t === '(' || t === ')' || t === ',' || EXPLAIN_OPTION_SET.has(t)) {
      i++;
      continue;
    }
    break;
  }
  return i;
}

/** True when a single tokenized statement mutates anything. */
function isWriteStatement(tokens: string[]): boolean {
  const start = skipExplainWrapper(tokens);
  if (start >= tokens.length) {return false;}

  if (tokens[start] === 'PRAGMA') {
    // `PRAGMA name = value` sets; `PRAGMA name` and `PRAGMA name(arg)` read.
    return tokens.includes('=');
  }

  let atStatementBoundary = true;
  for (let i = start; i < tokens.length; i++) {
    const token = tokens[i];
    if (token === '(' || token === ')') {
      atStatementBoundary = true;
      continue;
    }
    if (atStatementBoundary && WRITE_KEYWORD_SET.has(token)) {
      if (!(FUNCTION_LIKE_SET.has(token) && tokens[i + 1] === '(')) {return true;}
    }
    atStatementBoundary = false;
  }
  return false;
}

/**
 * True when the query modifies data, schema, permissions, or reaches outside
 * the named connection. Every statement in the text is classified, including
 * the bodies of CTEs and anything an EXPLAIN wraps.
 */
export function isWriteOperation(query: string): boolean {
  return splitStatements(normalizeSql(query)).some((stmt) => isWriteStatement(tokenize(stmt)));
}

/** True when the query is a pure read (SELECT/EXPLAIN/read PRAGMA/read CTE). */
export function isReadOnlyQuery(query: string): boolean {
  const statements = splitStatements(normalizeSql(query));
  if (statements.length === 0) {return false;}

  return statements.every((stmt) => {
    const tokens = tokenize(stmt);
    if (isWriteStatement(tokens)) {return false;}
    const start = skipExplainWrapper(tokens);
    const head = tokens[start];
    if (head === undefined) {return tokens[0] === 'EXPLAIN';}
    return READ_STARTER_SET.has(head);
  });
}

/** Number of statements in the query (comments and literals ignored). */
export function statementCount(query: string): number {
  return splitStatements(normalizeSql(query)).length;
}

/** True when a LIMIT clause is already present. */
export function hasLimitClause(query: string): boolean {
  const normalized = normalizeSql(query);
  return (
    /\bLIMIT\s+\d+/i.test(normalized) ||
    /\bLIMIT\s+\$\d+/i.test(normalized) ||
    /\bLIMIT\s+\?/i.test(normalized) ||
    /\bLIMIT\s+ALL\b/i.test(normalized)
  );
}

/** Add a LIMIT to a single-statement SELECT/CTE query that lacks one. */
export function addLimitClause(query: string, limit: number): string {
  const trimmedQuery = query.trim();
  const statements = splitStatements(normalizeSql(trimmedQuery));
  if (statements.length !== 1) {return trimmedQuery;}
  if (!/^(SELECT|WITH)\b/i.test(statements[0])) {return trimmedQuery;}
  if (hasLimitClause(trimmedQuery)) {return trimmedQuery;}
  const withoutSemicolon = trimmedQuery.replace(/;\s*$/, '');
  // Newline rather than a space: a query ending in a `--` comment would
  // otherwise swallow the clause.
  return `${withoutSemicolon}\nLIMIT ${limit}`;
}

/** Classify a query (write / select / has-limit). */
export function analyzeQuery(sql: string): { isWrite: boolean; isSelect: boolean; hasLimit: boolean } {
  return {
    isWrite: isWriteOperation(sql),
    isSelect: isReadOnlyQuery(sql),
    hasLimit: hasLimitClause(sql),
  };
}
