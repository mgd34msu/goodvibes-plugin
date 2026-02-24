import type { OutputFormat, SubagentSummary, BatchAnalysisResult, ComparisonResult, ExtendedCostAnalysisResult } from './types.js';
/**
 * Format output based on selected format
 */
export declare function formatOutput(result: ExtendedCostAnalysisResult, format: OutputFormat): string;
/**
 * Format subagent summary
 */
export declare function formatSubagentSummary(summary: SubagentSummary, format: OutputFormat): string;
/**
 * Format batch analysis
 */
export declare function formatBatchAnalysis(result: BatchAnalysisResult, format: OutputFormat): string;
/**
 * Format comparison analysis
 */
export declare function formatComparison(result: ComparisonResult, format: OutputFormat): string;
