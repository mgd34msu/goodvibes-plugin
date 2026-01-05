/**
 * Drizzle schema parser
 */

import * as fs from 'fs';
import * as path from 'path';

import { ToolResponse } from '../../types.js';
import { Column, Relation, Table } from './types.js';

/**
 * Parse Drizzle schema
 */
export function parseDrizzleSchema(projectPath: string, filterTables?: string[]): ToolResponse {
  // Look for drizzle schema files
  const schemaPaths = [
    path.join(projectPath, 'drizzle', 'schema.ts'),
    path.join(projectPath, 'src', 'db', 'schema.ts'),
    path.join(projectPath, 'src', 'schema.ts'),
    path.join(projectPath, 'db', 'schema.ts'),
  ];

  let schemaPath: string | null = null;
  for (const p of schemaPaths) {
    if (fs.existsSync(p)) {
      schemaPath = p;
      break;
    }
  }

  if (!schemaPath) {
    throw new Error('Drizzle schema not found. Checked: drizzle/schema.ts, src/db/schema.ts, src/schema.ts, db/schema.ts');
  }

  const content = fs.readFileSync(schemaPath, 'utf-8');
  const tables: Table[] = [];

  // Parse pgTable/mysqlTable/sqliteTable definitions
  const tableRegex = /export\s+const\s+(\w+)\s*=\s*(?:pgTable|mysqlTable|sqliteTable)\s*\(\s*['"](\w+)['"]\s*,\s*\{([^}]+)\}/g;
  let match;

  while ((match = tableRegex.exec(content)) !== null) {
    const [, varName, tableName, columnsBlock] = match;

    if (filterTables?.length && !filterTables.includes(tableName) && !filterTables.includes(varName)) continue;

    const columns: Column[] = [];
    const relations: Relation[] = [];

    // Parse column definitions
    const columnRegex = /(\w+)\s*:\s*(varchar|text|integer|serial|boolean|timestamp|json|uuid|bigint|real|doublePrecision|date|time|numeric)(?:\([^)]*\))?/g;
    let colMatch;

    while ((colMatch = columnRegex.exec(columnsBlock)) !== null) {
      const [fullMatch, colName, colType] = colMatch;
      columns.push({
        name: colName,
        type: colType,
        nullable: !fullMatch.includes('.notNull()'),
        primary: fullMatch.includes('.primaryKey()'),
        unique: fullMatch.includes('.unique()'),
        default: fullMatch.match(/\.default\(([^)]+)\)/)?.[1] || null,
      });
    }

    // Parse references for relations
    const refRegex = /\.references\(\s*\(\)\s*=>\s*(\w+)\.(\w+)/g;
    let refMatch;
    while ((refMatch = refRegex.exec(columnsBlock)) !== null) {
      relations.push({
        target: refMatch[1],
        targetColumn: refMatch[2],
        type: 'many-to-one',
      });
    }

    tables.push({
      name: tableName,
      variable: varName,
      columns,
      relations,
      indexes: [],
    });
  }

  // Also look for relations() definitions
  const relationsRegex = /relations\s*\(\s*(\w+)\s*,\s*\(\s*\{\s*(\w+)\s*\}\s*\)\s*=>\s*\(([^)]+)\)/g;
  while ((match = relationsRegex.exec(content)) !== null) {
    const [, tableName, , relBlock] = match;
    const table = tables.find(t => t.variable === tableName || t.name === tableName);
    if (table) {
      const oneMatches = relBlock.matchAll(/one\s*\(\s*(\w+)/g);
      for (const m of oneMatches) {
        table.relations.push({ target: m[1], targetColumn: 'id', type: 'many-to-one' });
      }
      const manyMatches = relBlock.matchAll(/many\s*\(\s*(\w+)/g);
      for (const m of manyMatches) {
        table.relations.push({ target: m[1], targetColumn: 'id', type: 'one-to-many' });
      }
    }
  }

  return {
    content: [{
      type: 'text',
      text: JSON.stringify({ source: 'drizzle', tables, raw_path: schemaPath }, null, 2),
    }],
  };
}
