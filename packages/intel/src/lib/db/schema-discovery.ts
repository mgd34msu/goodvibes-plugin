/**
 * `db_schema` source auto-detection + tribunal-shape conversion.
 *
 * Discovery priority ported from v1 project-engine `extensions/database/
 * schema.ts`: Prisma → Drizzle → SQL. `toModels` reshapes the parsers'
 * proven flat `tables`+`relations` output into the tribunal's
 * `models[].relations` shape (§4.4.3) at the tool boundary.
 *
 * @module lib/db/schema-discovery
 */

import * as fs from 'node:fs/promises';
import * as path from 'node:path';

import { parsePrismaSchema } from './parsers/prisma-schema.js';
import { parseDrizzleSchema } from './parsers/drizzle-schema.js';
import { parseSqlSchema } from './parsers/sql-schema.js';
import type { DatabaseSchemaResult, DbModel, SchemaSource } from './types.js';

async function fileExists(p: string): Promise<boolean> {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

/**
 * Locate and parse the project's database schema.
 * @param projectPath - absolute project directory to search
 * @param source - explicit source, or 'auto' to try prisma, then drizzle, then sql
 * @returns the parsed schema, or null when no schema file was found
 */
export async function discoverSchema(projectPath: string, source: SchemaSource | 'auto'): Promise<DatabaseSchemaResult | null> {
  if (source === 'prisma' || source === 'auto') {
    const prismaPath = path.join(projectPath, 'prisma', 'schema.prisma');
    if (await fileExists(prismaPath)) {
      const content = await fs.readFile(prismaPath, 'utf-8');
      return parsePrismaSchema(content, prismaPath);
    }
    if (source === 'prisma') return null;
  }

  if (source === 'drizzle' || source === 'auto') {
    const drizzleCandidates = [
      path.join(projectPath, 'drizzle', 'schema.ts'),
      path.join(projectPath, 'src', 'db', 'schema.ts'),
      path.join(projectPath, 'src', 'schema.ts'),
      path.join(projectPath, 'db', 'schema.ts'),
      path.join(projectPath, 'src', 'lib', 'db', 'schema.ts'),
    ];
    for (const p of drizzleCandidates) {
      if (await fileExists(p)) {
        const content = await fs.readFile(p, 'utf-8');
        return parseDrizzleSchema(content, p);
      }
    }

    const globDirs = [path.join(projectPath, 'drizzle'), path.join(projectPath, 'src', 'db'), path.join(projectPath, 'db')];
    for (const dir of globDirs) {
      if (!(await fileExists(dir))) continue;
      const entries = await fs.readdir(dir).catch(() => [] as string[]);
      const found = entries.filter((f) => f.endsWith('.schema.ts')).sort()[0];
      if (found) {
        const p = path.join(dir, found);
        const content = await fs.readFile(p, 'utf-8');
        return parseDrizzleSchema(content, p);
      }
    }
    if (source === 'drizzle') return null;
  }

  if (source === 'sql' || source === 'auto') {
    const sqlCandidates = [
      path.join(projectPath, 'schema.sql'),
      path.join(projectPath, 'db', 'schema.sql'),
      path.join(projectPath, 'sql', 'schema.sql'),
      path.join(projectPath, 'database', 'schema.sql'),
    ];
    for (const p of sqlCandidates) {
      if (await fileExists(p)) {
        const content = await fs.readFile(p, 'utf-8');
        return parseSqlSchema(content, p);
      }
    }

    const migrationsDir = path.join(projectPath, 'migrations');
    if (await fileExists(migrationsDir)) {
      const entries = (await fs.readdir(migrationsDir).catch(() => [] as string[]))
        .filter((f) => f.endsWith('.sql'))
        .sort()
        .reverse();
      if (entries.length > 0) {
        const target = entries.find((f) => f.includes('schema') || f.includes('init')) || entries[0];
        const p = path.join(migrationsDir, target);
        const content = await fs.readFile(p, 'utf-8');
        return parseSqlSchema(content, p);
      }
    }
  }

  return null;
}

/** Reshape the parser's flat tables+relations into the tribunal's models[].relations shape. */
export function toModels(result: DatabaseSchemaResult): DbModel[] {
  return result.tables.map((table) => ({
    name: table.name,
    fields: table.columns.map((c) => ({ ...c })),
    relations: result.relations
      .filter((r) => r.from_table === table.name)
      .map((r) => ({ from_column: r.from_column, to_model: r.to_table, to_column: r.to_column, type: r.type })),
    indexes: table.indexes,
  }));
}
