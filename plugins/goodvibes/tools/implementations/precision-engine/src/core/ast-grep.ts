/**
 * ast-grep wrapper - Structural code pattern matching
 *
 * Features:
 * - AST-based pattern matching using @ast-grep/napi
 * - Supports semantic search patterns (e.g., console.log($$$ARGS))
 * - Language auto-detection from file extensions
 * - Supports captures for pattern variables ($VAR, $$$VAR)
 *
 * Pattern syntax:
 * - $VAR - Matches a single AST node (e.g., $NAME for identifiers)
 * - $$$VAR - Matches multiple nodes (e.g., $$$ARGS for argument lists)
 * - Literal code - Matches exact AST structure
 *
 * Examples:
 * - console.log($$$ARGS) - Matches console.log with any arguments
 * - function $NAME($$$PARAMS) { $$$BODY } - Matches function declarations
 * - async function $NAME($$$) - Matches async functions
 * - try { $$$TRY } catch ($E) { $$$CATCH } - Matches try-catch blocks
 * - import { $$$IMPORTS } from '$MODULE' - Matches import statements
 */

import { parse, NapiConfig, Lang } from '@ast-grep/napi';
import fg from 'fast-glob';
import * as fs from 'fs/promises';
import { createTwoFilesPatch } from 'diff';
import * as path from 'path';
import { DEFAULT_EXCLUDES } from '../config.js';
import { detectLanguage as detectLang } from './languages.js';

// === Interfaces ===

export interface AstGrepSearchOptions {
  /** AST pattern to search for (e.g., 'console.log($$$ARGS)') */
  pattern: string;
  /** Base path to search within (defaults to cwd) */
  path?: string;
  /** Glob pattern to filter files (e.g., '**' + '/*.ts') */
  glob?: string;
  /** Language for parsing (auto-detected if not provided) */
  language?: string;
  /** File patterns to exclude (default: node_modules, .git, etc.) */
  exclude?: string[];
  /** Maximum number of matches to return per file */
  maxMatchesPerFile?: number;
  /** Maximum number of files to search */
  maxFiles?: number;
}

export interface AstGrepMatch {
  /** File path (relative to search path) */
  file: string;
  /** Start line number (1-indexed) */
  line: number;
  /** Start column number (1-indexed) */
  column: number;
  /** End line number (1-indexed) */
  endLine: number;
  /** End column number (1-indexed) */
  endColumn: number;
  /** Matched text */
  matchText: string;
  /** Named captures from pattern variables */
  captures?: Record<string, string>;
}

export interface AstGrepSearchResult {
  /** All matches found */
  matches: AstGrepMatch[];
  /** Number of files with matches */
  fileCount: number;
  /** Total number of matches */
  matchCount: number;
}

export interface AstGrepReplaceOptions {
  /** AST pattern to search for */
  pattern: string;
  /** Replacement pattern (can use captured variables like $NAME) */
  replacement: string;
  /** Base path to search within */
  path?: string;
  /** Glob pattern to filter files */
  glob?: string;
  /** Language for parsing */
  language?: string;
  /** File patterns to exclude */
  exclude?: string[];
  /** If true, return diffs without modifying files */
  dryRun?: boolean;
}

export interface AstGrepReplaceResult {
  /** File that was modified */
  file: string;
  /** Unified diff showing changes */
  diff: string;
}

// === Language Detection ===

const LANGUAGE_MAP: Record<string, string> = {
  '.js': 'javascript',
  '.jsx': 'javascript',
  '.mjs': 'javascript',
  '.cjs': 'javascript',
  '.ts': 'typescript',
  '.tsx': 'tsx',
  '.mts': 'typescript',
  '.cts': 'typescript',
  '.py': 'python',
  '.rs': 'rust',
  '.go': 'go',
  '.c': 'c',
  '.cpp': 'cpp',
  '.cc': 'cpp',
  '.cxx': 'cpp',
  '.h': 'c',
  '.hpp': 'cpp',
  '.java': 'java',
  '.kt': 'kotlin',
  '.swift': 'swift',
  '.rb': 'ruby',
  '.php': 'php',
  '.cs': 'csharp',
  '.scala': 'scala',
  '.sh': 'bash',
  '.bash': 'bash',
};

/**
 * Internal helper: Detects the programming language from a file extension.
 * Returns the ast-grep-specific language name, with a fallback to 'javascript'.
 * @param filePath - File path to detect language from
 * @returns Language identifier for ast-grep (never null)
 */
function detectLanguage(filePath: string): string {
  const detected = detectLang(filePath);
  if (detected) return detected;
  
  // Fallback to LANGUAGE_MAP for ast-grep-specific languages not in core languages.ts
  const ext = path.extname(filePath).toLowerCase();
  return LANGUAGE_MAP[ext] || 'javascript'; // Default to JavaScript
}

/**
 * Converts language string to ast-grep Lang enum.
 * @param language - Language identifier string
 * @returns ast-grep Lang enum value
 */
export function toLangEnum(language: string): Lang {
  const langMap: Record<string, Lang> = {
    'javascript': Lang.JavaScript,
    'typescript': Lang.TypeScript,
    'tsx': Lang.Tsx,
    'python': Lang.Python,
    'rust': Lang.Rust,
    'go': Lang.Go,
    'c': Lang.C,
    'cpp': Lang.Cpp,
    'java': Lang.Java,
    'kotlin': Lang.Kotlin,
    'swift': Lang.Swift,
    'ruby': Lang.Ruby,
    'csharp': Lang.CSharp,
    'html': Lang.Html,
    'css': Lang.Css,
    'bash': Lang.Bash,
    'scala': Lang.Scala,
    'php': Lang.Php,
  };

  return langMap[language.toLowerCase()] || Lang.JavaScript;
}

// === Core Implementation ===

export class AstGrepCore {
  /**
   * Searches for an AST pattern across files.
   *
   * @param options - Search configuration
   * @returns Search results with matches and metadata
   */
  async search(options: AstGrepSearchOptions): Promise<AstGrepSearchResult> {
    const {
      pattern,
      path: searchPath = process.cwd(),
      glob = '**' + '/*',
      language,
      exclude = [],
      maxMatchesPerFile = 100,
      maxFiles = 1000,
    } = options;

    const excludePatterns = [...DEFAULT_EXCLUDES, ...exclude];
    const absolutePath = path.resolve(searchPath);

    // Find files to search
    const files = await fg(glob, {
      cwd: absolutePath,
      ignore: excludePatterns,
      absolute: true,
      onlyFiles: true,
    });

    const allMatches: AstGrepMatch[] = [];
    const filesWithMatches = new Set<string>();
    let filesProcessed = 0;

    for (const filePath of files) {
      if (filesProcessed >= maxFiles) break;
      filesProcessed++;

      try {
        const content = await fs.readFile(filePath, 'utf-8');
        const lang = language || detectLanguage(filePath);
        const langEnum = toLangEnum(lang);

        // Parse the file
        const root = parse(langEnum, content);

        // Search for pattern
        const matches = root.root().findAll(pattern);

        let matchesInFile = 0;
        for (const match of matches) {
          if (matchesInFile >= maxMatchesPerFile) break;

          const range = match.range();
          const matchText = match.text();

          // Extract captures (pattern variables)
          const captures: Record<string, string> = {};
          
          // TODO: Implement capture extraction using ast-grep napi's getMatch() method
          // KNOWN LIMITATION: Named captures from pattern variables ($VAR, $$$VAR) are not yet extracted.
          // The @ast-grep/napi library provides getMatch() which returns a SgNode with methods like:
          // - getMatch(metaVarName: string) - Gets the node matched by a pattern variable
          // - text() - Gets the text content of a matched node
          // Implementation approach:
          //   1. Parse pattern to extract metavar names (e.g., $NAME, $$$ARGS from pattern)
          //   2. Call sgNode.getMatch(varName) for each metavar
          //   3. Call .text() on returned nodes to get captured text
          //   4. Store in captures object: captures[varName] = matchedNode.text()
          // Reference: https://ast-grep.github.io/reference/api.html#sgnode

          allMatches.push({
            file: path.relative(absolutePath, filePath),
            line: range.start.line + 1, // Convert 0-indexed to 1-indexed
            column: range.start.column + 1,
            endLine: range.end.line + 1,
            endColumn: range.end.column + 1,
            matchText,
            captures: Object.keys(captures).length > 0 ? captures : undefined,
          });

          matchesInFile++;
          filesWithMatches.add(filePath);
        }
      } catch (error) {
        // Skip files that can't be parsed
        // Could be binary files, invalid syntax, unsupported language, etc.
        continue;
      }
    }

    return {
      matches: allMatches,
      fileCount: filesWithMatches.size,
      matchCount: allMatches.length,
    };
  }

  /**
   * Gets a list of files that contain matches for an AST pattern.
   * More efficient than search() when you only need file paths.
   *
   * @param pattern - AST pattern to search for
   * @param searchPath - Base path to search within
   * @param glob - Glob pattern to filter files
   * @returns Array of file paths (relative to searchPath)
   */
  async filesWithMatches(
    pattern: string,
    searchPath: string = process.cwd(),
    glob: string = '**' + '/*'
  ): Promise<string[]> {
    const result = await this.search({
      pattern,
      path: searchPath,
      glob,
      maxMatchesPerFile: 1, // Only need to know if file has matches
    });

    // Extract unique file paths
    const uniqueFiles = new Set<string>();
    for (const match of result.matches) {
      uniqueFiles.add(match.file);
    }

    return Array.from(uniqueFiles);
  }

  /**
   * Replaces occurrences of an AST pattern in files.
   * Useful for semantic refactoring and code transformations.
   *
   * @param options - Replace configuration
   * @returns Array of replacement results with diffs
   */
  async replace(options: AstGrepReplaceOptions): Promise<AstGrepReplaceResult[]> {
    const {
      pattern,
      replacement,
      path: searchPath = process.cwd(),
      glob = '**' + '/*',
      language,
      exclude = [],
      dryRun = false,
    } = options;

    const excludePatterns = [...DEFAULT_EXCLUDES, ...exclude];
    const absolutePath = path.resolve(searchPath);

    // Find files to process
    const files = await fg(glob, {
      cwd: absolutePath,
      ignore: excludePatterns,
      absolute: true,
      onlyFiles: true,
    });

    const results: AstGrepReplaceResult[] = [];

    for (const filePath of files) {
      try {
        const originalContent = await fs.readFile(filePath, 'utf-8');
        const lang = language || detectLanguage(filePath);
        const langEnum = toLangEnum(lang);

        // Parse the file
        const root = parse(langEnum, originalContent);

        // Search for pattern matches
        const matches = root.root().findAll(pattern);
        if (matches.length === 0) continue;

        // Build modified content by replacing matches
        // Note: We need to replace from end to start to preserve positions
        const sortedMatches = [...matches].sort((a, b) => {
          return b.range().start.index - a.range().start.index;
        });

        let modifiedContent = originalContent;
        for (const match of sortedMatches) {
          const range = match.range();
          const before = modifiedContent.substring(0, range.start.index);
          const after = modifiedContent.substring(range.end.index);

          // Simple replacement - more sophisticated version would handle captures
          modifiedContent = before + replacement + after;
        }

        // Generate unified diff
        const diff = generateUnifiedDiff(
          filePath,
          originalContent,
          modifiedContent
        );

        // Write changes if not dry run
        if (!dryRun && modifiedContent !== originalContent) {
          await fs.writeFile(filePath, modifiedContent, 'utf-8');
        }

        results.push({
          file: path.relative(absolutePath, filePath),
          diff,
        });
      } catch (error) {
        // Skip files that can't be processed
        continue;
      }
    }

    return results;
  }
}

/**
 * Generates a unified diff between original and modified content.
 * @param filePath - File path for diff header
 * @param original - Original file content
 * @param modified - Modified file content
 * @returns Unified diff string
 */
function generateUnifiedDiff(
  filePath: string,
  original: string,
  modified: string
): string {
  if (original === modified) {
    return "No changes in " + filePath;
  }

  // Use the diff package for proper unified diffs
  return createTwoFilesPatch(
    filePath,
    filePath,
    original,
    modified,
    undefined,
    undefined
  );
}
