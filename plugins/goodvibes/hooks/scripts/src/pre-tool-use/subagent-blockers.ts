/**
 * Subagent Native Tool Blockers
 *
 * Blocks native Claude Code tools (Read, Edit, Glob, Grep) for subagents
 * and redirects them to use MCP batch tools instead for efficiency.
 *
 * This module enforces the batch processing pattern by:
 * - Detecting when a tool is called from a subagent context
 * - Blocking inefficient single-file operations
 * - Providing clear guidance on the MCP tool alternatives
 *
 * @module pre-tool-use/subagent-blockers
 */

import { respond, blockTool, allowTool, debug } from '../shared/index.js';

import type { HookInput } from '../shared/index.js';

/**
 * Extended hook input for PreToolUse with subagent detection.
 * The is_subagent field is set by Claude Code when the tool is called
 * from within a subagent (Task tool) context.
 */
export interface PreToolUseInput extends HookInput {
  /** Whether this tool call is from a subagent context */
  is_subagent?: boolean;
  /** The type of agent (e.g., 'backend-engineer', 'test-engineer') */
  agent_type?: string;
}

/**
 * Tool replacement configuration with usage examples.
 */
interface ToolReplacement {
  /** Name of the MCP replacement tool */
  replacement: string;
  /** Full mcp-cli usage example */
  usage: string;
  /** Brief description of capabilities */
  capabilities: string;
}

/**
 * Registry of native tools and their MCP replacements.
 * Each entry provides the replacement tool name and usage guidance.
 */
export const TOOL_REPLACEMENTS: Record<string, ToolReplacement> = {
  Read: {
    replacement: 'batch_read',
    usage: `mcp-cli call plugin_goodvibes_goodvibes-tools/batch_read '{
  "files": [
    "path/to/file1.ts",
    {"path": "path/to/file2.ts", "offset": 50, "limit": 30}
  ],
  "output_mode": "minimal"
}'`,
    capabilities:
      'Supports: per-file offset/limit, output_mode (minimal/standard/verbose)',
  },

  Edit: {
    replacement: 'atomic_multi_edit',
    usage: `mcp-cli call plugin_goodvibes_goodvibes-tools/atomic_multi_edit '{
  "edits": [
    {"file": "path/to/file.ts", "operation": "replace", "old_content": "original", "new_content": "replacement"}
  ],
  "output_mode": "minimal"
}'`,
    capabilities: 'Supports: multiple file edits atomically, validation, dry_run',
  },

  Write: {
    replacement: 'atomic_multi_edit',
    usage: `mcp-cli call plugin_goodvibes_goodvibes-tools/atomic_multi_edit '{
  "edits": [
    {"file": "path/to/file.ts", "operation": "create", "new_content": "file content here"}
  ],
  "output_mode": "minimal"
}'`,
    capabilities:
      'Supports: create/replace operations, multiple files, validation',
  },

  Glob: {
    replacement: 'smart_glob',
    usage: `mcp-cli call plugin_goodvibes_goodvibes-tools/smart_glob '{
  "patterns": ["**/*.ts", "**/*.tsx"],
  "exclude": ["**/*.test.ts"],
  "output_mode": "minimal",
  "limit": 50
}'`,
    capabilities:
      'Supports: multiple patterns, exclusions, auto-ignores node_modules/.git',
  },

  Grep: {
    replacement: 'grep_with_content',
    usage: `mcp-cli call plugin_goodvibes_goodvibes-tools/grep_with_content '{
  "pattern": "searchPattern",
  "glob": "**/*.ts",
  "output_mode": "minimal",
  "max_matches": 50
}'`,
    capabilities:
      'Supports: regex patterns, file filtering, context lines, case insensitive',
  },
};

/**
 * List of native tools that should be blocked for subagents.
 * DISABLED: Allowing all native tools for subagents to fix tool execution issues.
 */
export const BLOCKED_NATIVE_TOOLS: string[] = [];

/**
 * Formats a blocking message with the replacement tool and usage.
 *
 * @param toolName - The native tool that was blocked
 * @param replacement - The replacement tool configuration
 * @returns Formatted message with usage instructions
 */
export function formatBlockMessage(
  toolName: string,
  replacement: ToolReplacement
): string {
  return (
    `BLOCKED: Subagents must use '${replacement.replacement}' MCP tool instead of '${toolName}'.\n\n` +
    `${replacement.usage}\n\n` +
    `${replacement.capabilities}`
  );
}

/**
 * Checks if the given tool should be blocked for subagents.
 *
 * @param toolName - The name of the tool being invoked
 * @returns True if the tool is in the blocked list
 */
export function isBlockedNativeTool(toolName: string): boolean {
  return BLOCKED_NATIVE_TOOLS.includes(toolName);
}

/**
 * Handles blocking of native tools for subagent contexts.
 * Only blocks when is_subagent is explicitly true.
 *
 * @param input - The hook input containing tool information
 * @returns True if the tool was blocked, false if it should continue
 */
export function handleSubagentToolBlocking(input: PreToolUseInput): boolean {
  // Only block for explicit subagent context
  if (!input.is_subagent) {
    return false;
  }

  const toolName = input.tool_name ?? '';

  // Check if this is a blocked native tool
  const replacement = TOOL_REPLACEMENTS[toolName];
  if (replacement) {
    const blockMessage = formatBlockMessage(toolName, replacement);
    debug(`Blocking native tool '${toolName}' for subagent`, {
      agent_type: input.agent_type,
      replacement: replacement.replacement,
    });

    respond(blockTool('PreToolUse', blockMessage), true);
    return true;
  }

  return false;
}

/**
 * Validates that subagents are using appropriate tools.
 * This is the main entry point called from the pre-tool-use hook.
 *
 * @param input - The hook input containing tool information
 * @returns Promise that resolves when validation is complete
 */
export async function validateSubagentToolUsage(
  input: PreToolUseInput
): Promise<void> {
  // Check if tool should be blocked
  if (handleSubagentToolBlocking(input)) {
    // Already responded with block, nothing more to do
    return;
  }

  // If not a subagent or not a blocked tool, allow it
  if (input.is_subagent) {
    debug(`Allowing tool '${input.tool_name}' for subagent`);
  }

  // Don't respond here - let the caller handle the response
  // This allows other validators to run
}

/**
 * Provides a warning message for subagents about batch processing.
 * This can be injected as a system message when allowing tools.
 *
 * @returns Warning message about batch processing efficiency
 */
export function getBatchProcessingReminder(): string {
  return (
    'REMINDER: For efficiency, prefer batch operations:\n' +
    '- batch_read for multiple file reads\n' +
    '- atomic_multi_edit for multiple file edits\n' +
    '- smart_glob for pattern matching\n' +
    '- grep_with_content for searching\n' +
    'Always use output_mode: "minimal" to reduce context size.'
  );
}
