/**
 * Context Formatter
 *
 * Formats all gathered context into a clean, readable format
 * for injection via additionalContext.
 */
import { formatStack } from './stack-detector.js';
import { formatGitContext } from './git-context.js';
import { formatMemory } from './memory-loader.js';
import { formatEnvironment } from './environment.js';
import { formatRecentActivity } from './recent-activity.js';
import { formatTodos } from './todo-scanner.js';
import { formatProjectHealth } from './project-health.js';
import { formatFolderStructure } from './folder-structure.js';
/**
 * Format all gathered context into a readable string
 */
export function formatContext(ctx) {
    const sections = [];
    let issueCount = 0;
    sections.push('# Project Context');
    sections.push('');
    const stackFormatted = formatStack(ctx.stack);
    if (stackFormatted) {
        sections.push('## Tech Stack');
        sections.push(stackFormatted);
        sections.push('');
    }
    const structureFormatted = formatFolderStructure(ctx.folderStructure);
    if (structureFormatted) {
        sections.push('## Architecture');
        sections.push(structureFormatted);
        sections.push('');
    }
    const gitFormatted = formatGitContext(ctx.git);
    if (gitFormatted) {
        sections.push('## Git Status');
        sections.push(gitFormatted);
        sections.push('');
    }
    const healthFormatted = formatProjectHealth(ctx.health);
    if (healthFormatted) {
        sections.push('## Project Health');
        sections.push(healthFormatted);
        issueCount += ctx.health.warnings.length;
        sections.push('');
    }
    const envFormatted = formatEnvironment(ctx.environment);
    if (envFormatted) {
        sections.push('## Environment');
        sections.push(envFormatted);
        issueCount += ctx.environment.missingVars.length;
        issueCount += ctx.environment.sensitiveVarsExposed.length;
        sections.push('');
    }
    const todosFormatted = formatTodos(ctx.todos);
    if (todosFormatted) {
        sections.push('## Code TODOs');
        sections.push(todosFormatted);
        issueCount += ctx.todos.items.filter((i) => i.priority === 'high').length;
        sections.push('');
    }
    const activityFormatted = formatRecentActivity(ctx.recentActivity);
    if (activityFormatted) {
        sections.push('## Recent Activity');
        sections.push(activityFormatted);
        sections.push('');
    }
    const memoryFormatted = formatMemory(ctx.memory);
    if (memoryFormatted) {
        sections.push('## Project Memory');
        sections.push(memoryFormatted);
        sections.push('');
    }
    // Generate summary
    const summaryParts = [];
    const allTech = [
        ...ctx.stack.frameworks,
        ...ctx.stack.databases,
        ...ctx.stack.styling.slice(0, 1),
    ].slice(0, 4);
    if (allTech.length > 0) {
        summaryParts.push(allTech.join(' + '));
    }
    if (ctx.git.isGitRepo && ctx.git.branch) {
        const changes = ctx.git.uncommittedChanges + ctx.git.untrackedFiles;
        if (changes > 0) {
            summaryParts.push(`${changes} uncommitted changes`);
        }
    }
    if (issueCount > 0) {
        summaryParts.push(`${issueCount} issue(s) to review`);
    }
    const summary = summaryParts.length > 0 ? summaryParts.join(' | ') : 'Project context loaded';
    return {
        full: sections.join('\n'),
        summary,
        hasIssues: issueCount > 0,
        issueCount,
    };
}
/**
 * Create a minimal context string for low-overhead scenarios
 */
export function formatMinimalContext(ctx) {
    const parts = [];
    const tech = [...ctx.stack.frameworks, ...ctx.stack.databases].slice(0, 3);
    if (tech.length > 0) {
        parts.push(`Stack: ${tech.join(', ')}`);
    }
    if (ctx.git.isGitRepo && ctx.git.branch) {
        parts.push(`Branch: ${ctx.git.branch}`);
    }
    if (ctx.health.warnings.length > 0) {
        parts.push(`${ctx.health.warnings.length} health warning(s)`);
    }
    if (ctx.todos.items.filter((i) => i.priority === 'high').length > 0) {
        parts.push(`${ctx.todos.items.filter((i) => i.priority === 'high').length} high-priority TODO(s)`);
    }
    return parts.join(' | ');
}
