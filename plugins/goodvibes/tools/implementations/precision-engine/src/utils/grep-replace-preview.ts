/**
 * Find-and-replace preview functionality for precision_grep.
 * 
 * Generates dry-run previews showing what a find-and-replace would look like
 * across multiple files without actually writing changes.
 */

/**
 * A single replacement match within a file.
 */
export interface ReplacePreviewMatch {
  /** The file path where the match was found */
  file: string;
  /** Line number where the match occurs (1-based) */
  line: number;
  /** Original line content before replacement */
  original: string;
  /** Modified line content after replacement */
  replaced: string;
  /** Unified diff format showing the change (contains actual newline between -old and +new lines) */
  diff: string;
  /** Optional warning when fallback replacement method was used */
  warning?: string;
}

/**
 * Complete preview result for a find-and-replace operation.
 */
export interface ReplacePreviewResult {
  /** Array of all replacement matches across files */
  matches: ReplacePreviewMatch[];
  /** Total number of replacements that would be made */
  total_replacements: number;
  /** Number of unique files that would be affected */
  files_affected: number;
  /** Hint for applying changes using precision_edit */
  hint: string;
}

/**
 * Minimal match interface - any match object with these required fields.
 */
interface MinimalMatch {
  line: number;
  content?: string;
  highlight?: [number, number];
}

/**
 * Minimal file result interface - any file result with these required fields.
 */
interface MinimalFileResult {
  file: string;
  matches?: MinimalMatch[];
  match_count?: number;
}

/**
 * Escapes special regex characters in a string for literal matching.
 */
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Generates a unified diff line for a single replacement.
 */
function generateDiffLine(before: string, after: string): string {
  return `-${before}\n+${after}`;
}

/**
 * Applies replacement to a line based on highlight range or full-line regex.
 * 
 * @param content - Original line content
 * @param searchPattern - The pattern to search for (regex string)
 * @param replaceString - The replacement string (supports $1, $2, etc. for captures)
 * @param highlight - Optional [start, end] character indices to replace
 * @returns Tuple of [modified line content, optional warning message]
 */
function applyReplacement(
  content: string,
  searchPattern: string,
  replaceString: string,
  highlight?: [number, number]
): [string, string | undefined] {
  // If highlight is provided, replace only that specific portion
  if (highlight && highlight.length === 2) {
    const [start, end] = highlight;
    
    // Validate indices
    if (start < 0 || end > content.length || start >= end) {
      // Invalid highlight - fall back to regex replacement
      try {
        const regex = new RegExp(searchPattern, 'g');
        return [content.replace(regex, replaceString), 'Invalid highlight range, used regex fallback'];
      } catch (err) {
        // If regex fails, do literal replacement
        return [content.replace(searchPattern, replaceString), 'Invalid highlight range, used literal replacement fallback'];
      }
    }
    
    // Replace the highlighted portion
    const before = content.substring(0, start);
    const matched = content.substring(start, end);
    const after = content.substring(end);
    
    // Try to apply regex replacement to matched portion
    try {
      const regex = new RegExp(searchPattern);
      const replaced = matched.replace(regex, replaceString);
      return [before + replaced + after, undefined];
    } catch (err) {
      // Fall back to literal replacement of the highlighted portion
      return [before + replaceString + after, 'Regex compilation failed, used literal replacement fallback'];
    }
  }
  
  // No highlight - apply regex replacement to full line
  try {
    const regex = new RegExp(searchPattern, 'g');
    return [content.replace(regex, replaceString), undefined];
  } catch (err) {
    // If regex compilation fails, try literal replacement
    const escapedPattern = escapeRegex(searchPattern);
    try {
      const regex = new RegExp(escapedPattern, 'g');
      return [content.replace(regex, replaceString), 'Regex compilation failed, used escaped pattern fallback'];
    } catch {
      // Last resort: simple string replacement
      return [content.split(searchPattern).join(replaceString), 'Regex compilation failed, used simple string replacement fallback'];
    }
  }
}

/**
 * Generates a preview of what a find-and-replace operation would look like.
 * 
 * @param files - Array of file results from precision_grep
 * @param searchPattern - The regex pattern or literal string to search for
 * @param replaceString - The replacement string (supports regex capture groups)
 * @returns Preview result showing all replacements that would be made
 */
export function generateReplacePreview(
  files: MinimalFileResult[],
  searchPattern: string,
  replaceString: string
): ReplacePreviewResult {
  const matches: ReplacePreviewMatch[] = [];
  const affectedFiles = new Set<string>();
  
  // Process each file
  for (const fileResult of files) {
    const { file, matches: fileMatches } = fileResult;
    
    // Skip files without matches or content
    if (!fileMatches || fileMatches.length === 0) {
      continue;
    }
    
    // Process each match in the file
    for (const match of fileMatches) {
      const { line, content, highlight } = match;
      
      // Skip matches without content - can't preview replacement
      if (!content) {
        continue;
      }
      
      // Apply the replacement
      const [modifiedContent, warning] = applyReplacement(
        content,
        searchPattern,
        replaceString,
        highlight
      );
      
      // Only add if content actually changed
      if (modifiedContent !== content) {
        matches.push({
          file,
          line,
          original: content,
          replaced: modifiedContent,
          diff: generateDiffLine(content, modifiedContent),
          ...(warning && { warning }),
        });
        
        affectedFiles.add(file);
      }
    }
  }
  
  // Generate hint for applying changes
  const hint = matches.length > 0
    ? `To apply: use precision_edit with find: ${JSON.stringify(searchPattern)}, replace: ${JSON.stringify(replaceString)}, occurrence: 'all'`
    : 'No replacements would be made (pattern not found or no content available)';
  
  return {
    matches,
    total_replacements: matches.length,
    files_affected: affectedFiles.size,
    hint,
  };
}
