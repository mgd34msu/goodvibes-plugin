/**
 * Barrel export for core runtime utilities.
 *
 * @module core/runtime
 */

export type { LogAnalyzerArgs, LogAnalyzerResult, DetectMemoryLeaksArgs, MemorySnapshot, MemoryAnalysis, ProfileFunctionArgs, TimingStats } from './types.js';
export { TIMESTAMP_PATTERNS } from './constants.js';
export { parseTimeWindow } from './time-utils.js';
export type { ParsedLogEntry } from './log-parser.js';
export { detectLevel, parseTimestamp, extractTimestamp, detectStructured, parseLogLine, normalizeMessage } from './log-parser.js';
export type { GroupedMessage, Anomaly, RateAnalysis } from './log-analysis.js';
export { groupMessages, detectAnomalies, calculateRateAnalysis, matchPatterns } from './log-analysis.js';
export { isProcessAlive, getWindowsMemory, getUnixMemory, getProcessMemory, spawnCommand } from './process-utils.js';
export type { LinearRegressionResult, LeakSuspect } from './statistics.js';
export { linearRegression, analyzeMemoryTrend, generateLeakSuspects, generateMemoryRecommendations, calculateTimingStats } from './statistics.js';
export { extractFunction } from './profiler.js';
export type { ProfileResultShape } from './formatters.js';
export { formatLogAnalysis, formatProfileResult } from './formatters.js';
