/**
 * Tool Comparison Module
 *
 * Calculates per-call metrics for tools and generates comparisons
 * between native and precision tool pairs.
 */
import { ToolStats, ToolMetrics, CategoryMetrics, HeadToHeadComparison, ComparisonResult } from './types.js';
export declare function calculateToolMetrics(tools: ToolStats[]): ToolMetrics[];
export declare function aggregateByCategory(metrics: ToolMetrics[]): CategoryMetrics[];
export declare function compareHeadToHead(metrics: ToolMetrics[]): HeadToHeadComparison[];
export declare function generateComparison(tools: ToolStats[]): ComparisonResult;
