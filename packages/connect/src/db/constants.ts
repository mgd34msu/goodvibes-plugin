/**
 * SQL write keywords, ported from v1 project-engine
 * `core/database/constants.ts` (query-execution subset only, the Prisma/loop
 * constants stay with intel's `db_schema`).
 */

/**
 * Statement keywords that mean "this is not a read". The list covers data and
 * schema mutation, permission changes, maintenance statements that rewrite
 * storage, statements that reach a database or file outside the connection the
 * caller named (ATTACH/COPY/LOAD), and statements whose body is decided at
 * runtime (CALL/DO/EXECUTE), which the text classifier cannot inspect.
 */
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
  'ATTACH',
  'DETACH',
  'REINDEX',
  'ANALYZE',
  'CLUSTER',
  'COPY',
  'LOAD',
  'IMPORT',
  'RENAME',
  'COMMENT',
  'CALL',
  'DO',
  'EXECUTE',
  'PREPARE',
  'DEALLOCATE',
  'SET',
  'RESET',
  'LOCK',
  'UNLOCK',
  'BEGIN',
  'START',
  'COMMIT',
  'ROLLBACK',
  'SAVEPOINT',
  'RELEASE',
];

/**
 * Write keywords that are also ordinary SQL functions in at least one dialect
 * (MySQL `INSERT()`, `REPLACE()`, `TRUNCATE()`). When one of these is followed
 * immediately by `(` it is a call inside an expression, not a statement.
 */
export const FUNCTION_LIKE_WRITE_KEYWORDS: readonly string[] = ['INSERT', 'REPLACE', 'TRUNCATE'];

/**
 * Words EXPLAIN accepts between itself and the statement it explains, including
 * the Postgres parenthesised option list and SQLite's `QUERY PLAN`.
 */
export const EXPLAIN_OPTION_WORDS: readonly string[] = [
  'ANALYZE',
  'ANALYSE',
  'VERBOSE',
  'QUERY',
  'PLAN',
  'COSTS',
  'SETTINGS',
  'GENERIC_PLAN',
  'BUFFERS',
  'WAL',
  'TIMING',
  'SUMMARY',
  'MEMORY',
  'SERIALIZE',
  'FORMAT',
  'TEXT',
  'XML',
  'JSON',
  'YAML',
  'ON',
  'OFF',
  'TRUE',
  'FALSE',
];

/** Statement keywords that begin a pure read. */
export const READ_STATEMENT_STARTERS: readonly string[] = [
  'SELECT',
  'WITH',
  'VALUES',
  'TABLE',
  'SHOW',
  'DESCRIBE',
  'DESC',
  'PRAGMA',
];
