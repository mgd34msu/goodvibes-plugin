/**
 * Database schema extension
 *
 * High-level handler for the get_database_schema MCP tool.
 * Auto-detects and parses the project's database schema from
 * Prisma, Drizzle, or SQL files.
 *
 * @module extensions/database/schema
 */

import * as node_fs from 'node:fs';
import * as node_path from 'node:path';
import type { McpResponse } from '../../shared/types.js';
import { ok } from '../../shared/response.js';
import { getProjectRoot } from '../../shared/config.js';
import type { DatabaseSchemaArgs } from '../../core/database/types.js';
import {
  parsePrismaForUnifiedSchema,
  parseDrizzleForUnifiedSchema,
  parseSQLForUnifiedSchema,
} from '../../core/database/index.js';

/**
 * Extract and return the project's database schema in unified format.
 *
 * Auto-detects schema source in priority order:
 * 1. Prisma (prisma/schema.prisma)
 * 2. Drizzle (drizzle/schema.ts, src/db/schema.ts, etc.)
 * 3. SQL (schema.sql, db/schema.sql, migrations/*.sql)
 *
 * @param args - The get_database_schema tool arguments
 * @returns MCP response with JSON schema including tables, relations, and source info
 *
 * @example
 * await getDatabaseSchema({ path: 'my-project' })
 * // Returns unified schema from auto-detected source
 */
export function getDatabaseSchema(args: DatabaseSchemaArgs): McpResponse {
  const projectRoot = getProjectRoot();
  const projectPath = node_path.resolve(projectRoot, args.path || '.');

  // 1. Prisma
  const prismaPath = node_path.join(projectPath, 'prisma', 'schema.prisma');
  if (node_fs.existsSync(prismaPath)) {
    const result = parsePrismaForUnifiedSchema(prismaPath);
    return ok(result);
  }

  // 2. Drizzle - common paths
  const drizzlePaths = [
    node_path.join(projectPath, 'drizzle', 'schema.ts'),
    node_path.join(projectPath, 'src', 'db', 'schema.ts'),
    node_path.join(projectPath, 'src', 'schema.ts'),
    node_path.join(projectPath, 'db', 'schema.ts'),
    node_path.join(projectPath, 'src', 'lib', 'db', 'schema.ts'),
  ];

  for (const drizzlePath of drizzlePaths) {
    if (node_fs.existsSync(drizzlePath)) {
      const result = parseDrizzleForUnifiedSchema(drizzlePath);
      return ok(result);
    }
  }

  // 2b. Drizzle - *.schema.ts glob patterns
  const schemaGlobDirs = [
    node_path.join(projectPath, 'drizzle'),
    node_path.join(projectPath, 'src', 'db'),
    node_path.join(projectPath, 'db'),
  ];

  for (const dir of schemaGlobDirs) {
    if (node_fs.existsSync(dir)) {
      const files = node_fs.readdirSync(dir).filter(f => f.endsWith('.schema.ts'));
      if (files.length > 0) {
        const result = parseDrizzleForUnifiedSchema(node_path.join(dir, files[0]));
        return ok(result);
      }
    }
  }

  // 3. SQL schema files
  const sqlPaths = [
    node_path.join(projectPath, 'schema.sql'),
    node_path.join(projectPath, 'db', 'schema.sql'),
    node_path.join(projectPath, 'sql', 'schema.sql'),
    node_path.join(projectPath, 'database', 'schema.sql'),
  ];

  for (const sqlPath of sqlPaths) {
    if (node_fs.existsSync(sqlPath)) {
      const result = parseSQLForUnifiedSchema(sqlPath);
      return ok(result);
    }
  }

  // 3b. SQL migration files
  const migrationsDir = node_path.join(projectPath, 'migrations');
  if (node_fs.existsSync(migrationsDir)) {
    const sqlFiles = node_fs.readdirSync(migrationsDir)
      .filter(f => f.endsWith('.sql'))
      .sort()
      .reverse();

    if (sqlFiles.length > 0) {
      const schemaFile = sqlFiles.find(f => f.includes('schema') || f.includes('init'));
      const targetFile = schemaFile || sqlFiles[0];
      const result = parseSQLForUnifiedSchema(node_path.join(migrationsDir, targetFile));
      return ok(result);
    }
  }

  // No schema found
  return ok({
    source: 'unknown',
    tables: [],
    relations: [],
    raw_path: '',
    error: 'No database schema found. Checked for Prisma, Drizzle, and SQL schema files.',
  });
}
