/**
 * Pre-Tool-Use Hook (GoodVibes)
 *
 * Main router/dispatcher for pre-tool-use validations.
 *
 * Validates prerequisites before tool execution:
 * - Platform path mapping (Unix paths -> Windows equivalents)
 * - Shell safety analysis (detect/block shell-unsafe content in mcp-cli calls)
 * - Bash tool: JSON auto-escape for mcp-cli, git command detection, quality gates
 * - Native tools (Read, Edit, Update, Write, Glob, Grep, WebFetch): Block for ALL agents, redirect to precision-engine
 * - MCP tools: Resource availability checks
 *
 * ## Hook Priority Order
 * 1. Platform path mapping (rewrite /tmp, /dev/null on Windows)
 * 2. Shell safety analysis (detect shell-unsafe content in precision tool calls)
 * 3. Bash tool handling (JSON auto-escape, git commands, quality gates)
 * 4. Native tool blocking for ALL agents (Read, Edit, Update, Write, Glob, Grep, WebFetch)
 * 5. MCP tool validators
 *
 * @module pre-tool-use/hook
 */
/**
 * Main entry point for pre-tool-use hook.
 */
export declare function runPreToolUseHook(): Promise<void>;
