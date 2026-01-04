/**
 * Smart Context Injection Module
 *
 * Gathers comprehensive project context at session start
 * and formats it for injection via additionalContext.
 *
 * All gatherers run in parallel for maximum performance.
 */
// Re-export types
export { isEmptyProject, getEmptyProjectContext } from './empty-project.js';
export { detectStack, formatStack } from './stack-detector.js';
export { getGitContext, formatGitContext } from './git-context.js';
export { loadMemory, formatMemory } from './memory-loader.js';
export { checkEnvironment, formatEnvironment } from './environment.js';
export { getRecentActivity, formatRecentActivity } from './recent-activity.js';
export { scanTodos, formatTodos } from './todo-scanner.js';
export { checkProjectHealth, formatProjectHealth } from './project-health.js';
export { analyzeFolderStructure, formatFolderStructure } from './folder-structure.js';
export { formatContext, formatMinimalContext } from './formatter.js';
import { isEmptyProject, getEmptyProjectContext } from './empty-project.js';
import { detectStack } from './stack-detector.js';
import { getGitContext } from './git-context.js';
import { loadMemory } from './memory-loader.js';
import { checkEnvironment } from './environment.js';
import { getRecentActivity } from './recent-activity.js';
import { scanTodos } from './todo-scanner.js';
import { checkProjectHealth } from './project-health.js';
import { analyzeFolderStructure } from './folder-structure.js';
import { formatContext } from './formatter.js';
/**
 * Gather all project context in parallel
 *
 * This is the main entry point for context injection.
 * All gatherers run concurrently via Promise.all for maximum performance.
 */
export async function gatherProjectContext(cwd) {
    const startTime = Date.now();
    // First, check if this is an empty project
    const emptyCheck = isEmptyProject(cwd);
    if (emptyCheck.isEmpty) {
        return {
            additionalContext: getEmptyProjectContext(),
            summary: 'Empty project - ready to scaffold',
            isEmptyProject: true,
            hasIssues: false,
            issueCount: 0,
            gatherTimeMs: Date.now() - startTime,
        };
    }
    // Run all gatherers in parallel
    const [stack, git, memory, environment, recentActivity, todos, health, folderStructure,] = await Promise.all([
        detectStack(cwd),
        getGitContext(cwd),
        loadMemory(cwd),
        checkEnvironment(cwd),
        getRecentActivity(cwd),
        scanTodos(cwd),
        checkProjectHealth(cwd),
        analyzeFolderStructure(cwd),
    ]);
    const gatheredContext = {
        stack,
        git,
        memory,
        environment,
        recentActivity,
        todos,
        health,
        folderStructure,
    };
    const formatted = formatContext(gatheredContext);
    return {
        additionalContext: formatted.full,
        summary: formatted.summary,
        isEmptyProject: false,
        hasIssues: formatted.hasIssues,
        issueCount: formatted.issueCount,
        gatherTimeMs: Date.now() - startTime,
    };
}
/**
 * Gather minimal context (faster, less comprehensive)
 *
 * Use this when you need quick context without full analysis.
 */
export async function gatherMinimalContext(cwd) {
    const startTime = Date.now();
    // Only run essential gatherers
    const [stack, git, health] = await Promise.all([
        detectStack(cwd),
        getGitContext(cwd),
        checkProjectHealth(cwd),
    ]);
    const parts = [];
    const tech = [...stack.frameworks, ...stack.databases].slice(0, 3);
    if (tech.length > 0) {
        parts.push(`Stack: ${tech.join(', ')}`);
    }
    if (git.isGitRepo && git.branch) {
        let branchInfo = `Branch: ${git.branch}`;
        const changes = git.uncommittedChanges + git.untrackedFiles;
        if (changes > 0) {
            branchInfo += ` (${changes} changes)`;
        }
        parts.push(branchInfo);
    }
    if (health.warnings.length > 0) {
        parts.push(`${health.warnings.length} health warning(s)`);
    }
    return {
        context: parts.join(' | '),
        gatherTimeMs: Date.now() - startTime,
    };
}
