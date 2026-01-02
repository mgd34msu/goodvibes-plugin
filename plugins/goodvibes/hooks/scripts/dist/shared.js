/**
 * Shared utilities for GoodVibes hook scripts
 */
import * as fs from 'fs';
import * as path from 'path';
// Environment
export const PLUGIN_ROOT = process.env.PLUGIN_ROOT || path.resolve(process.cwd(), '..');
export const PROJECT_ROOT = process.env.PROJECT_ROOT || process.cwd();
export const CACHE_DIR = path.join(PLUGIN_ROOT, '.cache');
export const ANALYTICS_FILE = path.join(CACHE_DIR, 'analytics.json');
/**
 * Output hook response as JSON
 */
export function respond(response) {
    console.log(JSON.stringify(response));
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
