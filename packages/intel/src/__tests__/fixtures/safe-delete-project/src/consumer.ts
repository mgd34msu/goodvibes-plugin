import { shared } from './target';

// This comment mentions countdown, and so does the string below, but neither is
// a real reference. Only the TypeScript compiler (not a text scan) knows that.
const note = 'the countdown label mentions countdown but never calls it';

/** Calls `shared` for real, unlike the string above. */
export function useShared(): string {
  return shared() + note;
}
