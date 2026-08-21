/**
 * Tool-module contract for the goodvibes-analytics server.
 *
 * Per R13 the MCP tool names drop the `analytics_` prefix (the server key is the
 * namespace): `query`, `dashboard`, `budget`, `export`, `tag`, `sync`, `config`.
 * Each module carries the external name, the engine's internal handler key
 * (which keeps the `analytics_` prefix), a description, and a JSON input schema
 * surfaced to the client. Input is validated a second time inside the engine
 * against the authoritative Zod schema, so this schema is advisory for the UI.
 */

export interface ToolModule {
  /** External MCP tool name, `analytics_` prefix dropped (R13). */
  name: string;
  /** The engine handler-registry key (keeps the `analytics_` prefix). */
  engineTool: string;
  /** One-line description surfaced in the tool list. */
  description: string;
  /** JSON Schema for the tool input (advisory; the engine re-validates via Zod). */
  inputSchema: Record<string, unknown>;
}
