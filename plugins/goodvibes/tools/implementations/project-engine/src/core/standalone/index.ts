/**
 * Standalone Domain — L1 Core Barrel
 *
 * @module core/standalone
 */

export type {
  BundleFormat,
  AnalyzeBundleArgs,
  SizeInfo,
  ChunkInfo,
  ModuleInfo,
  DuplicateInfo,
  BundleAnalysis,
  ScaffoldProjectArgs,
} from './types.js';

export {
  extractModules,
  extractPackageName,
  generateBundleRecommendations,
  generatePackageAlternativeMessages,
} from './bundle-parser.js';
