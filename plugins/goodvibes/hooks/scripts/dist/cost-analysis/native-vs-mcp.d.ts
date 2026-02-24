/**
 * Native vs MCP Tool Analysis
 *
 * Classifies tools into native, MCP (precision), and MCP info categories.
 * Calculates overhead from mcp-cli info calls and provides comparative metrics.
 */
import type { ToolStats, ClassifiedTools, McpInfoOverhead, NativeVsMcpSummary } from './types.js';
/**
 * Classify tools into native, MCP, and MCP info categories
 */
export declare function classifyTools(tools: ToolStats[]): ClassifiedTools;
/**
 * Calculate MCP info overhead metrics
 */
export declare function calculateMcpInfoOverhead(tools: ToolStats[], classified?: ClassifiedTools): McpInfoOverhead;
/**
 * Generate comprehensive native vs MCP comparison
 */
export declare function summarizeNativeVsMcp(tools: ToolStats[]): NativeVsMcpSummary;
