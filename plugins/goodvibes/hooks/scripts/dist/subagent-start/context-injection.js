/**
 * Subagent Context Injection
 *
 * Builds context for subagent sessions based on agent type and project configuration.
 * Provides:
 * - Universal reminder to prefer skills and MCP tools over raw bash/shell commands
 * - Agent-specific reminders and guidelines (e.g., write-local for backend,
 *   test quality for test engineers, scoring for reviewers)
 *
 * @module subagent-start/context-injection
 * @see {@link ../session-start/context-injection} for main session context
 */
import * as path from 'path';
import { loadSharedConfig } from '../shared/index.js';
import { getDefaultConfig as getAutomationConfig } from '../types/config.js';
/** Protocol skills that should be loaded before starting work */
export const PROTOCOL_SKILLS = [
    'precision-mastery',
    'review-scoring',
    'gather-plan-apply',
    'goodvibes-memory',
    'error-recovery'
];
/** Agent-specific skill recommendations based on role */
export const AGENT_SKILL_MAP = {
    'engineer': ['authentication', 'database-layer', 'api-design', 'component-architecture', 'styling-system', 'state-management', 'payment-integration', 'ai-integration', 'service-integration', 'refactoring', 'debugging'],
    'reviewer': ['code-review', 'security-audit', 'performance-audit', 'accessibility-audit'],
    'tester': ['testing-strategy'],
    'architect': ['project-onboarding'], // Loads outcome skills as needed per task; project-onboarding is the primary quality skill
    'deployer': ['deployment'],
    'integrator': ['ai-integration', 'payment-integration', 'service-integration', 'state-management', 'authentication'], // Generic integrator
    'integrator-ai': ['ai-integration'],
    'integrator-services': ['payment-integration', 'service-integration', 'authentication'],
    'integrator-state': ['state-management'],
    'planner': ['task-orchestration', 'fullstack-feature'],
    'agent-factory': [], // Meta-agent, loads skills as needed
    'skill-factory': [], // Meta-agent, loads skills as needed
};
/** Skill catalog with descriptions and validation scripts */
export const SKILL_CATALOG = {
    // Protocol
    'precision-mastery': { description: 'Token-efficient file operations, extract modes, verbosity, batching', path: 'protocol/precision-mastery', scripts: ['validate-precision-usage.sh'] },
    'review-scoring': { description: '10-dimension scoring rubric for WRFC review loops', path: 'protocol/review-scoring', scripts: ['validate-review.sh', 'validate-fix.sh'] },
    'gather-plan-apply': { description: 'Strict 3-call GPA execution loop', path: 'protocol/gather-plan-apply', scripts: ['validate-gpa-compliance.sh'] },
    'goodvibes-memory': { description: 'Cross-session memory (decisions, patterns, failures, preferences)', path: 'protocol/goodvibes-memory', scripts: ['validate-memory-usage.sh'] },
    'error-recovery': { description: 'Tiered error recovery and escalation procedures', path: 'protocol/error-recovery', scripts: ['validate-error-recovery.sh'] },
    // Orchestration
    'fullstack-feature': { description: 'End-to-end multi-layer feature development', path: 'orchestration/fullstack-feature', scripts: ['validate-feature-workflow.sh'] },
    'task-orchestration': { description: 'Parallel agent decomposition and WRFC coordination', path: 'orchestration/task-orchestration', scripts: ['validate-orchestration.sh'] },
    // Outcome
    'ai-integration': { description: 'AI/LLM chat, streaming, RAG, embeddings', path: 'outcome/ai-integration', scripts: ['validate-ai-integration.sh'] },
    'api-design': { description: 'REST/GraphQL/tRPC endpoint design and validation', path: 'outcome/api-design', scripts: ['api-checklist.sh'] },
    'authentication': { description: 'Login, OAuth, JWT, sessions, RBAC', path: 'outcome/authentication', scripts: ['auth-checklist.sh'] },
    'component-architecture': { description: 'UI component composition, rendering, accessibility', path: 'outcome/component-architecture', scripts: ['validate-components.sh'] },
    'database-layer': { description: 'Schema design, ORM setup, migrations, query optimization', path: 'outcome/database-layer', scripts: ['database-checklist.sh'] },
    'deployment': { description: 'CI/CD, Docker, Vercel/Railway/Fly.io/AWS', path: 'outcome/deployment', scripts: ['validate-deployment.sh'] },
    'payment-integration': { description: 'Stripe/LemonSqueezy/Paddle checkout and subscriptions', path: 'outcome/payment-integration', scripts: ['validate-payments.sh'] },
    'service-integration': { description: 'Email, CMS, file uploads, analytics', path: 'outcome/service-integration', scripts: ['validate-services.sh'] },
    'state-management': { description: 'Server/client/form/URL state patterns', path: 'outcome/state-management', scripts: ['validate-state.sh'] },
    'styling-system': { description: 'Tailwind, design tokens, dark mode, responsive', path: 'outcome/styling-system', scripts: ['validate-styling.sh'] },
    'testing-strategy': { description: 'Vitest/Jest, Testing Library, Playwright, MSW', path: 'outcome/testing-strategy', scripts: ['validate-tests.sh'] },
    // Quality
    'accessibility-audit': { description: 'WCAG 2.1 AA compliance audit', path: 'quality/accessibility-audit', scripts: ['validate-accessibility-audit.sh'] },
    'code-review': { description: '10-dimension weighted code review', path: 'quality/code-review', scripts: ['validate-code-review.sh'] },
    'debugging': { description: 'Error analysis, runtime debugging, root cause analysis', path: 'quality/debugging', scripts: ['validate-debugging.sh'] },
    'performance-audit': { description: 'Bundle, database, rendering, Core Web Vitals', path: 'quality/performance-audit', scripts: ['validate-performance-audit.sh'] },
    'project-onboarding': { description: 'Codebase analysis and architecture mapping', path: 'quality/project-onboarding', scripts: ['validate-onboarding.sh'] },
    'refactoring': { description: 'Safe structural improvements with validation', path: 'quality/refactoring', scripts: ['validate-refactoring.sh'] },
    'security-audit': { description: 'Auth, input validation, dependencies, infrastructure', path: 'quality/security-audit', scripts: ['validate-security-audit.sh'] },
};
/**
 * Builds context for a subagent based on agent type and project.
 * Adds agent-specific reminders (write-local, test quality, scoring, etc.).
 *
 * @param cwd - The current working directory (project root)
 * @param agentType - The type of agent (e.g., 'engineer', 'reviewer', 'tester')
 * @param _sessionId - The session ID (reserved for future use)
 * @returns Promise resolving to SubagentContext with additional context string
 *
 * @example
 * const context = await buildSubagentContext(cwd, 'goodvibes:engineer', sessionId);
 * // Returns context with write-local and skill recommendations
 */
export async function buildSubagentContext(cwd, agentType, _sessionId) {
    // Load shared config for telemetry settings (reserved for future use; kept to ensure config is loaded)
    const _sharedConfig = await loadSharedConfig(cwd);
    const automationConfig = getAutomationConfig();
    const projectName = path.basename(cwd);
    const contextParts = [];
    // Add project context
    contextParts.push(`[GoodVibes] Project: ${projectName}`);
    contextParts.push(`Mode: ${automationConfig.automation.mode}`);
    // Universal reminder: Prefer skills and MCP tools over raw commands
    contextParts.push('MANDATORY: Always prefer GoodVibes skills and MCP tools over raw bash/shell commands.\n' +
        'CRITICAL: Only use commands outside of MCP tools or skills when there is absolutely no other way ' +
        'to accomplish a specific part of the task. Even if the entire task cannot be completed ' +
        'with skills/MCP tools, use them for every part where they apply.\n\n');
    // GPA loop reminder for efficiency
    contextParts.push('MANDATORY: If multiple tool uses are planned, use GPA loops as defined in the System Prompt.\n\n');
    // Add agent-specific reminders based on type
    if (agentType.includes('engineer')) {
        contextParts.push('Remember: Write-local only. All changes must be in the project root or directories within the project root.\n\n');
    }
    if (agentType.includes('test')) {
        contextParts.push('Remember: Tests must actually verify behavior, not just exist.\n\n');
    }
    if (agentType.includes('reviewer')) {
        contextParts.push('Remember: Be completely honest, regardless of how harsh the truth would be. Never sugar coat or take feelings into account.\n\n');
    }
    // Skill injection — provides Level 1 awareness (names + descriptions)
    const agentSuffix = agentType.split(':').pop() ?? agentType;
    const outcomeSkills = AGENT_SKILL_MAP[agentSuffix] ?? [];
    // Helper: Format skill list with descriptions
    const formatSkillList = (skillNames) => {
        return skillNames
            .map(name => {
            const info = SKILL_CATALOG[name];
            return info ? `  - ${name}: ${info.description}` : `  - ${name}`;
        })
            .join('\n');
    };
    // Build protocol skills section
    const protocolSection = [
        'Protocol skills (Always Active):',
        formatSkillList(PROTOCOL_SKILLS)
    ].join('\n');
    // Build role-specific skills section
    const roleSkillsSection = outcomeSkills.length > 0
        ? ['Skills for your role:', formatSkillList(outcomeSkills)].join('\n')
        : 'Skills for your role: none — load as needed';
    // Build progressive disclosure load instruction
    const loadInstruction = [
        'Your assigned skills load automatically based on task relevance. Protocol skills (precision-mastery, gather-plan-apply, review-scoring, goodvibes-memory, error-recovery) are always active.',
        'Skills contain workflows, checklists, and validation scripts that define quality standards.',
        'Fallback: If a skill does not load automatically, use ToolSearch to find get_skill_content from registry-engine.'
    ].join('\n');
    // Build script validation instruction
    const validationInstruction = [
        'AFTER completing work, validate with the relevant skill script:',
        '  precision_exec cmd: "bash plugins/goodvibes/skills/{tier}/{skill}/scripts/{script-name}"',
        '  Example: bash plugins/goodvibes/skills/outcome/api-design/scripts/api-checklist.sh',
        'Scripts verify work programmatically. Run BEFORE submitting for review.'
    ].join('\n');
    contextParts.push([protocolSection, roleSkillsSection, loadInstruction, validationInstruction].join('\n\n') + '\n\n');
    // contextParts always has at least 2 elements (project name and mode)
    return {
        additionalContext: contextParts.join('\n'),
    };
}
