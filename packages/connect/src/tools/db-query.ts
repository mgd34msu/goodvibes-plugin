/**
 * `db_query` — SQL execution under the connect trust boundary (§4.3 db_query row).
 *
 * Ported from v1 project-engine `extensions/database/query.ts`, moved onto
 * connect's trust model:
 *  - registered-connection-only: in restricted mode a query runs only against a
 *    connection registered via the `service` tool; a bare `database_url` is a
 *    write-your-own-destination and is allowed only in open mode (human-only);
 *  - read-only by default: write statements are blocked unless the caller passes
 *    `write: true` AND the target permits writes (a registered connection's
 *    `allow_writes`, or open mode for a bare url);
 *  - the praised v1 behavior is kept: drivers load from the target project with
 *    honest install hints; SELECTs get an auto-LIMIT.
 */

import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import {
  successEnvelope,
  errorEnvelope,
  toCallToolResult,
  startTimer,
  estimatePayloadTokens,
  type Envelope,
} from '@goodvibes/core/envelope';
import { loadConfig } from '@goodvibes/core/config';
import { withBudget } from '@goodvibes/core/proc';
import { getConnection } from '../fetch/service-registry.js';
import { parseConnectionUrl } from '../db/url-parser.js';
import { isWriteOperation, hasLimitClause, addLimitClause } from '../db/query-analysis.js';
import { formatQueryResult } from '../db/formatters.js';
import { enhanceDatabaseError } from '../db/errors.js';
import { executePostgres, executeMysql, executeSqlite } from '../db/executors/index.js';
import type { DatabaseConnectionInfo, ExecutionResult, ColumnInfo } from '../db/types.js';
import type { TrustMode } from '../trust.js';

/** Input to `db_query`. */
export interface DbQueryInput {
  /** Registered connection name (required in restricted mode). */
  connection?: string;
  /** Bare connection URL — allowed only in open mode. */
  database_url?: string;
  /** The SQL to run. */
  query: string;
  /** Parameters for `?`/`$n` placeholders. */
  params?: unknown[];
  /** Max rows for auto-LIMIT on SELECT (default 100). */
  limit?: number;
  /** Output format. */
  format?: 'json' | 'table';
  /** Include an EXPLAIN. */
  explain?: boolean;
  /** Explicit opt-in to run a write statement (default false = read-only). */
  write?: boolean;
  output?: { max_tokens?: number };
}

/** The tool descriptor (schema deferred by the client). */
export const dbQueryTool = {
  name: 'db_query',
  description:
    'Run a SQL query under the connect trust boundary. Restricted mode requires a ' +
    'connection registered via the service tool; a bare database_url is open-mode ' +
    'only. Read-only by default — writes require write:true AND a target that permits ' +
    'them (a connection allow_writes opt-in, or open mode). Drivers load from the ' +
    'target project.',
  inputSchema: {
    type: 'object',
    properties: {
      connection: { type: 'string', description: 'Registered connection name.' },
      database_url: { type: 'string', description: 'Bare connection URL (open mode only).' },
      query: { type: 'string' },
      params: { type: 'array' },
      limit: { type: 'number', description: 'Auto-LIMIT for SELECT (default 100).' },
      format: { type: 'string', enum: ['json', 'table'] },
      explain: { type: 'boolean' },
      write: { type: 'boolean', description: 'Opt-in to run a write statement.' },
      output: { type: 'object', properties: { max_tokens: { type: 'number' } } },
    },
    required: ['query'],
  },
} as const;

/** Dispatch to the right executor by database type. */
async function executeQuery(
  connectionInfo: DatabaseConnectionInfo,
  sql: string,
  params: unknown[],
  readonly: boolean,
): Promise<ExecutionResult> {
  switch (connectionInfo.type) {
    case 'postgresql':
      return executePostgres(connectionInfo, sql, params);
    case 'mysql':
      return executeMysql(connectionInfo, sql, params);
    case 'sqlite':
      return executeSqlite(connectionInfo, sql, params, readonly);
    default:
      throw new Error(
        `Unsupported database type: ${connectionInfo.type}. Supported: postgresql, mysql, sqlite`,
      );
  }
}

/** Resolve the effective connection URL + write permission under the trust model. */
function resolveTarget(
  input: Partial<DbQueryInput>,
  mode: TrustMode,
): { url: string; allowWrites: boolean } | { error: string } {
  if (input.connection) {
    const conn = getConnection(input.connection);
    if (!conn) {
      return { error: `Connection "${input.connection}" is not registered. Register it via the service tool.` };
    }
    const url = conn.url_env ? process.env[conn.url_env] : conn.url;
    if (!url) {
      return {
        error: conn.url_env
          ? `Connection "${input.connection}" reads its URL from env var ${conn.url_env}, which is not set.`
          : `Connection "${input.connection}" has no url.`,
      };
    }
    return { url, allowWrites: conn.allow_writes === true };
  }

  if (input.database_url) {
    if (mode !== 'open') {
      return {
        error:
          'A bare database_url is only permitted in open mode (human-only). Register the ' +
          'connection via the service tool, or open the trust mode out-of-band.',
      };
    }
    return { url: input.database_url, allowWrites: true };
  }

  return { error: 'db_query requires a registered `connection` name or (in open mode) a `database_url`.' };
}

/** Trim rows until the rendered result fits the token budget. */
function capRows(
  data: { rows: unknown[]; columns: ColumnInfo[]; [k: string]: unknown },
  maxTokens: number,
): boolean {
  const render = (): number => estimatePayloadTokens(JSON.stringify(data));
  if (render() <= maxTokens) {return false;}
  let trimmed = false;
  while (data.rows.length > 0 && render() > maxTokens) {
    // Drop a chunk from the tail proportional to the overage (bounded by 1 row).
    const drop = Math.max(1, Math.floor(data.rows.length * 0.1));
    data.rows.splice(data.rows.length - drop, drop);
    trimmed = true;
  }
  return trimmed;
}

/** Execute `db_query` and return an MCP result. */
export async function handleDbQuery(args: unknown): Promise<CallToolResult> {
  const elapsed = startTimer();
  const cfg = loadConfig();
  const mode = cfg.mode;
  const input = (args ?? {}) as Partial<DbQueryInput>;

  const fail = (msg: string): CallToolResult =>
    toCallToolResult(errorEnvelope(msg, { mode, execution_ms: elapsed() }) as Envelope);

  if (!input.query || typeof input.query !== 'string') {
    return fail('db_query requires a `query` string.');
  }

  const target = resolveTarget(input, mode);
  if ('error' in target) {return fail(target.error);}

  const connectionInfo = parseConnectionUrl(target.url);
  if (connectionInfo.type === 'unknown') {
    return fail(
      'Unable to parse the connection URL. Supported: postgresql://…, mysql://…, sqlite:///path or file:./db.',
    );
  }

  const wantsWrite = input.write === true;
  const isWrite = isWriteOperation(input.query);

  // Read-only default + write opt-in.
  if (isWrite && !wantsWrite) {
    return fail(
      'This is a write statement and db_query is read-only by default. Pass write:true to opt in ' +
        '(and ensure the target permits writes).',
    );
  }
  if (isWrite && wantsWrite && !target.allowWrites) {
    return fail(
      'Writes are not permitted on this target. Register the connection with allow_writes:true, or ' +
        'use open mode for a bare database_url.',
    );
  }

  const readonly = !isWrite; // executors open read-only unless this is an opted-in write
  const limit = input.limit ?? 100;
  const format = input.format ?? 'json';
  const explain = input.explain === true;
  const maxTokens = input.output?.max_tokens ?? cfg.max_tokens_default;

  const outcome = await withBudget(cfg.budgets.db_query_ms, async () => {
    let queryToExecute = input.query!.trim();

    let truncated = false;
    if (limit > 0 && !hasLimitClause(queryToExecute) && /^(SELECT|WITH)\b/i.test(queryToExecute)) {
      queryToExecute = addLimitClause(queryToExecute, limit);
      truncated = true;
    }

    let explainOutput: string | undefined;
    if (explain && !isWriteOperation(queryToExecute)) {
      try {
        const explainPrefix = connectionInfo.type === 'sqlite' ? 'EXPLAIN QUERY PLAN' : 'EXPLAIN';
        const explainResult = await executeQuery(
          connectionInfo,
          `${explainPrefix} ${queryToExecute}`,
          input.params ?? [],
          true,
        );
        explainOutput = JSON.stringify(explainResult.rows, null, 2);
      } catch (error) {
        explainOutput = `EXPLAIN failed: ${error instanceof Error ? error.message : 'Unknown error'}`;
      }
    }

    const executionResult = await executeQuery(
      connectionInfo,
      queryToExecute,
      input.params ?? [],
      readonly,
    );

    return { executionResult, queryToExecute, truncated, explainOutput };
  }).catch((error: unknown) => {
    const msg = error instanceof Error ? error.message : String(error);
    return { error: enhanceDatabaseError(msg, connectionInfo.type) } as const;
  });

  if ('error' in outcome) {return fail(outcome.error);}

  const { value } = outcome;
  const { executionResult, queryToExecute, truncated, explainOutput } = value;

  if (format === 'table') {
    let outputText: string;
    if (executionResult.changes !== undefined) {
      outputText = `Query executed successfully.\n\nRows affected: ${executionResult.changes}`;
      if (executionResult.lastInsertRowid !== undefined && executionResult.lastInsertRowid !== 0n) {
        outputText += `\nLast insert row ID: ${executionResult.lastInsertRowid}`;
      }
    } else {
      const tableOutput = formatQueryResult(executionResult.rows, executionResult.columns);
      outputText = `${tableOutput}\n\n${executionResult.rows.length} row(s) returned`;
      if (truncated) {outputText += ` (limited to ${limit})`;}
    }
    if (explainOutput) {outputText += `\n\nEXPLAIN:\n${explainOutput}`;}

    const env = successEnvelope(
      {
        database_type: connectionInfo.type,
        content: outputText,
        query_executed: queryToExecute,
      },
      {
        mode,
        execution_ms: elapsed(),
        budget_exceeded: outcome.budget_exceeded || undefined,
      },
    );
    return toCallToolResult(env);
  }

  const data: {
    database_type: string;
    rows: unknown[];
    columns: ColumnInfo[];
    row_count: number;
    query_executed: string;
    truncated: boolean;
    changes?: number;
    last_insert_rowid?: number | bigint;
    explain_output?: string;
  } = {
    database_type: connectionInfo.type,
    rows: executionResult.rows,
    columns: executionResult.columns,
    row_count: executionResult.rows.length,
    query_executed: queryToExecute,
    truncated,
  };
  if (executionResult.changes !== undefined) {data.changes = executionResult.changes;}
  if (executionResult.lastInsertRowid !== undefined) {
    // bigint is not JSON-serializable; stringify large ids honestly.
    const rid = executionResult.lastInsertRowid;
    data.last_insert_rowid = typeof rid === 'bigint' ? Number(rid) : rid;
  }
  if (explainOutput) {data.explain_output = explainOutput;}

  const capped = capRows(data, maxTokens);

  const env = successEnvelope(data, {
    mode,
    execution_ms: elapsed(),
    budget_exceeded: outcome.budget_exceeded || undefined,
    truncated: capped || truncated || undefined,
    effective_caps: capped ? { max_tokens: maxTokens } : undefined,
  });
  return toCallToolResult(env);
}
