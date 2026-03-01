/**
 * SQL query analysis utilities
 *
 * Functions for classifying SQL queries (read vs write),
 * checking for LIMIT clauses, and modifying queries safely.
 *
 * @module core/database/query-analysis
 */

import { WRITE_KEYWORDS } from './constants.js';

/**
 * Remove SQL comments from the beginning of a query.
 *
 * @param query - Raw SQL query string
 * @returns Query with leading comments stripped
 */
function stripLeadingComments(query: string): string {
  return query
    .replace(/^--.*$/gm, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .trim();
}

/**
 * Check if a SQL query is a write (mutation) operation.
 *
 * Detects INSERT, UPDATE, DELETE, DROP, CREATE, ALTER, TRUNCATE,
 * REPLACE, UPSERT, MERGE, GRANT, REVOKE, VACUUM at the query start,
 * and CTEs ending in a write operation.
 *
 * @param query - SQL query string to analyze
 * @returns true if the query modifies data or schema
 *
 * @example
 * isReadOnlyQuery('DELETE FROM users WHERE id = 1') // false (write)
 * isReadOnlyQuery('SELECT * FROM users') // true (not a write)
 */
export function isWriteOperation(query: string): boolean {
  const normalizedQuery = query.trim().toUpperCase();
  const withoutComments = stripLeadingComments(normalizedQuery);

  for (const keyword of WRITE_KEYWORDS) {
    if (withoutComments.startsWith(keyword)) {
      return true;
    }
  }

  // WITH...INSERT/UPDATE/DELETE (CTE with write)
  if (withoutComments.startsWith('WITH')) {
    for (const keyword of WRITE_KEYWORDS) {
      const cteEndPattern = new RegExp(`\\)\\s*${keyword}\\b`, 'i');
      if (cteEndPattern.test(withoutComments)) {
        return true;
      }
    }
  }

  return false;
}

/**
 * Check if a SQL query is a SELECT (read-only) statement.
 *
 * @param query - SQL query string
 * @returns true if the query is a pure read operation
 *
 * @example
 * analyzeQuery('SELECT id FROM users') // true
 * analyzeQuery('INSERT INTO users VALUES (...)') // false
 */
export function isReadOnlyQuery(query: string): boolean {
  const normalizedQuery = query.trim().toUpperCase();
  const withoutComments = stripLeadingComments(normalizedQuery);

  if (withoutComments.startsWith('SELECT') || withoutComments.startsWith('EXPLAIN')) {
    return true;
  }

  if (withoutComments.startsWith('WITH')) {
    return !WRITE_KEYWORDS.some(keyword => {
      const pattern = new RegExp(`\\)\\s*${keyword}\\b`, 'i');
      return pattern.test(withoutComments);
    });
  }

  // PRAGMA read statements
  if (withoutComments.startsWith('PRAGMA')) {
    return !withoutComments.includes('=');
  }

  return false;
}

/**
 * Check if a query already has a LIMIT clause.
 *
 * @param query - SQL query string
 * @returns true if LIMIT is already present
 */
export function hasLimitClause(query: string): boolean {
  const normalizedQuery = query.trim().toUpperCase();
  return /\bLIMIT\s+\d+/i.test(normalizedQuery) ||
         /\bLIMIT\s+\$\d+/i.test(normalizedQuery) ||
         /\bLIMIT\s+\?/i.test(normalizedQuery);
}

/**
 * Add a LIMIT clause to a SELECT query if not already present.
 *
 * @param query - SQL query string
 * @param limit - Maximum rows to return
 * @returns Query with LIMIT appended, or original if already limited
 */
export function addLimitClause(query: string, limit: number): string {
  const trimmedQuery = query.trim();

  if (!/^(SELECT|WITH)/i.test(trimmedQuery)) {
    return trimmedQuery;
  }

  if (hasLimitClause(trimmedQuery)) {
    return trimmedQuery;
  }

  const withoutSemicolon = trimmedQuery.replace(/;\s*$/, '');
  return `${withoutSemicolon} LIMIT ${limit}`;
}

/**
 * Analyze a SQL query and return its type and key properties.
 *
 * @param sql - SQL query string
 * @returns Object with query classification flags
 */
export function analyzeQuery(sql: string): {
  isWrite: boolean;
  isSelect: boolean;
  hasLimit: boolean;
} {
  return {
    isWrite: isWriteOperation(sql),
    isSelect: isReadOnlyQuery(sql),
    hasLimit: hasLimitClause(sql),
  };
}
