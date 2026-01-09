/**
 * Context Builder Module
 *
 * Responsible for gathering and formatting all project context
 * for the session-start hook. This includes:
 * - Stack detection (frameworks, package manager, TypeScript)
 * - Git context (branch, uncommitted changes, recent commits)
 * - Environment status (.env files, missing vars)
 * - TODO/FIXME scanner
 * - Project health checks
 * - Folder structure analysis
 * - Port status for dev servers
 * - Project memory (decisions, patterns, failures)
 */
import { detectStack, formatStackInfo, getGitContext, formatGitContext, checkEnvStatus, formatEnvStatus, scanTodos, formatTodos, checkProjectHealth, formatHealthStatus, analyzeFolderStructure, formatFolderAnalysis, isEmptyProject, formatEmptyProjectContext, checkPorts, formatPortStatus, } from '../context/index.js';
import { loadProjectMemory, formatMemoryContext } from '../memory/index.js';
import { debug } from '../shared/index.js';
import { formatRecoveryContext } from './crash-recovery.js';
/** Width of section separator lines */
const SECTION_SEPARATOR_LENGTH = 50;
/**
 * Creates a context result for an empty project.
 * Used when the project directory has no significant content.
 *
 * @param startTime - Timestamp when context gathering started (for timing)
 * @returns ContextGatheringResult configured for an empty project
 */
function createEmptyProjectResult(startTime) {
    return {
        additionalContext: formatEmptyProjectContext(),
        summary: 'New project (empty directory)',
        isEmptyProject: true,
        hasIssues: false,
        issueCount: 0,
        gatherTimeMs: Date.now() - startTime,
        needsRecovery: false,
    };
}
/**
 * Creates a context result when context gathering fails.
 * Used as a fallback when an error occurs during context collection.
 *
 * @param startTime - Timestamp when context gathering started (for timing)
 * @returns ContextGatheringResult with empty/default values
 */
export function createFailedContextResult(startTime) {
    return {
        additionalContext: '',
        summary: 'Context gathering failed',
        isEmptyProject: false,
        hasIssues: false,
        issueCount: 0,
        gatherTimeMs: Date.now() - startTime,
        needsRecovery: false,
    };
}
/**
 * Formats the header section for context output.
 *
 * @returns Array of strings containing header lines
 */
function formatHeader() {
    return ['[GoodVibes SessionStart]', '='.repeat(SECTION_SEPARATOR_LENGTH), ''];
}
/**
 * Formats an optional section with a header.
 * Returns empty array if content is null or empty.
 *
 * @param header - The section header text
 * @param content - The section content, or null to skip
 * @returns Array of strings for the section, or empty array
 */
function formatOptionalSection(header, content) {
    if (!content) {
        return [];
    }
    return [`## ${header}`, '', content, ''];
}
/**
 * Formats the recovery section if crash recovery is needed.
 *
 * @param recoveryInfo - Recovery information from crash detection
 * @returns Array of strings for recovery section, or empty if no recovery needed
 */
function formatRecoverySection(recoveryInfo) {
    if (!recoveryInfo.needsRecovery) {
        return [];
    }
    const recoveryStr = formatRecoveryContext(recoveryInfo);
    return recoveryStr ? [recoveryStr, ''] : [];
}
/**
 * Formats the project overview section with stack and folder info.
 *
 * @param stackInfo - Stack detection results (frameworks, package manager, etc.)
 * @param folderAnalysis - Folder structure analysis results
 * @returns Array of strings for the project overview section
 */
function formatProjectOverviewSection(stackInfo, folderAnalysis) {
    const parts = ['## Project Overview', ''];
    const stackStr = formatStackInfo(stackInfo);
    if (stackStr) {
        parts.push(stackStr);
    }
    const folderStr = formatFolderAnalysis(folderAnalysis);
    if (folderStr) {
        parts.push(folderStr);
    }
    parts.push('');
    return parts;
}
/**
 * Formats the git status section.
 *
 * @param gitContext - Git context including branch, changes, and recent commits
 * @returns Array of strings for the git status section
 */
function formatGitSection(gitContext) {
    const parts = ['## Git Status', ''];
    const gitStr = formatGitContext(gitContext);
    if (gitStr) {
        parts.push(gitStr);
    }
    parts.push('');
    return parts;
}
/**
 * Formats port status if any dev servers are detected.
 * Returns null if no active servers found.
 *
 * @param portStatus - Port check results
 * @returns Formatted port status string, or null if no servers
 */
function formatPortStatusIfActive(portStatus) {
    const portStr = formatPortStatus(portStatus);
    return portStr && portStr !== 'No dev servers detected' ? portStr : null;
}
/**
 * Formats health status if there are warnings or errors.
 * Returns null if project health is good.
 *
 * @param healthStatus - Project health check results
 * @returns Formatted health status string, or null if all good
 */
function formatHealthIfWarning(healthStatus) {
    const healthStr = formatHealthStatus(healthStatus);
    return healthStr && healthStr !== 'Health: All good' ? healthStr : null;
}
/**
 * Formats all context sections into a single string.
 * Combines recovery, project overview, git, environment, dev servers,
 * memory, TODOs, and health check sections.
 *
 * @param recoveryInfo - Crash recovery information
 * @param stackInfo - Stack detection results
 * @param folderAnalysis - Folder structure analysis
 * @param gitContext - Git context information
 * @param envStatus - Environment file status
 * @param portStatus - Dev server port status
 * @param memory - Project memory (decisions, patterns, failures)
 * @param todos - Code TODOs found in the project
 * @param healthStatus - Project health check results
 * @returns Complete formatted context string
 */
function formatContextSections(recoveryInfo, stackInfo, folderAnalysis, gitContext, envStatus, portStatus, memory, todos, healthStatus) {
    const contextParts = [
        ...formatHeader(),
        ...formatRecoverySection(recoveryInfo),
        ...formatProjectOverviewSection(stackInfo, folderAnalysis),
        ...formatGitSection(gitContext),
        ...formatOptionalSection('Environment', formatEnvStatus(envStatus)),
        ...formatOptionalSection('Dev Servers', formatPortStatusIfActive(portStatus)),
        ...formatOptionalSection('Project Memory', formatMemoryContext(memory)),
        ...formatOptionalSection('Code TODOs', formatTodos(todos)),
        ...formatOptionalSection('Health Checks', formatHealthIfWarning(healthStatus)),
        '='.repeat(SECTION_SEPARATOR_LENGTH),
    ];
    return contextParts.join('\n');
}
/**
 * Builds the summary string from gathered context.
 * Creates a brief one-line summary of project state.
 *
 * @param stackInfo - Stack detection results
 * @param gitContext - Git context information
 * @param issueCount - Total number of detected issues
 * @returns Brief summary string (e.g., "Next.js, React | on main | 3 uncommitted")
 */
function buildContextSummary(stackInfo, gitContext, issueCount) {
    const summaryParts = [];
    const MAX_FRAMEWORKS_IN_SUMMARY = 3;
    if (stackInfo.frameworks.length > 0) {
        summaryParts.push(stackInfo.frameworks.slice(0, MAX_FRAMEWORKS_IN_SUMMARY).join(', '));
    }
    if (gitContext.branch) {
        summaryParts.push(`on ${gitContext.branch}`);
    }
    if (gitContext.hasUncommittedChanges) {
        summaryParts.push(`${gitContext.uncommittedFileCount} uncommitted`);
    }
    if (issueCount > 0) {
        summaryParts.push(`${issueCount} issues`);
    }
    return summaryParts.join(' | ') || 'Project analyzed';
}
/**
 * Calculates the total issue count from health status, env warnings, and todos.
 * Counts warnings/errors from health checks, env warnings, and code TODOs.
 *
 * @param healthStatus - Project health check results
 * @param envStatus - Environment file status
 * @param todos - Code TODOs found in the project
 * @returns Total number of detected issues
 */
function calculateIssueCount(healthStatus, envStatus, todos) {
    return (healthStatus.checks.filter((c) => c.status === 'warning' || c.status === 'error').length +
        envStatus.warnings.length +
        todos.length);
}
/**
 * Gathers all project context and formats it for session injection.
 *
 * This function orchestrates the parallel gathering of all context types
 * and formats them into a cohesive context string for the session.
 *
 * @param projectDir - The project directory to analyze
 * @param recoveryInfo - Crash recovery information from previous session
 * @param startTime - Timestamp when gathering started (for performance metrics)
 * @returns Promise resolving to ContextGatheringResult with all context data
 *
 * @example
 * const recoveryInfo = await checkCrashRecovery(cwd);
 * const result = await gatherProjectContext(cwd, recoveryInfo, Date.now());
 * console.log(result.additionalContext);
 */
export async function gatherProjectContext(projectDir, recoveryInfo, startTime) {
    // Check for empty project first
    const isEmpty = await isEmptyProject(projectDir);
    if (isEmpty) {
        return createEmptyProjectResult(startTime);
    }
    // Gather all context in parallel for performance
    const [stackInfo, gitContext, envStatus, todos, healthStatus, folderAnalysis, memory, portStatus,] = await Promise.all([
        detectStack(projectDir),
        getGitContext(projectDir),
        checkEnvStatus(projectDir),
        scanTodos(projectDir),
        checkProjectHealth(projectDir),
        analyzeFolderStructure(projectDir),
        loadProjectMemory(projectDir),
        checkPorts(projectDir),
    ]);
    // Calculate issues
    const issueCount = calculateIssueCount(healthStatus, envStatus, todos);
    // Format the context
    const additionalContext = formatContextSections(recoveryInfo, stackInfo, folderAnalysis, gitContext, envStatus, portStatus, memory, todos, healthStatus);
    // Build summary
    const summary = buildContextSummary(stackInfo, gitContext, issueCount);
    const result = {
        additionalContext,
        summary,
        isEmptyProject: false,
        hasIssues: issueCount > 0,
        issueCount,
        gatherTimeMs: Date.now() - startTime,
        needsRecovery: recoveryInfo.needsRecovery,
    };
    debug(`Context gathered in ${result.gatherTimeMs}ms`, {
        isEmptyProject: result.isEmptyProject,
        hasIssues: result.hasIssues,
        issueCount: result.issueCount,
        needsRecovery: result.needsRecovery,
    });
    return result;
}
