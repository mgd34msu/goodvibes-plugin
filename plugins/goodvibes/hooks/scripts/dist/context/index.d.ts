/**
 * Smart Context Injection Module
 *
 * Gathers comprehensive project context at session start
 * and formats it for injection via additionalContext.
 *
 * All gatherers run in parallel for maximum performance.
 */
export { EmptyProjectResult, isEmptyProject, getEmptyProjectContext } from './empty-project.js';
export { DetectedStack, detectStack, formatStack } from './stack-detector.js';
export { GitContext, getGitContext, formatGitContext } from './git-context.js';
export { ProjectMemory, loadMemory, formatMemory } from './memory-loader.js';
export { EnvironmentContext, checkEnvironment, formatEnvironment } from './environment.js';
export { RecentActivity, getRecentActivity, formatRecentActivity } from './recent-activity.js';
export { TodoScanResult, TodoItem, scanTodos, formatTodos } from './todo-scanner.js';
export { ProjectHealth, checkProjectHealth, formatProjectHealth } from './project-health.js';
export { FolderStructure, ArchitecturePattern, analyzeFolderStructure, formatFolderStructure } from './folder-structure.js';
export { GatheredContext, FormattedContext, formatContext, formatMinimalContext } from './formatter.js';
export interface ContextInjectionResult {
    additionalContext: string;
    summary: string;
    isEmptyProject: boolean;
    hasIssues: boolean;
    issueCount: number;
    gatherTimeMs: number;
}
/**
 * Gather all project context in parallel
 *
 * This is the main entry point for context injection.
 * All gatherers run concurrently via Promise.all for maximum performance.
 */
export declare function gatherProjectContext(cwd: string): Promise<ContextInjectionResult>;
/**
 * Gather minimal context (faster, less comprehensive)
 *
 * Use this when you need quick context without full analysis.
 */
export declare function gatherMinimalContext(cwd: string): Promise<{
    context: string;
    gatherTimeMs: number;
}>;
