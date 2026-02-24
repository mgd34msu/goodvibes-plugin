/**
 * Cost Analysis Types
 *
 * All interfaces and types for the cost analysis system.
 */
export interface ModelPricing {
    name: string;
    inputPrice: number;
    outputPrice: number;
    cacheWrite5Min: number;
    cacheWrite1Hour: number;
    cacheHits: number;
}
export interface PricingCache {
    fetchedAt: string;
    models: Record<string, ModelPricing>;
}
export interface TimeFilter {
    type: 'absolute' | 'relative';
    startDate?: string;
    endDate?: string;
    relativeStart?: string;
}
export interface ParsedTimeFilter {
    startTime: number;
    endTime: number;
    description: string;
}
export interface TokenUsage {
    input_tokens: number;
    output_tokens: number;
    cache_read_input_tokens?: number;
    cache_creation_input_tokens?: number;
    cache_creation?: {
        ephemeral_5m?: number;
        ephemeral_1h?: number;
    };
}
export interface MessageContent {
    type: 'text' | 'tool_use' | 'tool_result';
    name?: string;
    input?: unknown;
}
export interface JournalEntry {
    type: string;
    timestamp?: string;
    message?: {
        id?: string;
        model?: string;
        usage?: TokenUsage;
        content?: MessageContent[];
    };
    requestId?: string;
}
export declare function validateJournalEntry(raw: unknown): JournalEntry | null;
export interface TokenStats {
    input: number;
    output: number;
    cache5m: number;
    cache1h: number;
    cacheRead: number;
    calls: number;
}
export interface CostBreakdown {
    inputCost: number;
    outputCost: number;
    cache5mCost: number;
    cache1hCost: number;
    cacheReadCost: number;
    totalCost: number;
}
export interface ModelStats {
    model: string;
    displayName: string;
    tokens: TokenStats;
    cost: CostBreakdown;
}
export interface ProjectStats {
    project: string;
    tokens: TokenStats;
    cost: CostBreakdown;
    models: ModelStats[];
}
export interface ToolStats {
    tool: string;
    usageCount: number;
    tokens: TokenStats;
    cost: CostBreakdown;
}
export interface McpToolsSummary {
    totalTools: number;
    totalCalls: number;
    tokens: TokenStats;
    cost: CostBreakdown;
    topTools: ToolStats[];
}
export interface CostAnalysisResult {
    timeRange: ParsedTimeFilter;
    projects: ProjectStats[];
    models: ModelStats[];
    tools?: ToolStats[];
    grandTotal: {
        tokens: TokenStats;
        cost: CostBreakdown;
    };
    mcpToolsSummary?: McpToolsSummary;
}
export type OutputFormat = 'text' | 'json' | 'markdown' | 'minimal';
export type GroupBy = 'none' | 'daily' | 'weekly' | 'monthly' | 'session';
export interface CostAnalysisOptions {
    timeFilter?: TimeFilter;
    projectFilter?: string[];
    modelFilter?: string[];
    includeTools?: boolean;
    topToolsLimit?: number;
    outputFormat?: OutputFormat;
    groupBy?: GroupBy;
}
/**
 * Represents a single subagent execution session with cost tracking
 */
export interface SubagentSession {
    /** Unique session identifier */
    id: string;
    /** Full path to the subagent file */
    path: string;
    /** Project name */
    project: string;
    /** Total number of tool calls */
    calls: number;
    /** Token usage for this session */
    tokens: TokenUsage;
    /** Total cost for this session */
    cost: number;
    /** Number of MCP tool calls */
    mcpCalls: number;
    /** Number of native tool calls */
    nativeCalls: number;
    /** MCP tools usage breakdown */
    mcpTools: Record<string, number>;
    /** Native tools usage breakdown */
    nativeTools: Record<string, number>;
    /** Model used for this session */
    model: string;
}
/**
 * Summary statistics for subagent usage
 */
export interface SubagentSummary {
    /** Total number of subagent sessions */
    totalSessions: number;
    /** Total number of tool calls across all sessions */
    totalCalls: number;
    /** Total tokens across all subagent sessions */
    totalTokens: TokenUsage;
    /** Total cost across all subagent sessions */
    totalCost: number;
    /** Percentage of calls that were MCP tools */
    mcpCallPercent: number;
    /** Percentage of calls that were native tools */
    nativeCallPercent: number;
    /** Top subagents by MCP usage */
    topAgents: SubagentSession[];
    /** All sessions */
    sessions: SubagentSession[];
}
/**
 * Raw batch operation payload from journal
 */
export interface BatchPayload {
    /** Operations array */
    operations?: Array<{
        tool: string;
        [key: string]: unknown;
    }>;
    /** Commands array */
    commands?: Array<{
        tool?: string;
        type?: string;
        [key: string]: unknown;
    }>;
    /** Files array */
    files?: Array<{
        path: string;
        [key: string]: unknown;
    }>;
    /** Queries array */
    queries?: Array<{
        id: string;
        type: string;
        [key: string]: unknown;
    }>;
    /** Edits array */
    edits?: Array<{
        file: string;
        [key: string]: unknown;
    }>;
}
/**
 * Analyzed batch call with cost metrics
 */
export interface BatchCall {
    file: string;
    timestamp: string;
    command: string;
    payload: BatchPayload | null;
    operationCount: number;
    operationsByType: OperationCount;
}
/**
 * Calculated savings from batch operations
 */
export interface BatchSavings {
    batchCost: number;
    nativeEquivalent: number;
    savings: number;
    savingsPercent: number;
    multiplier: number;
}
/**
 * Complete batch analysis result
 */
export interface BatchAnalysisResult {
    totalBatches: number;
    totalOperations: number;
    operationsByType: OperationCount;
    totalBatchCost: number;
    totalNativeEquivalent: number;
    totalSavings: number;
    avgSavingsPercent: number;
    avgOpsPerBatch: number;
    greatestBatches: AnalyzedBatch[];
}
/**
 * Operation count breakdown for batch analysis
 */
export interface OperationCount {
    read: number;
    write: number;
    edit: number;
    grep: number;
    glob: number;
    exec: number;
    other: number;
    total: number;
}
/**
 * Analyzed batch with both call data and savings
 */
export interface AnalyzedBatch extends BatchCall, BatchSavings {
}
/**
 * Metrics for a specific tool
 */
export interface ToolMetrics {
    tool: string;
    displayName: string;
    calls: number;
    inputPerCall: number;
    outputPerCall: number;
    cachePerCall: number;
    totalPerCall: number;
    costPerCall: number;
    totalCost: number;
    category: string;
}
/**
 * Aggregated metrics for a category of tools
 */
export interface CategoryMetrics {
    category: string;
    tools: string[];
    totalCalls: number;
    avgInputPerCall: number;
    avgOutputPerCall: number;
    avgCachePerCall: number;
    avgTotalPerCall: number;
    avgCostPerCall: number;
    totalCost: number;
}
/**
 * Head-to-head comparison between two tools
 */
export interface HeadToHeadComparison {
    label: string;
    nativeTool: ToolMetrics;
    precisionTool: ToolMetrics;
    deltas: {
        inputPercent: number;
        outputPercent: number;
        cachePercent: number;
        totalPercent: number;
        costPercent: number;
    };
}
/**
 * Complete comparison analysis result
 */
export interface ComparisonResult {
    metrics: ToolMetrics[];
    categories: CategoryMetrics[];
    headToHead: HeadToHeadComparison[];
}
/**
 * Classified tool stats by type
 */
export interface ClassifiedTools {
    native: ToolStats[];
    mcp: ToolStats[];
    mcpInfo: ToolStats[];
}
/**
 * Overhead analysis for mcp-cli info calls
 */
export interface McpInfoOverhead {
    totalInfoCalls: number;
    totalInfoCost: number;
    infoRatio: number;
    costRatio: number;
    perCallOverhead: number;
}
/**
 * Native vs MCP tools comparison summary
 */
export interface NativeVsMcpSummary {
    native: {
        totalCalls: number;
        totalCost: number;
        perCallCost: number;
        tokens: TokenStats;
        cost: CostBreakdown;
    };
    mcp: {
        totalCalls: number;
        totalCost: number;
        perCallCost: number;
        tokens: TokenStats;
        cost: CostBreakdown;
    };
    mcpWithInfo: {
        totalCalls: number;
        totalCost: number;
        perCallCost: number;
        tokens: TokenStats;
        cost: CostBreakdown;
    };
    infoOverhead: McpInfoOverhead;
}
/**
 * Extended cost analysis options with additional filters
 */
export interface ExtendedCostAnalysisOptions extends CostAnalysisOptions {
    /** Include subagent analysis */
    includeSubagents?: boolean;
    /** Include batch analysis */
    includeBatches?: boolean;
    /** Include native vs MCP comparison */
    includeNativeVsMcp?: boolean;
    /** Include tool comparisons */
    includeComparisons?: boolean;
    /** Categories to compare */
    compareCategories?: string[];
    /** Session ID filter for subagents */
    sessionFilter?: string[];
}
/**
 * Extended cost analysis result with all optional sections
 */
export interface ExtendedCostAnalysisResult extends CostAnalysisResult {
    /** Subagent analysis (if requested) */
    subagents?: SubagentSummary;
    /** Batch analysis (if requested) */
    batches?: BatchAnalysisResult;
    /** Native vs MCP comparison (if requested) */
    nativeVsMcp?: NativeVsMcpSummary;
    /** Tool comparisons (if requested) */
    comparisons?: ComparisonResult;
}
