import { rankBySimilarity } from './fuzzy.js';
import { promises as fs } from 'fs';
import { basename, dirname, extname, join } from 'path';

export interface FileSuggestion {
  path: string;
  reason: string;
  confidence: 'high' | 'medium' | 'low';
}

/**
 * Generate file suggestions when a requested file is not found.
 * Two-layer suggestion system:
 *   Layer 1: Common mistakes (missing extension, wrong extension, index files)
 *   Layer 2: Directory listing with fuzzy matching (Levenshtein similarity)
 * Zero overhead — only called on file-not-found errors.
 */
export async function getFileSuggestions(
  requestedPath: string,
  maxSuggestions: number = 5
): Promise<FileSuggestion[]> {
  const suggestions: FileSuggestion[] = [];
  const dir = dirname(requestedPath);
  const base = basename(requestedPath);
  const ext = extname(requestedPath);
  
  // Layer 1: Common mistakes
  await checkCommonMistakes(requestedPath, dir, base, ext, suggestions);
  
  // Layer 2: Directory listing with fuzzy match
  await checkDirectoryListing(requestedPath, dir, base, suggestions);
  
  // Deduplicate and limit
  const seen = new Set<string>();
  return suggestions
    .filter(s => {
      if (seen.has(s.path)) return false;
      seen.add(s.path);
      return true;
    })
    .slice(0, maxSuggestions);
}

async function checkCommonMistakes(
  requested: string, dir: string, base: string, ext: string,
  suggestions: FileSuggestion[]
): Promise<void> {
  const commonExts = ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.json', '.md'];
  
  // Missing extension
  if (!ext) {
    for (const testExt of commonExts) {
      const testPath = requested + testExt;
      if (await fileExists(testPath)) {
        suggestions.push({
          path: testPath,
          reason: `missing extension (added ${testExt})`,
          confidence: 'high'
        });
      }
    }
  }
  
  // Wrong extension (e.g., .ts vs .tsx)
  if (ext) {
    const swaps: Record<string, string[]> = {
      '.ts': ['.tsx', '.js', '.jsx'],
      '.tsx': ['.ts', '.jsx', '.js'],
      '.js': ['.ts', '.jsx', '.tsx', '.mjs', '.cjs'],
      '.jsx': ['.tsx', '.js', '.ts'],
    };
    for (const altExt of (swaps[ext] || [])) {
      const testPath = requested.replace(ext, altExt);
      if (await fileExists(testPath)) {
        suggestions.push({
          path: testPath,
          reason: `wrong extension (${ext} → ${altExt})`,
          confidence: 'high'
        });
      }
    }
  }
  
  // Index file in directory (e.g., utils → utils/index.ts)
  const baseNoExt = base.replace(ext, '');
  for (const testExt of commonExts) {
    const indexPath = join(dir, baseNoExt, 'index' + testExt);
    if (await fileExists(indexPath)) {
      suggestions.push({
        path: indexPath,
        reason: 'directory with index file',
        confidence: 'medium'
      });
    }
  }
}

async function checkDirectoryListing(
  requested: string, dir: string, base: string,
  suggestions: FileSuggestion[]
): Promise<void> {
  try {
    const entries = await fs.readdir(dir);
    const ranked = rankBySimilarity(base, entries, 0.4);
    for (const match of ranked.slice(0, 3)) {
      suggestions.push({
        path: join(dir, match.path),
        reason: `similar name (${Math.round(match.similarity * 100)}% match)`,
        confidence: match.similarity > 0.7 ? 'medium' : 'low'
      });
    }
  } catch {
    // Directory doesn't exist or not readable — skip
  }
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}
