/**
 * Context Formatter
 *
 * Formats all gathered context into a clean, readable format
 * for injection via additionalContext.
 */
import { StackInfo } from './stack-detector.js';
import { GitContext } from './git-context.js';
import { EnvStatus } from './env-checker.js';
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
/** Format all gathered context into a readable string. */
export declare function formatContext(context: GatheredContext): FormattedContext;
/** Create a minimal context string for low-overhead scenarios. */
export declare function formatMinimalContext(context: GatheredContext): string;
