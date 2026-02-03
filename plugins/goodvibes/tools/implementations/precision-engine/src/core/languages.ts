/**
 * Language detection and grammar mapping for tree-sitter.
 * 
 * This module provides utilities for:
 * - Detecting programming languages from file extensions
 * - Loading appropriate tree-sitter grammars
 * - Checking language support
 * 
 * @module core/languages
 */

/**
 * Supported programming languages for tree-sitter parsing.
 */
export type SupportedLanguage = 
  | 'typescript' 
  | 'javascript' 
  | 'python' 
  | 'rust' 
  | 'go' 
  | 'tsx' 
  | 'jsx';

/**
 * Tree-sitter language grammar interface.
 * This is a placeholder until tree-sitter types are properly added.
 */
export interface TreeSitterLanguage {
  // This will be replaced with proper tree-sitter types when dependencies are added
  name: string;
  [key: string]: unknown;
}

/**
 * Map of file extensions to supported languages.
 */
const EXTENSION_MAP: Record<string, SupportedLanguage> = {
  '.ts': 'typescript',
  '.tsx': 'tsx',
  '.mts': 'typescript',   // ESM TypeScript
  '.cts': 'typescript',   // CommonJS TypeScript
  '.js': 'javascript',
  '.jsx': 'jsx',
  '.mjs': 'javascript',   // ESM JavaScript
  '.cjs': 'javascript',   // CommonJS JavaScript
  '.py': 'python',
  '.pyi': 'python',       // Python type stubs
  '.rs': 'rust',
  '.go': 'go',
};

/**
 * Gets the programming language from a file extension.
 * 
 * @param filePath - Path to the file (can be absolute or relative)
 * @returns The detected language or null if unsupported
 * 
 * @example
 * ```typescript
 * getLanguageFromExtension('src/index.ts')  // => 'typescript'
 * getLanguageFromExtension('App.tsx')       // => 'tsx'
 * getLanguageFromExtension('main.py')       // => 'python'
 * getLanguageFromExtension('config.yaml')   // => null
 * ```
 */
export function getLanguageFromExtension(filePath: string): SupportedLanguage | null {
  // Extract extension from path (handles paths with multiple dots)
  const match = filePath.match(/\.[^.]+$/);
  if (!match) {
    return null;
  }
  
  const extension = match[0].toLowerCase();
  return EXTENSION_MAP[extension] ?? null;
}

/**
 * Loads the tree-sitter grammar for a given language.
 * 
 * NOTE: This is a placeholder implementation. Tree-sitter dependencies
 * need to be added to package.json before this can work:
 * - tree-sitter
 * - tree-sitter-typescript
 * - tree-sitter-javascript
 * - tree-sitter-python
 * - tree-sitter-rust
 * - tree-sitter-go
 * 
 * @param language - The language to get grammar for
 * @returns The tree-sitter language grammar
 * @throws Error if language grammar cannot be loaded
 * 
 * @example
 * ```typescript
 * const grammar = getGrammar('typescript');
 * // Use grammar with tree-sitter parser
 * ```
 */
export function getGrammar(language: SupportedLanguage): TreeSitterLanguage {
  // TODO: Implement actual grammar loading once tree-sitter deps are added
  // Example implementation:
  // switch (language) {
  //   case 'typescript':
  //   case 'tsx':
  //     return require('tree-sitter-typescript').typescript;
  //   case 'javascript':
  //   case 'jsx':
  //     return require('tree-sitter-javascript');
  //   case 'python':
  //     return require('tree-sitter-python');
  //   case 'rust':
  //     return require('tree-sitter-rust');
  //   case 'go':
  //     return require('tree-sitter-go');
  //   default:
  //     throw new Error(`Unsupported language: ${language}`);
  // }
  
  throw new Error(
    `Grammar loading not implemented. ` +
    `Add tree-sitter dependencies to package.json first. ` +
    `Requested language: ${language}`
  );
}

/**
 * Detects the programming language from a file path.
 * 
 * This is a convenience wrapper around getLanguageFromExtension().
 * 
 * @param filePath - Path to the file
 * @returns The detected language or null if unsupported
 * 
 * @example
 * ```typescript
 * detectLanguage('src/components/Button.tsx')  // => 'tsx'
 * detectLanguage('api/routes.ts')              // => 'typescript'
 * detectLanguage('README.md')                  // => null
 * ```
 */
export function detectLanguage(filePath: string): SupportedLanguage | null {
  return getLanguageFromExtension(filePath);
}

/**
 * Checks if a file's language is supported for tree-sitter parsing.
 * 
 * @param filePath - Path to the file
 * @returns True if the language is supported, false otherwise
 * 
 * @example
 * ```typescript
 * isLanguageSupported('src/index.ts')    // => true
 * isLanguageSupported('config.yaml')     // => false
 * isLanguageSupported('main.py')         // => true
 * ```
 */
export function isLanguageSupported(filePath: string): boolean {
  return detectLanguage(filePath) !== null;
}

/**
 * Gets all supported file extensions.
 * 
 * @returns Array of supported file extensions (including the dot)
 * 
 * @example
 * ```typescript
 * getSupportedExtensions()  // => ['.ts', '.tsx', '.js', '.jsx', '.py', '.rs', '.go']
 * ```
 */
export function getSupportedExtensions(): string[] {
  return Object.keys(EXTENSION_MAP);
}

/**
 * Gets a mapping of all extensions to their languages.
 * 
 * @returns Record mapping extensions to languages
 * 
 * @example
 * ```typescript
 * const map = getExtensionMap();
 * map['.ts']   // => 'typescript'
 * map['.tsx']  // => 'tsx'
 * ```
 */
export function getExtensionMap(): Readonly<Record<string, SupportedLanguage>> {
  return Object.freeze({ ...EXTENSION_MAP });
}
