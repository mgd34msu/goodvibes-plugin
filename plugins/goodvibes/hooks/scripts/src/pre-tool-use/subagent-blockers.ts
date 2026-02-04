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

import { respond, blockTool, allowTool } from '../shared/index.js';

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
    usage: `Call mcp__plugin_goodvibes_precision-engine__precision_read with:
{"files": [{"path": "path/to/file.ts"}], "extract": "content", "verbosity": "standard"}`,
    capabilities:
      'Supports: extract modes (content/outline/symbols/ast/lines), line ranges, verbosity levels',
  },

  Edit: {
    replacement: 'precision_edit',
    usage: `Call mcp__plugin_goodvibes_precision-engine__precision_edit with:
{"edits": [{"file": "path/to/file.ts", "find": "original", "replace": "new"}], "verbosity": "with_diff"}`,
    capabilities: 'Supports: atomic transactions, validation, hints, batch edits, fuzzy/regex/ast matching',
  },

  Write: {
    replacement: 'precision_write',
    usage: `Call mcp__plugin_goodvibes_precision-engine__precision_write with:
{"files": [{"path": "path/to/file.ts", "content": "content here", "mode": "overwrite"}], "verbosity": "standard"}`,
    capabilities:
      'Supports: create/overwrite/backup modes, multiple files, automatic parent directory creation',
  },

  Glob: {
    replacement: 'precision_glob',
    usage: `Call mcp__plugin_goodvibes_precision-engine__precision_glob with:
{"patterns": ["**/*.ts", "**/*.tsx"], "exclude": ["**/node_modules/**"], "verbosity": "standard"}`,
    capabilities:
      'Supports: multiple patterns, exclusions, size/date filters, presets, sorting',
  },

  Grep: {
    replacement: 'precision_grep',
    usage: `Call mcp__plugin_goodvibes_precision-engine__precision_grep with:
{"queries": [{"id": "search1", "pattern": "searchPattern", "glob": "**/*.ts"}], "verbosity": "standard"}`,
    capabilities:
      'Supports: batch queries, regex patterns, file filtering, context control, multiple output formats',
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
 * Bash command patterns that should be blocked.
 * These patterns detect attempts to circumvent native tool blocking
 * by using shell commands that replicate blocked tool functionality.
 */

/**
export const BLOCKED_BASH_PATTERNS: Array<{
  pattern: RegExp;
  replacementKey: string;
  description: string;
}> = [
  // Order matters: check most specific patterns first

  // 1. cat with pipe to grep (most specific cat usage)
  {
    pattern: /\bcat\b[^|]*\|\s*grep\b/i,
    replacementKey: 'Grep',
    description: 'cat piped to grep',
  },

  // 2. cat with any pipe (e.g., cat file | head)
  {
    pattern: /(?:^|[|;&]\s*)cat\b[^|]*\|/i,
    replacementKey: 'Read',
    description: 'cat piped to other command (use precision_read)',
  },

  // 3. cat with redirect output (e.g., cat > file, cat << EOF > file)
  {
    pattern: /(?:^|[|;&])\s*cat\b.*>\s*\S+/i,
    replacementKey: 'Write',
    description: 'cat redirect to file (use precision_write)',
  },

  // 4. Plain cat without pipe or redirect (most general cat usage)
  {
    pattern: /(?:^|[|;&])\s*cat\s+(?!-file\b)[^|>&]/i,
    replacementKey: 'Read',
    description: 'cat command (use precision_read)',
  },

  // 5. Standalone grep command
  {
    pattern: /(?:^|[|;&]\s*)grep\s+/i,
    replacementKey: 'Grep',
    description: 'grep command',
  },

  // 6. head/tail commands
  {
    pattern: /(?:^|[|;&]\s*)(?:head|tail)\s+/i,
    replacementKey: 'Read',
    description: 'head/tail command (use precision_read with line ranges)',
  },

  // 7. find command
  {
    pattern: /(?:^|[|;&]\s*)find\s+\S/i,
    replacementKey: 'Glob',
    description: 'find command (use precision_glob)',
  },
];
/*

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
  const mcpToolName = `mcp__plugin_goodvibes_precision-engine__${replacement.replacement}`;

  return (
    `\n` +
    `BLOCKED: '${toolName}' - MANDATORY: Use ${mcpToolName} instead.\n` +
    `CRITICAL: If multiple tool uses are planned, use discover and batch tools.\n\n` +
    `** ${mcpToolName} **\n` +
    `${replacement.usage}\n\n` +
    `CAPABILITIES: ${replacement.capabilities}\n\n`
  );
}

/**
 * Checks if a Bash command matches any blocked pattern.
 *
 * @param command - The bash command string to check
 * @returns Block message if pattern matches, null otherwise
 */

/**
export function checkBashCommand(command: string): string | null {
  for (const { pattern, replacementKey, description } of BLOCKED_BASH_PATTERNS) {
    if (pattern.test(command)) {
      const replacement = TOOL_REPLACEMENTS[replacementKey];
      if (replacement) {
        return formatBlockMessage(description, replacement);
      }
    }
  }
  return null;
}
*/

/**
 * Handles blocking of Bash commands that circumvent tool blocking.
 *
 * @param input - The hook input containing tool information
 * @returns True if the command was blocked, false otherwise
 */

/**
export function handleBashBlocking(input: PreToolUseInput): boolean {
  if (input.tool_name !== 'Bash') return false;

  const command = (input.tool_input?.command as string) || '';
  const blockMessage = checkBashCommand(command);

  if (blockMessage) {
    return true;
  }
  return false;
}
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
  // Check if native tool should be blocked
  if (handleNativeToolBlocking(input)) {
    return;
  }

  // Check if Bash command pattern should be blocked
  //if (handleBashBlocking(input)) {
  //  return;
  //}

  // If not a blocked tool, allow it

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
