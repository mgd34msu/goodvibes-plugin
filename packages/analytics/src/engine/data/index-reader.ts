/**
 * IndexReader - Reads precision-engine's project index file.
 *
 * The index lives at .goodvibes/project-index.json (v4 format).
 * IndexReader caches the parsed result and invalidates on file mtime change,
 * so repeated calls within the same filesystem tick are free.
 */

import { readFileSync, statSync, existsSync } from 'fs';
import * as path from 'path';
import type { ProjectIndex } from '../types.js';

export class IndexReader {
  private readonly indexPath: string;

  /** Parsed index, null if unread or unavailable. */
  private cache: ProjectIndex | null = null;

  /** Mtime (ms) of the file when it was last parsed. */
  private cacheMtime: number = -1;

  constructor(goodvibesDir: string) {
    this.indexPath = path.join(goodvibesDir, 'project-index.json');
  }

  /**
   * Read the current project index, using a cached copy when the file
   * has not been modified since the last read.
   * Returns null if the index file does not exist or cannot be parsed.
   */
  read(): ProjectIndex | null {
    if (!existsSync(this.indexPath)) {
      this.cache = null;
      this.cacheMtime = -1;
      return null;
    }

    try {
      const mtime = statSync(this.indexPath).mtimeMs;
      if (this.cache !== null && mtime === this.cacheMtime) {
        return this.cache;
      }

      const raw = readFileSync(this.indexPath, 'utf-8');
      const parsed = JSON.parse(raw) as ProjectIndex;

      // Only accept v4 format; silently reject others.
      if (!parsed || parsed.version !== 4) {
        this.cache = null;
        this.cacheMtime = mtime;
        return null;
      }

      this.cache = parsed;
      this.cacheMtime = mtime;
      return this.cache;
    } catch {
      this.cache = null;
      return null;
    }
  }

  /**
   * Returns true when the project-index.json file exists on disk.
   */
  isAvailable(): boolean {
    return existsSync(this.indexPath);
  }

  /**
   * Total file count from the index stats block.
   * Returns 0 if the index is unavailable.
   */
  getTotalFiles(): number {
    return this.read()?.stats.total_files ?? 0;
  }

  /**
   * Total estimated token count, summed across all files in the tree.
   * Returns 0 if the index is unavailable.
   */
  getTotalTokens(): number {
    const index = this.read();
    if (!index) {return 0;}

    let total = 0;
    for (const files of Object.values(index.tree)) {
      for (const tokens of Object.values(files)) {
        total += tokens;
      }
    }
    return total;
  }

  /**
   * File count broken down by extension category.
   * Extension categories match the precision-engine's categorizeFileType output:
   * ts, js, json, md, css, html, py, go, rs, yaml, other.
   *
   * Returns an empty object if the index is unavailable.
   */
  getTypeCounts(): Record<string, number> {
    const index = this.read();
    if (!index) {return {};}

    const counts: Record<string, number> = {};
    for (const files of Object.values(index.tree)) {
      for (const filename of Object.keys(files)) {
        const ext = path.extname(filename).toLowerCase().slice(1);
        const type = extToCategory(ext);
        counts[type] = (counts[type] ?? 0) + 1;
      }
    }
    return counts;
  }

  /**
   * Return the top N files sorted descending by token count.
   * Each entry contains the full relative path and its token count.
   * Returns an empty array if the index is unavailable or n <= 0.
   */
  getLargestFiles(n: number): Array<{ path: string; tokens: number }> {
    if (n <= 0) {return [];}

    const index = this.read();
    if (!index) {return [];}

    const entries: Array<{ path: string; tokens: number }> = [];
    for (const [dir, files] of Object.entries(index.tree)) {
      for (const [filename, tokens] of Object.entries(files)) {
        const filePath = dir ? `${dir}/${filename}` : filename;
        entries.push({ path: filePath, tokens });
      }
    }

    // Sort descending by tokens, then ascending by path for determinism.
    entries.sort((a, b) => b.tokens - a.tokens || a.path.localeCompare(b.path));
    return entries.slice(0, n);
  }
}

// ---------------------------------------------------------------------------
// Extension categorisation (mirrors precision-engine's categorizeFileType)
// ---------------------------------------------------------------------------

function extToCategory(ext: string): string {
  switch (ext) {
    case 'ts':
    case 'tsx':
      return 'ts';
    case 'js':
    case 'jsx':
    case 'mjs':
    case 'cjs':
      return 'js';
    case 'json':
      return 'json';
    case 'md':
    case 'mdx':
      return 'md';
    case 'css':
    case 'scss':
    case 'less':
      return 'css';
    case 'html':
    case 'htm':
      return 'html';
    case 'py':
      return 'py';
    case 'go':
      return 'go';
    case 'rs':
      return 'rs';
    case 'yaml':
    case 'yml':
      return 'yaml';
    default:
      return 'other';
  }
}
