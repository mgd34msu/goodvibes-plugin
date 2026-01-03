/**
 * Shared utilities for GoodVibes hook scripts
 */
import * as fs from 'fs';
import * as path from 'path';
// Environment - using official Claude Code environment variable names
export const PLUGIN_ROOT = process.env.CLAUDE_PLUGIN_ROOT || path.resolve(process.cwd(), '..');
export const PROJECT_ROOT = process.env.CLAUDE_PROJECT_DIR || process.cwd();
export const CACHE_DIR = path.join(PLUGIN_ROOT, '.cache');
export const ANALYTICS_FILE = path.join(CACHE_DIR, 'analytics.json');
/**
 * Read hook input from stdin
 */
export async function readHookInput() {
    return new Promise((resolve, reject) => {
        let data = '';
        process.stdin.setEncoding('utf-8');
        process.stdin.on('data', (chunk) => {
            data += chunk;
        });
        process.stdin.on('end', () => {
            try {
                resolve(JSON.parse(data));
            }
            catch (error) {
                reject(new Error('Failed to parse hook input from stdin'));
            }
        });
        process.stdin.on('error', reject);
        // Handle case where no stdin is provided (timeout after 100ms)
        setTimeout(() => {
            if (!data) {
                resolve({
                    session_id: '',
                    transcript_path: '',
                    cwd: process.cwd(),
                    permission_mode: 'default',
                    hook_event_name: 'unknown',
                });
            }
        }, 100);
    });
}
/**
 * Create a response that allows the tool to proceed
 */
export function allowTool(hookEventName, systemMessage) {
    return {
        continue: true,
        systemMessage,
        hookSpecificOutput: {
            hookEventName,
            permissionDecision: 'allow',
        },
    };
}
/**
 * Create a response that blocks the tool
 */
export function blockTool(hookEventName, reason) {
    return {
        continue: false,
        hookSpecificOutput: {
            hookEventName,
            permissionDecision: 'deny',
            permissionDecisionReason: reason,
        },
    };
}
/**
 * Log debug message to stderr (visible in Claude Code logs but won't affect hook response)
 */
export function debug(message, data) {
    const timestamp = new Date().toISOString();
    if (data !== undefined) {
        console.error(`[GoodVibes ${timestamp}] ${message}:`, JSON.stringify(data, null, 2));
    }
    else {
        console.error(`[GoodVibes ${timestamp}] ${message}`);
    }
}
/**
 * Log error to stderr with full stack trace
 */
export function logError(context, error) {
    const timestamp = new Date().toISOString();
    const message = error instanceof Error ? error.message : String(error);
    const stack = error instanceof Error ? error.stack : undefined;
    console.error(`[GoodVibes ${timestamp}] ERROR in ${context}: ${message}`);
    if (stack) {
        console.error(stack);
    }
}
/**
 * Output hook response as JSON and exit with appropriate code
 * Exit 0 = success, Exit 2 = blocking error
 */
export function respond(response, block = false) {
    debug('Hook response', response);
    console.log(JSON.stringify(response));
    process.exit(block ? 2 : 0);
}
/**
 * Ensure cache directory exists
 */
export function ensureCacheDir() {
    if (!fs.existsSync(CACHE_DIR)) {
        fs.mkdirSync(CACHE_DIR, { recursive: true });
    }
}
/**
 * Load analytics from file
 */
export function loadAnalytics() {
    ensureCacheDir();
    if (fs.existsSync(ANALYTICS_FILE)) {
        try {
            const content = fs.readFileSync(ANALYTICS_FILE, 'utf-8');
            return JSON.parse(content);
        }
        catch {
            return null;
        }
    }
    return null;
}
/**
 * Save analytics to file
 */
export function saveAnalytics(analytics) {
    ensureCacheDir();
    fs.writeFileSync(ANALYTICS_FILE, JSON.stringify(analytics, null, 2));
}
/**
 * Check if a command is available
 */
export function commandExists(cmd) {
    try {
        const { execSync } = require('child_process');
        execSync(`where ${cmd}`, { stdio: 'ignore' });
        return true;
    }
    catch {
        return false;
    }
}
/**
 * Check if a file exists
 */
export function fileExists(filePath) {
    return fs.existsSync(path.resolve(PROJECT_ROOT, filePath));
}
/**
 * Check if registries are valid
 */
export function validateRegistries() {
    const registries = [
        'skills/_registry.yaml',
        'agents/_registry.yaml',
        'tools/_registry.yaml',
    ];
    const missing = [];
    for (const reg of registries) {
        if (!fs.existsSync(path.join(PLUGIN_ROOT, reg))) {
            missing.push(reg);
        }
    }
    return { valid: missing.length === 0, missing };
}
/**
 * Get current session ID (or create one)
 */
export function getSessionId() {
    const analytics = loadAnalytics();
    if (analytics?.session_id) {
        return analytics.session_id;
    }
    return `session_${Date.now()}`;
}
/**
 * Log a tool usage event
 */
export function logToolUsage(usage) {
    const analytics = loadAnalytics() || {
        session_id: getSessionId(),
        started_at: new Date().toISOString(),
        tool_usage: [],
        skills_recommended: [],
        validations_run: 0,
        issues_found: 0,
    };
    analytics.tool_usage.push(usage);
    saveAnalytics(analytics);
}
