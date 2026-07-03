/**
 * `service` — the registry / auth / trust-config surface (§4.3 service row).
 *
 * The agent-facing CRUD for registered services, their stored credentials, URL
 * patterns, and the destination allowlist. Two invariants the trust model
 * demands:
 *  - responses are credential-free: setting or inspecting auth returns only an
 *    auth STATUS, never a secret value;
 *  - this tool cannot flip the trust mode. `open` is human-only and out-of-band
 *    (a config-file edit); there is deliberately no `mode` action here.
 */

import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import {
  successEnvelope,
  errorEnvelope,
  toCallToolResult,
  startTimer,
  type Envelope,
} from '@goodvibes/core/envelope';
import { loadConfig, configForEnvelope } from '@goodvibes/core/config';
import {
  getAllServiceSummaries,
  getServiceSummary,
  addService,
  removeService,
  addUrlPattern,
  getAllowlist,
  addAllowlistHost,
  removeAllowlistHost,
  listServiceNames,
  addConnection,
  removeConnection,
  getConnectionSummary,
  listConnectionNames,
  type ServiceConfig,
  type DbConnection,
} from '../fetch/service-registry.js';
import { setServiceSecret, type ServiceAuth } from '../fetch/secrets-store.js';
import { getAuthStatus } from '../fetch/auth/auth-orchestrator.js';

/** Actions the `service` tool accepts. */
export type ServiceAction =
  | 'list'
  | 'get'
  | 'register'
  | 'remove'
  | 'set_auth'
  | 'set_url_pattern'
  | 'allow'
  | 'unallow'
  | 'register_connection'
  | 'remove_connection'
  | 'status';

/** Input to the `service` tool. */
export interface ServiceInput {
  action: ServiceAction;
  name?: string;
  hostname?: string;
  force?: boolean;
  /** For `register`. */
  config?: ServiceConfig;
  /** For `set_auth` — stored 0600; NEVER echoed back. */
  auth?: ServiceAuth;
  /** For `register_connection`. */
  connection?: DbConnection;
}

/** The tool descriptor (schema deferred by the client). */
export const serviceTool = {
  name: 'service',
  description:
    'Manage registered API services under the connect trust boundary: list/get ' +
    '(credential-free summaries), register, remove (purges credentials), set_auth ' +
    '(stored 0600, never echoed), set_url_pattern, allow/unallow a destination host, ' +
    'and status. The trust mode is human-only and cannot be changed here.',
  inputSchema: {
    type: 'object',
    properties: {
      action: {
        type: 'string',
        enum: [
          'list',
          'get',
          'register',
          'remove',
          'set_auth',
          'set_url_pattern',
          'allow',
          'unallow',
          'register_connection',
          'remove_connection',
          'status',
        ],
      },
      name: { type: 'string', description: 'Service or connection name.' },
      hostname: { type: 'string', description: 'Host for set_url_pattern / allow / unallow.' },
      force: { type: 'boolean', description: 'Overwrite an existing service on register.' },
      config: {
        type: 'object',
        description: 'Service configuration for register.',
        properties: {
          base_url: { type: 'string' },
          default_headers: { type: 'object', additionalProperties: { type: 'string' } },
          auth_type: { type: 'string' },
          description: { type: 'string' },
          timeout_ms: { type: 'number' },
          rate_limit_rps: { type: 'number' },
          write_methods: {
            type: 'array',
            items: { type: 'string' },
            description: 'Write methods this service opts into (read-only by default).',
          },
        },
        required: ['base_url'],
      },
      auth: {
        type: 'object',
        description: 'Auth config stored to the 0600 secrets file. Never echoed back.',
      },
      connection: {
        type: 'object',
        description: 'Database connection for register_connection (prefer url_env for networked DBs).',
        properties: {
          url: { type: 'string' },
          url_env: { type: 'string' },
          allow_writes: { type: 'boolean' },
          description: { type: 'string' },
        },
      },
    },
    required: ['action'],
  },
} as const;

/** Execute the `service` tool and return an MCP result. */
export async function handleService(args: unknown): Promise<CallToolResult> {
  const elapsed = startTimer();
  const cfg = loadConfig();
  const { mode } = configForEnvelope(cfg);
  const input = (args ?? {}) as Partial<ServiceInput>;

  const fail = (msg: string): CallToolResult =>
    toCallToolResult(errorEnvelope(msg, { mode, execution_ms: elapsed() }));

  const ok = (data: unknown): CallToolResult =>
    toCallToolResult(
      successEnvelope(data, { mode, execution_ms: elapsed() }) as Envelope,
    );

  try {
    switch (input.action) {
      case 'list':
        return ok({
          services: getAllServiceSummaries(),
          connections: listConnectionNames(),
          allowlist: getAllowlist(),
          mode,
        });

      case 'get': {
        if (!input.name) {return fail('`get` requires a service `name`.');}
        const summary = getServiceSummary(input.name);
        if (!summary) {return fail(`Service "${input.name}" is not registered.`);}
        const auth_status = await getAuthStatus(input.name);
        return ok({ ...summary, auth_status });
      }

      case 'register': {
        if (!input.name) {return fail('`register` requires a service `name`.');}
        if (!input.config?.base_url) {return fail('`register` requires `config.base_url`.');}
        if (!originValid(input.config.base_url)) {
          return fail(`base_url "${input.config.base_url}" is not a valid absolute URL.`);
        }
        await addService(input.name, input.config, input.force ?? false);
        return ok({ registered: input.name, summary: getServiceSummary(input.name) });
      }

      case 'remove': {
        if (!input.name) {return fail('`remove` requires a service `name`.');}
        const removed = await removeService(input.name);
        return ok({ removed, name: input.name });
      }

      case 'set_auth': {
        if (!input.name) {return fail('`set_auth` requires a service `name`.');}
        if (!input.auth) {return fail('`set_auth` requires an `auth` config.');}
        await setServiceSecret(input.name, input.auth);
        // Credential-free: report only the resulting status, never the secret.
        const auth_status = await getAuthStatus(input.name);
        return ok({ name: input.name, stored: true, auth_status });
      }

      case 'set_url_pattern': {
        if (!input.hostname || !input.name) {
          return fail('`set_url_pattern` requires `hostname` and `name`.');
        }
        await addUrlPattern(input.hostname, input.name);
        return ok({ hostname: input.hostname, service: input.name });
      }

      case 'allow': {
        if (!input.hostname) {return fail('`allow` requires a `hostname`.');}
        await addAllowlistHost(input.hostname);
        return ok({ allowlist: getAllowlist() });
      }

      case 'unallow': {
        if (!input.hostname) {return fail('`unallow` requires a `hostname`.');}
        const removed = await removeAllowlistHost(input.hostname);
        return ok({ removed, allowlist: getAllowlist() });
      }

      case 'register_connection': {
        if (!input.name) {return fail('`register_connection` requires a `name`.');}
        if (!input.connection || (!input.connection.url && !input.connection.url_env)) {
          return fail('`register_connection` requires `connection.url` or `connection.url_env`.');
        }
        await addConnection(input.name, input.connection, input.force ?? false);
        return ok({ registered_connection: input.name, summary: getConnectionSummary(input.name) });
      }

      case 'remove_connection': {
        if (!input.name) {return fail('`remove_connection` requires a `name`.');}
        const removed = await removeConnection(input.name);
        return ok({ removed, name: input.name });
      }

      case 'status':
        return ok({
          mode,
          read_only: mode === 'restricted',
          dangerously_persist_across_sessions: cfg.dangerously_persist_across_sessions,
          services: listServiceNames(),
          connections: listConnectionNames(),
          allowlist: getAllowlist(),
          note:
            'Trust mode is human-only. To open it, a person edits ' +
            '.goodvibes/config.json out-of-band; no tool can flip it.',
        });

      default:
        return fail(
          `Unknown service action "${String(input.action)}". Valid: list, get, register, ` +
            'remove, set_auth, set_url_pattern, allow, unallow, status.',
        );
    }
  } catch (e) {
    return fail(e instanceof Error ? e.message : String(e));
  }
}

function originValid(url: string): boolean {
  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
}
