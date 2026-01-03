/**
 * Schema parsing handlers
 */

import * as fs from 'fs';
import * as path from 'path';
import { ToolResponse } from '../types.js';
import { PROJECT_ROOT } from '../config.js';

export interface GetSchemaArgs {
  source: string;
  path?: string;
  tables?: string[];
}

interface Column {
  name: string;
  type: string;
  nullable: boolean;
  primary: boolean;
  unique: boolean;
  default?: string | null;
  auto_increment?: boolean;
}

interface Relation {
  field?: string;
  column?: string;
  target: string;
  targetColumn?: string;
  type: string;
}

interface Index {
  type: string;
  columns: string[];
}

interface Table {
  name: string;
  entity?: string;
  variable?: string;
  columns: Column[];
  relations: Relation[];
  indexes: Index[];
  file?: string;
}

/**
 * Parse Prisma schema
 */
function parsePrismaSchema(projectPath: string, filterTables?: string[]): ToolResponse {
  const schemaPath = path.join(projectPath, 'prisma', 'schema.prisma');
  if (!fs.existsSync(schemaPath)) {
    throw new Error('Prisma schema not found at prisma/schema.prisma');
  }

  const content = fs.readFileSync(schemaPath, 'utf-8');
  const modelRegex = /model\s+(\w+)\s*\{([^}]+)\}/g;
  const tables: Table[] = [];
  let match;

  while ((match = modelRegex.exec(content)) !== null) {
    const modelName = match[1];
    const modelBody = match[2];

    if (filterTables?.length && !filterTables.includes(modelName)) continue;

    const columns: Column[] = [];
    const relations: Relation[] = [];

    for (const line of modelBody.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('//') || trimmed.startsWith('@@')) continue;

      const fieldMatch = /^(\w+)\s+(\w+)(\??)(\[\])?/.exec(trimmed);
      if (fieldMatch) {
        const [, fieldName, fieldType, nullable, isArray] = fieldMatch;

        // Check if it's a relation (type starts with uppercase and isn't a Prisma scalar)
        const prismaScalars = ['String', 'Int', 'Float', 'Boolean', 'DateTime', 'Json', 'Bytes', 'BigInt', 'Decimal'];
        const isRelation = /^[A-Z]/.test(fieldType) && !prismaScalars.includes(fieldType);

        if (isRelation) {
          relations.push({
            field: fieldName,
            target: fieldType,
            type: isArray ? 'one-to-many' : 'many-to-one',
          });
        } else {
          columns.push({
            name: fieldName,
            type: fieldType,
            nullable: nullable === '?',
            primary: trimmed.includes('@id'),
            unique: trimmed.includes('@unique'),
            default: trimmed.match(/@default\(([^)]+)\)/)?.[1] || null,
          });
        }
      }
    }

    // Parse indexes from @@index and @@unique
    const indexMatches = modelBody.matchAll(/@@(index|unique)\(\[([^\]]+)\]\)/g);
    const indexes: Index[] = [];
    for (const idxMatch of indexMatches) {
      indexes.push({
        type: idxMatch[1],
        columns: idxMatch[2].split(',').map(c => c.trim()),
      });
    }

    tables.push({ name: modelName, columns, relations, indexes });
  }

  return {
    content: [{
      type: 'text',
      text: JSON.stringify({ source: 'prisma', tables, raw_path: 'prisma/schema.prisma' }, null, 2),
    }],
  };
}

/**
 * Parse Drizzle schema
 */
function parseDrizzleSchema(projectPath: string, filterTables?: string[]): ToolResponse {
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

/**
 * Parse TypeORM schema
 */
function parseTypeORMSchema(projectPath: string, filterTables?: string[]): ToolResponse {
  // Look for TypeORM entity files
  const entityPaths = [
    path.join(projectPath, 'src', 'entities'),
    path.join(projectPath, 'src', 'entity'),
    path.join(projectPath, 'entities'),
    path.join(projectPath, 'entity'),
  ];

  let entityDir: string | null = null;
  for (const p of entityPaths) {
    if (fs.existsSync(p)) {
      entityDir = p;
      break;
    }
  }

  if (!entityDir) {
    throw new Error('TypeORM entities not found. Checked: src/entities, src/entity, entities, entity');
  }

  const tables: Table[] = [];
  const entityFiles = fs.readdirSync(entityDir).filter(f => f.endsWith('.ts') || f.endsWith('.js'));

  for (const file of entityFiles) {
    const content = fs.readFileSync(path.join(entityDir, file), 'utf-8');

    // Parse @Entity decorator
    const entityMatch = content.match(/@Entity\s*\(\s*['"]?(\w+)?['"]?\s*\)/);
    if (!entityMatch) continue;

    // Parse class name
    const classMatch = content.match(/class\s+(\w+)/);
    if (!classMatch) continue;

    const tableName = entityMatch[1] || classMatch[1].toLowerCase();
    const className = classMatch[1];

    if (filterTables?.length && !filterTables.includes(tableName) && !filterTables.includes(className)) continue;

    const columns: Column[] = [];
    const relations: Relation[] = [];

    // Parse @Column decorators
    const columnRegex = /@(PrimaryGeneratedColumn|PrimaryColumn|Column)\s*\(([^)]*)\)\s*\n\s*(\w+)\s*[?!]?\s*:\s*(\w+)/g;
    let colMatch;

    while ((colMatch = columnRegex.exec(content)) !== null) {
      const [, decorator, options, colName, colType] = colMatch;
      columns.push({
        name: colName,
        type: colType,
        nullable: options.includes('nullable: true'),
        primary: decorator.includes('Primary'),
        unique: options.includes('unique: true'),
      });
    }

    // Parse relation decorators
    const relRegex = /@(OneToOne|OneToMany|ManyToOne|ManyToMany)\s*\(\s*\(\)\s*=>\s*(\w+)/g;
    let relMatch;

    while ((relMatch = relRegex.exec(content)) !== null) {
      const [, relType, target] = relMatch;
      relations.push({
        target,
        type: relType.replace(/([A-Z])/g, '-$1').toLowerCase().slice(1),
      });
    }

    tables.push({
      name: tableName,
      entity: className,
      columns,
      relations,
      indexes: [],
      file,
    });
  }

  return {
    content: [{
      type: 'text',
      text: JSON.stringify({ source: 'typeorm', tables, entity_dir: entityDir }, null, 2),
    }],
  };
}

/**
 * Parse SQL schema
 */
function parseSQLSchema(projectPath: string, filterTables?: string[]): ToolResponse {
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

/**
 * Handle get_schema tool call
 */
export function handleGetSchema(args: GetSchemaArgs): ToolResponse {
  const projectPath = path.resolve(PROJECT_ROOT, args.path || '.');

  switch (args.source) {
    case 'prisma':
      return parsePrismaSchema(projectPath, args.tables);
    case 'drizzle':
      return parseDrizzleSchema(projectPath, args.tables);
    case 'typeorm':
      return parseTypeORMSchema(projectPath, args.tables);
    case 'sql':
      return parseSQLSchema(projectPath, args.tables);
    default:
      throw new Error(`Unknown schema source: ${args.source}. Supported: prisma, drizzle, typeorm, sql`);
  }
}
