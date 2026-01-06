/**
 * Context Formatter
 *
 * Formats all gathered context into a clean, readable format
 * for injection via additionalContext.
 */
import { StackInfo } from './stack-detector.js';
import { GitContext } from './git-context.js';
import { EnvStatus } from './environment.js';
import { TodoItem } from './todo-scanner.js';
import { HealthStatus } from './health-checker.js';
import { FolderAnalysis } from './folder-analyzer.js';
import type { ProjectMemory } from '../types/memory.js';
/** All gathered project context data. */
export interface GatheredContext {
    stack: StackInfo;
    git: GitContext;
    memory: ProjectMemory;
    environment: EnvStatus;
    todos: TodoItem[];
    health: HealthStatus;
    folderStructure: FolderAnalysis;
}
/** Formatted context output with summary and issue tracking. */
export interface FormattedContext {
    full: string;
    summary: string;
    hasIssues: boolean;
    issueCount: number;
}
/**
 * Format all gathered context into a readable string.
 * Combines stack, architecture, git, health, environment, todos, and memory into sections.
 *
 * @param context - The GatheredContext object with all project context data
 * @returns FormattedContext with full formatted string, summary, and issue tracking
 *
 * @example
 * const formatted = formatContext(context);
 * console.log(formatted.summary); // "Next.js + TypeScript + Tailwind CSS | 3 uncommitted changes"
 * console.log(formatted.full); // Full multi-section report
 */
export declare function formatContext(context: GatheredContext): FormattedContext;
/**
 * Create a minimal context string for low-overhead scenarios.
 * Generates a one-line summary with stack, branch, and critical issues only.
 *
 * @param context - The GatheredContext object with all project context data
 * @returns Compact single-line summary string
 *
 * @example
 * const minimal = formatMinimalContext(context);
 * // Returns: "Stack: Next.js, TypeScript | Branch: main | 2 health warning(s)"
 */
export declare function formatMinimalContext(context: GatheredContext): string;
