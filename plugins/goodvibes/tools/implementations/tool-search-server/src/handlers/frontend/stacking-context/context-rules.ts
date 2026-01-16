/**
 * Stacking Context Detection Rules
 *
 * Rules for detecting when CSS properties create new stacking contexts.
 *
 * @module handlers/frontend/stacking-context/context-rules
 */

// =============================================================================
// Stacking Context Detection Rules
// =============================================================================

/**
 * Rules for detecting stacking context creation.
 * Each rule takes an array of CSS classes and returns whether
 * the combination creates a new stacking context.
 */
export const CONTEXT_CREATORS: Record<string, (classes: string[]) => boolean> = {
  /**
   * Position with z-index: relative/absolute/fixed/sticky + z-*
   */
  position_with_z: (classes: string[]) => {
    const hasPosition = classes.some((c) =>
      ['relative', 'absolute', 'fixed', 'sticky'].includes(c)
    );
    const hasZIndex = classes.some((c) => /^-?z-/.test(c));
    return hasPosition && hasZIndex;
  },

  /**
   * Fixed or sticky positioning always creates a stacking context
   */
  fixed_or_sticky: (classes: string[]) =>
    classes.includes('fixed') || classes.includes('sticky'),

  /**
   * Transform property creates a stacking context
   */
  transform: (classes: string[]) =>
    classes.some(
      (c) =>
        c.startsWith('transform') ||
        c.startsWith('rotate') ||
        c.startsWith('scale') ||
        c.startsWith('translate') ||
        c.startsWith('skew') ||
        c === '-translate-x-1/2' ||
        c === '-translate-y-1/2' ||
        /^-?(rotate|scale|translate|skew)-/.test(c)
    ),

  /**
   * Opacity less than 1 creates a stacking context
   * Matches opacity-0 through opacity-95 (not opacity-100)
   */
  opacity: (classes: string[]) =>
    classes.some((c) => {
      const match = c.match(/^opacity-(\d+)$/);
      if (!match) return false;
      const value = parseInt(match[1], 10);
      return value < 100;
    }),

  /**
   * Filter or backdrop-filter creates a stacking context
   */
  filter: (classes: string[]) =>
    classes.some(
      (c) =>
        c === 'filter' ||
        c.startsWith('blur-') ||
        c.startsWith('brightness-') ||
        c.startsWith('contrast-') ||
        c.startsWith('grayscale') ||
        c.startsWith('hue-rotate-') ||
        c.startsWith('invert') ||
        c.startsWith('saturate-') ||
        c.startsWith('sepia') ||
        c.startsWith('drop-shadow-') ||
        c.startsWith('backdrop-')
    ),

  /**
   * Isolation: isolate creates a stacking context
   */
  isolation: (classes: string[]) => classes.includes('isolate'),

  /**
   * will-change with transform or opacity creates a stacking context
   */
  will_change: (classes: string[]) =>
    classes.some((c) => c.startsWith('will-change-')),

  /**
   * CSS contain property with layout, paint, or strict
   */
  contain: (classes: string[]) => classes.some((c) => c.startsWith('contain-')),

  /**
   * Mix-blend-mode other than normal creates a stacking context
   */
  mix_blend: (classes: string[]) =>
    classes.some((c) => c.startsWith('mix-blend-') && c !== 'mix-blend-normal'),

  /**
   * Flex/Grid child with z-index creates a stacking context
   * (technically the parent needs to be flex/grid, but we detect the z-index usage)
   */
  flex_grid_z: (classes: string[]) => {
    const hasZIndex = classes.some((c) => /^-?z-/.test(c));
    // If it has z-index but no explicit position, could be in flex/grid context
    const hasPosition = classes.some((c) =>
      ['relative', 'absolute', 'fixed', 'sticky'].includes(c)
    );
    return hasZIndex && !hasPosition;
  },

  /**
   * Perspective creates a stacking context
   */
  perspective: (classes: string[]) =>
    classes.some((c) => c.startsWith('perspective-')),

  /**
   * Clip-path creates a stacking context
   */
  clip_path: (classes: string[]) =>
    classes.some((c) => c.startsWith('clip-') && c !== 'clip-content'),

  /**
   * Mask creates a stacking context
   */
  mask: (classes: string[]) =>
    classes.some((c) => c.startsWith('mask-') || c === 'mask'),
};

/**
 * Check if a set of classes creates a new stacking context
 * @param classes - Array of CSS class names
 * @returns Object with creates flag and optional reason
 */
export function createsStackingContext(classes: string[]): { creates: boolean; reason?: string } {
  for (const [name, check] of Object.entries(CONTEXT_CREATORS)) {
    if (check(classes)) {
      return { creates: true, reason: name.replace(/_/g, ' ') };
    }
  }
  return { creates: false };
}

// =============================================================================
// Z-Index Extraction
// =============================================================================

/**
 * Standard Tailwind z-index values
 */
export const TAILWIND_Z_INDEX_MAP: Record<string, number> = {
  'z-0': 0,
  'z-10': 10,
  'z-20': 20,
  'z-30': 30,
  'z-40': 40,
  'z-50': 50,
  'z-auto': NaN, // Special marker for "auto"
};

/**
 * Extract z-index value from CSS classes
 * @param classes - Array of CSS class names
 * @returns z-index value or "auto"
 */
export function extractZIndex(classes: string[]): number | 'auto' {
  // Look for z-* classes
  const zClass = classes.find((c) => /^-?z-/.test(c));
  if (!zClass) return 'auto';

  // Check for z-auto
  if (zClass === 'z-auto') return 'auto';

  // Check for standard Tailwind values
  if (TAILWIND_Z_INDEX_MAP[zClass] !== undefined) {
    return TAILWIND_Z_INDEX_MAP[zClass];
  }

  // Handle negative z-index
  const negativeMatch = zClass.match(/^-z-(\d+)$/);
  if (negativeMatch) {
    return -parseInt(negativeMatch[1], 10);
  }

  // Handle arbitrary values: z-[100], z-[9999]
  const arbitraryMatch = zClass.match(/^-?z-\[(-?\d+)\]$/);
  if (arbitraryMatch) {
    return parseInt(arbitraryMatch[1], 10);
  }

  // Handle numeric z-index: z-100, z-999
  const numericMatch = zClass.match(/^z-(\d+)$/);
  if (numericMatch) {
    return parseInt(numericMatch[1], 10);
  }

  return 'auto';
}
