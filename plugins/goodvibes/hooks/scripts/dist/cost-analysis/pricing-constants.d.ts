/**
 * Empirical per-call cost constants for native and MCP tools
 * Derived from actual usage data analysis
 */
/**
 * Native tool costs per individual call (in cents)
 * These represent the average cost when using built-in tools
 */
export declare const NATIVE_COSTS_PER_CALL: {
    readonly Read: 0.0255;
    readonly Edit: 0.0383;
    readonly Write: 0.0973;
    readonly Grep: 0.0283;
    readonly Glob: 0.0194;
    readonly Bash: 0.0269;
    readonly Task: 0.125;
};
/**
 * MCP tool costs per individual call (in cents)
 * These represent the average cost when using precision_engine tools
 */
export declare const MCP_COSTS_PER_CALL: {
    readonly precision_read: 0.0155;
    readonly precision_edit: 0.0146;
    readonly precision_write: 0.0224;
    readonly precision_grep: 0.0146;
    readonly precision_glob: 0.0146;
    readonly precision_exec: 0.0199;
    readonly discover: 0.018;
    readonly batch: 0.0139;
};
/**
 * Flat overhead for MCP info calls per 100 tool calls (in cents)
 * This overhead is amortized across all MCP tool usage
 */
export declare const MCP_INFO_OVERHEAD_PER_100_CALLS = 0.15;
/**
 * Average cost per call across all native tools (in cents)
 */
export declare const NATIVE_AVG_COST_PER_CALL = 0.0321;
/**
 * Average cost per call across all MCP tools (in cents)
 */
export declare const MCP_AVG_COST_PER_CALL = 0.0166;
/**
 * Type for all recognized tool names
 */
export type ToolName = keyof typeof NATIVE_COSTS_PER_CALL | keyof typeof MCP_COSTS_PER_CALL;
/**
 * Get the cost for 100 calls of a specific tool
 *
 * @param tool - The name of the tool
 * @returns Cost in cents for 100 calls
 * @throws Error if tool name is not recognized
 */
export declare function getCostPer100Calls(tool: string): number;
/**
 * Get the overhead-adjusted cost for 100 calls of a specific tool
 * For MCP tools, this includes the amortized info call overhead
 *
 * @param tool - The name of the tool
 * @returns Cost in cents for 100 calls including overhead
 * @throws Error if tool name is not recognized
 */
export declare function getOverheadAdjustedCostPer100(tool: string): number;
/**
 * Check if a tool is an MCP tool
 *
 * @param tool - The name of the tool
 * @returns True if the tool is an MCP tool
 */
export declare function isMCPTool(tool: string): boolean;
/**
 * Check if a tool is a native tool
 *
 * @param tool - The name of the tool
 * @returns True if the tool is a native tool
 */
export declare function isNativeTool(tool: string): boolean;
/**
 * Get all available tool names
 *
 * @returns Array of all recognized tool names
 */
export declare function getAllToolNames(): string[];
