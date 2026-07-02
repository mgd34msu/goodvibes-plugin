/**
 * Entry point / public API of the surface fixture. Everything declared+exported
 * here is the "public" surface; `internal.ts` exports are "internal".
 */

/** Adds one to its argument. */
export function publicFn(x: number): number {
  return x + 1;
}

/** A public value holder. */
export class PublicThing {
  value = 1;
}

/** A public shape. */
export interface PublicType {
  id: string;
}
