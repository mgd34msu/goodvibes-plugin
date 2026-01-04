/**
 * Environment Checker (Comprehensive)
 *
 * Performs comprehensive environment configuration analysis including:
 * - Detection of all .env file variants (.env, .env.local, .env.production, etc.)
 * - Missing variable detection against .env.example/.env.sample/.env.template
 * - Sensitive variable exposure detection (API keys, secrets not in .gitignore)
 *
 * **Difference from env-checker.ts:**
 * - This module returns {@link EnvironmentContext} with full analysis
 * - env-checker.ts returns {@link EnvStatus} with basic presence/missing checks only
 *
 * Use this when you need comprehensive security analysis; use env-checker.ts for quick checks.
 */
import * as fs from 'fs';
import * as path from 'path';
import { debug } from '../shared/logging.js';
// Common sensitive variable patterns
const SENSITIVE_PATTERNS = [
    /api[_-]?key/i,
    /secret/i,
    /password/i,
    /token/i,
    /private[_-]?key/i,
    /credentials/i,
    /auth/i,
];
// Files to check for environment configuration
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
const ENV_EXAMPLE_FILES = ['.env.example', '.env.sample', '.env.template'];
/**
 * Parse an env file and extract variable names
 */
function parseEnvFile(filePath) {
    try {
        if (!fs.existsSync(filePath))
            return [];
        const content = fs.readFileSync(filePath, 'utf-8');
        const vars = [];
        for (const line of content.split('\n')) {
            const trimmed = line.trim();
            // Skip comments and empty lines
            if (!trimmed || trimmed.startsWith('#'))
                continue;
            // Extract variable name
            const match = trimmed.match(/^([A-Z_][A-Z0-9_]*)\s*=/i);
            if (match) {
                vars.push(match[1]);
            }
        }
        return vars;
    }
    catch (error) {
        debug('parseEnvFile failed', { error: String(error) });
        return [];
    }
}
/**
 * Check if a variable name looks sensitive
 */
function isSensitiveVar(varName) {
    return SENSITIVE_PATTERNS.some((pattern) => pattern.test(varName));
}
/**
 * Check environment configuration
 */
export async function checkEnvironment(cwd) {
    const envFiles = [];
    let definedVars = [];
    // Check which env files exist
    for (const envFile of ENV_FILES) {
        const filePath = path.join(cwd, envFile);
        if (fs.existsSync(filePath)) {
            envFiles.push(envFile);
            const vars = parseEnvFile(filePath);
            definedVars = [...definedVars, ...vars];
        }
    }
    // Deduplicate
    definedVars = [...new Set(definedVars)];
    // Check for .env.example
    let hasEnvExample = false;
    let exampleVars = [];
    for (const exampleFile of ENV_EXAMPLE_FILES) {
        const filePath = path.join(cwd, exampleFile);
        if (fs.existsSync(filePath)) {
            hasEnvExample = true;
            exampleVars = parseEnvFile(filePath);
            break;
        }
    }
    // Find missing vars (in example but not in any env file)
    const missingVars = exampleVars.filter((v) => !definedVars.includes(v));
    // Check for sensitive vars that might be in version control
    const sensitiveVarsExposed = [];
    const gitignorePath = path.join(cwd, '.gitignore');
    if (fs.existsSync(gitignorePath)) {
        const gitignore = fs.readFileSync(gitignorePath, 'utf-8');
        for (const envFile of envFiles) {
            // Simple check - see if the file pattern is in gitignore
            const isIgnored = gitignore.includes(envFile) ||
                gitignore.includes('.env') ||
                gitignore.includes('.env*') ||
                gitignore.includes('.env.*');
            if (!isIgnored && envFile !== '.env.example') {
                const vars = parseEnvFile(path.join(cwd, envFile));
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
/**
 * Format environment context for display
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
    return lines.length > 0 ? lines.join('\n') : null;
}
