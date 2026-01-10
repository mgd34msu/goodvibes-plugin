/**
 * Stack Parser Handler
 *
 * Parses error stack traces and provides structured analysis:
 * - Extracts file paths, line numbers, and function names
 * - Maps frames to project files
 * - Identifies root cause frame (first project file in stack)
 * - Provides code previews for project files
 */

import * as fs from 'fs';
import * as path from 'path';

import { success } from '../../utils.js';

/**
 * Arguments for the parse_error_stack tool
 */
export interface ParseErrorStackArgs {
  /** The full error message and stack trace */
  error_text: string;
  /** Project root path for mapping files (defaults to cwd) */
  project_path?: string;
}

/**
 * Represents a single stack frame
 */
export interface StackFrame {
  /** Function or method name */
  function_name: string;
  /** File path */
  file: string;
  /** Line number */
  line: number;
  /** Column number */
  column: number;
  /** Whether this file exists in the project */
  is_project_file: boolean;
  /** Preview of the code at this location */
  code_preview?: string;
}

/**
 * Result of parsing an error stack trace
 */
export interface ParseErrorStackResult {
  /** Error type (e.g., TypeError, ReferenceError) */
  error_type: string;
  /** The error message text */
  error_message: string;
  /** Parsed stack frames */
  stack_frames: StackFrame[];
  /** First project file frame in the stack (likely root cause) */
  root_cause_frame: { file: string; line: number; column: number } | null;
  /** Project files mentioned in the stack trace */
  related_files: string[];
}

/**
 * Regex patterns for parsing different stack trace formats
 */
const STACK_PATTERNS = {
  // Node.js/V8: "    at functionName (file:line:column)"
  // Also handles: "    at file:line:column"
  v8: /^\s*at\s+(?:(?<func>[^\s(]+)\s+\()?(?<file>[^:]+):(?<line>\d+):(?<column>\d+)\)?$/,

  // Node.js/V8 with async context: "    at async functionName (file:line:column)"
  v8Async: /^\s*at\s+async\s+(?:(?<func>[^\s(]+)\s+\()?(?<file>[^:]+):(?<line>\d+):(?<column>\d+)\)?$/,

  // Node.js internal: "    at Object.<anonymous> (node:internal/...)"
  nodeInternal: /^\s*at\s+(?:(?<func>[^\s(]+)\s+\()?\(?(node:[^:]+):(?<line>\d+):(?<column>\d+)\)?$/,

  // Firefox/SpiderMonkey: "functionName@file:line:column"
  spiderMonkey: /^(?<func>[^@]*)@(?<file>[^:]+):(?<line>\d+):(?<column>\d+)$/,

  // Safari/JavaScriptCore: "functionName@file:line:column" (similar to Firefox)
  javaScriptCore: /^(?<func>[^@]+)@(?<file>[^:]+):(?<line>\d+)(?::(?<column>\d+))?$/,

  // Windows paths with drive letters: "    at functionName (C:\path\file.ts:line:column)"
  windowsPath:
    /^\s*at\s+(?:(?<func>[^\s(]+)\s+\()?(?<file>[A-Za-z]:[^:]+):(?<line>\d+):(?<column>\d+)\)?$/,

  // Eval context: "    at eval (eval at <anonymous> (file:line:column), <anonymous>:evalLine:evalCol)"
  evalContext:
    /^\s*at\s+eval\s+\(eval\s+at\s+(?<func>[^\s(]+)\s+\((?<file>[^:]+):(?<line>\d+):(?<column>\d+)\)/,
};

/**
 * Regex patterns for extracting error type and message
 */
const ERROR_HEADER_PATTERNS = [
  // Standard format: "ErrorType: message"
  /^(?<type>[A-Z][a-zA-Z]*Error|Error|Exception):\s*(?<message>.+)$/m,

  // Node.js format with code: "Error [ERR_CODE]: message"
  /^(?<type>[A-Z][a-zA-Z]*Error|Error)\s*\[(?<code>[A-Z_]+)\]:\s*(?<message>.+)$/m,

  // Assertion errors: "AssertionError [ERR_ASSERTION]: message"
  /^(?<type>AssertionError)\s*\[(?<code>[A-Z_]+)\]:\s*(?<message>.+)$/m,

  // Uncaught/Unhandled prefix: "Uncaught TypeError: message"
  /^(?:Uncaught|Unhandled)\s+(?<type>[A-Z][a-zA-Z]*Error|Error):\s*(?<message>.+)$/m,

  // Generic error without type: just the message
  /^(?<message>[^\n]+)$/,
];

/**
 * Parse a single stack frame line
 */
function parseStackLine(line: string): StackFrame | null {
  const trimmed = line.trim();
  if (!trimmed) return null;

  // Try each pattern
  for (const [_name, pattern] of Object.entries(STACK_PATTERNS)) {
    const match = pattern.exec(trimmed);
    if (match?.groups) {
      const { func, file, line: lineStr, column: columnStr } = match.groups;

      // Skip invalid entries
      if (!file || !lineStr) continue;

      return {
        function_name: func?.trim() || '<anonymous>',
        file: file.trim(),
        line: parseInt(lineStr, 10),
        column: columnStr ? parseInt(columnStr, 10) : 0,
        is_project_file: false, // Will be determined later
      };
    }
  }

  return null;
}

/**
 * Extract error type and message from the error text
 */
function parseErrorHeader(errorText: string): { type: string; message: string } {
  const lines = errorText.split('\n');
  const firstLine = lines[0]?.trim() || '';

  for (const pattern of ERROR_HEADER_PATTERNS) {
    const match = pattern.exec(firstLine);
    if (match?.groups) {
      const type = match.groups['type'] || 'Error';
      const message = match.groups['message'] || firstLine;
      const code = match.groups['code'];

      // Include error code in message if present
      const fullMessage = code ? `[${code}] ${message}` : message;

      return { type, message: fullMessage };
    }
  }

  // Fallback: treat entire first line as message
  return { type: 'Error', message: firstLine };
}

/**
 * Check if a file path is within the project directory
 */
function isProjectFile(filePath: string, projectPath: string): boolean {
  // Skip node_modules
  if (filePath.includes('node_modules')) return false;

  // Skip Node.js internals
  if (filePath.startsWith('node:')) return false;
  if (filePath.startsWith('internal/')) return false;

  // Skip common external paths
  if (filePath.includes('webpack/')) return false;
  if (filePath.includes('webpack-internal')) return false;

  // Normalize paths for comparison
  const normalizedFile = path.normalize(filePath).toLowerCase();
  const normalizedProject = path.normalize(projectPath).toLowerCase();

  // Check if file is under project path
  if (normalizedFile.startsWith(normalizedProject)) {
    return true;
  }

  // For relative paths, check if they exist in project
  if (!path.isAbsolute(filePath)) {
    const absolutePath = path.resolve(projectPath, filePath);
    return fs.existsSync(absolutePath);
  }

  return false;
}

/**
 * Get a code preview for a file at a specific line
 */
function getCodePreview(
  filePath: string,
  line: number,
  projectPath: string,
): string | undefined {
  try {
    // Resolve file path
    const absolutePath = path.isAbsolute(filePath)
      ? filePath
      : path.resolve(projectPath, filePath);

    if (!fs.existsSync(absolutePath)) return undefined;

    const content = fs.readFileSync(absolutePath, 'utf-8');
    const lines = content.split('\n');

    // Get the line (1-indexed)
    const lineIndex = line - 1;
    if (lineIndex < 0 || lineIndex >= lines.length) return undefined;

    // Get context: one line before, current line, one line after
    const contextLines: string[] = [];

    if (lineIndex > 0) {
      contextLines.push(`${line - 1}: ${lines[lineIndex - 1]}`);
    }
    contextLines.push(`${line}: >>> ${lines[lineIndex]}`);
    if (lineIndex < lines.length - 1) {
      contextLines.push(`${line + 1}: ${lines[lineIndex + 1]}`);
    }

    return contextLines.join('\n');
  } catch {
    return undefined;
  }
}

/**
 * Format the result as readable markdown
 */
function formatResult(result: ParseErrorStackResult): string {
  const lines: string[] = [];

  lines.push('## Error Analysis');
  lines.push('');
  lines.push(`**Type:** \`${result.error_type}\``);
  lines.push(`**Message:** ${result.error_message}`);
  lines.push('');

  if (result.root_cause_frame) {
    lines.push('### Root Cause');
    lines.push(
      `\`${result.root_cause_frame.file}:${result.root_cause_frame.line}:${result.root_cause_frame.column}\``,
    );
    lines.push('');

    // Find the frame to get code preview
    const rootFrame = result.stack_frames.find(
      (f) =>
        f.file === result.root_cause_frame?.file &&
        f.line === result.root_cause_frame?.line,
    );
    if (rootFrame?.code_preview) {
      lines.push('```');
      lines.push(rootFrame.code_preview);
      lines.push('```');
      lines.push('');
    }
  }

  lines.push('### Stack Trace');
  lines.push('');

  for (const frame of result.stack_frames) {
    const marker = frame.is_project_file ? '[PROJECT]' : '[EXTERNAL]';
    lines.push(
      `- ${marker} \`${frame.function_name}\` at \`${frame.file}:${frame.line}:${frame.column}\``,
    );
  }

  if (result.related_files.length > 0) {
    lines.push('');
    lines.push('### Related Project Files');
    for (const file of result.related_files) {
      lines.push(`- \`${file}\``);
    }
  }

  lines.push('');
  lines.push('---');
  lines.push('');
  lines.push('```json');
  lines.push(JSON.stringify(result, null, 2));
  lines.push('```');

  return lines.join('\n');
}

/**
 * Handles the parse_error_stack MCP tool call.
 *
 * Parses an error stack trace and provides structured analysis:
 * - Extracts error type and message
 * - Parses stack frames with file, line, column, and function names
 * - Identifies which frames are from project files vs external dependencies
 * - Finds the root cause frame (first project file in stack)
 * - Provides code previews for project files
 *
 * @param args - The parse_error_stack tool arguments
 * @param args.error_text - The full error message and stack trace
 * @param args.project_path - Project root path for mapping files
 * @returns MCP tool response with parsed error analysis
 *
 * @example
 * handleParseErrorStack({
 *   error_text: "TypeError: Cannot read 'map' of undefined\\n    at Component (src/App.tsx:10:5)"
 * });
 */
export function handleParseErrorStack(args: ParseErrorStackArgs) {
  const projectPath = args.project_path
    ? path.resolve(args.project_path)
    : process.cwd();

  // Parse error header
  const { type: errorType, message: errorMessage } = parseErrorHeader(
    args.error_text,
  );

  // Parse stack frames
  const lines = args.error_text.split('\n');
  const stackFrames: StackFrame[] = [];

  for (const line of lines) {
    const frame = parseStackLine(line);
    if (frame) {
      // Determine if this is a project file
      frame.is_project_file = isProjectFile(frame.file, projectPath);

      // Get code preview for project files
      if (frame.is_project_file) {
        frame.code_preview = getCodePreview(frame.file, frame.line, projectPath);
      }

      stackFrames.push(frame);
    }
  }

  // Find root cause frame (first project file in stack)
  const rootCauseFrame = stackFrames.find((f) => f.is_project_file);

  // Collect related project files (unique)
  const relatedFiles = [
    ...new Set(
      stackFrames.filter((f) => f.is_project_file).map((f) => f.file),
    ),
  ];

  const result: ParseErrorStackResult = {
    error_type: errorType,
    error_message: errorMessage,
    stack_frames: stackFrames,
    root_cause_frame: rootCauseFrame
      ? {
          file: rootCauseFrame.file,
          line: rootCauseFrame.line,
          column: rootCauseFrame.column,
        }
      : null,
    related_files: relatedFiles,
  };

  return success(formatResult(result));
}
