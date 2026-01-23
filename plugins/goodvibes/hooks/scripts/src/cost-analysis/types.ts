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
