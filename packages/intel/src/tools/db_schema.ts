/**
 * `db_schema` — database schema extraction + Prisma usage analysis.
 *
 * Ports project-engine `extensions/database/schema.ts` +
 * `core/database/parsers/{prisma-schema,drizzle-schema,sql-schema}.ts`
 * (§4.1). Usage mode MERGES `extensions/database/prisma.ts` +
 * `core/database/prisma-utils.ts` (tribunal merge, shape in §4.4.3),
 * rewired onto the shared compiler host (see `lib/db/prisma-usage.ts`).
 *
 * v2 wrappers per the port row:
 *  - `base_path` contract (issue 1): the schema file's absolute path is
 *    echoed as `resolved_path`; call sites echo their own `resolved_path`.
 *  - `core/proc` budget: usage-mode scanning runs under `withBudget`.
 *  - `core/envelope`: honest token accounting; `output.max_tokens` trims
 *    `usage.call_sites` (the largest field) with `truncated`/`effective_caps`.
 *  - Output reshaped to the tribunal's `models[].relations` shape (§4.4.3),
 *    not v1's flat `tables`+`relations` arrays.
 *
 * @module tools/db_schema
 */

import * as fs from 'node:fs/promises';

import type { CallToolResult, Tool } from '@modelcontextprotocol/sdk/types.js';
import type { ToolDefinition } from './types.js';
import {
  successEnvelope,
  errorEnvelope,
  toCallToolResult,
  renderEnvelope,
  estimatePayloadTokens,
  startTimer,
  type Envelope,
} from '@goodvibes/core/envelope';
import { resolveBaseDir } from '@goodvibes/core/fsx';
import { loadConfig } from '@goodvibes/core/config';
import { withBudget, type BudgetSignal } from '@goodvibes/core/proc';

import { discoverSchema, toModels } from '../lib/db/schema-discovery.js';
import { scanPrismaUsage } from '../lib/db/prisma-usage.js';
import type { DbSchemaData, SchemaSource } from '../lib/db/types.js';

interface DbSchemaArgs {
  base_path?: string;
  source?: SchemaSource | 'auto';
  usage?: boolean;
  output?: { max_tokens?: number };
}

const definition: Tool = {
  name: 'db_schema',
  description:
    'Extract a project database schema (Prisma, Drizzle, or raw SQL — auto-detected by ' +
    'default) into a unified models/fields/relations shape. Optional usage mode (usage: true) ' +
    'statically maps Prisma client call sites (model, operation, file, line) and flags calls ' +
    'inside loops as N+1 risk (in_loop), plus per-model call frequency. Static analysis; no ' +
    'database connection is made.',
  inputSchema: {
    type: 'object',
    properties: {
      base_path: {
        type: 'string',
        description: 'Absolute project root. Schema files are located under it.',
      },
      source: {
        type: 'string',
        enum: ['auto', 'prisma', 'drizzle', 'sql'],
        description: "Schema source; 'auto' tries prisma, then drizzle, then sql (default).",
      },
      usage: {
        type: 'boolean',
        description: 'Also run Prisma call-site / N+1 usage analysis over the whole project (default false).',
      },
      output: {
        type: 'object',
        properties: {
          max_tokens: {
            type: 'number',
            description: 'Cap the rendered response; usage.call_sites trims first when it bites.',
          },
        },
      },
    },
  },
};

/** Trim `data.usage.call_sites` from the end until the rendered envelope fits `maxTokens`. */
function capToTokens(env: Envelope<DbSchemaData>, maxTokens?: number): Envelope<DbSchemaData> {
  if (!maxTokens || maxTokens <= 0 || !env.data) {return env;}
  if (estimatePayloadTokens(renderEnvelope(env)) <= maxTokens) {return env;}

  const data = env.data;
  const trim = (): Envelope<DbSchemaData> => ({
    ...env,
    data,
    meta: {
      ...env.meta,
      truncated: true,
      effective_caps: { ...(env.meta.effective_caps ?? {}), max_tokens: maxTokens },
    },
  });

  if (data.usage) {
    while (data.usage.call_sites.length > 0 && estimatePayloadTokens(renderEnvelope(trim())) > maxTokens) {
      data.usage.call_sites.pop();
    }
  }
  while (data.models.length > 0 && estimatePayloadTokens(renderEnvelope(trim())) > maxTokens) {
    data.models.pop();
  }
  return trim();
}

/**
 * The `db_schema` handler.
 * @param rawArgs - MCP tool arguments (validated here)
 */
export async function handler(rawArgs: unknown): Promise<CallToolResult> {
  const elapsed = startTimer();
  const args = (rawArgs ?? {}) as DbSchemaArgs;
  const cfg = loadConfig();

  const baseDir = resolveBaseDir(args.base_path);
  const source = args.source ?? 'auto';
  const wantUsage = args.usage === true;

  try {
    const stat = await fs.stat(baseDir).catch(() => null);
    if (!stat || !stat.isDirectory()) {
      return toCallToolResult(errorEnvelope(`base_path is not a directory: ${baseDir}`));
    }

    const schema = await discoverSchema(baseDir, source);
    if (!schema) {
      return toCallToolResult(
        errorEnvelope(
          `No database schema found under ${baseDir}. Checked for Prisma (prisma/schema.prisma), ` +
            'Drizzle (drizzle/schema.ts and common variants), and SQL (schema.sql / migrations/*.sql).',
        ),
      );
    }

    let budgetExceeded = false;
    let usage: DbSchemaData['usage'];
    if (wantUsage) {
      const outcome = await withBudget(cfg.budgets.analyzer_ms, (signal: BudgetSignal) => scanPrismaUsage(baseDir, signal));
      usage = outcome.value;
      budgetExceeded = outcome.budget_exceeded;
    }

    const data: DbSchemaData = {
      source: schema.source,
      resolved_path: schema.raw_path,
      models: toModels(schema),
      ...(usage && { usage }),
    };

    const env = successEnvelope<DbSchemaData>(data, {
      execution_ms: elapsed(),
      ...(budgetExceeded ? { budget_exceeded: true } : {}),
    });

    const maxTokens = args.output?.max_tokens ?? cfg.max_tokens_default;
    return toCallToolResult(capToTokens(env, maxTokens));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return toCallToolResult(errorEnvelope(`Failed to extract database schema: ${message}`));
  }
}

/** Registration entry consumed by `src/index.ts`. */
export const dbSchemaTool: ToolDefinition = { definition, handler };
