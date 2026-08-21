/**
 * Domain types for `db_schema` (schema extraction + prisma usage mode).
 *
 * `DatabaseTable`/`DatabaseRelation`/`DatabaseColumn` mirror v1 project-engine
 * `core/database/types.ts`'s unified parser output (flat tables + a global
 * relations array), the three schema parsers (prisma/drizzle/sql) still
 * produce this shape near-verbatim, since it is proven, working logic. The
 * tool boundary (`tools/db_schema.ts`) reshapes it into the tribunal's
 * `models[].relations` shape (§4.4.3) on the way out.
 *
 * @module lib/db/types
 */

/** Column definition in unified format across all schema sources. */
export interface DatabaseColumn {
  name: string;
  type: string;
  nullable: boolean;
  primary_key: boolean;
  references?: { table: string; column: string };
}

/** Database index definition. */
export interface DatabaseIndex {
  name: string;
  columns: string[];
  unique: boolean;
}

/** Database table definition in unified (parser-output) format. */
export interface DatabaseTable {
  name: string;
  columns: DatabaseColumn[];
  indexes: DatabaseIndex[];
}

/** Database relation (foreign key relationship) definition. */
export interface DatabaseRelation {
  from_table: string;
  from_column: string;
  to_table: string;
  to_column: string;
  type: 'one-to-one' | 'one-to-many' | 'many-to-many';
}

/** Supported schema source types. */
export type SchemaSource = 'prisma' | 'drizzle' | 'sql' | 'unknown';

/** Parser output: the unified (v1-shaped) schema extraction result. */
export interface DatabaseSchemaResult {
  source: SchemaSource;
  tables: DatabaseTable[];
  relations: DatabaseRelation[];
  /** Absolute resolved path to the parsed schema file (issue 1 fix #3). */
  raw_path: string;
}

// =============================================================================
// db_schema tool shape (§4.4.3, tribunal merge)
// =============================================================================

/** A field on a `db_schema` model, same content as DatabaseColumn, tribunal-named. */
export interface DbField {
  name: string;
  type: string;
  nullable: boolean;
  primary_key: boolean;
  references?: { table: string; column: string };
}

/** A relation embedded on its owning model (tribunal shape, not a flat global array). */
export interface DbModelRelation {
  from_column: string;
  to_model: string;
  to_column: string;
  type: 'one-to-one' | 'one-to-many' | 'many-to-many';
}

/** One model in the `db_schema` tribunal output shape. */
export interface DbModel {
  name: string;
  fields: DbField[];
  relations: DbModelRelation[];
  indexes: DatabaseIndex[];
}

/** A single detected Prisma call site (usage mode). */
export interface UsageCallSite {
  model: string;
  operation: string;
  /** File path relative to base_path. */
  file: string;
  /** Absolute resolved path (issue 1 fix #3). */
  resolved_path: string;
  line: number;
  in_loop: boolean;
  includes_relation: boolean;
}

/** Per-model call frequency (usage mode). */
export interface UsageFrequency {
  model: string;
  count: number;
}

/** Usage-mode result, present only when `usage: true` was requested. */
export interface DbSchemaUsage {
  call_sites: UsageCallSite[];
  frequency: UsageFrequency[];
}

/** The full `db_schema` tool result. */
export interface DbSchemaData {
  source: SchemaSource;
  /** Absolute resolved path to the schema file that was parsed (issue 1 fix #3). */
  resolved_path: string;
  models: DbModel[];
  usage?: DbSchemaUsage;
}
