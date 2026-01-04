/**
 * Environment Checker (Lightweight)
 *
 * Checks environment configuration and identifies missing variables.
 * Returns a simple EnvStatus for quick status checks.
 *
 * **Difference from environment.ts:**
 * - This module returns {@link EnvStatus} with basic env file presence/missing vars
 * - environment.ts returns {@link EnvironmentContext} with comprehensive analysis
 *   including sensitive variable detection and gitignore checks
 *
 * Use this when you need a quick check; use environment.ts for full analysis.
 */
import * as fs from 'fs/promises';
import * as path from 'path';
import { fileExistsAsync } from '../shared.js';
function parseEnvVars(content) {
    return content
        .split('\n')
        .filter(line => line.trim() && !line.startsWith('#'))
        .map(line => line.split('=')[0].trim())
        .filter(Boolean);
}
/**
 * Check environment configuration: .env files and missing variables.
 *
 * This is a lightweight check that returns basic status. For comprehensive
 * environment analysis including sensitive variable detection, use
 * {@link checkEnvironment} from environment.ts instead.
 */
export async function checkEnvironment(cwd) {
    const envPath = path.join(cwd, '.env');
    const envLocalPath = path.join(cwd, '.env.local');
    const envExamplePath = path.join(cwd, '.env.example');
    const [hasEnvPathExists, hasEnvLocalExists, hasEnvExampleExists] = await Promise.all([
        fileExistsAsync(envPath),
        fileExistsAsync(envLocalPath),
        fileExistsAsync(envExamplePath),
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
/** Format environment status for display in context output. */
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
