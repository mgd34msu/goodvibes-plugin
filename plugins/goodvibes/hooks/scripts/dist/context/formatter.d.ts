/**
 * Context Formatter
 *
 * Formats all gathered context into a clean, readable format
 * for injection via additionalContext.
 */
import { DetectedStack } from './stack-detector.js';
import { GitContext } from './git-context.js';
import { ProjectMemory } from './memory-loader.js';
import { EnvironmentContext } from './environment.js';
import { RecentActivity } from './recent-activity.js';
import { TodoScanResult } from './todo-scanner.js';
import { ProjectHealth } from './project-health.js';
import { FolderStructure } from './folder-structure.js';
export interface GatheredContext {
    stack: DetectedStack;
    git: GitContext;
    memory: ProjectMemory;
    environment: EnvironmentContext;
    recentActivity: RecentActivity;
    todos: TodoScanResult;
    health: ProjectHealth;
    folderStructure: FolderStructure;
}
export interface FormattedContext {
    full: string;
    summary: string;
    hasIssues: boolean;
    issueCount: number;
}
/**
 * Format all gathered context into a readable string
 */
export declare function formatContext(ctx: GatheredContext): FormattedContext;
/**
 * Create a minimal context string for low-overhead scenarios
 */
export declare function formatMinimalContext(ctx: GatheredContext): string;
