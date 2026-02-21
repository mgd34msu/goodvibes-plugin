/**
 * Analytics Engine MCP Server
 *
 * Stdio-based MCP transport wrapping the AnalyticsEngine class.
 * Registers 6 tools: analytics_dashboard, analytics_query, analytics_budget,
 * analytics_tag, analytics_export, analytics_config.
 *
 * Entry point for .mcp.json registration. Library consumers should
 * import AnalyticsEngine from './index.js' instead.
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ErrorCode,
  McpError,
  type CallToolResult,
} from '@modelcontextprotocol/sdk/types.js';

import { AnalyticsEngine, getToolDefinitions } from './index.js';

// ============================================================
// Constants
// ============================================================

const SERVER_NAME = 'analytics-engine';
const SERVER_VERSION = '0.1.0';

/** Default .goodvibes directory — resolved from PLUGIN_ROOT or cwd. */
function resolveGoodvibesDir(): string {
  const pluginRoot = process.env['PLUGIN_ROOT'];
  if (pluginRoot) {
    // When running as a plugin MCP server, PLUGIN_ROOT is the plugin directory.
    // The .goodvibes dir is in the project root (cwd), not in the plugin.
    return `${process.cwd()}/.goodvibes`;
  }
  return `${process.cwd()}/.goodvibes`;
}

// ============================================================
// Server
// ============================================================

class AnalyticsEngineServer {
  private readonly server: Server;
  private readonly engine: AnalyticsEngine;

  constructor(goodvibesDir: string) {
    this.engine = new AnalyticsEngine(goodvibesDir);
    this.server = new Server(
      { name: SERVER_NAME, version: SERVER_VERSION },
      { capabilities: { tools: {} } },
    );

    this.setupHandlers();
    this.setupErrorHandling();
  }

  private setupHandlers(): void {
    // List available tools
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      const defs = getToolDefinitions();
      // Convert Zod schemas to JSON Schema for MCP SDK
      const tools = defs.map((def) => {
        const zodSchema = def.inputSchema as { _def?: unknown };
        let jsonSchema: Record<string, unknown>;
        try {
          // Zod v3 .toJSONSchema() or zodToJsonSchema
          if (typeof (zodSchema as Record<string, unknown>)['toJSONSchema'] === 'function') {
            jsonSchema = (zodSchema as { toJSONSchema: () => Record<string, unknown> }).toJSONSchema();
          } else {
            // Fallback: use Zod's internal shape to build a minimal schema
            jsonSchema = zodToMinimalJsonSchema(zodSchema);
          }
        } catch {
          jsonSchema = { type: 'object' };
        }
        return {
          name: def.name,
          description: def.description,
          inputSchema: jsonSchema,
        };
      });
      return { tools };
    });

    // Handle tool calls
    this.server.setRequestHandler(CallToolRequestSchema, async (request): Promise<CallToolResult> => {
      const { name, arguments: args } = request.params;

      try {
        const result = await this.engine.handleToolCall(name, args ?? {});
        return result as CallToolResult;
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        throw new McpError(ErrorCode.InternalError, `Tool ${name} failed: ${message}`);
      }
    });
  }

  private setupErrorHandling(): void {
    this.server.onerror = (error) => {
      process.stderr.write(`[${SERVER_NAME}] MCP error: ${String(error)}\n`);
    };

    const shutdown = async (): Promise<void> => {
      await this.engine.shutdown();
      await this.server.close();
      process.exit(0);
    };

    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);
  }

  async start(): Promise<void> {
    await this.engine.initialize();
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    process.stderr.write(`[${SERVER_NAME}] v${SERVER_VERSION} started (7 tools)\n`);
  }
}

// ============================================================
// Zod -> JSON Schema minimal converter
// ============================================================

/**
 * Minimal Zod-to-JSON-Schema for MCP tool registration.
 * Handles the common Zod types used in analytics schemas.
 */
function zodToMinimalJsonSchema(schema: unknown): Record<string, unknown> {
  const s = schema as { _def?: { typeName?: string; shape?: () => Record<string, unknown>; values?: unknown[]; type?: unknown; options?: unknown[]; innerType?: unknown; defaultValue?: () => unknown; minValue?: number; maxValue?: number } };
  const def = s?._def;
  if (!def) return { type: 'object' };

  switch (def.typeName) {
    case 'ZodObject': {
      const shape = typeof def.shape === 'function' ? def.shape() : {};
      const properties: Record<string, unknown> = {};
      const required: string[] = [];
      for (const [key, val] of Object.entries(shape)) {
        const fieldDef = (val as { _def?: { typeName?: string } })?._def;
        properties[key] = zodToMinimalJsonSchema(val);
        // Required if not optional/default
        if (fieldDef?.typeName !== 'ZodOptional' && fieldDef?.typeName !== 'ZodDefault') {
          required.push(key);
        }
      }
      const result: Record<string, unknown> = { type: 'object', properties };
      if (required.length > 0) result['required'] = required;
      return result;
    }
    case 'ZodString':
      return { type: 'string' };
    case 'ZodNumber': {
      const result: Record<string, unknown> = { type: 'number' };
      if (def.minValue !== undefined) result['minimum'] = def.minValue;
      if (def.maxValue !== undefined) result['maximum'] = def.maxValue;
      return result;
    }
    case 'ZodBoolean':
      return { type: 'boolean' };
    case 'ZodEnum':
      return { type: 'string', enum: def.values ?? [] };
    case 'ZodArray':
      return { type: 'array', items: zodToMinimalJsonSchema(def.type) };
    case 'ZodOptional':
      return zodToMinimalJsonSchema(def.innerType);
    case 'ZodDefault':
      return zodToMinimalJsonSchema(def.innerType);
    case 'ZodUnion': {
      const options = (def.options ?? []) as unknown[];
      return { oneOf: options.map((o) => zodToMinimalJsonSchema(o)) };
    }
    case 'ZodEffects':
      // .refine() wraps in ZodEffects — unwrap to get the inner schema
      return zodToMinimalJsonSchema((def as unknown as { schema?: unknown }).schema);
    case 'ZodUnknown':
      return {};
    default:
      return { type: 'object' };
  }
}

// ============================================================
// Main
// ============================================================

async function main(): Promise<void> {
  const goodvibesDir = resolveGoodvibesDir();
  const server = new AnalyticsEngineServer(goodvibesDir);
  await server.start();
}

main().catch((err) => {
  process.stderr.write(`[${SERVER_NAME}] Fatal: ${err instanceof Error ? err.message : String(err)}\n`);
  process.exit(1);
});
