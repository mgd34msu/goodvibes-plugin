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
    debug(`Blocking Bash command pattern`, {
      command: command.slice(0, 100),
      agent_type: input.agent_type,
      is_subagent: input.is_subagent,
    });
    blockTool(blockMessage);
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
  // Check if native tool should be blocked
  if (handleNativeToolBlocking(input)) {
    return;
  }

  // Check if Bash command pattern should be blocked
  //if (handleBashBlocking(input)) {
  //  return;
  //}

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
