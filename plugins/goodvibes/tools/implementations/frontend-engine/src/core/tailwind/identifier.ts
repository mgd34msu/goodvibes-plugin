/**
 * Tailwind Element Identifier
 *
 * Creates human-readable element identifier strings from tag name, classes, and id.
 * Extracted from sizing-strategy-utils for reuse across the frontend-engine.
 *
 * @module core/tailwind/identifier
 */

// =============================================================================
// Element Identifier Helper
// =============================================================================

/**
 * Create element identifier string
 */
export function createElementIdentifier(tagName: string, classes: string[], id?: string): string {
  if (id) {
    return `${tagName}#${id}`;
  }
  if (classes.length > 0) {
    const layoutClasses = classes.filter(
      (c) =>
        c.startsWith('flex') ||
        c.startsWith('grid') ||
        c.startsWith('w-') ||
        c.startsWith('h-') ||
        c.startsWith('overflow') ||
        c === 'block' ||
        c === 'inline' ||
        c === 'hidden'
    );
    const identifierClasses = layoutClasses.length > 0 ? layoutClasses.slice(0, 3) : classes.slice(0, 2);
    return `${tagName}.${identifierClasses.join('.')}`;
  }
  return tagName;
}
