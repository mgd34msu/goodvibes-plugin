/**
 * Cross-file relationship utilities for grep results
 * SPEC-v2 Item 12 Part B
 * 
 * Given a grep match, find related files based on import/export relationships.
 * Useful for understanding symbol usage across the codebase.
 * 
 * Example use cases:
 * - Find where a function is imported after finding its definition
 * - Find re-exports of a symbol
 * - Trace symbol flow through module boundaries
 */

import * as path from 'path';
import { readFile } from 'fs/promises';
import { TreeSitterCore } from '../core/tree-sitter.js';
import { RipgrepCore } from '../core/ripgrep.js';

// === Interfaces ===

/**
 * Represents a related file and its relationship type.
 */
export interface RelatedFile {
  /** Path to the related file */
  file: string;
  /** Type of relationship */
  relationship: 'imports' | 'exports' | 're-exports';
  /** The symbol involved in the relationship */
  symbol?: string;
  /** Line number where the relationship occurs */
  line?: number;
}

/**
 * Result of finding related files for a symbol.
 */
export interface RelationshipResult {
  /** The source file being analyzed */
  source_file: string;
  /** Array of related files */
  related: RelatedFile[];
  /** The symbol being traced */
  symbol: string;
}

// === Singleton Instances ===

const treeSitterCore = new TreeSitterCore();
const ripgrepCore = new RipgrepCore();

// === Helper Functions ===

/**
 * Escapes special regex characters in a string.
 * Prevents regex injection when using user input in RegExp constructors.
 */
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// === Main Function ===

/**
 * Find files related to a symbol through import/export relationships.
 * 
 * Algorithm:
 * 1. Check if the symbol is exported from the source file (using TreeSitter)
 * 2. Find files that import from the source file (using ripgrep)
 * 3. Find files that export the same symbol (using ripgrep)
 * 4. Classify relationships and return results
 * 
 * @param filePath - Absolute path to the file containing the symbol
 * @param symbol - The symbol name to trace
 * @param workDir - Working directory (base path for searches)
 * @returns Relationship result with related files
 */
export async function findRelatedFiles(
  filePath: string,
  symbol: string,
  workDir: string
): Promise<RelationshipResult> {
  const result: RelationshipResult = {
    source_file: filePath,
    related: [],
    symbol,
  };

  try {
    // Ensure TreeSitter is initialized
    await treeSitterCore.init();

    // Step 1: Check if symbol is exported from the source file
    let isExported = false;
    try {
      const fileContent = await readFile(filePath, 'utf-8');
      const tree = await treeSitterCore.parse(fileContent, filePath);
      const symbols = treeSitterCore.getSymbols(tree, filePath);
      isExported = symbols.some(
        s => s.name === symbol && s.exported
      );
    } catch (error) {
      // TreeSitter parsing failed - gracefully degrade
      // We'll continue with ripgrep-only approach
    }

    // Step 2: Find files that import from this file
    // We need to handle various import patterns:
    // - import { symbol } from './file'
    // - import * as name from './file'
    // - const { symbol } = require('./file')
    const relativePath = path.relative(workDir, filePath);
    const fileBaseName = path.basename(filePath, path.extname(filePath));
    
    // Escape special regex characters to prevent injection
    const escapedSymbol = escapeRegex(symbol);
    const escapedFileBaseName = escapeRegex(fileBaseName);
    
    // Build import pattern - match various import styles
    const importPatterns = [
      // ESM named imports: import { symbol } from './file'
      `import\\s+\\{[^}]*\\b${escapedSymbol}\\b[^}]*\\}\\s+from\\s+['\"].*${escapedFileBaseName}`,
      // ESM namespace imports: import * as name from './file'
      `import\\s+\\*\\s+as\\s+\\w+\\s+from\\s+['\"].*${escapedFileBaseName}`,
      // CJS require: const { symbol } = require('./file')
      `require\\s*\\(['\"].*${escapedFileBaseName}`,
    ];

    for (const pattern of importPatterns) {
      try {
        const importResult = await ripgrepCore.search({
          pattern,
          path: workDir,
          glob: '**/*.{ts,tsx,js,jsx,mts,cts,mjs,cjs}',
          maxCount: 100,
        });

        for (const match of importResult.matches) {
          const matchFile = path.resolve(workDir, match.file);
          // Skip if it's the source file itself
          if (matchFile === filePath) continue;

          // Check if this file is already in results
          const existingIndex = result.related.findIndex(
            r => r.file === matchFile
          );

          if (existingIndex === -1) {
            result.related.push({
              file: matchFile,
              relationship: 'imports',
              symbol,
              line: match.line,
            });
          }
        }
      } catch (error) {
        // Ripgrep error (e.g., no matches) - continue to next pattern
      }
    }

    // Step 3: Find files that export the same symbol
    // This helps identify:
    // - Re-exports: export { symbol } from './file'
    // - Alternative definitions: export function symbol() {}
    if (isExported) {
      try {
        // Pattern for exports
        const exportPattern = `export\\s+(const|let|var|function|class|interface|type|enum)\\s+${escapedSymbol}\\b|export\\s+\\{[^}]*\\b${escapedSymbol}\\b`;
        
        const exportResult = await ripgrepCore.search({
          pattern: exportPattern,
          path: workDir,
          glob: '**/*.{ts,tsx,js,jsx,mts,cts,mjs,cjs}',
          maxCount: 100,
        });

        for (const match of exportResult.matches) {
          const matchFile = path.resolve(workDir, match.file);
          // Skip if it's the source file itself
          if (matchFile === filePath) continue;

          // Skip if already added as import
          const existingIndex = result.related.findIndex(
            r => r.file === matchFile
          );

          if (existingIndex === -1) {
            // Determine if it's a re-export or independent export
            // Check if the line contains "from" keyword
            const isReexport = /\bfrom\b/.test(match.lineContent);

            result.related.push({
              file: matchFile,
              relationship: isReexport ? 're-exports' : 'exports',
              symbol,
              line: match.line,
            });
          }
        }
      } catch (error) {
        // Ripgrep error (e.g., no matches) - that's okay
      }
    }

    return result;
  } catch (error) {
    // Unexpected error - return partial results
    return result;
  }
}
