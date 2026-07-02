/**
 * SQL query analysis — ported verbatim from v1 project-engine
 * `core/database/query-analysis.ts` (read/write classification, LIMIT handling,
 * CTE-with-write detection). This is what enforces the connect read-only
 * default before a query ever reaches an executor.
 */

import { WRITE_KEYWORDS } from './constants.js';

const STRIP_LINE_COMMENTS = /^--.*$/gm;
const STRIP_BLOCK_COMMENTS = /\/\*[\s\S]*?\*\//g;

const CTE_END_PATTERNS: Record<string, RegExp> = {};

function getCteEndPattern(keyword: string): RegExp {
  if (!CTE_END_PATTERNS[keyword]) {
    CTE_END_PATTERNS[keyword] = new RegExp(`\\)\\s*${keyword}\\b`, 'i');
  }
  return CTE_END_PATTERNS[keyword];
}

function stripLeadingComments(query: string): string {
  return query.replace(STRIP_LINE_COMMENTS, '').replace(STRIP_BLOCK_COMMENTS, '').trim();
}

/** True when the query modifies data or schema (incl. CTE-with-write). */
export function isWriteOperation(query: string): boolean {
  const normalizedQuery = query.trim().toUpperCase();
  const withoutComments = stripLeadingComments(normalizedQuery);

  for (const keyword of WRITE_KEYWORDS) {
    if (withoutComments.startsWith(keyword)) return true;
  }

  if (withoutComments.startsWith('WITH')) {
    for (const keyword of WRITE_KEYWORDS) {
      if (getCteEndPattern(keyword).test(withoutComments)) return true;
    }
  }

  return false;
}

/** True when the query is a pure read (SELECT/EXPLAIN/read PRAGMA/read CTE). */
export function isReadOnlyQuery(query: string): boolean {
  const normalizedQuery = query.trim().toUpperCase();
  const withoutComments = stripLeadingComments(normalizedQuery);

  if (withoutComments.startsWith('SELECT') || withoutComments.startsWith('EXPLAIN')) {
    return true;
  }

  if (withoutComments.startsWith('WITH')) {
    return !WRITE_KEYWORDS.some((keyword) => getCteEndPattern(keyword).test(withoutComments));
  }

  if (withoutComments.startsWith('PRAGMA')) {
    return !withoutComments.includes('=');
  }

  return false;
}

/** True when a LIMIT clause is already present. */
export function hasLimitClause(query: string): boolean {
  const normalizedQuery = query.trim().toUpperCase();
  return (
    /\bLIMIT\s+\d+/i.test(normalizedQuery) ||
    /\bLIMIT\s+\$\d+/i.test(normalizedQuery) ||
    /\bLIMIT\s+\?/i.test(normalizedQuery)
  );
}

/** Add a LIMIT to a SELECT/CTE query that lacks one; otherwise return unchanged. */
export function addLimitClause(query: string, limit: number): string {
  const trimmedQuery = query.trim();
  if (!/^(SELECT|WITH)/i.test(trimmedQuery)) return trimmedQuery;
  if (hasLimitClause(trimmedQuery)) return trimmedQuery;
  const withoutSemicolon = trimmedQuery.replace(/;\s*$/, '');
  return `${withoutSemicolon} LIMIT ${limit}`;
}

/** Classify a query (write / select / has-limit). */
export function analyzeQuery(sql: string): { isWrite: boolean; isSelect: boolean; hasLimit: boolean } {
  return {
    isWrite: isWriteOperation(sql),
    isSelect: isReadOnlyQuery(sql),
    hasLimit: hasLimitClause(sql),
  };
}
