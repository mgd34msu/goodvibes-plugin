/**
 * Context intelligence for precision_read.
 * Enriches file reads with memory and pattern information.
 */

import { readFileSync, statSync } from 'fs';
import { join, dirname } from 'path';
import { FileTypeInfo } from './file-type-detection.js';

export interface ContextMetadata {
  file_type: FileTypeInfo;
  related_memory?: RelatedMemoryEntry[];
  related_patterns?: string[];
}

interface RelatedMemoryEntry {
  source: string;    // e.g., 'decisions', 'patterns', 'failures'
  id: string;
  summary: string;
  relevance: 'high' | 'medium' | 'low';
}

interface MemoryDecision {
  id: string;
  what: string;
  why: string;
  category?: string;
  scope?: string[];
  keywords?: string[];
}

interface MemoryPattern {
  id: string;
  pattern: string;
  files?: string[];
  description?: string;
  keywords?: string[];
}

interface MemoryFailure {
  id: string;
  operation: string;
  error: string;
  resolution?: string;
  keywords?: string[];
}

// Module-level set tracking which categories have sent full context (Item 3 M2)
const sentCategories = new Set<string>();

/**
 * Reset context tracking (for testing or session reset).
 */
export function resetContextTracking(): void {
  sentCategories.clear();
}

/**
 * Extract keywords from file path for matching.
 */
// Stopwords to filter out common but non-meaningful directory/file names (Item 3 m5)
const KEYWORD_STOPWORDS = new Set([
  'src', 'lib', 'dist', 'build', 'index', 'app', 'main',
  'node_modules', 'test', 'tests', 'spec', 'tmp', 'temp',
  'out', 'bin', 'obj', 'var', 'log', 'logs', 'utils', 'util'
]);

function extractKeywords(filePath: string): Set<string> {
  const keywords = new Set<string>();
  const parts = filePath.split('/').filter(Boolean);
  
  for (const part of parts) {
    // Add directory names
    const lowerPart = part.toLowerCase();
    if (!KEYWORD_STOPWORDS.has(lowerPart)) {
      keywords.add(lowerPart);
    }
    
    // Add filename without extension
    const nameWithoutExt = part.replace(/\.[^.]+$/, '');
    const lowerName = nameWithoutExt.toLowerCase();
    if (!KEYWORD_STOPWORDS.has(lowerName)) {
      keywords.add(lowerName);
    }
    
    // Add individual words from kebab/snake/camel case
    const words = nameWithoutExt.split(/[-_]|(?=[A-Z])/);
    for (const word of words) {
      const lowerWord = word.toLowerCase();
      if (word.length > 2 && !KEYWORD_STOPWORDS.has(lowerWord)) {
        keywords.add(lowerWord);
      }
    }
  }
  
  return keywords;
}

/**
 * Calculate keyword overlap relevance.
 */
function calculateRelevance(fileKeywords: Set<string>, entryKeywords: string[]): 'high' | 'medium' | 'low' {
  if (!entryKeywords || entryKeywords.length === 0) {
    return 'low';
  }
  
  const matches = entryKeywords.filter(k => fileKeywords.has(k.toLowerCase())).length;
  const ratio = matches / entryKeywords.length;
  
  if (ratio >= 0.5) return 'high';
  if (ratio >= 0.2) return 'medium';
  return 'low';
}

// Memory file caching to avoid repeated disk reads (Item 3 m4)
interface MemoryCache {
  decisions: MemoryDecision[];
  patterns: MemoryPattern[];
  failures: MemoryFailure[];
  loadedAt: number;
}

let memoryCache: MemoryCache | null = null;
const MEMORY_CACHE_TTL_MS = 30000; // 30 seconds

/**
 * Load memory files with 30-second TTL caching.
 */
function loadMemoryFiles(memoryDir: string): MemoryCache {
  const now = Date.now();
  if (memoryCache && (now - memoryCache.loadedAt) < MEMORY_CACHE_TTL_MS) {
    return memoryCache;
  }

  const decisions: MemoryDecision[] = [];
  const patterns: MemoryPattern[] = [];
  const failures: MemoryFailure[] = [];

  // Read decisions.json
  try {
    const decisionsPath = join(memoryDir, 'decisions.json');
    const decisionsData = JSON.parse(readFileSync(decisionsPath, 'utf-8'));
    decisions.push(...(decisionsData.entries || []));
  } catch {
    // File may not exist or be malformed
  }

  // Read patterns.json
  try {
    const patternsPath = join(memoryDir, 'patterns.json');
    const patternsData = JSON.parse(readFileSync(patternsPath, 'utf-8'));
    patterns.push(...(patternsData.entries || []));
  } catch {
    // File may not exist or be malformed
  }

  // Read failures.json
  try {
    const failuresPath = join(memoryDir, 'failures.json');
    const failuresData = JSON.parse(readFileSync(failuresPath, 'utf-8'));
    failures.push(...(failuresData.entries || []));
  } catch {
    // File may not exist or be malformed
  }

  memoryCache = { decisions, patterns, failures, loadedAt: now };
  return memoryCache;
}

/**
 * Find project root by looking for .goodvibes directory.
 */
function findProjectRoot(startPath: string): string | null {
  let current = dirname(startPath);
  let previous = '';
  
  while (current !== previous) {
    try {
      const goodvibesPath = join(current, '.goodvibes');
      const stat = statSync(goodvibesPath);
      if (stat.isDirectory()) {
        return current;
      }
    } catch {
      // Continue searching
    }
    
    previous = current;
    current = dirname(current);
  }
  
  return null;
}

/**
 * Get context metadata for a file.
 */
export async function getContextForFile(
  filePath: string,
  fileType: FileTypeInfo,
  workDir: string
): Promise<ContextMetadata> {
  // Progressive loading (Item 3 M2): first read sends full context, subsequent reads send only file_type
  if (sentCategories.has(fileType.category)) {
    return {
      file_type: fileType,
    };
  }

  const context: ContextMetadata = {
    file_type: fileType,
  };

  // Find project root
  const projectRoot = findProjectRoot(filePath) || workDir;
  const memoryDir = join(projectRoot, '.goodvibes', 'memory');
  
  // Extract keywords from file path
  const fileKeywords = extractKeywords(filePath);
  
  // Add file type category to keywords
  fileKeywords.add(fileType.category.toLowerCase());
  if (fileType.framework) {
    fileKeywords.add(fileType.framework.toLowerCase());
  }
  
  const relatedMemory: RelatedMemoryEntry[] = [];
  
  // Layer 2: Memory lookup using cached memory files (Item 3 m4)
  const memory = loadMemoryFiles(memoryDir);
  
  // Check decisions
  for (const decision of memory.decisions) {
    const keywords = decision.keywords || [];
    const relevance = calculateRelevance(fileKeywords, keywords);
    
    if (relevance === 'high' || relevance === 'medium') {
      relatedMemory.push({
        source: 'decisions',
        id: decision.id,
        summary: `${decision.what}: ${decision.why}`,
        relevance,
      });
    }
  }
  
  // Check patterns
  for (const pattern of memory.patterns) {
    const keywords = pattern.keywords || [];
    const relevance = calculateRelevance(fileKeywords, keywords);
    
    if (relevance === 'high' || relevance === 'medium') {
      relatedMemory.push({
        source: 'patterns',
        id: pattern.id,
        summary: pattern.pattern,
        relevance,
      });
    }
  }
  
  // Check failures
  for (const failure of memory.failures) {
    const keywords = failure.keywords || [];
    const relevance = calculateRelevance(fileKeywords, keywords);
    
    if (relevance === 'high' || relevance === 'medium') {
      relatedMemory.push({
        source: 'failures',
        id: failure.id,
        summary: `${failure.operation}: ${failure.error}${failure.resolution ? ` → ${failure.resolution}` : ''}`,
        relevance,
      });
    }
  }
  
  // Sort by relevance (high first) and limit to top 3
  relatedMemory.sort((a, b) => {
    const order = { high: 0, medium: 1, low: 2 };
    return order[a.relevance] - order[b.relevance];
  });
  
  if (relatedMemory.length > 0) {
    context.related_memory = relatedMemory.slice(0, 3);
  }
  
  // Layer 3: Registry skill lookup
  // TODO: Add registry skill lookup when cross-MCP communication is available
  // For now, we could scan registry data files directly if needed
  
  // Mark this category as sent for progressive loading (Item 3 M2)
  sentCategories.add(fileType.category);
  
  return context;
}
