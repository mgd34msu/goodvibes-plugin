/**
 * SQL write keywords, ported from v1 project-engine
 * `core/database/constants.ts` (query-execution subset only — the Prisma/loop
 * constants stay with intel's `db_schema`).
 */

/** Write SQL keywords that indicate a mutation query. */
export const WRITE_KEYWORDS: readonly string[] = [
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
];
