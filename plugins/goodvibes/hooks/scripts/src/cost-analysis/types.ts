/**
 * Cost Analysis Types
 *
 * All interfaces and types for the cost analysis system.
 */

// Model Pricing interfaces
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

// Time Filtering
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

// Journal Entries
export interface TokenUsage {
  input_tokens: number;
  output_tokens: number;
  cache_read_input_tokens?: number;
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

export function validateJournalEntry(raw: unknown): JournalEntry | null {
  if (!raw || typeof raw !== 'object') return null;
  const entry = raw as Record<string, unknown>;
  if (typeof entry.type !== 'string') return null;
  
  const timestamp = entry.timestamp && typeof entry.timestamp === 'string' ? entry.timestamp : undefined;
  
  let message: JournalEntry['message'] | undefined;
  if (entry.message && typeof entry.message === 'object') {
    const msg = entry.message as Record<string, unknown>;
    message = {
      id: typeof msg.id === 'string' ? msg.id : undefined,
      model: typeof msg.model === 'string' ? msg.model : undefined,
      usage: msg.usage && typeof msg.usage === 'object' ? (msg.usage as TokenUsage) : undefined,
      content: Array.isArray(msg.content) ? msg.content : undefined,
    };
  }
  
  const requestId = entry.requestId && typeof entry.requestId === 'string' ? entry.requestId : undefined;
  
  return { type: entry.type, timestamp, message, requestId };
}

// Statistics
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

// Subagent Analysis
export interface SubagentSession {
  sessionId: string;
  calls: number;
  cost: number;
  mcpCalls: number;
  nativeCalls: number;
}

export interface SubagentSummary {
  totalSessions: number;
  totalCalls: number;
  totalCost: number;
  mcpCalls: number;
  nativeCalls: number;
  tokens: TokenStats;
  cost: CostBreakdown;
  topSessions: SubagentSession[];
}

// Batch Analysis
export interface BatchOperation {
  type: 'read' | 'write' | 'exec' | 'query';
  count: number;
  estimatedSavings: number;
}

export interface GreatestBatch {
  batchId: string;
  operations: number;
  savingsMultiplier: number;
  cost: number;
}

export interface BatchAnalysisResult {
  totalBatches: number;
  totalOperations: number;
  totalSavings: number;
  operationsByType: BatchOperation[];
  greatestBatches: GreatestBatch[];
}

// Comparison Analysis
export interface CategoryMetrics {
  category: string;
  calls: number;
  cost: number;
  tokens: TokenStats;
}

export interface HeadToHeadComparison {
  metric: string;
  native: number;
  mcp: number;
  delta: number;
  deltaPercentage: number;
}

export interface ComparisonResult {
  categories: CategoryMetrics[];
  headToHead: HeadToHeadComparison[];
  nativeSummary: {
    totalCalls: number;
    totalCost: number;
    perCallCost: number;
  };
  mcpSummary: {
    totalCalls: number;
    totalCost: number;
    perCallCost: number;
  };
}

// Extended Cost Analysis Result
export interface ExtendedCostAnalysisResult extends CostAnalysisResult {
  subagentSummary?: SubagentSummary;
  batchAnalysis?: BatchAnalysisResult;
  comparison?: ComparisonResult;
}


// Subagent Analysis interfaces

/**
 * Represents a single subagent execution session with cost tracking
 */
export interface SubagentSession {
  /** Unique session identifier */
  sessionId: string;
  /** Subagent name/type */
  agentName: string;
  /** Session start timestamp */
  startTime: string;
  /** Session end timestamp */
  endTime: string;
  /** Duration in milliseconds */
  durationMs: number;
  /** Token usage for this session */
  tokens: TokenStats;
  /** Cost breakdown for this session */
  cost: CostBreakdown;
  /** Number of tool calls made */
  toolCalls: number;
  /** Parent session ID if this is a nested subagent */
  parentSessionId?: string;
}

/**
 * Summary statistics for subagent usage
 */
export interface SubagentSummary {
  /** Total number of subagent sessions */
  totalSessions: number;
  /** Unique subagent types used */
  uniqueAgents: string[];
  /** Total tokens across all subagent sessions */
  tokens: TokenStats;
  /** Total cost across all subagent sessions */
  cost: CostBreakdown;
  /** Per-agent breakdown */
  byAgent: Record<string, {
    sessions: number;
    tokens: TokenStats;
    cost: CostBreakdown;
    avgDurationMs: number;
  }>;
}

// Batch Analysis interfaces

/**
 * Raw batch operation payload from journal
 */
export interface BatchPayload {
  /** Batch operation ID */
  id: string;
  /** Operations in the batch */
  operations: Record<string, unknown>;
  /** Batch configuration */
  config?: Record<string, unknown>;
}

/**
 * Analyzed batch call with cost metrics
 */
export interface BatchCall {
  /** Request ID */
  requestId: string;
  /** Timestamp of the batch call */
  timestamp: string;
  /** Batch operation ID */
  batchId: string;
  /** Number of operations in the batch */
  operationCount: number;
  /** Token usage for this batch */
  tokens: TokenStats;
  /** Cost for this batch */
  cost: CostBreakdown;
  /** Individual operations */
  operations: Array<{
    id: string;
    type: string;
  }>;
}

/**
 * Calculated savings from batch operations
 */
export interface BatchSavings {
  /** Estimated tokens if operations were individual */
  estimatedIndividualTokens: number;
  /** Actual tokens used in batch */
  actualBatchTokens: number;
  /** Token savings */
  tokensSaved: number;
  /** Percentage saved */
  percentageSaved: number;
  /** Estimated individual cost */
  estimatedIndividualCost: number;
  /** Actual batch cost */
  actualBatchCost: number;
  /** Cost savings */
  costSaved: number;
}

/**
 * Complete batch analysis result
 */
export interface BatchAnalysisResult {
  /** Time range analyzed */
  timeRange: ParsedTimeFilter;
  /** All batch calls */
  batches: BatchCall[];
  /** Total batch metrics */
  totalBatches: number;
  totalOperations: number;
  tokens: TokenStats;
  cost: CostBreakdown;
  /** Calculated savings */
  savings: BatchSavings;
  /** Average operations per batch */
  avgOperationsPerBatch: number;
}

// Comparison interfaces

/**
 * Metrics for a specific tool
 */
export interface ToolMetrics {
  /** Tool name */
  name: string;
  /** Number of times used */
  usageCount: number;
  /** Token usage */
  tokens: TokenStats;
  /** Cost */
  cost: CostBreakdown;
  /** Average tokens per call */
  avgTokensPerCall: number;
  /** Average cost per call */
  avgCostPerCall: number;
}

/**
 * Aggregated metrics for a category of tools
 */
export interface CategoryMetrics {
  /** Category name */
  category: string;
  /** Tools in this category */
  tools: ToolMetrics[];
  /** Total usage across category */
  totalUsage: number;
  /** Total tokens */
  tokens: TokenStats;
  /** Total cost */
  cost: CostBreakdown;
}

/**
 * Head-to-head comparison between two tool categories
 */
export interface HeadToHeadComparison {
  /** Category A name */
  categoryA: string;
  /** Category A metrics */
  metricsA: CategoryMetrics;
  /** Category B name */
  categoryB: string;
  /** Category B metrics */
  metricsB: CategoryMetrics;
  /** Difference metrics (B - A) */
  difference: {
    usageDiff: number;
    tokensDiff: number;
    costDiff: number;
    percentageDiff: number;
  };
  /** Winner category */
  winner: string;
}

/**
 * Complete comparison analysis result
 */
export interface ComparisonResult {
  /** Time range analyzed */
  timeRange: ParsedTimeFilter;
  /** All categories analyzed */
  categories: CategoryMetrics[];
  /** Head-to-head comparisons */
  comparisons: HeadToHeadComparison[];
  /** Overall summary */
  summary: {
    totalTools: number;
    totalUsage: number;
    tokens: TokenStats;
    cost: CostBreakdown;
  };
}

// Native vs MCP interfaces

/**
 * Classified tool names by type
 */
export interface ClassifiedTools {
  /** Native tools (Read, Write, Edit, Grep, Glob, Bash, etc.) */
  native: string[];
  /** MCP tools (precision_*, discover, batch, etc.) */
  mcp: string[];
  /** Tools that couldn't be classified */
  unclassified: string[];
}

/**
 * Overhead analysis for mcp-cli info calls
 */
export interface McpInfoOverhead {
  /** Number of mcp-cli info calls */
  infoCallCount: number;
  /** Tokens spent on info calls */
  tokens: TokenStats;
  /** Cost of info calls */
  cost: CostBreakdown;
  /** Percentage of total MCP cost */
  percentageOfMcpCost: number;
}

/**
 * Native vs MCP tools comparison summary
 */
export interface NativeVsMcpSummary {
  /** Time range analyzed */
  timeRange: ParsedTimeFilter;
  /** Native tools metrics */
  native: CategoryMetrics;
  /** MCP tools metrics */
  mcp: CategoryMetrics;
  /** MCP info call overhead */
  mcpInfoOverhead: McpInfoOverhead;
  /** Net MCP metrics (excluding info overhead) */
  mcpNet: CategoryMetrics;
  /** Comparison results */
  comparison: {
    /** Which category was used more */
    preferredCategory: string;
    /** Usage difference */
    usageDiff: number;
    /** Token difference */
    tokensDiff: number;
    /** Cost difference */
    costDiff: number;
    /** Percentage difference */
    percentageDiff: number;
  };
  /** Classified tool lists */
  toolClassification: ClassifiedTools;
}

// Extended options interfaces

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
