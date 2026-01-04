/**
 * Shared utilities for GoodVibes hook scripts
 */
import * as fs from 'fs';
import * as path from 'path';
// =============================================================================
// Constants
// =============================================================================
/** Timeout in ms for waiting on stdin input before using defaults. */
const STDIN_TIMEOUT_MS = 100;
/** Maximum length for transcript summary text. */
const TRANSCRIPT_SUMMARY_MAX_LENGTH = 500;
/** Maximum number of keywords to extract from text. */
const MAX_EXTRACTED_KEYWORDS = 50;
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
        // Handle case where no stdin is provided (timeout after configured delay)
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
        }, STDIN_TIMEOUT_MS);
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
 * Check if a command is available (cross-platform)
 */
export function commandExists(cmd) {
    try {
        const { execSync } = require('child_process');
        // Use 'where' on Windows, 'which' on Unix/Mac
        const isWindows = process.platform === 'win32';
        const checkCmd = isWindows ? `where ${cmd}` : `which ${cmd}`;
        execSync(checkCmd, { stdio: 'ignore' });
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
// =============================================================================
// Lazy .goodvibes Directory Creation
// =============================================================================
/**
 * Ensure .goodvibes directory exists with all required subdirectories
 */
export async function ensureGoodVibesDir(cwd) {
    const goodvibesDir = path.join(cwd, '.goodvibes');
    if (!fs.existsSync(goodvibesDir)) {
        fs.mkdirSync(goodvibesDir, { recursive: true });
        fs.mkdirSync(path.join(goodvibesDir, 'memory'), { recursive: true });
        fs.mkdirSync(path.join(goodvibesDir, 'state'), { recursive: true });
        fs.mkdirSync(path.join(goodvibesDir, 'logs'), { recursive: true });
        fs.mkdirSync(path.join(goodvibesDir, 'telemetry'), { recursive: true });
        // Add security-hardened gitignore
        await ensureSecureGitignore(cwd);
    }
    return goodvibesDir;
}
// =============================================================================
// Security-Hardened Gitignore Updater
// =============================================================================
const SECURITY_GITIGNORE_ENTRIES = {
    'GoodVibes plugin state': ['.goodvibes/'],
    'Environment files': ['.env', '.env.local', '.env.*.local', '*.env'],
    'Secret files': ['*.pem', '*.key', 'credentials.json', 'secrets.json', 'service-account*.json'],
    'Cloud credentials': ['.aws/', '.gcp/', 'kubeconfig'],
    'Database files': ['*.db', '*.sqlite', '*.sqlite3', 'prisma/*.db'],
    'Log files': ['*.log', 'logs/'],
};
/**
 * Ensure .gitignore contains security-critical entries
 */
export async function ensureSecureGitignore(cwd) {
    const gitignorePath = path.join(cwd, '.gitignore');
    let content = '';
    if (fs.existsSync(gitignorePath)) {
        content = fs.readFileSync(gitignorePath, 'utf-8');
    }
    const entriesToAdd = [];
    for (const [section, patterns] of Object.entries(SECURITY_GITIGNORE_ENTRIES)) {
        const missing = patterns.filter(p => !content.includes(p));
        if (missing.length > 0) {
            entriesToAdd.push(`\n# ${section}`);
            entriesToAdd.push(...missing);
        }
    }
    if (entriesToAdd.length > 0) {
        const newContent = content.trimEnd() + '\n' + entriesToAdd.join('\n') + '\n';
        fs.writeFileSync(gitignorePath, newContent);
    }
}
// =============================================================================
// Master Keyword List for Telemetry
// =============================================================================
/** Keyword categories for telemetry and stack detection. */
export const KEYWORD_CATEGORIES = {
    frameworks_frontend: ['react', 'nextjs', 'next.js', 'vue', 'nuxt', 'svelte', 'sveltekit', 'angular', 'solid', 'solidjs', 'qwik', 'astro', 'remix', 'gatsby'],
    frameworks_backend: ['express', 'fastify', 'hono', 'koa', 'nest', 'nestjs'],
    languages: ['typescript', 'javascript', 'python', 'rust', 'go', 'golang'],
    databases: ['postgresql', 'postgres', 'mysql', 'sqlite', 'mongodb', 'redis', 'supabase', 'firebase', 'turso'],
    orms: ['prisma', 'drizzle', 'typeorm', 'sequelize', 'knex', 'kysely'],
    api: ['rest', 'graphql', 'trpc', 'grpc', 'websocket', 'socket.io'],
    auth: ['clerk', 'nextauth', 'auth.js', 'lucia', 'auth0', 'jwt', 'oauth'],
    ui: ['tailwind', 'tailwindcss', 'shadcn', 'radix', 'chakra', 'mantine', 'mui'],
    state: ['zustand', 'redux', 'jotai', 'recoil', 'mobx', 'valtio'],
    testing: ['vitest', 'jest', 'playwright', 'cypress', 'testing-library'],
    build: ['vite', 'webpack', 'esbuild', 'rollup', 'turbopack', 'bun'],
    devops: ['docker', 'kubernetes', 'vercel', 'netlify', 'cloudflare', 'aws', 'railway'],
    ai: ['openai', 'anthropic', 'claude', 'gpt', 'llm', 'langchain', 'vercel-ai'],
};
/** Flat list of all keywords across all categories. */
export const ALL_KEYWORDS = Object.values(KEYWORD_CATEGORIES).flat();
/**
 * Extract known keywords from text
 */
export function extractKeywords(text) {
    const found = new Set();
    const lowerText = text.toLowerCase();
    for (const keyword of ALL_KEYWORDS) {
        const regex = new RegExp(`\\b${keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
        if (regex.test(lowerText)) {
            found.add(keyword);
        }
    }
    return Array.from(found).slice(0, MAX_EXTRACTED_KEYWORDS);
}
/**
 * Parse a Claude Code transcript file to extract tools used and files modified
 */
export function parseTranscript(transcriptPath) {
    const toolsUsed = new Set();
    const filesModified = [];
    let lastAssistantMessage = '';
    try {
        const content = fs.readFileSync(transcriptPath, 'utf-8');
        const lines = content.split('\n').filter(Boolean);
        for (const line of lines) {
            try {
                const event = JSON.parse(line);
                if (event.type === 'tool_use') {
                    toolsUsed.add(event.name);
                    if (['Write', 'Edit'].includes(event.name) && event.input?.file_path) {
                        filesModified.push(event.input.file_path);
                    }
                }
                if (event.role === 'assistant' && event.content) {
                    lastAssistantMessage = typeof event.content === 'string'
                        ? event.content
                        : JSON.stringify(event.content);
                }
            }
            catch {
                // Skip malformed lines
            }
        }
    }
    catch {
        // Return empty data if transcript cannot be read
    }
    return {
        toolsUsed: Array.from(toolsUsed),
        filesModified: [...new Set(filesModified)],
        summary: lastAssistantMessage.slice(0, TRANSCRIPT_SUMMARY_MAX_LENGTH),
    };
}
// =============================================================================
// Checkpoint and Quality Gate Conditions
// =============================================================================
/** Triggers that determine when quality checkpoints should run. */
export const CHECKPOINT_TRIGGERS = {
    fileCountThreshold: 5,
    afterAgentComplete: true,
    afterMajorChange: true,
};
/** Default quality gate checks with auto-fix commands. */
export const QUALITY_GATES = [
    { name: 'TypeScript', check: 'npx tsc --noEmit', autoFix: null, blocking: true },
    { name: 'ESLint', check: 'npx eslint . --max-warnings=0', autoFix: 'npx eslint . --fix', blocking: true },
    { name: 'Prettier', check: 'npx prettier --check .', autoFix: 'npx prettier --write .', blocking: false },
    { name: 'Tests', check: 'npm test', autoFix: null, blocking: true },
];
/**
 * Get default shared configuration
 */
export function getDefaultSharedConfig() {
    return {
        telemetry: {
            enabled: true,
            anonymize: true,
        },
        quality: {
            gates: QUALITY_GATES,
            autoFix: true,
        },
        memory: {
            enabled: true,
            maxEntries: 100,
        },
        checkpoints: {
            enabled: true,
            triggers: CHECKPOINT_TRIGGERS,
        },
    };
}
/**
 * Deep merge two objects
 */
function deepMerge(target, source) {
    const result = { ...target };
    for (const key in source) {
        if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
            result[key] = deepMerge(result[key], source[key]);
        }
        else if (source[key] !== undefined) {
            result[key] = source[key];
        }
    }
    return result;
}
/**
 * Load shared configuration from .goodvibes/settings.json
 */
export function loadSharedConfig(cwd) {
    const configPath = path.join(cwd, '.goodvibes', 'settings.json');
    const defaults = getDefaultSharedConfig();
    if (!fs.existsSync(configPath)) {
        return defaults;
    }
    try {
        const content = fs.readFileSync(configPath, 'utf-8');
        const userConfig = JSON.parse(content);
        return deepMerge(defaults, userConfig.goodvibes || userConfig);
    }
    catch {
        return defaults;
    }
}
