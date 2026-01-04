/**
 * Shared utilities for GoodVibes hook scripts
 *
 * This file maintains backwards compatibility by re-exporting from
 * the split modules in src/shared/
 */

import * as fs from 'fs';
import * as fsPromises from 'fs/promises';
import * as path from 'path';

// Re-export from split modules for backwards compatibility
export type { HookInput, HookResponse, HookSpecificOutput } from './shared/hook-io.js';
export { readHookInput, allowTool, blockTool, respond } from './shared/hook-io.js';
export { debug, logError } from './shared/logging.js';

// Import for internal use
import { debug as debugLog } from './shared/logging.js';
export type { SharedConfig } from './shared/config.js';
export { CHECKPOINT_TRIGGERS, QUALITY_GATES, getDefaultSharedConfig, loadSharedConfig } from './shared/config.js';
export { SECURITY_GITIGNORE_ENTRIES, ensureSecureGitignore } from './shared/gitignore.js';

// =============================================================================
// Type Guards
// =============================================================================

/** Type guard for exec errors with stdout/stderr buffers */
function isExecError(error: unknown): error is { stdout?: Buffer; stderr?: Buffer; message?: string } {
  return error !== null && typeof error === 'object';
}

// =============================================================================
// Constants
// =============================================================================

/** Maximum length for transcript summary text. */
const TRANSCRIPT_SUMMARY_MAX_LENGTH = 500;

/** Maximum number of keywords to extract from text. */
const MAX_EXTRACTED_KEYWORDS = 50;

/** Package manager lockfiles for detection. */
export const LOCKFILES = ['pnpm-lock.yaml', 'yarn.lock', 'package-lock.json', 'bun.lockb'] as const;

// Environment - using official Claude Code environment variable names
export const PLUGIN_ROOT = process.env.CLAUDE_PLUGIN_ROOT || path.resolve(process.cwd(), '..');
export const PROJECT_ROOT = process.env.CLAUDE_PROJECT_DIR || process.cwd();
export const CACHE_DIR = path.join(PLUGIN_ROOT, '.cache');
export const ANALYTICS_FILE = path.join(CACHE_DIR, 'analytics.json');

// =============================================================================
// Analytics Types
// =============================================================================

/** Represents a single tool usage event for analytics. */
export interface ToolUsage {
  tool: string;
  timestamp: string;
  duration_ms?: number;
  success: boolean;
  args?: Record<string, unknown>;
}

/** Represents a tool failure event for analytics. */
export interface ToolFailure {
  tool: string;
  error: string;
  timestamp: string;
}

/** Represents a subagent spawn event for analytics. */
export interface SubagentSpawn {
  type: string;
  task: string;
  started_at: string;
  completed_at?: string;
  success?: boolean;
}

/** Aggregated analytics for a session. */
export interface SessionAnalytics {
  session_id: string;
  started_at: string;
  ended_at?: string;
  tool_usage: ToolUsage[];
  tool_failures?: ToolFailure[];
  skills_recommended: string[];
  subagents_spawned?: SubagentSpawn[];
  validations_run: number;
  issues_found: number;
  detected_stack?: Record<string, unknown>;
}

// =============================================================================
// Cache and Analytics Management
// =============================================================================

/**
 * Ensure cache directory exists
 */
export function ensureCacheDir(): void {
  if (!fs.existsSync(CACHE_DIR)) {
    fs.mkdirSync(CACHE_DIR, { recursive: true });
  }
}

/**
 * Load analytics from file
 */
export function loadAnalytics(): SessionAnalytics | null {
  ensureCacheDir();
  if (fs.existsSync(ANALYTICS_FILE)) {
    try {
      const content = fs.readFileSync(ANALYTICS_FILE, 'utf-8');
      return JSON.parse(content);
    } catch (error) {
      debugLog('loadAnalytics failed', { error: String(error) });
      return null;
    }
  }
  return null;
}

/**
 * Save analytics to file
 */
export function saveAnalytics(analytics: SessionAnalytics): void {
  ensureCacheDir();
  fs.writeFileSync(ANALYTICS_FILE, JSON.stringify(analytics, null, 2));
}

/**
 * Check if a command is available (cross-platform)
 */
export function commandExists(cmd: string): boolean {
  try {
    const { execSync } = require('child_process');
    // Use 'where' on Windows, 'which' on Unix/Mac
    const isWindows = process.platform === 'win32';
    const checkCmd = isWindows ? `where ${cmd}` : `which ${cmd}`;
    execSync(checkCmd, { stdio: 'ignore', timeout: 30000 });
    return true;
  } catch (error) {
    debugLog(`Command check failed for ${cmd}: ${error}`);
    return false;
  }
}

/**
 * Check if a file exists
 */
export function fileExists(filePath: string): boolean {
  return fs.existsSync(path.resolve(PROJECT_ROOT, filePath));
}

/**
 * Check if registries are valid
 */
export function validateRegistries(): { valid: boolean; missing: string[] } {
  const registries = [
    'skills/_registry.yaml',
    'agents/_registry.yaml',
    'tools/_registry.yaml',
  ];

  const missing: string[] = [];
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
export function getSessionId(): string {
  const analytics = loadAnalytics();
  if (analytics?.session_id) {
    return analytics.session_id;
  }
  return `session_${Date.now()}`;
}

/**
 * Log a tool usage event
 */
export function logToolUsage(usage: ToolUsage): void {
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
export async function ensureGoodVibesDir(cwd: string): Promise<string> {
  const goodvibesDir = path.join(cwd, '.goodvibes');

  if (!fs.existsSync(goodvibesDir)) {
    fs.mkdirSync(goodvibesDir, { recursive: true });
    fs.mkdirSync(path.join(goodvibesDir, 'memory'), { recursive: true });
    fs.mkdirSync(path.join(goodvibesDir, 'state'), { recursive: true });
    fs.mkdirSync(path.join(goodvibesDir, 'logs'), { recursive: true });
    fs.mkdirSync(path.join(goodvibesDir, 'telemetry'), { recursive: true });

    // Add security-hardened gitignore
    const { ensureSecureGitignore } = await import('./shared/gitignore.js');
    await ensureSecureGitignore(cwd);
  }

  return goodvibesDir;
}

// =============================================================================
// Master Keyword List for Telemetry
// =============================================================================

/** Keyword categories for telemetry and stack detection. */
export const KEYWORD_CATEGORIES: Record<string, string[]> = {
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
export function extractKeywords(text: string): string[] {
  const found = new Set<string>();
  const lowerText = text.toLowerCase();

  for (const keyword of ALL_KEYWORDS) {
    const regex = new RegExp(`\\b${keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
    if (regex.test(lowerText)) {
      found.add(keyword);
    }
  }

  return Array.from(found).slice(0, MAX_EXTRACTED_KEYWORDS);
}

// =============================================================================
// Transcript Parsing Utility
// =============================================================================

/** Parsed transcript data containing tools used and files modified. */
export interface TranscriptData {
  toolsUsed: string[];
  filesModified: string[];
  summary: string;
}

/**
 * Parse a Claude Code transcript file to extract tools used and files modified
 */
export function parseTranscript(transcriptPath: string): TranscriptData {
  const toolsUsed = new Set<string>();
  const filesModified: string[] = [];
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
      } catch (error) {
        debugLog('parseTranscript line parse failed', { error: String(error) });
      }
    }
  } catch (error) {
    debugLog('parseTranscript read failed', { error: String(error) });
  }

  return {
    toolsUsed: Array.from(toolsUsed),
    filesModified: [...new Set(filesModified)],
    summary: lastAssistantMessage.slice(0, TRANSCRIPT_SUMMARY_MAX_LENGTH),
  };
}

/**
 * Extract error output from an exec error (child_process execSync failures)
 */
export function extractErrorOutput(error: unknown): string {
  if (isExecError(error)) {
    return error.stdout?.toString() || error.stderr?.toString() || error.message || 'Unknown error';
  }
  return String(error);
}

/**
 * Check if a file exists (async version with absolute path support).
 *
 * This is the shared async implementation used by context modules
 * (env-checker, health-checker, stack-detector) to avoid duplicate code.
 *
 * @param filePath - Absolute path to the file
 * @returns Promise resolving to true if file exists
 */
export async function fileExistsAsync(filePath: string): Promise<boolean> {
  try {
    await fsPromises.access(filePath);
    return true;
  } catch (error) {
    debugLog('fileExistsAsync failed', { error: String(error) });
    return false;
  }
}
