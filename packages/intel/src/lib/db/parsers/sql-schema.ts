/**
 * SQL schema parser (raw `CREATE TABLE` statements).
 *
 * Ported near-verbatim from v1 project-engine
 * `core/database/parsers/sql-schema.ts`.
 *
 * @module lib/db/parsers/sql-schema
 */

import type { DatabaseColumn, DatabaseIndex, DatabaseRelation, DatabaseSchemaResult, DatabaseTable } from '../types.js';

/**
 * Parse raw SQL schema content into the unified `DatabaseSchemaResult`
 * format. Supports `CREATE TABLE [IF NOT EXISTS]`, column-level
 * `PRIMARY KEY`/`NOT NULL`/`UNIQUE`/`REFERENCES`, table-level `FOREIGN KEY`
 * constraints, and `CREATE [UNIQUE] INDEX` statements (MySQL backtick
 * quoting supported).
 *
 * @param content - the SQL schema file content
 * @param resolvedPath - absolute resolved path (issue 1 fix #3)
 */
export function parseSqlSchema(content: string, resolvedPath: string): DatabaseSchemaResult {
  const tables: DatabaseTable[] = [];
  const relations: DatabaseRelation[] = [];

  const tableRegex = /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?[`"']?(\w+)[`"']?\s*\(([^;]+)\)/gi;

  let match: RegExpExecArray | null;
  while ((match = tableRegex.exec(content)) !== null) {
    const [, tableName, columnsBlock] = match;

    const columns: DatabaseColumn[] = [];
    const indexes: DatabaseIndex[] = [];

    const lines: string[] = [];
    let currentLine = '';
    let parenDepth = 0;
    for (let i = 0; i < columnsBlock.length; i++) {
      const char = columnsBlock[i];
      if (char === '(') {parenDepth++;}
      else if (char === ')') {parenDepth--;}

      if (char === ',' && parenDepth === 0) {
        if (currentLine.trim()) {lines.push(currentLine.trim());}
        currentLine = '';
      } else {
        currentLine += char;
      }
    }
    if (currentLine.trim()) {lines.push(currentLine.trim());}

    for (const line of lines) {
      const normalizedLine = line.replace(/\s+/g, ' ').trim();

      if (/^(CONSTRAINT|PRIMARY|UNIQUE|CHECK|FOREIGN|INDEX|KEY)\b/i.test(normalizedLine)) {
        const fkMatch = normalizedLine.match(
          /(?:CONSTRAINT\s+[`"']?(\w+)[`"']?\s+)?FOREIGN\s+KEY\s*\(\s*[`"']?(\w+)[`"']?\s*\)\s*REFERENCES\s+[`"']?(\w+)[`"']?\s*\(\s*[`"']?(\w+)[`"']?\s*\)/i,
        );
        if (fkMatch) {
          const fromCol = fkMatch[2];
          const toTable = fkMatch[3];
          const toCol = fkMatch[4];
          const col = columns.find((c) => c.name === fromCol);
          if (col) {col.references = { table: toTable, column: toCol };}
          relations.push({ from_table: tableName, from_column: fromCol, to_table: toTable, to_column: toCol, type: 'one-to-many' });
        }

        const uniqueMatch = normalizedLine.match(
          /(?:CONSTRAINT\s+[`"']?(\w+)[`"']?\s+)?UNIQUE\s*(?:KEY|INDEX)?\s*(?:[`"']?(\w+)[`"']?\s*)?\(\s*([^)]+)\s*\)/i,
        );
        if (uniqueMatch) {
          const constraintName = uniqueMatch[1] || uniqueMatch[2];
          const idxCols = uniqueMatch[3].split(',').map((c) => c.trim().replace(/[`"']/g, ''));
          indexes.push({ name: constraintName || `${tableName}_${idxCols.join('_')}_unique`, columns: idxCols, unique: true });
        }

        const idxMatch = normalizedLine.match(/(?:INDEX|KEY)\s*(?:[`"']?(\w+)[`"']?\s*)?\(\s*([^)]+)\s*\)/i);
        if (idxMatch && !/UNIQUE/i.test(normalizedLine) && !/PRIMARY/i.test(normalizedLine)) {
          const name = idxMatch[1];
          const idxCols = idxMatch[2].split(',').map((c) => c.trim().replace(/[`"']/g, ''));
          indexes.push({ name: name || `${tableName}_${idxCols.join('_')}_idx`, columns: idxCols, unique: false });
        }
        continue;
      }

      const colMatch = normalizedLine.match(/^[`"']?(\w+)[`"']?\s+(\w+)(?:\s*\([^)]*\))?(.*)$/i);
      if (colMatch) {
        const [, colName, colType, rest] = colMatch;
        const isPrimary = /PRIMARY\s+KEY/i.test(rest);
        const isNullable = !/NOT\s+NULL/i.test(rest);
        const isUnique = /UNIQUE/i.test(rest);

        let references: DatabaseColumn['references'] | undefined;
        const refMatch = rest.match(/REFERENCES\s+[`"']?(\w+)[`"']?\s*\(\s*[`"']?(\w+)[`"']?\s*\)/i);
        if (refMatch) {
          references = { table: refMatch[1], column: refMatch[2] };
          relations.push({ from_table: tableName, from_column: colName, to_table: refMatch[1], to_column: refMatch[2], type: 'one-to-many' });
        }

        columns.push({ name: colName, type: colType.toUpperCase(), nullable: isNullable, primary_key: isPrimary, references });

        if (isUnique) {
          indexes.push({ name: `${tableName}_${colName}_unique`, columns: [colName], unique: true });
        }
      }
    }

    tables.push({ name: tableName, columns, indexes });
  }

  const createIndexRegex = /CREATE\s+(UNIQUE\s+)?INDEX\s+(?:IF\s+NOT\s+EXISTS\s+)?[`"']?(\w+)[`"']?\s+ON\s+[`"']?(\w+)[`"']?\s*\(([^)]+)\)/gi;
  while ((match = createIndexRegex.exec(content)) !== null) {
    const [, isUnique, idxName, tblName, colsStr] = match;
    const idxCols = colsStr.split(',').map((c) => c.trim().replace(/[`"']/g, ''));
    const table = tables.find((t) => t.name === tblName);
    if (table) {table.indexes.push({ name: idxName, columns: idxCols, unique: !!isUnique });}
  }

  return { source: 'sql', tables, relations, raw_path: resolvedPath };
}
