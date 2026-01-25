/**
 * precision_edit handler - Token-efficient file editing with atomic transactions
 * SPEC-v2 Section 13.1.5
 *
 * Features:
 * - Transaction modes: atomic, partial, none
 * - Match modes: exact, fuzzy, regex, ast
 * - Position hints: near_line, in_function, in_class, after, before
 * - Validation hooks: typecheck, lint, test, build
 * - Diff output
 * - Rollback support
 *
 * AST Mode:
 * - Supports TypeScript/JavaScript files (.ts, .tsx, .js, .jsx)
 * - Matches entire AST nodes (functions, classes, types, imports, etc.)
 * - Falls back to exact match for non-JS/TS files or parse failures
 * - Preserves formatting and comments within matched nodes
 *
 * AST Match Patterns:
 * - Function declarations: "function myFunc" or "myFunc"
 * - Variable declarations: "const myVar", "let myVar", "var myVar", or "myVar"
 * - Method declarations: "methodName" or "async methodName"
 * - Class declarations: "class MyClass" or "MyClass"
 * - Type aliases: "type MyType" or "MyType"
 * - Interfaces: "interface MyInterface" or "MyInterface"
 * - Enums: "enum MyEnum" or "MyEnum"
 * - Imports: matches if pattern is contained in import statement
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
import { diffLines } from 'diff';
import * as ts from 'typescript';
import { startTimer } from '../logging.js';
import type { OutputMode } from '../types.js';
import { successResult, errorResult, parseOutputMode, toCallToolResult, ToolHandler, resolveStringField } from '../utils/index.js';
import { formatMissingParamError, formatInvalidValueError, createErrorResult } from '../utils/errors.js';

const execAsync = promisify(exec);

// === Interfaces per SPEC-v2 ===

type TransactionMode = 'atomic' | 'partial' | 'none';
type MatchMode = 'exact' | 'fuzzy' | 'regex' | 'ast';
type EditOutputMode = 'count_only' | 'minimal' | 'with_diff' | 'verbose';
type ValidationStep = 'typecheck' | 'lint' | 'test' | 'build';
type OccurrenceType = 'first' | 'last' | 'all' | number;

interface EditHints {
  near_line?: number;
  in_function?: string;
  in_class?: string;
  after?: string;
  before?: string;
}

interface EditSpec {
  id?: string;
  path?: string;
  file?: string; // DEPRECATED: Use path instead
  find: string;
  find_base64?: string;
  replace: string;
  replace_base64?: string;
  occurrence?: OccurrenceType;
  hints?: EditHints;
}

interface Transaction {
  mode: TransactionMode;
  rollback_on_fail: boolean;
}

interface MatchConfig {
  mode: MatchMode;
  case_sensitive?: boolean;
  whitespace_sensitive?: boolean;
}

interface Validate {
  before?: ValidationStep[];
  after?: ValidationStep[];
}

interface EditOutput {
  mode: EditOutputMode;
  diff_context?: number;
  max_tokens?: number;
}

interface PrecisionEditInput {
  edits: EditSpec[];
  transaction?: Transaction;
  match?: MatchConfig;
  validate?: Validate;
  dry_run?: boolean;
  output?: EditOutput;
  output_mode?: OutputMode;
}

type EditStatus = 'applied' | 'not_found' | 'ambiguous' | 'conflict' | 'failed';

interface EditResult {
  id?: string;
  file: string;
  status: EditStatus;
  edits_applied?: number;
  diff?: string;
  error?: string;
}

interface ValidationResult {
  step: ValidationStep;
  passed: boolean;
  error?: string;
}

interface Backup {
  path: string;
  content: string | null;
}
// === Constants ===

const DEFAULT_MATCH_CONFIG: MatchConfig = {
  mode: 'exact' as const,
  case_sensitive: true,
  whitespace_sensitive: true,
};

// === Helper Functions ===

function estimateTokens(str: string): number {
  return Math.ceil(str.length / 4);
}

function generateRollbackId(): string {
  return `rb_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function normalizeWhitespace(str: string): string {
  return str.replace(/\s+/g, ' ').trim();
}

function fuzzyMatch(content: string, search: string, caseSensitive: boolean, whitespaceSensitive: boolean): number[] {
  const indices: number[] = [];

  let searchStr = search;
  let contentStr = content;

  if (!caseSensitive) {
    searchStr = searchStr.toLowerCase();
    contentStr = contentStr.toLowerCase();
  }

  if (!whitespaceSensitive) {
    // For fuzzy matching, we need to find positions in original string
    // This is a simplified approach - match normalized versions
    const normalizedSearch = normalizeWhitespace(searchStr);
    let pos = 0;

    while (pos < contentStr.length) {
      const segment = contentStr.slice(pos);
      const normalizedSegment = normalizeWhitespace(segment);
      if (normalizedSegment.startsWith(normalizedSearch)) {
        indices.push(pos);
        pos += search.length;
      } else {
        pos++;
      }
    }
  } else {
    let pos = 0;
    while ((pos = contentStr.indexOf(searchStr, pos)) !== -1) {
      indices.push(pos);
      pos++;
    }
  }

  return indices;
}

function regexMatch(content: string, pattern: string, caseSensitive: boolean): { index: number; match: string }[] {
  const flags = caseSensitive ? 'g' : 'gi';
  const regex = new RegExp(pattern, flags);
  const matches: { index: number; match: string }[] = [];

  let match: RegExpExecArray | null;
  while ((match = regex.exec(content)) !== null) {
    matches.push({ index: match.index, match: match[0] });
    if (match[0].length === 0) regex.lastIndex++;
  }

  return matches;
}

function isJavaScriptFile(filePath: string): boolean {
  const ext = path.extname(filePath).toLowerCase();
  return ['.ts', '.tsx', '.js', '.jsx'].includes(ext);
}

/**
 * Calculate Levenshtein distance between two strings
 * Used for finding similar content when pattern matching fails
 */
function levenshteinDistance(a: string, b: string): number {
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  const matrix: number[][] = [];

  for (let i = 0; i <= b.length; i++) {
    matrix[i] = [i];
  }

  for (let j = 0; j <= a.length; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1
        );
      }
    }
  }

  return matrix[b.length][a.length];
}

/**
 * Calculate similarity score between two strings (0-1 range)
 * Higher score means more similar
 */
function calculateSimilarity(a: string, b: string): number {
  if (a === b) return 1;
  if (!a || !b) return 0;

  const longer = a.length > b.length ? a : b;
  const shorter = a.length > b.length ? b : a;

  if (longer.length === 0) return 1;
  if (longer.length > 500) return 0; // Skip expensive comparison for very long strings

  const editDistance = levenshteinDistance(longer, shorter);
  return (longer.length - editDistance) / longer.length;
}

interface ClosestMatch {
  line: number;
  similarity: number;
  preview: string;
}

/**
 * Find the closest matching content when a pattern is not found
 * Returns up to maxResults matches sorted by similarity score
 */
function findClosestMatch(content: string, pattern: string, maxResults = 3): ClosestMatch[] {
  const lines = content.split('\n');
  const patternLines = pattern.split('\n');
  const patternFirstLine = patternLines[0].trim();

  const matches: ClosestMatch[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineTrimmed = line.trim();

    if (lineTrimmed.length === 0) continue;

    const similarity = calculateSimilarity(lineTrimmed, patternFirstLine);

    if (similarity > 0.4) {
      matches.push({
        line: i + 1,
        similarity,
        preview: line.slice(0, 80) + (line.length > 80 ? '...' : '')
      });
    }
  }

  return matches
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, maxResults);
}

function getScriptKind(filePath: string): ts.ScriptKind {
  const ext = path.extname(filePath).toLowerCase();
  switch (ext) {
    case '.tsx':
      return ts.ScriptKind.TSX;
    case '.jsx':
      return ts.ScriptKind.JSX;
    case '.ts':
      return ts.ScriptKind.TS;
    case '.js':
    default:
      return ts.ScriptKind.JS;
  }
}

interface AstMatch {
  index: number;
  length: number;
  nodeText: string;
}

function astMatch(filePath: string, content: string, pattern: string): AstMatch[] {
  // Only apply AST matching to JavaScript/TypeScript files
  if (!isJavaScriptFile(filePath)) {
    return [];
  }

  try {
    // Parse the file into an AST
    const sourceFile = ts.createSourceFile(
      filePath,
      content,
      ts.ScriptTarget.Latest,
      true,
      getScriptKind(filePath)
    );

    const matches: AstMatch[] = [];

    // Parse the pattern to determine what we're looking for
    const patternNormalized = pattern.trim();

    // Helper to check if a node matches the pattern
    function matchesPattern(node: ts.Node): boolean {
      const nodeText = node.getText(sourceFile).trim();

      // Function declarations: "function myFunc" or "async function myFunc"
      if (ts.isFunctionDeclaration(node)) {
        if (!node.name) return false;
        const funcName = node.name.getText(sourceFile);

        // Match patterns like "function myFunc", "async function myFunc", or just "myFunc"
        if (
          patternNormalized === `function ${funcName}` ||
          patternNormalized === `async function ${funcName}` ||
          patternNormalized === funcName
        ) {
          return true;
        }
      }

      // Arrow functions: "const myFunc = " or "const myFunc: Type = "
      if (ts.isVariableDeclaration(node) && node.initializer) {
        const varName = node.name.getText(sourceFile);

        // Match patterns like "const myVar", "let myVar", "var myVar", or just "myVar"
        if (
          patternNormalized === `const ${varName}` ||
          patternNormalized === `let ${varName}` ||
          patternNormalized === `var ${varName}` ||
          patternNormalized === varName
        ) {
          return true;
        }
      }

      // Method declarations in classes
      if (ts.isMethodDeclaration(node)) {
        const methodName = node.name.getText(sourceFile);

        // Match patterns like "methodName" or "async methodName"
        if (
          patternNormalized === methodName ||
          patternNormalized === `async ${methodName}`
        ) {
          return true;
        }
      }

      // Class declarations: "class MyClass" or "export class MyClass"
      if (ts.isClassDeclaration(node)) {
        if (!node.name) return false;
        const className = node.name.getText(sourceFile);

        // Match patterns like "class MyClass", "export class MyClass", or just "MyClass"
        if (
          patternNormalized === `class ${className}` ||
          patternNormalized === `export class ${className}` ||
          patternNormalized === className
        ) {
          return true;
        }
      }

      // Import declarations: "import { foo }"
      if (ts.isImportDeclaration(node)) {
        const importText = nodeText;

        // Check if pattern is contained in the import statement
        if (importText.includes(patternNormalized)) {
          return true;
        }
      }

      // Type alias declarations: "type MyType" or "export type MyType"
      if (ts.isTypeAliasDeclaration(node)) {
        const typeName = node.name.getText(sourceFile);

        // Match patterns like "type MyType", "export type MyType", or just "MyType"
        if (
          patternNormalized === `type ${typeName}` ||
          patternNormalized === `export type ${typeName}` ||
          patternNormalized === typeName
        ) {
          return true;
        }
      }

      // Interface declarations: "interface MyInterface" or "export interface MyInterface"
      if (ts.isInterfaceDeclaration(node)) {
        const interfaceName = node.name.getText(sourceFile);

        // Match patterns like "interface MyInterface", "export interface MyInterface", or just "MyInterface"
        if (
          patternNormalized === `interface ${interfaceName}` ||
          patternNormalized === `export interface ${interfaceName}` ||
          patternNormalized === interfaceName
        ) {
          return true;
        }
      }

      // Enum declarations: "enum MyEnum" or "export enum MyEnum"
      if (ts.isEnumDeclaration(node)) {
        const enumName = node.name.getText(sourceFile);

        // Match patterns like "enum MyEnum", "export enum MyEnum", or just "MyEnum"
        if (
          patternNormalized === `enum ${enumName}` ||
          patternNormalized === `export enum ${enumName}` ||
          patternNormalized === enumName
        ) {
          return true;
        }
      }

      return false;
    }

    // Walk the AST to find matching nodes
    function visit(node: ts.Node) {
      if (matchesPattern(node)) {
        matches.push({
          index: node.getStart(sourceFile),
          length: node.getEnd() - node.getStart(sourceFile),
          nodeText: node.getText(sourceFile),
        });
      }

      ts.forEachChild(node, visit);
    }

    visit(sourceFile);

    return matches;
  } catch (error) {
    // If AST parsing fails, return empty array (will fall back to exact match)
    console.error(`AST parsing failed for ${filePath}:`, error);
    return [];
  }
}

interface MatchResult {
  index: number;
  length: number; // For AST mode, length of the matched node
}

/**
 * Escapes special regex characters in a user-provided string
 * to prevent regex injection vulnerabilities
 */
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function findInContext(
  filePath: string,
  content: string,
  find: string,
  hints: EditHints,
  matchConfig: MatchConfig
): MatchResult[] {
  const lines = content.split('\n');
  const candidates: MatchResult[] = [];

  // Find all occurrences first
  let allMatches: MatchResult[] = [];

  if (matchConfig.mode === 'ast') {
    // Use AST matching
    const astMatches = astMatch(filePath, content, find);

    if (astMatches.length === 0 && isJavaScriptFile(filePath)) {
      // AST matching failed or found nothing, fall back to exact match with warning
      console.warn(`AST matching found no matches for "${find}" in ${filePath}, falling back to exact match`);

      // Fall back to exact match
      let searchContent = content;
      let searchFind = find;
      if (matchConfig.case_sensitive === false) {
        searchContent = content.toLowerCase();
        searchFind = find.toLowerCase();
      }

      let pos = 0;
      while ((pos = searchContent.indexOf(searchFind, pos)) !== -1) {
        allMatches.push({ index: pos, length: searchFind.length });
        pos++;
      }
    } else if (astMatches.length === 0 && !isJavaScriptFile(filePath)) {
      // Non-JS/TS file, fall back to exact match
      console.warn(`AST mode only applies to .ts, .tsx, .js, .jsx files. Using exact match for ${filePath}`);

      let searchContent = content;
      let searchFind = find;
      if (matchConfig.case_sensitive === false) {
        searchContent = content.toLowerCase();
        searchFind = find.toLowerCase();
      }

      let pos = 0;
      while ((pos = searchContent.indexOf(searchFind, pos)) !== -1) {
        allMatches.push({ index: pos, length: searchFind.length });
        pos++;
      }
    } else {
      allMatches = astMatches;
    }
  } else if (matchConfig.mode === 'regex') {
    const matches = regexMatch(content, find, matchConfig.case_sensitive ?? true);
    allMatches = matches.map(m => ({ index: m.index, length: m.match.length }));
  } else if (matchConfig.mode === 'fuzzy') {
    const indices = fuzzyMatch(
      content,
      find,
      matchConfig.case_sensitive ?? true,
      matchConfig.whitespace_sensitive ?? true
    );
    allMatches = indices.map(index => ({ index, length: find.length }));
  } else {
    // exact match
    let searchContent = content;
    let searchFind = find;

    if (matchConfig.case_sensitive === false) {
      searchContent = searchContent.toLowerCase();
      searchFind = searchFind.toLowerCase();
    }

    if (matchConfig.whitespace_sensitive === false) {
      searchContent = normalizeWhitespace(searchContent);
      searchFind = normalizeWhitespace(searchFind);
    }

    // Standard exact match
    let pos = 0;
    while ((pos = searchContent.indexOf(searchFind, pos)) !== -1) {
      allMatches.push({ index: pos, length: searchFind.length });
      pos++;
    }
  }

  if (allMatches.length === 0) return [];

  // If no hints provided, return all matches
  if (!hints.near_line && !hints.in_function && !hints.in_class && !hints.after && !hints.before) {
    return allMatches;
  }

  // Apply hints to score and filter candidates
  interface ScoredMatch extends MatchResult {
    score: number;
  }

  const scoredMatches: ScoredMatch[] = [];

  // Hoist indexOf calls outside loop for performance
  const afterIdx = hints.after ? content.indexOf(hints.after) : -1;
  const beforeIdx = hints.before ? content.indexOf(hints.before) : -1;

  for (const match of allMatches) {
    const lineNumber = content.substring(0, match.index).split('\n').length;
    let score = 100; // Base score
    let disqualified = false;

    // near_line hint - closer is better (soft constraint)
    if (hints.near_line !== undefined) {
      const distance = Math.abs(lineNumber - hints.near_line);
      score += Math.max(0, 50 - distance * 5);
    }

    // in_function hint - MUST be in function (hard constraint)
    // LIMITATION: This only checks if the function declaration appears BEFORE the match,
    // not if the match is truly INSIDE the function's scope (which would require AST analysis).
    // For now, this provides a reasonable heuristic for most cases.
    if (hints.in_function) {
      const safeFuncName = escapeRegex(hints.in_function);
      const funcPattern = new RegExp(
        `(function\\s+${safeFuncName}\\s*\\(|const\\s+${safeFuncName}\\s*=|let\\s+${safeFuncName}\\s*=|var\\s+${safeFuncName}\\s*=)`,
        'g'
      );
      const beforeContent = content.substring(0, match.index);
      if (!funcPattern.test(beforeContent)) {
        disqualified = true; // Not in specified function
      } else {
        score += 50;
      }
    }

    // in_class hint - MUST be in class (hard constraint)
    // LIMITATION: This only checks if the class declaration appears BEFORE the match,
    // not if the match is truly INSIDE the class's scope (which would require AST analysis).
    // For now, this provides a reasonable heuristic for most cases.
    if (hints.in_class) {
      const safeClassName = escapeRegex(hints.in_class);
      const classPattern = new RegExp(`class\\s+${safeClassName}\\b`, 'g');
      const beforeContent = content.substring(0, match.index);
      if (!classPattern.test(beforeContent)) {
        disqualified = true; // Not in specified class
      } else {
        score += 50;
      }
    }

    // after hint - match MUST come after this text (hard constraint)
    if (hints.after) {
      if (afterIdx === -1 || match.index <= afterIdx + hints.after.length) {
        disqualified = true;
      } else {
        score += 30;
      }
    }

    // before hint - match MUST come before this text (hard constraint)
    if (hints.before) {
      if (beforeIdx === -1 || match.index >= beforeIdx) {
        disqualified = true;
      } else {
        score += 30;
      }
    }

    if (!disqualified) {
      scoredMatches.push({ ...match, score });
    }
  }

  // Sort by score (highest first) and return without score property
  return scoredMatches
    .sort((a, b) => b.score - a.score)
    .map(({ score, ...match }) => match);
}

function generateDiff(original: string, modified: string, context: number = 3): string {
  const changes = diffLines(original, modified);
  const lines: string[] = [];

  for (const change of changes) {
    const prefix = change.added ? '+' : change.removed ? '-' : ' ';
    const text = change.value.replace(/\n$/, '');
    for (const line of text.split('\n')) {
      lines.push(`${prefix}${line}`);
    }
  }

  return lines.join('\n');
}

async function runValidation(step: ValidationStep, workDir: string): Promise<ValidationResult> {
  try {
    switch (step) {
      case 'typecheck':
        await execAsync('npx tsc --noEmit', { cwd: workDir, timeout: 120000 });
        break;
      case 'lint':
        await execAsync('npx eslint . --max-warnings 0', { cwd: workDir, timeout: 120000 });
        break;
      case 'test':
        await execAsync('npm test', { cwd: workDir, timeout: 300000 });
        break;
      case 'build':
        await execAsync('npm run build', { cwd: workDir, timeout: 180000 });
        break;
    }
    return { step, passed: true };
  } catch (error) {
    return { step, passed: false, error: (error as Error).message };
  }
}

async function applyEdit(
  filePath: string,
  content: string | null,
  edit: EditSpec,
  matchConfig: MatchConfig
): Promise<{ newContent: string; status: EditStatus; editsApplied: number; error?: string }> {
  if (content === null) {
    return { newContent: '', status: 'not_found', editsApplied: 0, error: 'File does not exist' };
  }

  // Resolve find and replace values (supports regular strings, base64, and file paths)
  const findValue = resolveStringField(edit as unknown as Record<string, unknown>, 'find', {
    allowFile: true,
    basePath: process.cwd(),
    required: true,
    fieldName: 'find'
  });
  const replaceValue = resolveStringField(edit as unknown as Record<string, unknown>, 'replace', {
    allowFile: true,
    basePath: process.cwd(),
    required: true,
    fieldName: 'replace'
  });

  // Find matches using hints and match mode
  const matches = findInContext(filePath, content, findValue, edit.hints ?? {}, matchConfig);

  if (matches.length === 0) {
    const closestMatches = findClosestMatch(content, findValue);
    const errorDetails: any = {
      message: 'Pattern not found',
      pattern_length: findValue.length,
      file_length: content.length,
      closest_matches: closestMatches.length > 0 ? closestMatches : 'No similar content found'
    };
    return {
      newContent: content,
      status: 'not_found',
      editsApplied: 0,
      error: JSON.stringify(errorDetails, null, 2)
    };
  }

  // Determine which occurrences to replace
  let matchesToReplace: MatchResult[];
  const occurrence = edit.occurrence ?? 'first';

  if (occurrence === 'first') {
    matchesToReplace = [matches[0]];
  } else if (occurrence === 'last') {
    matchesToReplace = [matches[matches.length - 1]];
  } else if (occurrence === 'all') {
    matchesToReplace = matches;
  } else if (typeof occurrence === 'number') {
    if (occurrence > 0 && occurrence <= matches.length) {
      matchesToReplace = [matches[occurrence - 1]];
    } else {
      return { newContent: content, status: 'not_found', editsApplied: 0, error: `Occurrence ${occurrence} not found (only ${matches.length} matches)` };
    }
  } else {
    matchesToReplace = [matches[0]];
  }

  // Check for ambiguity in single-replacement modes
  if ((occurrence === 'first' || occurrence === 'last' || typeof occurrence === 'number') && matches.length > 1) {
    // Not ambiguous if we're explicitly selecting one
  }

  // Apply replacements (reverse order to preserve indices)
  let newContent = content;
  const sortedMatches = [...matchesToReplace].sort((a, b) => b.index - a.index);

  for (const match of sortedMatches) {
    // Use the match.length property which is set correctly for each match mode
    // For AST mode, this will be the entire node length
    // For other modes, this will be the matched string length
    newContent = newContent.slice(0, match.index) + replaceValue + newContent.slice(match.index + match.length);
  }

  return { newContent, status: 'applied', editsApplied: matchesToReplace.length };
}

// === Main Handler ===

export const handlePrecisionEdit: ToolHandler = async (args: unknown) => {
  const getElapsed = startTimer();
  const input = args as PrecisionEditInput;
  const outputMode = parseOutputMode(args, "precision_edit");
  const workDir = process.cwd();

  try {
    // Validate input
    if (!input.edits || !Array.isArray(input.edits) || input.edits.length === 0) {
      return toCallToolResult(errorResult('edits array is required', outputMode, getElapsed()));
    }

    // Validate edit specs - ensure each has required fields
    for (let i = 0; i < input.edits.length; i++) {
      const edit = input.edits[i];

      // Check for path or file (with fallback)
      const filePath = edit.path ?? edit.file;
      if (!filePath || typeof filePath !== 'string') {
        return toCallToolResult(errorResult(`edits[${i}].path (or deprecated .file) is required and must be a string`, outputMode, getElapsed()));
      }

      // Warn if deprecated file is used
      if (edit.file && !edit.path) {
        console.warn(`[precision_edit] DEPRECATION WARNING: edits[${i}].file is deprecated. Use edits[${i}].path instead.`);
      }

      // Check for find value via any supported source
      const hasFindValue = edit.find !== undefined ||
                           edit.find_base64 !== undefined ||
                           edit.find_file !== undefined;
      if (!hasFindValue) {
        return toCallToolResult(errorResult(
          `edits[${i}].find is required (provide find, find_base64, or find_file)`,
          outputMode, getElapsed()
        ));
      }

      // Check for replace value via any supported source
      const hasReplaceValue = edit.replace !== undefined ||
                              edit.replace_base64 !== undefined ||
                              edit.replace_file !== undefined;
      if (!hasReplaceValue) {
        return toCallToolResult(errorResult(
          `edits[${i}].replace is required (provide replace, replace_base64, or replace_file)`,
          outputMode, getElapsed()
        ));
      }
    }

    // Apply transaction defaults
    const transaction: Transaction = {
      mode: input.transaction?.mode ?? 'atomic',
      rollback_on_fail: input.transaction?.rollback_on_fail ?? true,
    };

    // Apply output defaults
    const output: EditOutput = {
      mode: input.output?.mode ?? 'with_diff',
      diff_context: input.output?.diff_context ?? 3,
      max_tokens: input.output?.max_tokens,
    };

    const dryRun = input.dry_run ?? false;
    const diffContext = output.diff_context;
    const rollbackId = generateRollbackId();
    const matchConfig = input.match ?? DEFAULT_MATCH_CONFIG;

    // Run before validation
    const beforeValidation: ValidationResult[] = [];
    if (input.validate?.before) {
      for (const step of input.validate.before) {
        const result = await runValidation(step, workDir);
        beforeValidation.push(result);
        if (!result.passed) {
          return toCallToolResult(errorResult(`Before validation failed: ${step} - ${result.error}`, outputMode, getElapsed()));
        }
      }
    }

    // Read all files and create backups
    const backups: Backup[] = [];
    const fileContents = new Map<string, string | null>();
    const uniqueFiles = [...new Set(input.edits.map(e => path.resolve(workDir, e.path ?? e.file!)))];

    for (const filePath of uniqueFiles) {
      try {
        const content = await fs.readFile(filePath, 'utf-8');
        fileContents.set(filePath, content);
        backups.push({ path: filePath, content });
      } catch {
        fileContents.set(filePath, null);
        backups.push({ path: filePath, content: null });
      }
    }

    // Apply edits in memory
    const results: EditResult[] = [];
    const newContents = new Map<string, string>();
    let totalEditsApplied = 0;
    let totalEditsFailed = 0;
    let hasFailures = false;

    for (const edit of input.edits) {
      const editFilePath = edit.path ?? edit.file!;
      const filePath = path.resolve(workDir, editFilePath);
      const currentContent = newContents.get(filePath) ?? fileContents.get(filePath) ?? null;
      const originalContent = fileContents.get(filePath);

      const { newContent, status, editsApplied, error } = await applyEdit(
        filePath,
        currentContent,
        edit,
        matchConfig
      );

      const result: EditResult = {
        id: edit.id,
        file: editFilePath,
        status,
        edits_applied: editsApplied,
      };

      if (status === 'applied') {
        newContents.set(filePath, newContent);
        totalEditsApplied += editsApplied;

        // Generate diff if requested
        if (output.mode === 'with_diff' || output.mode === 'verbose') {
          result.diff = generateDiff(currentContent ?? '', newContent, diffContext);
        }
      } else {
        hasFailures = true;
        totalEditsFailed++;
        result.error = error;
      }

      results.push(result);

      // For atomic mode, stop on first failure
      if (transaction.mode === 'atomic' && hasFailures) {
        break;
      }
    }

    // Handle transaction modes
    if (transaction.mode === 'atomic' && hasFailures) {
      // Don't write anything
      const data = {
        edits: results,
        summary: {
          files_modified: 0,
          edits_applied: 0,
          edits_failed: totalEditsFailed,
        },
        tokens_used: estimateTokens(JSON.stringify(results)),
      };
      return toCallToolResult(successResult(data, outputMode, getElapsed()));
    }

    // If dry run, return without writing
    if (dryRun) {
      const filesModified = new Set(results.filter(r => r.status === 'applied').map(r => r.file)).size;
      const data = {
        edits: results,
        summary: {
          files_modified: filesModified,
          edits_applied: totalEditsApplied,
          edits_failed: totalEditsFailed,
        },
        rollback_id: rollbackId,
        tokens_used: estimateTokens(JSON.stringify(results)),
      };
      return toCallToolResult(successResult(data, outputMode, getElapsed()));
    }

    // Write changes
    for (const [filePath, content] of newContents) {
      await fs.mkdir(path.dirname(filePath), { recursive: true });
      await fs.writeFile(filePath, content, 'utf-8');
    }

    // Run after validation
    const afterValidation: ValidationResult[] = [];
    if (input.validate?.after) {
      for (const step of input.validate.after) {
        const result = await runValidation(step, workDir);
        afterValidation.push(result);

        if (!result.passed && transaction.rollback_on_fail) {
          // Rollback
          for (const backup of backups) {
            if (backup.content === null) {
              await fs.unlink(backup.path).catch(() => {});
            } else {
              await fs.writeFile(backup.path, backup.content, 'utf-8');
            }
          }

          return toCallToolResult(errorResult(`After validation failed: ${step} - ${result.error}. Changes rolled back.`, outputMode, getElapsed()));
        }
      }
    }

    // Build final result
    const filesModified = new Set(results.filter(r => r.status === 'applied').map(r => r.file)).size;

    let data: unknown;
    switch (output.mode) {
      case 'count_only':
        data = {
          summary: {
            files_modified: filesModified,
            edits_applied: totalEditsApplied,
            edits_failed: totalEditsFailed,
          },
          tokens_used: estimateTokens(JSON.stringify({ filesModified, totalEditsApplied, totalEditsFailed })),
        };
        break;

      case 'minimal':
        data = {
          edits: results.map(r => ({ id: r.id, file: r.file, status: r.status })),
          summary: {
            files_modified: filesModified,
            edits_applied: totalEditsApplied,
            edits_failed: totalEditsFailed,
          },
          rollback_id: rollbackId,
          tokens_used: estimateTokens(JSON.stringify(results.map(r => ({ id: r.id, file: r.file, status: r.status })))),
        };
        break;

      case 'with_diff':
        data = {
          edits: results.map(r => ({ id: r.id, file: r.file, status: r.status, diff: r.diff, error: r.error })),
          summary: {
            files_modified: filesModified,
            edits_applied: totalEditsApplied,
            edits_failed: totalEditsFailed,
          },
          rollback_id: rollbackId,
          tokens_used: estimateTokens(JSON.stringify(results)),
        };
        break;

      case 'verbose':
      default:
        data = {
          edits: results,
          summary: {
            files_modified: filesModified,
            edits_applied: totalEditsApplied,
            edits_failed: totalEditsFailed,
          },
          validation: {
            before: beforeValidation,
            after: afterValidation,
          },
          rollback_id: rollbackId,
          tokens_used: estimateTokens(JSON.stringify(results)),
        };
    }

    return toCallToolResult(successResult(data, outputMode, getElapsed()));
  } catch (error) {
    return toCallToolResult(errorResult((error as Error).message, outputMode, getElapsed()));
  }
};
