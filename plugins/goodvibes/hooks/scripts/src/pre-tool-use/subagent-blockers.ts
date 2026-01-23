/**
 * Native Tool Blockers
 *
 * Blocks native Claude Code tools (Read, Edit, Write, Glob, Grep) for ALL agents
 * and redirects them to use precision-engine tools instead for efficiency.
 *
 * This module enforces the precision tool pattern by:
 * - Blocking native tools for all agent contexts (main and subagents)
 * - Redirecting to precision-engine equivalents
 * - Providing clear guidance on the MCP tool alternatives
 * - Promoting discover -> batch workflow
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
    replacement: 'precision_read',
    usage: `mcp-cli call plugin_goodvibes_precision-engine/precision_read '{
  "files": ["path/to/file1.ts", "path/to/file2.ts"],
  "extract": "full",
  "output": {"mode": "minimal"}
}'`,
    capabilities:
      'Supports: extract modes (full/outline/lines), line ranges, output modes (minimal/standard/verbose)',
  },

  Edit: {
    replacement: 'precision_edit',
    usage: `mcp-cli call plugin_goodvibes_precision-engine/precision_edit '{
  "edits": [
    {"file": "path/to/file.ts", "find": "original", "replace": "replacement"}
  ],
  "transaction": {"mode": "atomic", "rollback_on_fail": true},
  "output": {"mode": "minimal"}
}'`,
    capabilities: 'Supports: atomic transactions, validation, hints, batch edits',
  },

  Write: {
    replacement: 'precision_write',
    usage: `mcp-cli call plugin_goodvibes_precision-engine/precision_write '{
  "files": [
    {"path": "path/to/file.ts", "content": "file content here"}
  ],
  "transaction": {"mode": "atomic"},
  "output": {"mode": "minimal"}
}'`,
    capabilities:
      'Supports: create/overwrite operations, multiple files, atomic transactions, validation',
  },

  Glob: {
    replacement: 'precision_glob',
    usage: `mcp-cli call plugin_goodvibes_precision-engine/precision_glob '{
  "patterns": ["**/*.ts", "**/*.tsx"],
  "exclude": ["**/*.test.ts"],
  "output": {"mode": "minimal"}
}'`,
    capabilities:
      'Supports: multiple patterns, exclusions, filters, output modes',
  },

  Grep: {
    replacement: 'precision_grep',
    usage: `mcp-cli call plugin_goodvibes_precision-engine/precision_grep '{
  "queries": [
    {"pattern": "searchPattern", "glob": "**/*.ts"}
  ],
  "output": {"mode": "files_only"}
}'`,
    capabilities:
      'Supports: batch queries, regex patterns, file filtering, context control, output modes',
  },
};

/**
 * List of native tools that should be blocked for ALL agents.
 * These tools are replaced with precision-engine equivalents for better efficiency.
 */
export const BLOCKED_NATIVE_TOOLS: string[] = [
  'Read',
  'Edit',
  'Write',
  'Glob',
  'Grep',
];

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
  const toolPath = `plugin_goodvibes_precision-engine/${replacement.replacement}`;

  return (
    `BLOCKED: '${toolName}' - MANDATORY: Use ${toolPath} instead.\n` +
    `CRITICAL: If multiple tool uses are planned, "discover -> batch" process is MANDATORY:\n` +
    `mcp-cli info plugin_goodvibes_precision-engine/discover\n` +
    `mcp-cli info plugin_goodvibes_batch-engine/batch\n\n` +
    `** ${toolPath} **` +
    `TOOL INFO: \n${replacement.usage}\n\n` +
    `TOOL INFO: ${replacement.capabilities}\n` +
    `MORE INFO: mcp-cli info ${toolPath}\n\n`
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
 * Handles blocking of native tools for ALL agent contexts.
 * Blocks native tools and redirects to precision-engine equivalents.
 *
 * @param input - The hook input containing tool information
 * @returns True if the tool was blocked, false if it should continue
 */
export function handleNativeToolBlocking(input: PreToolUseInput): boolean {
  const toolName = input.tool_name ?? '';

  // Check if this is a blocked native tool
  if (!isBlockedNativeTool(toolName)) {
    return false;
  }

  const replacement = TOOL_REPLACEMENTS[toolName];
  if (replacement) {
    const blockMessage = formatBlockMessage(toolName, replacement);
    debug(`Blocking native tool '${toolName}'`, {
      agent_type: input.agent_type,
      is_subagent: input.is_subagent,
      replacement: replacement.replacement,
    });

    blockTool(blockMessage);
    return true;
  }

  return false;
}

/**
 * Validates that agents are using appropriate tools.
 * This is the main entry point called from the pre-tool-use hook.
 *
 * @param input - The hook input containing tool information
 * @returns Promise that resolves when validation is complete
 */
export async function validateToolUsage(
  input: PreToolUseInput
): Promise<void> {
  // Check if tool should be blocked
  if (handleNativeToolBlocking(input)) {
    // Already responded with block, nothing more to do
    return;
  }

  // If not a blocked tool, allow it
  debug(`Allowing tool '${input.tool_name}'`);

  // Don't respond here - let the caller handle the response
  // This allows other validators to run
}

/**
 * Provides a warning message about batch processing.
 * This can be injected as a system message when allowing tools.
 *
 * @returns Warning message about batch processing efficiency
 */
export function getBatchProcessingReminder(): string {
  return (
    'REMINDER: For efficiency, prefer precision tools and batch operations:\n' +
    '- precision_read for multiple file reads with extract modes\n' +
    '- precision_edit for atomic multi-file edits\n' +
    '- precision_write for creating multiple files\n' +
    '- precision_glob for pattern matching\n' +
    '- precision_grep for batch queries\n' +
    '- discover tool for parallel discovery queries\n' +
    '- batch tool for complex multi-operation workflows\n' +
    'Always use output.mode: "minimal" to reduce context size.'
  );
}
