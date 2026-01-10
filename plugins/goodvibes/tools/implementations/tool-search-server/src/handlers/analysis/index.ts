/**
 * Analysis Tools
 *
 * Provides tools for profiling and analyzing code performance:
 * - Function profiling with timing statistics
 * - Memory usage tracking
 * - Statistical analysis (mean, median, percentiles)
 * - Log file and command output analysis
 * - Pattern detection and anomaly identification
 */

// Profile Function
export { handleProfileFunction } from './profile-function.js';
export type {
  ProfileFunctionArgs,
  ProfileFunctionResult,
  TimingStats,
  MemoryStats,
} from './profile-function.js';

// Log Analyzer
export { handleLogAnalyzer } from './log-analyzer.js';
export type { LogAnalyzerArgs, LogAnalyzerResult } from './log-analyzer.js';

// Generate Types
export { handleGenerateTypes } from './generate-types.js';
export type { GenerateTypesArgs, GenerateTypesResult } from './generate-types.js';

// Memory Leak Detection
export { handleDetectMemoryLeaks } from './detect-memory-leaks.js';
export type {
  DetectMemoryLeaksArgs,
  DetectMemoryLeaksResult,
  MemorySnapshot,
  MemoryAnalysis,
  LinearRegressionResult,
  LeakSuspect,
} from './detect-memory-leaks.js';

// Tech Debt Analysis
export { handleIdentifyTechDebt } from './identify-tech-debt.js';
export type {
  IdentifyTechDebtArgs,
  TechDebtCategory,
  TechDebtGrade,
  IssueSeverity,
  EffortEstimate,
} from './identify-tech-debt.js';
