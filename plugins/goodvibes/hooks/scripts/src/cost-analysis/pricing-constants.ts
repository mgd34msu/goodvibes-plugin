/**
 * Empirical per-call cost constants for native and MCP tools
 * Derived from actual usage data analysis
 */

/**
 * Native tool costs per individual call (in cents)
 * These represent the average cost when using built-in tools
 */
export const NATIVE_COSTS_PER_CALL = {
  Read: 0.0255,
  Edit: 0.0383,
  Write: 0.0973,
  Grep: 0.0283,
  Glob: 0.0194,
  Bash: 0.0269,
  Task: 0.1250,
} as const;

/**
 * MCP tool costs per individual call (in cents)
 * These represent the average cost when using precision_engine tools
 */
export const MCP_COSTS_PER_CALL = {
  precision_read: 0.0155,
  precision_edit: 0.0146,
  precision_write: 0.0224,
  precision_grep: 0.0146,
  precision_glob: 0.0146,
  precision_exec: 0.0199,
  discover: 0.0180,
  batch: 0.0139,
} as const;

/**
 * Flat overhead for MCP info calls per 100 tool calls (in cents)
 * This overhead is amortized across all MCP tool usage
 */
export const MCP_INFO_OVERHEAD_PER_100_CALLS = 0.15;

/**
 * Average cost per call across all native tools (in cents)
 */
export const NATIVE_AVG_COST_PER_CALL = 0.0321;

/**
 * Average cost per call across all MCP tools (in cents)
 */
export const MCP_AVG_COST_PER_CALL = 0.0166;

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
export function getCostPer100Calls(tool: string): number {
  // Check native tools
  if (tool in NATIVE_COSTS_PER_CALL) {
    return NATIVE_COSTS_PER_CALL[tool as keyof typeof NATIVE_COSTS_PER_CALL] * 100;
  }
  
  // Check MCP tools
  if (tool in MCP_COSTS_PER_CALL) {
    return MCP_COSTS_PER_CALL[tool as keyof typeof MCP_COSTS_PER_CALL] * 100;
  }
  
  throw new Error(`Unknown tool: ${tool}`);
}

/**
 * Get the overhead-adjusted cost for 100 calls of a specific tool
 * For MCP tools, this includes the amortized info call overhead
 * 
 * @param tool - The name of the tool
 * @returns Cost in cents for 100 calls including overhead
 * @throws Error if tool name is not recognized
 */
export function getOverheadAdjustedCostPer100(tool: string): number {
  const baseCost = getCostPer100Calls(tool);
  
  // Add overhead for MCP tools
  if (tool in MCP_COSTS_PER_CALL) {
    return baseCost + MCP_INFO_OVERHEAD_PER_100_CALLS;
  }
  
  // Native tools have no additional overhead
  return baseCost;
}

/**
 * Check if a tool is an MCP tool
 * 
 * @param tool - The name of the tool
 * @returns True if the tool is an MCP tool
 */
export function isMCPTool(tool: string): boolean {
  return tool in MCP_COSTS_PER_CALL;
}

/**
 * Check if a tool is a native tool
 * 
 * @param tool - The name of the tool
 * @returns True if the tool is a native tool
 */
export function isNativeTool(tool: string): boolean {
  return tool in NATIVE_COSTS_PER_CALL;
}

/**
 * Get all available tool names
 * 
 * @returns Array of all recognized tool names
 */
export function getAllToolNames(): string[] {
  return [
    ...Object.keys(NATIVE_COSTS_PER_CALL),
    ...Object.keys(MCP_COSTS_PER_CALL),
  ];
}
