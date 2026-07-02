/**
 * Language detection and grammar-name mapping for tree-sitter.
 *
 * Ported verbatim from v1 `precision-engine/src/core/languages.ts` (the module
 * had no defects to fix — it is a pure extension→language lookup table).
 */

export type SupportedLanguage = 'typescript' | 'javascript' | 'python' | 'rust' | 'go' | 'tsx' | 'jsx';

const EXTENSION_MAP: Record<string, SupportedLanguage> = {
  '.ts': 'typescript',
  '.tsx': 'tsx',
  '.mts': 'typescript',
  '.cts': 'typescript',
  '.js': 'javascript',
  '.jsx': 'jsx',
  '.mjs': 'javascript',
  '.cjs': 'javascript',
  '.py': 'python',
  '.pyi': 'python',
  '.rs': 'rust',
  '.go': 'go',
};

/** Detect the supported language from a file path's extension, or null. */
export function getLanguageFromExtension(filePath: string): SupportedLanguage | null {
  const match = filePath.match(/\.[^.]+$/);
  if (!match) return null;
  return EXTENSION_MAP[match[0].toLowerCase()] ?? null;
}

/** Alias of {@link getLanguageFromExtension}. */
export function detectLanguage(filePath: string): SupportedLanguage | null {
  return getLanguageFromExtension(filePath);
}

/** True when tree-sitter parsing is available for this file's language. */
export function isLanguageSupported(filePath: string): boolean {
  return detectLanguage(filePath) !== null;
}

/** All supported file extensions, dot included. */
export function getSupportedExtensions(): string[] {
  return Object.keys(EXTENSION_MAP);
}
