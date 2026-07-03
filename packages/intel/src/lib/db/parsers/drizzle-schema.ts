/**
 * Drizzle ORM schema parser.
 *
 * Ported near-verbatim from v1 project-engine
 * `core/database/parsers/drizzle-schema.ts`.
 *
 * @module lib/db/parsers/drizzle-schema
 */

import type { DatabaseColumn, DatabaseIndex, DatabaseRelation, DatabaseSchemaResult, DatabaseTable } from '../types.js';

/**
 * Parse a Drizzle ORM schema file's content into the unified
 * `DatabaseSchemaResult` format. Supports pgTable/mysqlTable/sqliteTable
 * definitions with `relations()`.
 *
 * @param content - the Drizzle schema TypeScript file content
 * @param resolvedPath - absolute resolved path (issue 1 fix #3)
 */
export function parseDrizzleSchema(content: string, resolvedPath: string): DatabaseSchemaResult {
  const tables: DatabaseTable[] = [];
  const relations: DatabaseRelation[] = [];

  const tableRegex =
    /export\s+const\s+(\w+)\s*=\s*(?:pgTable|mysqlTable|sqliteTable)\s*\(\s*['"](\w+)['"]\s*,\s*\{([^}]+)\}(?:\s*,\s*\(([^)]*)\)\s*=>\s*\(?\{?([^}]*)\}?\)?)?/g;

  let match: RegExpExecArray | null;
  while ((match = tableRegex.exec(content)) !== null) {
    const [, , tableName, columnsBlock, , indexBlock] = match;

    const columns: DatabaseColumn[] = [];
    const indexes: DatabaseIndex[] = [];

    const columnRegex =
      /(\w+)\s*:\s*(varchar|text|integer|serial|bigserial|smallint|boolean|timestamp|timestamptz|json|jsonb|uuid|bigint|real|doublePrecision|date|time|numeric|decimal|char)(?:\s*\([^)]*\))?([^,\n]*)/g;

    let colMatch: RegExpExecArray | null;
    while ((colMatch = columnRegex.exec(columnsBlock)) !== null) {
      const [, colName, colType, rest] = colMatch;
      const isPrimary = rest.includes('.primaryKey()');
      const isNullable = !rest.includes('.notNull()');
      const isUnique = rest.includes('.unique()');

      let references: DatabaseColumn['references'] | undefined;
      const refMatch = rest.match(/\.references\s*\(\s*\(\)\s*=>\s*(\w+)\.(\w+)/);
      if (refMatch) {
        references = { table: refMatch[1], column: refMatch[2] };
        relations.push({ from_table: tableName, from_column: colName, to_table: refMatch[1], to_column: refMatch[2], type: 'one-to-many' });
      }

      columns.push({ name: colName, type: colType, nullable: isNullable, primary_key: isPrimary, references });

      if (isUnique) {
        indexes.push({ name: `${tableName}_${colName}_unique`, columns: [colName], unique: true });
      }
    }

    if (indexBlock) {
      const uniqueIndexRegex = /uniqueIndex\s*\(['"]([\w_]+)['"]\)\.on\s*\(([^)]+)\)/g;
      let idxMatch: RegExpExecArray | null;
      while ((idxMatch = uniqueIndexRegex.exec(indexBlock)) !== null) {
        const idxCols = idxMatch[2]
          .split(',')
          .map((c) => c.trim().match(/table\.(\w+)/)?.[1])
          .filter((c): c is string => c !== undefined);
        indexes.push({ name: idxMatch[1], columns: idxCols, unique: true });
      }

      const indexRegex = /(?<!unique)index\s*\(['"]([\w_]+)['"]\)\.on\s*\(([^)]+)\)/g;
      while ((idxMatch = indexRegex.exec(indexBlock)) !== null) {
        const idxCols = idxMatch[2]
          .split(',')
          .map((c) => c.trim().match(/table\.(\w+)/)?.[1])
          .filter((c): c is string => c !== undefined);
        indexes.push({ name: idxMatch[1], columns: idxCols, unique: false });
      }
    }

    tables.push({ name: tableName, columns, indexes });
  }

  const relationsRegex = /relations\s*\(\s*(\w+)\s*,\s*\(\s*\{\s*(\w+)\s*\}\s*\)\s*=>\s*\(?\[?([^\])}]+)/g;
  while ((match = relationsRegex.exec(content)) !== null) {
    const [, tableName, , relBlock] = match;

    const oneRegex = /one\s*\(\s*(\w+)\s*(?:,\s*\{[^}]*fields:\s*\[([^\]]+)\][^}]*references:\s*\[([^\]]+)\][^}]*\})?/g;
    let oneMatch: RegExpExecArray | null;
    while ((oneMatch = oneRegex.exec(relBlock)) !== null) {
      const targetTable = oneMatch[1];
      const fromCol = oneMatch[2]?.trim() || 'id';
      const toCol = oneMatch[3]?.trim() || 'id';
      const exists = relations.some((r) => r.from_table === tableName && r.to_table === targetTable && r.from_column === fromCol);
      if (!exists) {relations.push({ from_table: tableName, from_column: fromCol, to_table: targetTable, to_column: toCol, type: 'one-to-one' });}
    }

    const manyRegex = /many\s*\(\s*(\w+)\s*(?:,\s*\{[^}]*\})?/g;
    let manyMatch: RegExpExecArray | null;
    while ((manyMatch = manyRegex.exec(relBlock)) !== null) {
      const targetTable = manyMatch[1];
      const exists = relations.some((r) => r.from_table === tableName && r.to_table === targetTable);
      if (!exists) {relations.push({ from_table: tableName, from_column: 'id', to_table: targetTable, to_column: `${tableName}Id`, type: 'one-to-many' });}
    }
  }

  return { source: 'drizzle', tables, relations, raw_path: resolvedPath };
}
