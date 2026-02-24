/**
 * Native Tool Blockers
 *
 * Blocks native Claude Code tools (Read, Edit, Write, Glob, Grep, WebFetch) for ALL agents
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
export declare const TOOL_REPLACEMENTS: Record<string, ToolReplacement>;
/**
 * List of native tools that should be blocked for ALL agents.
 * These tools are replaced with precision-engine equivalents for better efficiency.
 */
export declare const BLOCKED_NATIVE_TOOLS: string[];
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
export declare function formatBlockMessage(toolName: string, replacement: ToolReplacement): string;
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
export declare function isBlockedNativeTool(toolName: string): boolean;
/**
 * Handles blocking of native tools for ALL agent contexts.
 * Blocks native tools and redirects to precision-engine equivalents.
 *
 * @param input - The hook input containing tool information
 * @returns True if the tool was blocked, false if it should continue
 */
export declare function handleNativeToolBlocking(input: PreToolUseInput): boolean;
/**
 * Validates that agents are using appropriate tools.
 * This is the main entry point called from the pre-tool-use hook.
 *
 * @param input - The hook input containing tool information
 * @returns Promise that resolves when validation is complete
 */
export declare function validateToolUsage(input: PreToolUseInput): Promise<void>;
/**
 * Provides a warning message about batch processing.
 * This can be injected as a system message when allowing tools.
 *
 * @returns Warning message about batch processing efficiency
 */
export declare function getBatchProcessingReminder(): string;
export {};
