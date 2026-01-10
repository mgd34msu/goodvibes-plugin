/**
 * Unified database schema extraction handler
 *
 * Auto-detects and parses database schema from:
 * - Prisma schema files
 * - Drizzle schema files
 * - SQL migration/schema files
 */

import * as fs from 'fs';
import * as path from 'path';

import { ToolResponse } from '../../types.js';
import { PROJECT_ROOT } from '../../config.js';

/**
 * Column definition in unified format
 */
export interface DatabaseColumn {
  name: string;
  type: string;
  nullable: boolean;
  primary_key: boolean;
  references?: {
    table: string;
    column: string;
  };
}

/**
 * Index definition
 */
export interface DatabaseIndex {
  name: string;
  columns: string[];
  unique: boolean;
}

/**
 * Table definition in unified format
 */
export interface DatabaseTable {
  name: string;
  columns: DatabaseColumn[];
  indexes: DatabaseIndex[];
}

/**
 * Relation definition
 */
export interface DatabaseRelation {
  from_table: string;
  from_column: string;
  to_table: string;
  to_column: string;
  type: 'one-to-one' | 'one-to-many' | 'many-to-many';
}

/**
 * Schema source types
 */
export type SchemaSource = 'prisma' | 'drizzle' | 'sql' | 'unknown';

/**
 * Result of schema extraction
 */
export interface DatabaseSchemaResult {
  source: SchemaSource;
  tables: DatabaseTable[];
  relations: DatabaseRelation[];
  raw_path: string;
}

/**
 * Arguments for get_database_schema handler
 */
export interface GetDatabaseSchemaArgs {
  path?: string;
}

/**
 * Handle get_database_schema tool call
 */
export function handleGetDatabaseSchema(args: GetDatabaseSchemaArgs): ToolResponse {
  const projectPath = path.resolve(PROJECT_ROOT, args.path || '.');

  // Try to detect schema source in order of priority
  const prismaPath = path.join(projectPath, 'prisma', 'schema.prisma');
  if (fs.existsSync(prismaPath)) {
    const result = parsePrismaForUnifiedSchema(prismaPath);
    return formatResponse(result);
  }

  // Check for Drizzle schema
  const drizzlePaths = [
    path.join(projectPath, 'drizzle', 'schema.ts'),
    path.join(projectPath, 'src', 'db', 'schema.ts'),
    path.join(projectPath, 'src', 'schema.ts'),
    path.join(projectPath, 'db', 'schema.ts'),
    path.join(projectPath, 'src', 'lib', 'db', 'schema.ts'),
  ];

  for (const drizzlePath of drizzlePaths) {
    if (fs.existsSync(drizzlePath)) {
      const result = parseDrizzleForUnifiedSchema(drizzlePath);
      return formatResponse(result);
    }
  }

  // Check for Drizzle schema files with pattern *.schema.ts
  const schemaGlobPaths = [
    path.join(projectPath, 'drizzle'),
    path.join(projectPath, 'src', 'db'),
    path.join(projectPath, 'db'),
  ];

  for (const dir of schemaGlobPaths) {
    if (fs.existsSync(dir)) {
      const files = fs.readdirSync(dir).filter(f => f.endsWith('.schema.ts'));
      if (files.length > 0) {
        const result = parseDrizzleForUnifiedSchema(path.join(dir, files[0]));
        return formatResponse(result);
      }
    }
  }

  // Check for SQL schema files
  const sqlPaths = [
    path.join(projectPath, 'schema.sql'),
    path.join(projectPath, 'db', 'schema.sql'),
    path.join(projectPath, 'sql', 'schema.sql'),
    path.join(projectPath, 'database', 'schema.sql'),
  ];

  for (const sqlPath of sqlPaths) {
    if (fs.existsSync(sqlPath)) {
      const result = parseSQLForUnifiedSchema(sqlPath);
      return formatResponse(result);
    }
  }

  // Check migrations folder for SQL files
  const migrationsDir = path.join(projectPath, 'migrations');
  if (fs.existsSync(migrationsDir)) {
    const sqlFiles = fs.readdirSync(migrationsDir)
      .filter(f => f.endsWith('.sql'))
      .sort()
      .reverse(); // Most recent first

    if (sqlFiles.length > 0) {
      // Try to find a combined schema or use the latest migration
      const schemaFile = sqlFiles.find(f => f.includes('schema') || f.includes('init'));
      const targetFile = schemaFile || sqlFiles[0];
      const result = parseSQLForUnifiedSchema(path.join(migrationsDir, targetFile));
      return formatResponse(result);
    }
  }

  // No schema found
  return {
    content: [{
      type: 'text',
      text: JSON.stringify({
        source: 'unknown',
        tables: [],
        relations: [],
        raw_path: '',
        error: 'No database schema found. Checked for Prisma, Drizzle, and SQL schema files.',
      }, null, 2),
    }],
  };
}

/**
 * Format the result as a ToolResponse
 */
function formatResponse(result: DatabaseSchemaResult): ToolResponse {
  return {
    content: [{
      type: 'text',
      text: JSON.stringify(result, null, 2),
    }],
  };
}

/**
 * Parse Prisma schema into unified format
 */
function parsePrismaForUnifiedSchema(schemaPath: string): DatabaseSchemaResult {
  const content = fs.readFileSync(schemaPath, 'utf-8');
  const tables: DatabaseTable[] = [];
  const relations: DatabaseRelation[] = [];

  const modelRegex = /model\s+(\w+)\s*\{([^}]+)\}/g;
  const prismaScalars = ['String', 'Int', 'Float', 'Boolean', 'DateTime', 'Json', 'Bytes', 'BigInt', 'Decimal'];

  let match: RegExpExecArray | null;
  while ((match = modelRegex.exec(content)) !== null) {
    const modelName = match[1];
    const modelBody = match[2];

    const columns: DatabaseColumn[] = [];
    const indexes: DatabaseIndex[] = [];

    for (const line of modelBody.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('//') || trimmed.startsWith('@@')) continue;

      const fieldMatch = /^(\w+)\s+(\w+)(\??)(\[\])?(.*)$/.exec(trimmed);
      if (fieldMatch) {
        const [, fieldName, fieldType, nullable, isArray, rest] = fieldMatch;

        const isRelation = /^[A-Z]/.test(fieldType) && !prismaScalars.includes(fieldType);

        if (isRelation) {
          // Parse @relation directive for foreign key info
          const relationMatch = rest.match(/@relation\s*\([^)]*fields:\s*\[([^\]]+)\][^)]*references:\s*\[([^\]]+)\]/);
          if (relationMatch) {
            const fromColumns = relationMatch[1].split(',').map(c => c.trim());
            const toColumns = relationMatch[2].split(',').map(c => c.trim());

            for (let i = 0; i < fromColumns.length; i++) {
              relations.push({
                from_table: modelName,
                from_column: fromColumns[i],
                to_table: fieldType,
                to_column: toColumns[i] || 'id',
                type: isArray ? 'one-to-many' : 'one-to-one',
              });
            }
          } else if (!isArray) {
            // Implicit relation without @relation directive
            relations.push({
              from_table: modelName,
              from_column: `${fieldName}Id`,
              to_table: fieldType,
              to_column: 'id',
              type: 'one-to-one',
            });
          }
        } else {
          const isPrimary = rest.includes('@id');
          const isUnique = rest.includes('@unique');

          // Check for @relation references
          let references: DatabaseColumn['references'] | undefined;
          const refMatch = rest.match(/@relation\s*\([^)]*references:\s*\[([^\]]+)\]/);
          if (refMatch) {
            // This is a foreign key column
            const referencedColumn = refMatch[1].trim();
            // Find the relation field to get the target table
            const relationField = modelBody.match(new RegExp(`(\\w+)\\s+\\w+.*@relation.*fields:\\s*\\[${fieldName}\\]`));
            if (relationField) {
              const targetModel = modelBody.match(new RegExp(`${relationField[1]}\\s+(\\w+)`))?.[1];
              if (targetModel) {
                references = { table: targetModel, column: referencedColumn };
              }
            }
          }

          columns.push({
            name: fieldName,
            type: fieldType,
            nullable: nullable === '?',
            primary_key: isPrimary,
            references,
          });

          if (isUnique) {
            indexes.push({
              name: `${modelName}_${fieldName}_unique`,
              columns: [fieldName],
              unique: true,
            });
          }
        }
      }
    }

    // Parse @@index and @@unique
    const indexRegex = /@@(index|unique)\(\s*\[([^\]]+)\](?:\s*,\s*name:\s*"([^"]+)")?\s*\)/g;
    let idxMatch: RegExpExecArray | null;
    while ((idxMatch = indexRegex.exec(modelBody)) !== null) {
      const isUnique = idxMatch[1] === 'unique';
      const idxColumns = idxMatch[2].split(',').map(c => c.trim());
      const idxName = idxMatch[3] || `${modelName}_${idxColumns.join('_')}_${isUnique ? 'unique' : 'idx'}`;

      indexes.push({
        name: idxName,
        columns: idxColumns,
        unique: isUnique,
      });
    }

    // Parse @@id for composite primary keys
    const compositeIdMatch = modelBody.match(/@@id\(\s*\[([^\]]+)\]\s*\)/);
    if (compositeIdMatch) {
      const pkColumns = compositeIdMatch[1].split(',').map(c => c.trim());
      for (const pkCol of pkColumns) {
        const col = columns.find(c => c.name === pkCol);
        if (col) {
          col.primary_key = true;
        }
      }
    }

    tables.push({ name: modelName, columns, indexes });
  }

  return {
    source: 'prisma',
    tables,
    relations,
    raw_path: schemaPath,
  };
}

/**
 * Parse Drizzle schema into unified format
 */
function parseDrizzleForUnifiedSchema(schemaPath: string): DatabaseSchemaResult {
  const content = fs.readFileSync(schemaPath, 'utf-8');
  const tables: DatabaseTable[] = [];
  const relations: DatabaseRelation[] = [];

  // Parse pgTable/mysqlTable/sqliteTable definitions
  const tableRegex = /export\s+const\s+(\w+)\s*=\s*(?:pgTable|mysqlTable|sqliteTable)\s*\(\s*['"](\w+)['"]\s*,\s*\{([^}]+)\}(?:\s*,\s*\(([^)]*)\)\s*=>\s*\(?\{?([^}]*)\}?\)?)?/g;

  let match: RegExpExecArray | null;
  while ((match = tableRegex.exec(content)) !== null) {
    const [, varName, tableName, columnsBlock, , indexBlock] = match;

    const columns: DatabaseColumn[] = [];
    const indexes: DatabaseIndex[] = [];

    // Parse column definitions
    const columnRegex = /(\w+)\s*:\s*(varchar|text|integer|serial|bigserial|smallint|boolean|timestamp|timestamptz|json|jsonb|uuid|bigint|real|doublePrecision|date|time|numeric|decimal|char)(?:\s*\([^)]*\))?([^,\n]*)/g;

    let colMatch: RegExpExecArray | null;
    while ((colMatch = columnRegex.exec(columnsBlock)) !== null) {
      const [, colName, colType, rest] = colMatch;
      const isPrimary = rest.includes('.primaryKey()');
      const isNullable = !rest.includes('.notNull()');
      const isUnique = rest.includes('.unique()');

      // Check for references
      let references: DatabaseColumn['references'] | undefined;
      const refMatch = rest.match(/\.references\s*\(\s*\(\)\s*=>\s*(\w+)\.(\w+)/);
      if (refMatch) {
        references = { table: refMatch[1], column: refMatch[2] };
        relations.push({
          from_table: tableName,
          from_column: colName,
          to_table: refMatch[1],
          to_column: refMatch[2],
          type: 'one-to-many',
        });
      }

      columns.push({
        name: colName,
        type: colType,
        nullable: isNullable,
        primary_key: isPrimary,
        references,
      });

      if (isUnique) {
        indexes.push({
          name: `${tableName}_${colName}_unique`,
          columns: [colName],
          unique: true,
        });
      }
    }

    // Parse indexes from table options
    if (indexBlock) {
      const uniqueIndexRegex = /uniqueIndex\s*\(['"]([\w_]+)['"]\)\.on\s*\(([^)]+)\)/g;
      let idxMatch: RegExpExecArray | null;
      while ((idxMatch = uniqueIndexRegex.exec(indexBlock)) !== null) {
        const idxCols = idxMatch[2]
          .split(',')
          .map(c => c.trim().match(/table\.(\w+)/)?.[1])
          .filter((c): c is string => c !== undefined);

        indexes.push({
          name: idxMatch[1],
          columns: idxCols,
          unique: true,
        });
      }

      const indexRegex = /(?<!unique)index\s*\(['"]([\w_]+)['"]\)\.on\s*\(([^)]+)\)/g;
      while ((idxMatch = indexRegex.exec(indexBlock)) !== null) {
        const idxCols = idxMatch[2]
          .split(',')
          .map(c => c.trim().match(/table\.(\w+)/)?.[1])
          .filter((c): c is string => c !== undefined);

        indexes.push({
          name: idxMatch[1],
          columns: idxCols,
          unique: false,
        });
      }
    }

    tables.push({ name: tableName, columns, indexes });
  }

  // Parse relations() definitions
  const relationsRegex = /relations\s*\(\s*(\w+)\s*,\s*\(\s*\{\s*(\w+)\s*\}\s*\)\s*=>\s*\(?\[?([^\])}]+)/g;
  while ((match = relationsRegex.exec(content)) !== null) {
    const [, tableName, , relBlock] = match;

    // Parse one() relations
    const oneRegex = /one\s*\(\s*(\w+)\s*(?:,\s*\{[^}]*fields:\s*\[([^\]]+)\][^}]*references:\s*\[([^\]]+)\][^}]*\})?/g;
    let oneMatch: RegExpExecArray | null;
    while ((oneMatch = oneRegex.exec(relBlock)) !== null) {
      const targetTable = oneMatch[1];
      const fromCol = oneMatch[2]?.trim() || 'id';
      const toCol = oneMatch[3]?.trim() || 'id';

      // Avoid duplicates
      const exists = relations.some(r =>
        r.from_table === tableName &&
        r.to_table === targetTable &&
        r.from_column === fromCol
      );

      if (!exists) {
        relations.push({
          from_table: tableName,
          from_column: fromCol,
          to_table: targetTable,
          to_column: toCol,
          type: 'one-to-one',
        });
      }
    }

    // Parse many() relations
    const manyRegex = /many\s*\(\s*(\w+)\s*(?:,\s*\{[^}]*\})?/g;
    let manyMatch: RegExpExecArray | null;
    while ((manyMatch = manyRegex.exec(relBlock)) !== null) {
      const targetTable = manyMatch[1];

      const exists = relations.some(r =>
        r.from_table === tableName &&
        r.to_table === targetTable
      );

      if (!exists) {
        relations.push({
          from_table: tableName,
          from_column: 'id',
          to_table: targetTable,
          to_column: `${tableName}Id`,
          type: 'one-to-many',
        });
      }
    }
  }

  return {
    source: 'drizzle',
    tables,
    relations,
    raw_path: schemaPath,
  };
}

/**
 * Parse SQL schema into unified format
 */
function parseSQLForUnifiedSchema(schemaPath: string): DatabaseSchemaResult {
  const content = fs.readFileSync(schemaPath, 'utf-8');
  const tables: DatabaseTable[] = [];
  const relations: DatabaseRelation[] = [];

  // Parse CREATE TABLE statements
  const tableRegex = /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?[`"']?(\w+)[`"']?\s*\(([^;]+)\)/gi;

  let match: RegExpExecArray | null;
  while ((match = tableRegex.exec(content)) !== null) {
    const [, tableName, columnsBlock] = match;

    const columns: DatabaseColumn[] = [];
    const indexes: DatabaseIndex[] = [];

    // Parse columns and constraints
    const lines = columnsBlock.split(',').map(l => l.trim());

    for (const line of lines) {
      // Skip table-level constraints
      if (/^(PRIMARY|UNIQUE|CHECK|CONSTRAINT|INDEX|KEY)\s/i.test(line)) {
        // Parse FOREIGN KEY constraint
        const fkMatch = line.match(/FOREIGN\s+KEY\s*\([`"']?(\w+)[`"']?\)\s*REFERENCES\s+[`"']?(\w+)[`"']?\s*\([`"']?(\w+)[`"']?\)/i);
        if (fkMatch) {
          const fromCol = fkMatch[1];
          const toTable = fkMatch[2];
          const toCol = fkMatch[3];

          // Update column with reference
          const col = columns.find(c => c.name === fromCol);
          if (col) {
            col.references = { table: toTable, column: toCol };
          }

          relations.push({
            from_table: tableName,
            from_column: fromCol,
            to_table: toTable,
            to_column: toCol,
            type: 'one-to-many',
          });
        }

        // Parse UNIQUE constraint
        const uniqueMatch = line.match(/UNIQUE\s*(?:KEY\s*)?(?:[`"']?\w+[`"']?\s*)?\(([^)]+)\)/i);
        if (uniqueMatch) {
          const idxCols = uniqueMatch[1].split(',').map(c => c.trim().replace(/[`"']/g, ''));
          indexes.push({
            name: `${tableName}_${idxCols.join('_')}_unique`,
            columns: idxCols,
            unique: true,
          });
        }

        // Parse INDEX/KEY
        const idxMatch = line.match(/(?:INDEX|KEY)\s*(?:[`"']?(\w+)[`"']?\s*)?\(([^)]+)\)/i);
        if (idxMatch && !line.toUpperCase().includes('PRIMARY') && !line.toUpperCase().includes('UNIQUE')) {
          const idxCols = idxMatch[2].split(',').map(c => c.trim().replace(/[`"']/g, ''));
          indexes.push({
            name: idxMatch[1] || `${tableName}_${idxCols.join('_')}_idx`,
            columns: idxCols,
            unique: false,
          });
        }

        continue;
      }

      // Parse column definition
      const colMatch = line.match(/^[`"']?(\w+)[`"']?\s+(\w+)(?:\s*\([^)]*\))?(.*)$/i);
      if (colMatch) {
        const [, colName, colType, rest] = colMatch;
        const isPrimary = /PRIMARY\s+KEY/i.test(rest);
        const isNullable = !/NOT\s+NULL/i.test(rest);
        const isUnique = /UNIQUE/i.test(rest);

        // Parse inline REFERENCES
        let references: DatabaseColumn['references'] | undefined;
        const refMatch = rest.match(/REFERENCES\s+[`"']?(\w+)[`"']?\s*\([`"']?(\w+)[`"']?\)/i);
        if (refMatch) {
          references = { table: refMatch[1], column: refMatch[2] };
          relations.push({
            from_table: tableName,
            from_column: colName,
            to_table: refMatch[1],
            to_column: refMatch[2],
            type: 'one-to-many',
          });
        }

        columns.push({
          name: colName,
          type: colType.toUpperCase(),
          nullable: isNullable,
          primary_key: isPrimary,
          references,
        });

        if (isUnique) {
          indexes.push({
            name: `${tableName}_${colName}_unique`,
            columns: [colName],
            unique: true,
          });
        }
      }
    }

    tables.push({ name: tableName, columns, indexes });
  }

  // Parse CREATE INDEX statements
  const createIndexRegex = /CREATE\s+(UNIQUE\s+)?INDEX\s+(?:IF\s+NOT\s+EXISTS\s+)?[`"']?(\w+)[`"']?\s+ON\s+[`"']?(\w+)[`"']?\s*\(([^)]+)\)/gi;
  while ((match = createIndexRegex.exec(content)) !== null) {
    const [, isUnique, idxName, tableName, colsStr] = match;
    const idxCols = colsStr.split(',').map(c => c.trim().replace(/[`"']/g, ''));

    const table = tables.find(t => t.name === tableName);
    if (table) {
      table.indexes.push({
        name: idxName,
        columns: idxCols,
        unique: !!isUnique,
      });
    }
  }

  return {
    source: 'sql',
    tables,
    relations,
    raw_path: schemaPath,
  };
}
