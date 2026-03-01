/**
 * Database domain constants
 *
 * Prisma operation names and loop keywords used for N+1 detection.
 *
 * @module core/database/constants
 */

/**
 * All known Prisma client query and mutation operation names.
 *
 * Used for detecting prisma.model.operation() call chains in AST analysis.
 */
export const PRISMA_OPERATIONS: string[] = [
  // Read operations
  'findUnique',
  'findUniqueOrThrow',
  'findFirst',
  'findFirstOrThrow',
  'findMany',
  'count',
  'aggregate',
  'groupBy',
  // Write operations
  'create',
  'createMany',
  'createManyAndReturn',
  'update',
  'updateMany',
  'upsert',
  'delete',
  'deleteMany',
  // Raw queries
  '$queryRaw',
  '$executeRaw',
  '$queryRawUnsafe',
  '$executeRawUnsafe',
];

/**
 * JavaScript/TypeScript loop constructs that may cause N+1 query issues.
 *
 * Used to detect when Prisma queries are placed inside iteration callbacks.
 */
export const LOOP_KEYWORDS: string[] = [
  'for',
  'forEach',
  'map',
  'filter',
  'reduce',
  'some',
  'every',
  'flatMap',
];

/**
 * Write SQL keywords that indicate a mutation query.
 *
 * Used by the query analysis module to prevent writes in readonly mode.
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
] as const;
