/**
 * Prisma schema parser
 *
 * Parses Prisma schema files (schema.prisma) into the unified
 * DatabaseSchemaResult format.
 *
 * @module core/database/parsers/prisma-schema
 */

import * as node_fs from 'node:fs';
import type { DatabaseSchemaResult, DatabaseTable, DatabaseColumn, DatabaseRelation, DatabaseIndex } from '../types.js';

/**
 * Parse a Prisma schema file into the unified DatabaseSchemaResult format.
 *
 * Extracts models, fields, relations, and indexes from Prisma schema syntax.
 * Supports:
 * - Scalar fields with `@id`, `@unique`, `@relation`
 * - Composite primary keys via `@@id`
 * - Composite indexes via `@@index` and `@@unique`
 * - Relation fields with explicit and implicit foreign keys
 *
 * @param schemaPath - Absolute path to the schema.prisma file
 * @returns Unified schema result with tables, relations, and source info
 */
export function parsePrismaForUnifiedSchema(schemaPath: string): DatabaseSchemaResult {
  const content = node_fs.readFileSync(schemaPath, 'utf-8');
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

      const fieldMatch = /^(\w+)\s+(\w+)(.*)$/.exec(trimmed);
      if (fieldMatch) {
        const [, fieldName, fieldType, rawRest] = fieldMatch;
        const rest = rawRest.trim();
        const isArray = rest.startsWith('[]');
        let cleanRest = rest;
        if (isArray) cleanRest = cleanRest.slice(2).trim();
        // Note: Prisma does not support nullable arrays (Type[]? is invalid syntax),
        // so we only check for nullable on non-array fields.
        const nullable = isArray ? false : rest.startsWith('?');
        if (nullable) cleanRest = cleanRest.slice(1).trim();

        const isRelation = /^[A-Z]/.test(fieldType) && !prismaScalars.includes(fieldType);

        if (isRelation) {
          const relationMatch = cleanRest.match(/@relation\s*\([^)]*fields:\s*\[([^\]]+)\][^)]*references:\s*\[([^\]]+)\]/);
          if (relationMatch) {
            const fromColumns = relationMatch[1].split(',').map((c: string) => c.trim());
            const toColumns = relationMatch[2].split(',').map((c: string) => c.trim());
            for (let i = 0; i < fromColumns.length; i++) {
              relations.push({
                from_table: modelName,
                from_column: fromColumns[i],
                to_table: fieldType,
                to_column: toColumns[i] || 'id',
                type: isArray ? 'one-to-many' : 'one-to-one',
              });
            }
          } else {
            relations.push({
              from_table: modelName,
              from_column: isArray ? 'id' : `${fieldName}Id`,
              to_table: fieldType,
              to_column: isArray ? `${modelName.toLowerCase()}Id` : 'id',
              type: isArray ? 'one-to-many' : 'one-to-one',
            });
          }
        } else {
          const isPrimary = cleanRest.includes('@id');
          const isUnique = cleanRest.includes('@unique');

          let references: DatabaseColumn['references'] | undefined;
          const refMatch = cleanRest.match(/@relation\s*\([^)]*references:\s*\[([^\]]+)\]/);
          if (refMatch) {
            const referencedColumn = refMatch[1].trim();
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
            nullable,
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

    // @@index and @@unique
    const indexRegex = /@@(index|unique)\(\s*\[([^\]]+)\](?:\s*,\s*name:\s*"([^"]+)")?\s*\)/g;
    let idxMatch: RegExpExecArray | null;
    while ((idxMatch = indexRegex.exec(modelBody)) !== null) {
      const isUnique = idxMatch[1] === 'unique';
      const idxColumns = idxMatch[2].split(',').map((c: string) => c.trim());
      const idxName = idxMatch[3] || `${modelName}_${idxColumns.join('_')}_${isUnique ? 'unique' : 'idx'}`;
      indexes.push({ name: idxName, columns: idxColumns, unique: isUnique });
    }

    // @@id for composite primary keys
    const compositeIdMatch = modelBody.match(/@@id\(\s*\[([^\]]+)\]\s*\)/);
    if (compositeIdMatch) {
      const pkColumns = compositeIdMatch[1].split(',').map((c: string) => c.trim());
      for (const pkCol of pkColumns) {
        const col = columns.find(c => c.name === pkCol);
        if (col) col.primary_key = true;
      }
    }

    tables.push({ name: modelName, columns, indexes });
  }

  return { source: 'prisma', tables, relations, raw_path: schemaPath };
}
