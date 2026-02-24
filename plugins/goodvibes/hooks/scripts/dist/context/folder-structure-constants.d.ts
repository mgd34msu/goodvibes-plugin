/**
 * Constants for folder structure pattern detection.
 */
/** Directories that indicate a layer-based architecture. */
export declare const LAYER_INDICATORS: string[];
/** Directories that indicate a feature-based architecture. */
export declare const FEATURE_INDICATORS: string[];
/** Directories that indicate an atomic design architecture. */
export declare const ATOMIC_INDICATORS: string[];
/** Directories that indicate domain-driven design architecture. */
export declare const DDD_INDICATORS: string[];
/** Minimum indicator matches for pattern detection. */
export declare const MIN_INDICATOR_MATCH = 2;
/** Minimum matches for high confidence pattern detection. */
export declare const HIGH_CONFIDENCE_THRESHOLD = 3;
/** Maximum folder depth to traverse. */
export declare const DEFAULT_MAX_DEPTH = 5;
/** Minimum top-level directories before considering structure flat. */
export declare const FLAT_STRUCTURE_THRESHOLD = 3;
