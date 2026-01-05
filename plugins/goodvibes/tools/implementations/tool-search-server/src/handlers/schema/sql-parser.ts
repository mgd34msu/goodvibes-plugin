/**
 * SQL schema parser
 */

import * as fs from 'fs';
import * as path from 'path';

import { ToolResponse } from '../../types.js';
import { Column, Relation, Index, Table } from './types.js';

/**
 * Parse SQL schema
 */
export function parseSQLSchema(projectPath: string, filterTables?: string[]): ToolResponse {
  // Look for SQL schema files
  const sqlPaths = [
    path.join(projectPath, 'schema.sql'),
    path.join(projectPath, 'db', 'schema.sql'),
    path.join(projectPath, 'sql', 'schema.sql'),
    path.join(projectPath, 'database', 'schema.sql'),
    path.join(projectPath, 'migrations', 'schema.sql'),
  ];

  let sqlPath: string | null = null;
  for (const p of sqlPaths) {
    if (fs.existsSync(p)) {
      sqlPath = p;
      break;
    }
  }

  if (!sqlPath) {
    // Try to find any .sql file
    const findSql = (dir: string): string | null => {
      if (!fs.existsSync(dir)) return null;
      const files = fs.readdirSync(dir);
      for (const f of files) {
        if (f.endsWith('.sql') && !f.includes('migration')) {
          return path.join(dir, f);
        }
      }
      return null;
    };

    sqlPath = findSql(projectPath) || findSql(path.join(projectPath, 'db')) || findSql(path.join(projectPath, 'sql'));
  }

  if (!sqlPath) {
    throw new Error('SQL schema not found. Checked: schema.sql, db/schema.sql, sql/schema.sql, database/schema.sql');
  }

  const content = fs.readFileSync(sqlPath, 'utf-8');
  const tables: Table[] = [];

  // Parse CREATE TABLE statements
  const tableRegex = /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?[`"']?(\w+)[`"']?\s*\(([^;]+)\)/gi;
  let match;

  while ((match = tableRegex.exec(content)) !== null) {
    const [, tableName, columnsBlock] = match;

    if (filterTables?.length && !filterTables.includes(tableName)) continue;

    const columns: Column[] = [];
    const relations: Relation[] = [];
    const indexes: Index[] = [];

    // Parse columns
    const lines = columnsBlock.split(',').map(l => l.trim());
    for (const line of lines) {
      // Skip constraints
      if (/^(PRIMARY|FOREIGN|UNIQUE|CHECK|CONSTRAINT|INDEX|KEY)/i.test(line)) {
        // Parse foreign key for relations
        const fkMatch = line.match(/FOREIGN\s+KEY\s*\([`"']?(\w+)[`"']?\)\s*REFERENCES\s+[`"']?(\w+)[`"']?/i);
        if (fkMatch) {
          relations.push({
            column: fkMatch[1],
            target: fkMatch[2],
            type: 'many-to-one',
          });
        }
        // Parse unique/index
        const uniqueMatch = line.match(/UNIQUE\s*\(([^)]+)\)/i);
        if (uniqueMatch) {
          indexes.push({
            type: 'unique',
            columns: uniqueMatch[1].split(',').map(c => c.trim().replace(/[`"']/g, '')),
          });
        }
        continue;
      }

      // Parse column definition
      const colMatch = line.match(/^[`"']?(\w+)[`"']?\s+(\w+)(?:\([^)]+\))?(.*)$/i);
      if (colMatch) {
        const [, colName, colType, rest] = colMatch;
        columns.push({
          name: colName,
          type: colType.toUpperCase(),
          nullable: !/NOT\s+NULL/i.test(rest),
          primary: /PRIMARY\s+KEY/i.test(rest),
          unique: /UNIQUE/i.test(rest),
          default: rest.match(/DEFAULT\s+([^\s,]+)/i)?.[1] || null,
          auto_increment: /AUTO_INCREMENT|SERIAL|IDENTITY/i.test(rest),
        });
      }
    }

    tables.push({ name: tableName, columns, relations, indexes });
  }

  return {
    content: [{
      type: 'text',
      text: JSON.stringify({ source: 'sql', tables, raw_path: sqlPath }, null, 2),
    }],
  };
}
