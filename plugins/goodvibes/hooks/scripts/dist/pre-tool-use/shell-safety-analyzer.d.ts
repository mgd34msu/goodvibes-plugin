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
export type SafetyIssueType = 'single_quote_in_json' | 'unmatched_quotes' | 'variable_expansion' | 'backtick_expansion' | 'nested_quotes';
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
 * Checks if a command is an mcp-cli call to a precision tool.
 */
export declare function isMcpPrecisionCall(command: string): boolean;
/**
 * Analyzes a command for shell safety issues.
 */
export declare function analyzeShellSafety(command: string): SafetyAnalysis;
/**
 * Attempts to fix shell safety issues automatically.
 */
export declare function attemptFix(command: string, issues: SafetyIssue[]): FixResult;
/**
 * Formats a block message with base64 encoding guidance.
 */
export declare function formatBlockMessage(issues: SafetyIssue[], toolName: string): string;
