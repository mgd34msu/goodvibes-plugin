/**
 * Environment Configuration Module
 *
 * Consolidated environment analysis providing both quick checks and comprehensive analysis.
 *
 * **Two APIs:**
 * - `checkEnvStatus()` - Quick check returning {@link EnvStatus} (basic presence/missing vars)
 * - `analyzeEnvironment()` - Comprehensive analysis returning {@link EnvironmentContext}
 */
import * as fs from 'fs/promises';
import * as path from 'path';
import { debug } from '../shared/logging.js';
import { fileExists } from '../shared/file-utils.js';
// =============================================================================
// Constants
// =============================================================================
/** Common sensitive variable patterns for security detection. */
const SENSITIVE_PATTERNS = [
    /api[_-]?key/i,
    /secret|password|token/i,
    /private[_-]?key/i,
    /credentials/i,
    /auth/i,
];
/** All env file variants to check for. */
const ENV_FILES = [
    '.env',
    '.env.local',
    '.env.development',
    '.env.development.local',
    '.env.production',
    '.env.production.local',
    '.env.test',
    '.env.test.local',
];
/** Example/template env files to check for required variables. */
const ENV_EXAMPLE_FILES = ['.env.example', '.env.sample', '.env.template'];
// =============================================================================
// Internal Helpers
// =============================================================================
/**
 * Parse an env file and extract variable names (async version).
 */
async function parseEnvFile(filePath) {
    try {
        if (!await fileExists(filePath))
            return [];
        const content = await fs.readFile(filePath, 'utf-8');
        return parseEnvVars(content);
    }
    catch (error) {
        debug('parseEnvFile failed', { error: String(error) });
        return [];
    }
}
/**
 * Parse env content and extract variable names.
 */
function parseEnvVars(content) {
    const vars = [];
    for (const line of content.split('\n')) {
        const trimmed = line.trim();
        // Skip comments and empty lines
        if (!trimmed || trimmed.startsWith('#'))
            continue;
        // Extract variable name (support both KEY=value and KEY= formats)
        const match = trimmed.match(/^([A-Z_][A-Z0-9_]*)\s*=/i);
        if (match) {
            vars.push(match[1]);
        }
    }
    return vars;
}
/**
 * Check if a variable name looks sensitive.
 */
function isSensitiveVar(varName) {
    return SENSITIVE_PATTERNS.some((pattern) => pattern.test(varName));
}
// =============================================================================
// Quick Check API (EnvStatus)
// =============================================================================
/**
 * Quick environment check returning basic status.
 *
 * This is the lightweight check that returns basic status. For comprehensive
 * environment analysis including sensitive variable detection, use
 * {@link analyzeEnvironment} instead.
 *
 * @param cwd - Working directory to check
 * @returns Promise resolving to EnvStatus
 */
export async function checkEnvStatus(cwd) {
    const envPath = path.join(cwd, '.env');
    const envLocalPath = path.join(cwd, '.env.local');
    const envExamplePath = path.join(cwd, '.env.example');
    const [hasEnvPathExists, hasEnvLocalExists, hasEnvExampleExists] = await Promise.all([
        fileExists(envPath),
        fileExists(envLocalPath),
        fileExists(envExamplePath),
    ]);
    const hasEnvFile = hasEnvPathExists || hasEnvLocalExists;
    const hasEnvExample = hasEnvExampleExists;
    let missingVars = [];
    const warnings = [];
    if (hasEnvExample) {
        const exampleContent = await fs.readFile(envExamplePath, 'utf-8');
        const requiredVars = parseEnvVars(exampleContent);
        let definedVars = [];
        if (hasEnvLocalExists) {
            definedVars = parseEnvVars(await fs.readFile(envLocalPath, 'utf-8'));
        }
        else if (hasEnvPathExists) {
            definedVars = parseEnvVars(await fs.readFile(envPath, 'utf-8'));
        }
        missingVars = requiredVars.filter(v => !definedVars.includes(v));
        if (missingVars.length > 0) {
            warnings.push(`Missing env vars: ${missingVars.join(', ')}`);
        }
    }
    return { hasEnvFile, hasEnvExample, missingVars, warnings };
}
// =============================================================================
// Comprehensive Analysis API (EnvironmentContext)
// =============================================================================
/**
 * Comprehensive environment analysis including security checks.
 *
 * Performs full analysis including:
 * - Detection of all .env file variants
 * - Missing variable detection against example files
 * - Sensitive variable exposure detection (not in .gitignore)
 *
 * @param cwd - Working directory to analyze
 * @returns Promise resolving to EnvironmentContext
 */
export async function analyzeEnvironment(cwd) {
    const envFiles = [];
    let definedVars = [];
    // Check which env files exist (parallel)
    const fileChecks = await Promise.all(ENV_FILES.map(async (envFile) => {
        const filePath = path.join(cwd, envFile);
        const exists = await fileExists(filePath);
        if (exists) {
            const vars = await parseEnvFile(filePath);
            return { envFile, vars };
        }
        return null;
    }));
    for (const result of fileChecks) {
        if (result) {
            envFiles.push(result.envFile);
            definedVars = [...definedVars, ...result.vars];
        }
    }
    // Deduplicate
    definedVars = [...new Set(definedVars)];
    // Check for .env.example (parallel check, sequential processing)
    let hasEnvExample = false;
    let exampleVars = [];
    const exampleChecks = await Promise.all(ENV_EXAMPLE_FILES.map(async (exampleFile) => {
        const filePath = path.join(cwd, exampleFile);
        const exists = await fileExists(filePath);
        return { exampleFile, filePath, exists };
    }));
    for (const check of exampleChecks) {
        if (check.exists) {
            hasEnvExample = true;
            exampleVars = await parseEnvFile(check.filePath);
            break;
        }
    }
    // Find missing vars (in example but not in any env file)
    const missingVars = exampleVars.filter((v) => !definedVars.includes(v));
    // Check for sensitive vars that might be in version control
    const sensitiveVarsExposed = [];
    const gitignorePath = path.join(cwd, '.gitignore');
    if (await fileExists(gitignorePath)) {
        const gitignore = await fs.readFile(gitignorePath, 'utf-8');
        for (const envFile of envFiles) {
            // Simple check - see if the file pattern is in gitignore
            const isIgnored = gitignore.includes(envFile) ||
                gitignore.includes('.env') ||
                gitignore.includes('.env*') ||
                gitignore.includes('.env.*');
            if (!isIgnored && envFile !== '.env.example') {
                const vars = await parseEnvFile(path.join(cwd, envFile));
                const sensitive = vars.filter(isSensitiveVar);
                sensitiveVarsExposed.push(...sensitive.map((v) => `${v} (in ${envFile})`));
            }
        }
    }
    return {
        envFiles,
        hasEnvExample,
        missingVars,
        definedVars,
        sensitiveVarsExposed: [...new Set(sensitiveVarsExposed)],
    };
}
// =============================================================================
// Formatting Functions
// =============================================================================
/**
 * Format EnvStatus for display in context output.
 *
 * @param status - The EnvStatus to format
 * @returns Formatted string or empty string if no relevant info
 */
export function formatEnvStatus(status) {
    const parts = [];
    if (status.hasEnvFile) {
        parts.push('Environment: .env present');
    }
    else if (status.hasEnvExample) {
        parts.push('Environment: .env.example exists but no .env file');
    }
    if (status.warnings.length > 0) {
        parts.push(`Warning: ${status.warnings.join(', ')}`);
    }
    return parts.join('\n');
}
/**
 * Format EnvironmentContext for display.
 *
 * @param context - The EnvironmentContext to format
 * @returns Formatted string or null if no env files
 */
export function formatEnvironment(context) {
    const lines = [];
    if (context.envFiles.length === 0) {
        return null;
    }
    lines.push(`**Env Files:** ${context.envFiles.join(', ')}`);
    if (context.missingVars.length > 0) {
        lines.push(`**Missing Vars:** ${context.missingVars.join(', ')} (defined in .env.example but not set)`);
    }
    if (context.sensitiveVarsExposed.length > 0) {
        lines.push(`**Warning:** Potentially sensitive vars may not be gitignored: ${context.sensitiveVarsExposed.join(', ')}`);
    }
    // lines always has at least one element here since we return early if envFiles is empty
    return lines.join('\n');
}
