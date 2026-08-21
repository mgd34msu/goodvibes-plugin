/**
 * Constants for `db_schema` usage-mode Prisma call detection.
 *
 * Ported verbatim from v1 project-engine `core/database/constants.ts`.
 * `WRITE_KEYWORDS` (raw-SQL classification) does NOT port here, it belongs
 * to connect's `db_query` trust model (§4.3), not intel's static analyzer.
 *
 * @module lib/db/constants
 */

/** All known Prisma client query and mutation operation names. */
export const PRISMA_OPERATIONS: readonly string[] = [
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

/** JavaScript/TypeScript loop constructs that may cause N+1 query issues. */
export const LOOP_KEYWORDS: readonly string[] = ['for', 'forEach', 'map', 'filter', 'reduce', 'some', 'every', 'flatMap'];
