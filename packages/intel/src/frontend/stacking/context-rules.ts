/**
 * Stacking context detection rules — Lane 4.
 * Ported from frontend-engine `core/stacking/context-rules.ts` and extended with
 * {@link allStackingTriggers} — the tribunal "all context-creation triggers per
 * element" enhancement (§4.4.2). The v1 `createsStackingContext` returned only the
 * FIRST matching trigger; `allStackingTriggers` returns every one.
 *
 * @module frontend/stacking/context-rules
 */

/** Class-set predicates that each create a new stacking context. */
export const CONTEXT_CREATORS: Record<string, (classes: string[]) => boolean> = {
  position_with_z: (classes) => {
    const hasPosition = classes.some((c) => ['relative', 'absolute', 'fixed', 'sticky'].includes(c));
    const hasZIndex = classes.some((c) => /^-?z-/.test(c));
    return hasPosition && hasZIndex;
  },
  fixed_or_sticky: (classes) => classes.includes('fixed') || classes.includes('sticky'),
  transform: (classes) =>
    classes.some(
      (c) =>
        c.startsWith('transform') || c.startsWith('rotate') || c.startsWith('scale') ||
        c.startsWith('translate') || c.startsWith('skew') ||
        c === '-translate-x-1/2' || c === '-translate-y-1/2' ||
        /^-?(rotate|scale|translate|skew)-/.test(c),
    ),
  opacity: (classes) =>
    classes.some((c) => {
      const match = c.match(/^opacity-(\d+)$/);
      if (!match) {return false;}
      return parseInt(match[1], 10) < 100;
    }),
  filter: (classes) =>
    classes.some(
      (c) =>
        c === 'filter' || c.startsWith('blur-') || c.startsWith('brightness-') ||
        c.startsWith('contrast-') || c.startsWith('grayscale') || c.startsWith('hue-rotate-') ||
        c.startsWith('invert') || c.startsWith('saturate-') || c.startsWith('sepia') ||
        c.startsWith('drop-shadow-') || c.startsWith('backdrop-'),
    ),
  isolation: (classes) => classes.includes('isolate'),
  will_change: (classes) => classes.some((c) => c.startsWith('will-change-')),
  contain: (classes) => classes.some((c) => c.startsWith('contain-')),
  mix_blend: (classes) => classes.some((c) => c.startsWith('mix-blend-') && c !== 'mix-blend-normal'),
  perspective: (classes) => classes.some((c) => c.startsWith('perspective-')),
  clip_path: (classes) => classes.some((c) => c.startsWith('clip-') && c !== 'clip-content'),
  mask: (classes) => classes.some((c) => c.startsWith('mask-') || c === 'mask'),
};

function triggerLabel(name: string): string {
  return name === 'isolation' ? 'isolate' : name.replace(/_/g, ' ');
}

/** First matching trigger (kept for parity). */
export function createsStackingContext(classes: string[]): { creates: boolean; reason?: string } {
  for (const [name, check] of Object.entries(CONTEXT_CREATORS)) {
    if (check(classes)) {return { creates: true, reason: triggerLabel(name) };}
  }
  return { creates: false };
}

/** ALL matching triggers for an element (the §4.4.2 all-triggers enhancement). */
export function allStackingTriggers(classes: string[]): string[] {
  const triggers: string[] = [];
  for (const [name, check] of Object.entries(CONTEXT_CREATORS)) {
    if (check(classes)) {triggers.push(triggerLabel(name));}
  }
  return triggers;
}

/** Extract the position type from classes. */
export function extractPosition(classes: string[]): 'relative' | 'absolute' | 'fixed' | 'sticky' | 'static' {
  if (classes.includes('fixed')) {return 'fixed';}
  if (classes.includes('absolute')) {return 'absolute';}
  if (classes.includes('sticky')) {return 'sticky';}
  if (classes.includes('relative')) {return 'relative';}
  return 'static';
}

const TAILWIND_Z_INDEX_MAP: Record<string, number> = {
  'z-0': 0, 'z-10': 10, 'z-20': 20, 'z-30': 30, 'z-40': 40, 'z-50': 50,
};

/** Extract the z-index value from classes ('auto' when unset). */
export function extractZIndex(classes: string[]): number | 'auto' {
  const zClass = classes.find((c) => /^-?z-/.test(c));
  if (!zClass) {return 'auto';}
  if (zClass === 'z-auto') {return 'auto';}
  if (TAILWIND_Z_INDEX_MAP[zClass] !== undefined) {return TAILWIND_Z_INDEX_MAP[zClass];}
  const negativeMatch = zClass.match(/^-z-(\d+)$/);
  if (negativeMatch) {return -parseInt(negativeMatch[1], 10);}
  const arbitraryMatch = zClass.match(/^-?z-\[(-?\d+)\]$/);
  if (arbitraryMatch) {return parseInt(arbitraryMatch[1], 10);}
  const numericMatch = zClass.match(/^z-(\d+)$/);
  if (numericMatch) {return parseInt(numericMatch[1], 10);}
  return 'auto';
}
