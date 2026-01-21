/**
 * SQL Query Analysis
 *
 * Functions for analyzing SQL queries to determine their type (read/write),
 * check for LIMIT clauses, and modify queries as needed.
 */

/**
 * Keywords that indicate a write operation
 */
export const WRITE_KEYWORDS = [
  'INSERT',
  'UPDATE',
  'DELETE',
  'DROP',
  'CREATE',
  'ALTER',
  'TRUNCATE',
  'REPLACE',
  'UPSERT',
  'MERGE',
  'GRANT',
  'REVOKE',
  'VACUUM',
] as const;

/**
 * Remove SQL comments from the beginning of a query
 */
function stripLeadingComments(query: string): string {
  return query
    .replace(/^--.*$/gm, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .trim();
}

/**
 * Check if a query is a write operation
 */
export function isWriteOperation(query: string): boolean {
  const normalizedQuery = query.trim().toUpperCase();
  const withoutComments = stripLeadingComments(normalizedQuery);

  // Check if query starts with any write keyword
  for (const keyword of WRITE_KEYWORDS) {
    if (withoutComments.startsWith(keyword)) {
      return true;
    }
  }

  // Check for WITH...INSERT/UPDATE/DELETE (CTE with write)
  if (withoutComments.startsWith('WITH')) {
    for (const keyword of WRITE_KEYWORDS) {
      // Look for write keyword after the CTE definition
      const cteEndPattern = new RegExp(`\\)\\s*${keyword}\\b`, 'i');
      if (cteEndPattern.test(withoutComments)) {
        return true;
      }
    }
  }

  return false;
}

/**
 * Check if a query is a SELECT statement (read-only)
 */
export function isSelectQuery(query: string): boolean {
  const normalizedQuery = query.trim().toUpperCase();
  const withoutComments = stripLeadingComments(normalizedQuery);

  // Check if it starts with SELECT, WITH (CTEs), or EXPLAIN
  if (withoutComments.startsWith('SELECT') || withoutComments.startsWith('EXPLAIN')) {
    return true;
  }

  // WITH clause that ends in SELECT is a read query
  if (withoutComments.startsWith('WITH')) {
    // Check if the CTE ends with SELECT
    return !WRITE_KEYWORDS.some(keyword => {
      const pattern = new RegExp(`\\)\\s*${keyword}\\b`, 'i');
      return pattern.test(withoutComments);
    });
  }

  // PRAGMA statements are also read queries
  if (withoutComments.startsWith('PRAGMA')) {
    // Unless it's a PRAGMA that modifies something
    return !withoutComments.includes('=');
  }

  return false;
}

/**
 * Check if query already has a LIMIT clause
 */
export function hasLimitClause(query: string): boolean {
  const normalizedQuery = query.trim().toUpperCase();
  // Match LIMIT keyword followed by number or parameter
  return /\bLIMIT\s+\d+/i.test(normalizedQuery) ||
         /\bLIMIT\s+\$\d+/i.test(normalizedQuery) ||
         /\bLIMIT\s+\?/i.test(normalizedQuery);
}

/**
 * Add LIMIT clause to a SELECT query
 */
export function addLimitClause(query: string, limit: number): string {
  const trimmedQuery = query.trim();

  // Don't add limit to non-SELECT queries
  if (!/^(SELECT|WITH)/i.test(trimmedQuery)) {
    return trimmedQuery;
  }

  // Don't add if already has LIMIT
  if (hasLimitClause(trimmedQuery)) {
    return trimmedQuery;
  }

  // Remove trailing semicolon, add LIMIT, then re-add semicolon
  const withoutSemicolon = trimmedQuery.replace(/;\s*$/, '');
  return `${withoutSemicolon} LIMIT ${limit}`;
}
