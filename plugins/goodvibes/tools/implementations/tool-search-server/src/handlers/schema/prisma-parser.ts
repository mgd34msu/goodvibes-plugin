/**
 * Prisma schema parser
 */

import * as fs from 'fs';
import * as path from 'path';

import { ToolResponse } from '../../types.js';
import { Column, Relation, Index, Table } from './types.js';

/**
 * Parse Prisma schema
 */
export function parsePrismaSchema(projectPath: string, filterTables?: string[]): ToolResponse {
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
