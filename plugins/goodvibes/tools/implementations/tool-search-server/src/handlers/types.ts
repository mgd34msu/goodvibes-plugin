/**
 * Shared types for tool handlers
 *
 * This module provides the common type definitions used across all tool handlers,
 * including the handler context, response types, and the handler function signature.
 */

import type Fuse from "fuse.js";
import type { Registry, RegistryEntry } from "../types.js";

/**
 * Context object passed to tool handlers providing access to indexes and registries.
 * Not all handlers require all context fields - many only need specific indexes.
 */
export interface HandlerContext {
  /** Fuse.js index for searching skills */
  skillsIndex: Fuse<RegistryEntry> | null;
  /** Fuse.js index for searching agents */
  agentsIndex: Fuse<RegistryEntry> | null;
  /** Fuse.js index for searching tools */
  toolsIndex: Fuse<RegistryEntry> | null;
  /** Full skills registry for dependency lookups */
  skillsRegistry: Registry | null;
}

/**
 * Standard response structure returned by tool handlers.
 * Compatible with MCP CallToolResult.
 */
export interface ToolHandlerResponse {
  content: Array<{ type: string; text: string }>;
  isError?: boolean;
}

/**
 * Generic tool handler function signature.
 * All handlers receive the full context and their specific arguments.
 *
 * @param ctx - The handler context with access to indexes and registries
 * @param args - Tool-specific arguments (type varies per handler)
 * @returns The handler response, synchronous or async
 */
export type ToolHandler<TArgs = unknown> = (
  ctx: HandlerContext,
  args: TArgs,
) => ToolHandlerResponse | Promise<ToolHandlerResponse>;

/**
 * Registry of tool handlers keyed by tool name.
 * Using Record provides type safety for the lookup.
 */
export type ToolHandlerRegistry = Record<string, ToolHandler>;

/**
 * Tool category for organizing handlers logically.
 * Used for documentation and grouping in the registry.
 */
export type ToolCategory =
  | "search"
  | "content"
  | "context"
  | "validation"
  | "scaffolding"
  | "status"
  | "lsp"
  | "deps"
  | "test"
  | "security"
  | "build"
  | "process"
  | "runtime"
  | "edit"
  | "analysis"
  | "database"
  | "env"
  | "package"
  | "sync"
  | "fixtures"
  | "git"
  | "frontend"
  | "errors"
  | "project"
  | "framework"
  | "docs"
  | "batch";

/**
 * Metadata for a registered tool handler.
 * Optional but useful for introspection and documentation.
 */
export interface ToolHandlerMeta {
  /** The tool name (must match TOOL_SCHEMAS) */
  name: string;
  /** Category for grouping */
  category: ToolCategory;
  /** Whether the handler requires context indexes */
  requiresContext: boolean;
}
