/**
 * Constants for folder structure pattern detection.
 */

/** Directories that indicate a layer-based architecture. */
export const LAYER_INDICATORS = [
  'controllers',
  'services',
  'repositories',
  'models',
  'middleware',
  'routes',
];

/** Directories that indicate a feature-based architecture. */
export const FEATURE_INDICATORS = ['features', 'modules', 'domains'];

/** Directories that indicate an atomic design architecture. */
export const ATOMIC_INDICATORS = ['atoms', 'molecules', 'organisms', 'templates'];

/** Directories that indicate domain-driven design architecture. */
export const DDD_INDICATORS = [
  'domain',
  'infrastructure',
  'application',
  'aggregates',
  'entities',
  'value-objects',
];

/** Minimum indicator matches for pattern detection. */
export const MIN_INDICATOR_MATCH = 2;

/** Minimum matches for high confidence pattern detection. */
export const HIGH_CONFIDENCE_THRESHOLD = 3;

/** Maximum folder depth to traverse. */
export const DEFAULT_MAX_DEPTH = 5;

/** Minimum top-level directories before considering structure flat. */
export const FLAT_STRUCTURE_THRESHOLD = 3;
