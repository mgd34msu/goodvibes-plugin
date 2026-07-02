import { shared } from './target';

// This comment mentions countdown, and so does the string below — neither is a
// real reference. Only the TypeScript compiler (not a text scan) knows that.
const note = 'the countdown label mentions countdown but never calls it';

/** A genuine call site for `shared` — this is a real external reference. */
export function useShared(): string {
  return shared() + note;
}
