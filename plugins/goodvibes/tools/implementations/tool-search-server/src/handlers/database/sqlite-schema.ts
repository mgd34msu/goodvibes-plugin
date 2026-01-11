/**
 * SQLite Schema Introspection
 *
 * Provides comprehensive schema introspection for SQLite databases:
 * - List tables and views
 * - Describe table structure (columns, types, constraints)
 * - Show indexes and foreign keys
 * - Analyze triggers
 */

import { withConnection, type SqliteConnectionOptions, type SqliteDatabase } from './sqlite-connection.js';

// =============================================================================
// Types
// =============================================================================

/**
 * SQLite column information
 */
export interface SqliteColumn {
  cid: number;
  name: string;
  type: string;
  notnull: boolean;
  dflt_value: string | null;
  pk: number; // 0 if not part of primary key, otherwise order in PK
}

/**
 * SQLite index information
 */
export interface SqliteIndex {
  seq: number;
  name: string;
  unique: boolean;
  origin: 'c' | 'u' | 'pk'; // c=CREATE INDEX, u=UNIQUE, pk=PRIMARY KEY
  partial: boolean;
  columns: string[];
}

/**
 * SQLite foreign key information
 */
export interface SqliteForeignKey {
  id: number;
  seq: number;
  table: string;
  from: string;
  to: string;
  on_update: string;
  on_delete: string;
  match: string;
}

/**
 * SQLite trigger information
 */
export interface SqliteTrigger {
  name: string;
  type: string;
  table: string;
  sql: string;
}

/**
 * Complete table schema information
 */
export interface SqliteTableSchema {
  name: string;
  type: 'table' | 'view';
  columns: SqliteColumn[];
  indexes: SqliteIndex[];
  foreign_keys: SqliteForeignKey[];
  triggers: SqliteTrigger[];
  sql: string; // CREATE statement
  row_count?: number;
}

/**
 * Database schema overview
 */
export interface SqliteDatabaseSchema {
  tables: SqliteTableSchema[];
  views: SqliteTableSchema[];
  version: string;
  file_size_bytes?: number;
  page_count?: number;
  page_size?: number;
}

// =============================================================================
// Schema Query Functions
// =============================================================================

/**
 * Get list of all tables in the database
 */
export async function listTables(options: SqliteConnectionOptions): Promise<string[]> {
  return withConnection(options, (db) => {
    const rows = db.prepare(`
      SELECT name
      FROM sqlite_master
      WHERE type = 'table'
        AND name NOT LIKE 'sqlite_%'
      ORDER BY name
    `).all() as Array<{ name: string }>;

    return rows.map(r => r.name);
  });
}

/**
 * Get list of all views in the database
 */
export async function listViews(options: SqliteConnectionOptions): Promise<string[]> {
  return withConnection(options, (db) => {
    const rows = db.prepare(`
      SELECT name
      FROM sqlite_master
      WHERE type = 'view'
      ORDER BY name
    `).all() as Array<{ name: string }>;

    return rows.map(r => r.name);
  });
}

/**
 * Get column information for a table
 */
export async function getTableColumns(
  options: SqliteConnectionOptions,
  tableName: string
): Promise<SqliteColumn[]> {
  return withConnection(options, (db) => {
    // Validate table name to prevent SQL injection
    const safeTableName = sanitizeIdentifier(tableName);

    const rows = db.prepare(`PRAGMA table_info("${safeTableName}")`).all() as Array<{
      cid: number;
      name: string;
      type: string;
      notnull: number;
      dflt_value: string | null;
      pk: number;
    }>;

    return rows.map(r => ({
      cid: r.cid,
      name: r.name,
      type: r.type,
      notnull: r.notnull === 1,
      dflt_value: r.dflt_value,
      pk: r.pk,
    }));
  });
}

/**
 * Get index information for a table
 */
export async function getTableIndexes(
  options: SqliteConnectionOptions,
  tableName: string
): Promise<SqliteIndex[]> {
  return withConnection(options, (db) => {
    const safeTableName = sanitizeIdentifier(tableName);

    // Get index list
    const indexList = db.prepare(`PRAGMA index_list("${safeTableName}")`).all() as Array<{
      seq: number;
      name: string;
      unique: number;
      origin: string;
      partial: number;
    }>;

    // Get columns for each index
    return indexList.map(idx => {
      const indexInfo = db.prepare(`PRAGMA index_info("${sanitizeIdentifier(idx.name)}")`).all() as Array<{
        seqno: number;
        cid: number;
        name: string;
      }>;

      return {
        seq: idx.seq,
        name: idx.name,
        unique: idx.unique === 1,
        origin: idx.origin as 'c' | 'u' | 'pk',
        partial: idx.partial === 1,
        columns: indexInfo.map(i => i.name),
      };
    });
  });
}

/**
 * Get foreign key information for a table
 */
export async function getTableForeignKeys(
  options: SqliteConnectionOptions,
  tableName: string
): Promise<SqliteForeignKey[]> {
  return withConnection(options, (db) => {
    const safeTableName = sanitizeIdentifier(tableName);

    const rows = db.prepare(`PRAGMA foreign_key_list("${safeTableName}")`).all() as Array<{
      id: number;
      seq: number;
      table: string;
      from: string;
      to: string;
      on_update: string;
      on_delete: string;
      match: string;
    }>;

    return rows.map(r => ({
      id: r.id,
      seq: r.seq,
      table: r.table,
      from: r.from,
      to: r.to,
      on_update: r.on_update,
      on_delete: r.on_delete,
      match: r.match,
    }));
  });
}

/**
 * Get triggers for a table
 */
export async function getTableTriggers(
  options: SqliteConnectionOptions,
  tableName: string
): Promise<SqliteTrigger[]> {
  return withConnection(options, (db) => {
    const safeTableName = sanitizeIdentifier(tableName);

    const rows = db.prepare(`
      SELECT name, type, tbl_name as table_name, sql
      FROM sqlite_master
      WHERE type = 'trigger'
        AND tbl_name = ?
      ORDER BY name
    `).all(safeTableName) as Array<{
      name: string;
      type: string;
      table_name: string;
      sql: string;
    }>;

    return rows.map(r => ({
      name: r.name,
      type: r.type,
      table: r.table_name,
      sql: r.sql || '',
    }));
  });
}

/**
 * Get the CREATE statement for a table or view
 */
export async function getCreateStatement(
  options: SqliteConnectionOptions,
  objectName: string
): Promise<string> {
  return withConnection(options, (db) => {
    const safeObjectName = sanitizeIdentifier(objectName);

    const row = db.prepare(`
      SELECT sql
      FROM sqlite_master
      WHERE name = ?
        AND type IN ('table', 'view')
    `).get(safeObjectName) as { sql: string } | undefined;

    return row?.sql || '';
  });
}

/**
 * Get approximate row count for a table
 */
export async function getRowCount(
  options: SqliteConnectionOptions,
  tableName: string
): Promise<number> {
  return withConnection(options, (db) => {
    const safeTableName = sanitizeIdentifier(tableName);

    // Use a fast approximation from sqlite_stat1 if available
    try {
      const stat = db.prepare(`
        SELECT stat FROM sqlite_stat1 WHERE tbl = ?
      `).get(safeTableName) as { stat: string } | undefined;

      if (stat) {
        const parts = stat.stat.split(' ');
        return parseInt(parts[0], 10) || 0;
      }
    } catch {
      // sqlite_stat1 might not exist
    }

    // Fall back to actual count
    const result = db.prepare(`SELECT COUNT(*) as count FROM "${safeTableName}"`).get() as { count: number };
    return result.count;
  });
}

/**
 * Get complete schema for a single table
 */
export async function getTableSchema(
  options: SqliteConnectionOptions,
  tableName: string
): Promise<SqliteTableSchema> {
  return withConnection(options, async (db) => {
    const safeTableName = sanitizeIdentifier(tableName);

    // Check if it's a table or view
    const master = db.prepare(`
      SELECT type, sql
      FROM sqlite_master
      WHERE name = ?
        AND type IN ('table', 'view')
    `).get(safeTableName) as { type: 'table' | 'view'; sql: string } | undefined;

    if (!master) {
      throw new Error(`Table or view '${tableName}' not found`);
    }

    const type = master.type;

    // Get columns
    const columns = db.prepare(`PRAGMA table_info("${safeTableName}")`).all() as Array<{
      cid: number;
      name: string;
      type: string;
      notnull: number;
      dflt_value: string | null;
      pk: number;
    }>;

    // Get indexes (only for tables)
    let indexes: SqliteIndex[] = [];
    if (type === 'table') {
      const indexList = db.prepare(`PRAGMA index_list("${safeTableName}")`).all() as Array<{
        seq: number;
        name: string;
        unique: number;
        origin: string;
        partial: number;
      }>;

      indexes = indexList.map(idx => {
        const indexInfo = db.prepare(`PRAGMA index_info("${sanitizeIdentifier(idx.name)}")`).all() as Array<{
          seqno: number;
          cid: number;
          name: string;
        }>;

        return {
          seq: idx.seq,
          name: idx.name,
          unique: idx.unique === 1,
          origin: idx.origin as 'c' | 'u' | 'pk',
          partial: idx.partial === 1,
          columns: indexInfo.map(i => i.name),
        };
      });
    }

    // Get foreign keys (only for tables)
    let foreign_keys: SqliteForeignKey[] = [];
    if (type === 'table') {
      const fkList = db.prepare(`PRAGMA foreign_key_list("${safeTableName}")`).all() as Array<{
        id: number;
        seq: number;
        table: string;
        from: string;
        to: string;
        on_update: string;
        on_delete: string;
        match: string;
      }>;

      foreign_keys = fkList.map(r => ({
        id: r.id,
        seq: r.seq,
        table: r.table,
        from: r.from,
        to: r.to,
        on_update: r.on_update,
        on_delete: r.on_delete,
        match: r.match,
      }));
    }

    // Get triggers
    const triggerRows = db.prepare(`
      SELECT name, type, tbl_name as table_name, sql
      FROM sqlite_master
      WHERE type = 'trigger'
        AND tbl_name = ?
      ORDER BY name
    `).all(safeTableName) as Array<{
      name: string;
      type: string;
      table_name: string;
      sql: string;
    }>;

    const triggers = triggerRows.map(r => ({
      name: r.name,
      type: r.type,
      table: r.table_name,
      sql: r.sql || '',
    }));

    // Get row count for tables
    let row_count: number | undefined;
    if (type === 'table') {
      const countResult = db.prepare(`SELECT COUNT(*) as count FROM "${safeTableName}"`).get() as { count: number };
      row_count = countResult.count;
    }

    return {
      name: tableName,
      type,
      columns: columns.map(c => ({
        cid: c.cid,
        name: c.name,
        type: c.type,
        notnull: c.notnull === 1,
        dflt_value: c.dflt_value,
        pk: c.pk,
      })),
      indexes,
      foreign_keys,
      triggers,
      sql: master.sql || '',
      row_count,
    };
  });
}

/**
 * Get complete database schema
 */
export async function getDatabaseSchema(
  options: SqliteConnectionOptions
): Promise<SqliteDatabaseSchema> {
  return withConnection(options, (db) => {
    // Get SQLite version
    const versionRow = db.prepare('SELECT sqlite_version() as version').get() as { version: string };

    // Get database stats
    const pageCountRow = db.pragma('page_count', true) as number;
    const pageSizeRow = db.pragma('page_size', true) as number;

    // Get all tables
    const tableRows = db.prepare(`
      SELECT name, type, sql
      FROM sqlite_master
      WHERE type = 'table'
        AND name NOT LIKE 'sqlite_%'
      ORDER BY name
    `).all() as Array<{ name: string; type: string; sql: string }>;

    // Get all views
    const viewRows = db.prepare(`
      SELECT name, type, sql
      FROM sqlite_master
      WHERE type = 'view'
      ORDER BY name
    `).all() as Array<{ name: string; type: string; sql: string }>;

    const tables: SqliteTableSchema[] = [];
    const views: SqliteTableSchema[] = [];

    // Process tables
    for (const tableRow of tableRows) {
      const schema = buildTableSchemaSync(db, tableRow.name, 'table', tableRow.sql);
      tables.push(schema);
    }

    // Process views
    for (const viewRow of viewRows) {
      const schema = buildTableSchemaSync(db, viewRow.name, 'view', viewRow.sql);
      views.push(schema);
    }

    return {
      tables,
      views,
      version: versionRow.version,
      page_count: pageCountRow,
      page_size: pageSizeRow,
      file_size_bytes: pageCountRow * pageSizeRow,
    };
  });
}

/**
 * Build table schema synchronously (internal helper)
 */
function buildTableSchemaSync(
  db: SqliteDatabase,
  name: string,
  type: 'table' | 'view',
  sql: string
): SqliteTableSchema {
  const safeName = sanitizeIdentifier(name);

  // Get columns
  const columns = db.prepare(`PRAGMA table_info("${safeName}")`).all() as Array<{
    cid: number;
    name: string;
    type: string;
    notnull: number;
    dflt_value: string | null;
    pk: number;
  }>;

  // Get indexes (only for tables)
  let indexes: SqliteIndex[] = [];
  if (type === 'table') {
    const indexList = db.prepare(`PRAGMA index_list("${safeName}")`).all() as Array<{
      seq: number;
      name: string;
      unique: number;
      origin: string;
      partial: number;
    }>;

    indexes = indexList.map(idx => {
      const indexInfo = db.prepare(`PRAGMA index_info("${sanitizeIdentifier(idx.name)}")`).all() as Array<{
        seqno: number;
        cid: number;
        name: string;
      }>;

      return {
        seq: idx.seq,
        name: idx.name,
        unique: idx.unique === 1,
        origin: idx.origin as 'c' | 'u' | 'pk',
        partial: idx.partial === 1,
        columns: indexInfo.map(i => i.name),
      };
    });
  }

  // Get foreign keys (only for tables)
  let foreign_keys: SqliteForeignKey[] = [];
  if (type === 'table') {
    const fkList = db.prepare(`PRAGMA foreign_key_list("${safeName}")`).all() as Array<{
      id: number;
      seq: number;
      table: string;
      from: string;
      to: string;
      on_update: string;
      on_delete: string;
      match: string;
    }>;

    foreign_keys = fkList;
  }

  // Get triggers
  const triggerRows = db.prepare(`
    SELECT name, type, tbl_name as table_name, sql
    FROM sqlite_master
    WHERE type = 'trigger'
      AND tbl_name = ?
    ORDER BY name
  `).all(name) as Array<{
    name: string;
    type: string;
    table_name: string;
    sql: string;
  }>;

  const triggers = triggerRows.map(r => ({
    name: r.name,
    type: r.type,
    table: r.table_name,
    sql: r.sql || '',
  }));

  // Get row count for tables
  let row_count: number | undefined;
  if (type === 'table') {
    try {
      const countResult = db.prepare(`SELECT COUNT(*) as count FROM "${safeName}"`).get() as { count: number };
      row_count = countResult.count;
    } catch {
      // Might fail for virtual tables
    }
  }

  return {
    name,
    type,
    columns: columns.map(c => ({
      cid: c.cid,
      name: c.name,
      type: c.type,
      notnull: c.notnull === 1,
      dflt_value: c.dflt_value,
      pk: c.pk,
    })),
    indexes,
    foreign_keys,
    triggers,
    sql: sql || '',
    row_count,
  };
}

// =============================================================================
// Helpers
// =============================================================================

/**
 * Sanitize an identifier to prevent SQL injection
 * Removes or escapes dangerous characters
 */
function sanitizeIdentifier(identifier: string): string {
  // Remove any characters that could break out of double-quoted identifiers
  return identifier.replace(/["\\]/g, '');
}
