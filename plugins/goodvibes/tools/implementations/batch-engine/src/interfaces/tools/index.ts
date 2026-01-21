/**
 * Tool Wiring - Central export and integration for all batch tools
 * @see SPEC-v2 Section 13
 */

// Re-export all tool interfaces
export * from './discover.js';
export * from './batch-tool.js';
export * from './batch-status.js';
export * from './batch-recover.js';
export * from './batch-state.js';

// Import tool interfaces
import type { DiscoverTool, DiscoverInput, DiscoverOutput } from './discover.js';
import type { BatchTool, BatchToolInput, BatchToolOutput } from './batch-tool.js';
import type { BatchStatusTool, BatchStatusInput, BatchStatusOutput } from './batch-status.js';
import type { BatchRecoverTool, BatchRecoverInput, BatchRecoverOutput } from './batch-recover.js';
import type { BatchStateTool, BatchStateInput, BatchStateOutput } from './batch-state.js';

// Tool names
export type ToolName = 'discover' | 'batch' | 'batch_status' | 'batch_recover' | 'batch_state';

// Tool input union
export type AnyToolInput =
  | { tool: 'discover'; input: DiscoverInput }
  | { tool: 'batch'; input: BatchToolInput }
  | { tool: 'batch_status'; input: BatchStatusInput }
  | { tool: 'batch_recover'; input: BatchRecoverInput }
  | { tool: 'batch_state'; input: BatchStateInput };

// Tool output union
export type AnyToolOutput =
  | { tool: 'discover'; output: DiscoverOutput }
  | { tool: 'batch'; output: BatchToolOutput }
  | { tool: 'batch_status'; output: BatchStatusOutput }
  | { tool: 'batch_recover'; output: BatchRecoverOutput }
  | { tool: 'batch_state'; output: BatchStateOutput };

// Tool registry
export interface ToolRegistry {
  discover: DiscoverTool;
  batch: BatchTool;
  batch_status: BatchStatusTool;
  batch_recover: BatchRecoverTool;
  batch_state: BatchStateTool;
}

// Tool executor interface
export interface ToolExecutor {
  execute<T extends ToolName>(tool: T, input: ToolInputFor<T>): Promise<ToolOutputFor<T>>;
  isAvailable(tool: ToolName): boolean;
  getTools(): ToolName[];
}

// Type helpers for tool input/output
export type ToolInputFor<T extends ToolName> =
  T extends 'discover' ? DiscoverInput :
  T extends 'batch' ? BatchToolInput :
  T extends 'batch_status' ? BatchStatusInput :
  T extends 'batch_recover' ? BatchRecoverInput :
  T extends 'batch_state' ? BatchStateInput :
  never;

export type ToolOutputFor<T extends ToolName> =
  T extends 'discover' ? DiscoverOutput :
  T extends 'batch' ? BatchToolOutput :
  T extends 'batch_status' ? BatchStatusOutput :
  T extends 'batch_recover' ? BatchRecoverOutput :
  T extends 'batch_state' ? BatchStateOutput :
  never;

// Tool context (shared across tools)
export interface ToolContext {
  session_id: string;
  mode: string;
  project_root: string;
  timeout_ms: number;
  max_tokens: number;
}

// Tool manager interface
export interface ToolManager {
  registry: ToolRegistry;
  context: ToolContext;

  // Lifecycle
  initialize(): Promise<void>;
  shutdown(): Promise<void>;

  // Execution
  execute<T extends ToolName>(tool: T, input: ToolInputFor<T>): Promise<ToolOutputFor<T>>;

  // Tool access
  getTool<T extends ToolName>(name: T): ToolRegistry[T];

  // Batch execution of multiple tools
  executeBatch(inputs: AnyToolInput[]): Promise<AnyToolOutput[]>;
}

// Default tool context
export const DEFAULT_TOOL_CONTEXT: ToolContext = {
  session_id: '',
  mode: 'vibecoding',
  project_root: '.',
  timeout_ms: 60000,
  max_tokens: 100000
};
