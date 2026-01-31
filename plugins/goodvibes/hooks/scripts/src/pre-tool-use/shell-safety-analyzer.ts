/**
 * Shell Safety Analyzer
 *
 * Detects shell-unsafe content in mcp-cli precision tool calls and attempts to fix them.
 * Focuses on JSON string literals passed to mcp-cli that contain shell metacharacters.
 *
 * @module pre-tool-use/shell-safety-analyzer
 */

/**
 * Classification of shell safety issues.
 */
export type SafetyIssueType =
  | 'single_quote_in_json'
  | 'unmatched_quotes'
  | 'variable_expansion'
  | 'backtick_expansion'
  | 'nested_quotes';

/**
 * Severity level for safety issues.
 */
export type IssueSeverity = 'block' | 'warn' | 'info';

/**
 * A specific shell safety issue detected in the command.
 */
export interface SafetyIssue {
  type: SafetyIssueType;
  severity: IssueSeverity;
  message: string;
  location?: string;
  fixable: boolean;
}

/**
 * Result of shell safety analysis.
 */
export interface SafetyAnalysis {
  safe: boolean;
  issues: SafetyIssue[];
  toolName?: string;
  jsonArg?: string;
}

/**
 * Result of attempting to fix shell safety issues.
 */
export interface FixResult {
  success: boolean;
  command?: string;
  explanation?: string;
}

/**
 * Precision tools that we analyze for shell safety.
 */
const PRECISION_TOOLS = [
  'precision_read',
  'precision_write',
  'precision_edit',
  'precision_grep',
  'precision_glob',
  'precision_exec',
  'precision_symbols',
  'discover',
];

/**
 * Checks if a command is an mcp-cli call to a precision tool.
 */
export function isMcpPrecisionCall(command: string): boolean {
  for (const tool of PRECISION_TOOLS) {
    if (command.includes('plugin_goodvibes_precision-engine/' + tool)) {
      return true;
    }
  }
  return false;
}

/**
 * Extracts the JSON argument from an mcp-cli call.
 */
function extractJsonArgument(command: string): string | null {
  // Match: mcp-cli call <server>/<tool> '<json>'
  const inlineMatch = command.match(/mcp-cli\s+call\s+\S+\s+'([^']+)'/);
  if (inlineMatch) {
    return inlineMatch[1];
  }

  // For heredoc/stdin patterns, we cannot analyze
  if (command.includes('<<') || command.includes('| mcp-cli')) {
    return null;
  }

  return null;
}

/**
 * Analyzes a command for shell safety issues.
 */
export function analyzeShellSafety(command: string): SafetyAnalysis {
  const issues: SafetyIssue[] = [];

  if (!isMcpPrecisionCall(command)) {
    return { safe: true, issues: [] };
  }

  // Extract tool name
  const toolMatch = command.match(
    /plugin_goodvibes_precision-engine\/(precision_\w+|discover)/
  );
  const toolName = toolMatch ? toolMatch[1] : undefined;

  // Extract JSON argument
  const jsonArg = extractJsonArgument(command);
  if (!jsonArg) {
    // Cannot analyze stdin/heredoc patterns - assume safe
    return { safe: true, issues: [], toolName };
  }

  // Check for single quotes in JSON content (most critical issue)
  if (jsonArg.includes("'")) {
    issues.push({
      type: 'single_quote_in_json',
      severity: 'block',
      message: "Single quote (') in JSON content breaks shell parsing",
      fixable: false,
    });
  }

  // Check for unmatched quotes
  const singleQuotes = (jsonArg.match(/'/g) || []).length;
  const doubleQuotes = (jsonArg.match(/"/g) || []).length;
  if (singleQuotes % 2 !== 0 || doubleQuotes % 2 !== 0) {
    issues.push({
      type: 'unmatched_quotes',
      severity: 'block',
      message: 'Unmatched quotes in JSON content',
      fixable: false,
    });
  }

  // Check for variable expansion patterns
  if (/\$\{[^}]+\}|\$\w+/.test(jsonArg)) {
    issues.push({
      type: 'variable_expansion',
      severity: 'warn',
      message: 'Variable expansion pattern ($VAR or ${VAR}) detected',
      fixable: true,
    });
  }

  // Check for backticks
  if (jsonArg.includes('`')) {
    issues.push({
      type: 'backtick_expansion',
      severity: 'warn',
      message: 'Backticks detected - may execute commands',
      fixable: true,
    });
  }

  const safe = !issues.some((issue) => issue.severity === 'block');
  return { safe, issues, toolName, jsonArg };
}

/**
 * Attempts to fix shell safety issues automatically.
 */
export function attemptFix(
  command: string,
  issues: SafetyIssue[]
): FixResult {
  const fixableIssues = issues.filter((issue) => issue.fixable);
  if (fixableIssues.length === 0) {
    return { success: false };
  }

  // If there are any blocking issues, do not attempt partial fixes
  if (issues.some((issue) => issue.severity === 'block')) {
    return { success: false };
  }

  // Complex escaping is error-prone - recommend base64 instead
  return { success: false };
}

/**
 * Formats a block message with base64 encoding guidance.
 */
export function formatBlockMessage(
  issues: SafetyIssue[],
  toolName: string
): string {
  const blockingIssues = issues.filter(
    (issue) => issue.severity === 'block'
  );
  const issueDescriptions = blockingIssues
    .map((issue) => issue.message)
    .join('; ');

  return 'BLOCKED: Shell-unsafe content in ' + toolName + ' call.\n\n' +
    'ISSUE: ' + issueDescriptions + '\n\n' +
    'FIX THIS CALL: Use base64-encoded parameters instead.\n' +
    '  - For "content": Use "content_base64" parameter\n' +
    '  - For "find"/"replace": Use "find_base64"/"replace_base64" parameters\n' +
    '  - Encode: echo "your content" | base64 -w0\n\n' +
    'NEXT CALLS: Return to normal parameters after this call.\n' +
    'Base64 encoding is only needed when content contains: \' " $ ` \ or nested shell/JSON syntax.';
}
