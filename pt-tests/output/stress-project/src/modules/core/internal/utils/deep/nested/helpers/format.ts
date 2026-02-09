/**
 * Deeply nested formatting utility
 * 
 * This file tests directory creation at 8+ levels deep
 */

export interface FormatOptions {
  indent?: number;
  lineWidth?: number;
  preserveWhitespace?: boolean;
  trimTrailing?: boolean;
}

/**
 * Format a string with specified options
 */
export function format(input: string, options: FormatOptions = {}): string {
  const {
    indent = 2,
    lineWidth = 80,
    preserveWhitespace = false,
    trimTrailing = true,
  } = options;

  let result = input;

  if (!preserveWhitespace) {
    result = result.replace(/\s+/g, ' ');
  }

  if (trimTrailing) {
    result = result.replace(/\s+$/gm, '');
  }

  // Word wrap to line width
  if (lineWidth > 0) {
    const words = result.split(' ');
    const lines: string[] = [];
    let currentLine = '';

    for (const word of words) {
      if (currentLine.length + word.length + 1 > lineWidth) {
        lines.push(currentLine.trim());
        currentLine = word;
      } else {
        currentLine += (currentLine ? ' ' : '') + word;
      }
    }

    if (currentLine) {
      lines.push(currentLine.trim());
    }

    result = lines.join('\n');
  }

  // Apply indentation
  if (indent > 0) {
    const indentStr = ' '.repeat(indent);
    result = result.split('\n').map(line => indentStr + line).join('\n');
  }

  return result;
}

/**
 * Format JSON with proper indentation
 */
export function formatJSON(obj: unknown, indent: number = 2): string {
  return JSON.stringify(obj, null, indent);
}

/**
 * Format a list with bullets
 */
export function formatList(items: string[], bullet: string = '•'): string {
  return items.map(item => `${bullet} ${item}`).join('\n');
}
