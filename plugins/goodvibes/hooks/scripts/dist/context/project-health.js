/**
 * Project Health Checker (Comprehensive)
 *
 * Performs comprehensive project health analysis including:
 * - node_modules existence and dependency status
 * - Multiple lockfile detection (npm + yarn + pnpm + bun)
 * - Detailed TypeScript configuration (strict, strictNullChecks, noImplicitAny, target)
 * - Available npm scripts detection
 * - Actionable suggestions for improvement
 *
 * **Difference from health-checker.ts:**
 * - This module returns {@link ProjectHealth} with full analysis including suggestions
 * - health-checker.ts returns {@link HealthStatus} with basic health checks array only
 *
 * Use this when you need comprehensive health analysis with suggestions;
 * use health-checker.ts for quick status checks.
 */
import * as fs from 'fs/promises';
import * as path from 'path';
import { debug } from '../shared/logging.js';
import { fileExists } from '../shared/file-utils.js';
const LOCKFILES = {
    'package-lock.json': 'npm',
    'yarn.lock': 'yarn',
    'pnpm-lock.yaml': 'pnpm',
    'bun.lockb': 'bun',
};
/** Maximum number of suggestions to return. */
const MAX_SUGGESTIONS = 3;
/**
 * Check for node_modules and lockfiles
 */
async function checkDependencies(cwd) {
    const hasNodeModules = await fileExists(path.join(cwd, 'node_modules'));
    const lockfiles = [];
    let packageManager = null;
    for (const [file, manager] of Object.entries(LOCKFILES)) {
        if (await fileExists(path.join(cwd, file))) {
            lockfiles.push(file);
            if (!packageManager)
                packageManager = manager;
        }
    }
    return { hasNodeModules, lockfiles, packageManager };
}
/**
 * Check TypeScript configuration
 */
async function checkTypeScript(cwd) {
    const tsconfigPath = path.join(cwd, 'tsconfig.json');
    if (!await fileExists(tsconfigPath)) {
        return null;
    }
    try {
        const content = await fs.readFile(tsconfigPath, 'utf-8');
        const jsonContent = content.replace(/\/\*[\s\S]*?\*\/|\/\/.*/g, '');
        const tsconfig = JSON.parse(jsonContent);
        const compilerOptions = tsconfig.compilerOptions || {};
        return {
            hasConfig: true,
            strict: compilerOptions.strict === true,
            strictNullChecks: compilerOptions.strictNullChecks === true || compilerOptions.strict === true,
            noImplicitAny: compilerOptions.noImplicitAny === true || compilerOptions.strict === true,
            target: compilerOptions.target || null,
        };
    }
    catch (error) {
        debug('project-health failed', { error: String(error) });
        return {
            hasConfig: true,
            strict: false,
            strictNullChecks: false,
            noImplicitAny: false,
            target: null,
        };
    }
}
/**
 * Get available npm scripts
 */
async function getScripts(cwd) {
    const packageJsonPath = path.join(cwd, 'package.json');
    if (!await fileExists(packageJsonPath)) {
        return [];
    }
    try {
        const content = await fs.readFile(packageJsonPath, 'utf-8');
        const packageJson = JSON.parse(content);
        return Object.keys(packageJson.scripts || {});
    }
    catch (error) {
        debug('project-health failed', { error: String(error) });
        return [];
    }
}
/**
 * Generate health warnings based on findings
 */
function generateWarnings(health) {
    const warnings = [];
    if (health.lockfiles && health.lockfiles.length > 0 && !health.hasNodeModules) {
        warnings.push({
            type: 'warning',
            message: 'node_modules not found. Run `npm install` (or your package manager) to install dependencies.',
        });
    }
    if (health.hasMultipleLockfiles) {
        warnings.push({
            type: 'warning',
            message: `Multiple lockfiles found (${health.lockfiles?.join(', ')}). This can cause inconsistent installs. Remove all but one.`,
        });
    }
    if (health.typescript && health.typescript.hasConfig && !health.typescript.strict) {
        warnings.push({
            type: 'info',
            message: 'TypeScript strict mode is not enabled. Consider enabling for better type safety.',
        });
    }
    return warnings;
}
/**
 * Generate improvement suggestions
 */
function generateSuggestions(health) {
    const suggestions = [];
    /* v8 ignore next -- @preserve defensive: scripts is always set by checkProjectHealth */
    const scripts = health.scripts || [];
    if (!scripts.includes('lint') && !scripts.includes('eslint')) {
        suggestions.push('Add a `lint` script to catch code issues');
    }
    if (!scripts.includes('test') && !scripts.includes('jest') && !scripts.includes('vitest')) {
        suggestions.push('Add a `test` script for automated testing');
    }
    if (!scripts.includes('typecheck') && !scripts.includes('tsc') && health.typescript?.hasConfig) {
        suggestions.push('Add a `typecheck` script (e.g., `tsc --noEmit`) for CI');
    }
    return suggestions.slice(0, MAX_SUGGESTIONS);
}
/**
 * Check overall project health with comprehensive analysis.
 *
 * This performs full analysis including TypeScript details and suggestions.
 * For lightweight status checks, use checkProjectHealth from health-checker.ts.
 */
export async function checkProjectHealth(cwd) {
    const [{ hasNodeModules, lockfiles, packageManager }, typescript, scripts] = await Promise.all([
        checkDependencies(cwd),
        checkTypeScript(cwd),
        getScripts(cwd),
    ]);
    const health = {
        hasNodeModules,
        lockfiles,
        hasMultipleLockfiles: lockfiles.length > 1,
        typescript,
        packageManager,
        scripts,
        warnings: [],
        suggestions: [],
    };
    health.warnings = generateWarnings(health);
    health.suggestions = generateSuggestions(health);
    return health;
}
/** Format project health status for display in context output. */
export function formatProjectHealth(health) {
    const sections = [];
    if (health.packageManager) {
        let line = `**Package Manager:** ${health.packageManager}`;
        if (!health.hasNodeModules) {
            line += ' (dependencies not installed)';
        }
        sections.push(line);
    }
    if (health.typescript) {
        const ts = health.typescript;
        let line = '**TypeScript:** ';
        if (ts.strict) {
            line += 'strict mode enabled';
        }
        else {
            const flags = [];
            if (ts.strictNullChecks)
                flags.push('strictNullChecks');
            if (ts.noImplicitAny)
                flags.push('noImplicitAny');
            line += flags.length > 0 ? `partial (${flags.join(', ')})` : 'not strict';
        }
        if (ts.target)
            line += `, target: ${ts.target}`;
        sections.push(line);
    }
    if (health.scripts.length > 0) {
        const importantScripts = health.scripts.filter((s) => ['dev', 'build', 'start', 'test', 'lint', 'typecheck'].includes(s));
        if (importantScripts.length > 0) {
            sections.push(`**Scripts:** ${importantScripts.join(', ')}`);
        }
    }
    if (health.warnings.length > 0) {
        const warningLines = health.warnings.map((w) => {
            const icon = w.type === 'error' ? '[!]' : w.type === 'warning' ? '[*]' : '[i]';
            return `${icon} ${w.message}`;
        });
        sections.push(`**Health Issues:**\n${warningLines.join('\n')}`);
    }
    if (health.suggestions.length > 0) {
        const suggestionLines = health.suggestions.map((s) => `- ${s}`);
        sections.push(`**Suggestions:**\n${suggestionLines.join('\n')}`);
    }
    return sections.length > 0 ? sections.join('\n') : null;
}
