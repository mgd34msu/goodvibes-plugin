/**
 * Telemetry utilities for GoodVibes hooks
 *
 * Provides:
 * - Active agent state management for SubagentStart/Stop correlation
 * - Transcript parsing for tool usage and file modifications
 * - Keyword extraction for categorization
 * - JSONL telemetry record writing
 */

import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';
import { debug, logError, PROJECT_ROOT } from './shared.js';

// ============================================================================
// Constants and Paths
// ============================================================================

const GOODVIBES_DIR = path.join(PROJECT_ROOT, '.goodvibes');
const STATE_DIR = path.join(GOODVIBES_DIR, 'state');
const TELEMETRY_DIR = path.join(GOODVIBES_DIR, 'telemetry');
const ACTIVE_AGENTS_FILE = path.join(STATE_DIR, 'active-agents.json');

// ============================================================================
// Types
// ============================================================================

export interface ActiveAgentEntry {
  agent_id: string;
  agent_type: string;
  session_id: string;
  cwd: string;
  project_name: string;
  started_at: string;
  git_branch?: string;
  git_commit?: string;
  task_description?: string;
}

export interface ActiveAgentsState {
  agents: Record<string, ActiveAgentEntry>;
  last_updated: string;
}

export interface ParsedTranscript {
  files_modified: string[];
  tools_used: string[];
  final_output?: string;
  error_count: number;
  success_indicators: string[];
}

export interface TelemetryRecord {
  type: 'subagent_complete';
  agent_id: string;
  agent_type: string;
  session_id: string;
  project_name: string;
  started_at: string;
  ended_at: string;
  duration_ms: number;
  cwd: string;
  git_branch?: string;
  git_commit?: string;
  task_description?: string;
  files_modified: string[];
  tools_used: string[];
  keywords: string[];
  success: boolean;
  final_summary?: string;
}

export interface GitInfo {
  branch?: string;
  commit?: string;
}

// ============================================================================
// Keyword Categories
// ============================================================================

export const KEYWORD_CATEGORIES: Record<string, string[]> = {
  // Frameworks
  frameworks: [
    'react', 'next', 'nextjs', 'vue', 'angular', 'svelte', 'remix', 'astro',
    'express', 'fastify', 'hono', 'koa', 'nest', 'nestjs',
    'django', 'flask', 'fastapi', 'rails', 'laravel',
    'spring', 'springboot',
  ],

  // Databases
  databases: [
    'postgres', 'postgresql', 'mysql', 'mariadb', 'sqlite',
    'mongodb', 'mongo', 'redis', 'dynamodb',
    'supabase', 'planetscale', 'turso', 'neon',
    'prisma', 'drizzle', 'kysely', 'typeorm', 'sequelize',
  ],

  // Authentication
  auth: [
    'auth', 'authentication', 'authorization', 'oauth', 'jwt', 'session',
    'clerk', 'auth0', 'nextauth', 'lucia', 'passport',
    'login', 'signup', 'password', 'token',
  ],

  // Testing
  testing: [
    'test', 'testing', 'jest', 'vitest', 'mocha', 'chai',
    'playwright', 'cypress', 'puppeteer',
    'unit test', 'integration test', 'e2e', 'coverage',
  ],

  // API
  api: [
    'api', 'rest', 'graphql', 'trpc', 'grpc',
    'endpoint', 'route', 'handler', 'middleware',
    'openapi', 'swagger', 'apollo',
  ],

  // DevOps / Infrastructure
  devops: [
    'docker', 'kubernetes', 'k8s', 'terraform', 'ansible',
    'ci', 'cd', 'pipeline', 'deploy', 'deployment',
    'aws', 'gcp', 'azure', 'vercel', 'netlify', 'railway',
    'github actions', 'gitlab ci',
  ],

  // Frontend
  frontend: [
    'css', 'tailwind', 'styled-components', 'sass', 'scss',
    'component', 'ui', 'ux', 'responsive', 'animation',
    'form', 'modal', 'table', 'button', 'input',
  ],

  // State Management
  state: [
    'state', 'redux', 'zustand', 'jotai', 'recoil', 'mobx',
    'context', 'provider', 'store',
  ],

  // TypeScript
  typescript: [
    'typescript', 'type', 'interface', 'generic', 'enum',
    'zod', 'yup', 'io-ts', 'validation', 'schema',
  ],

  // Performance
  performance: [
    'performance', 'optimization', 'cache', 'caching', 'lazy',
    'bundle', 'minify', 'compress', 'speed',
  ],

  // Security
  security: [
    'security', 'xss', 'csrf', 'sql injection', 'sanitize',
    'encrypt', 'hash', 'ssl', 'https', 'cors',
  ],

  // File Operations
  files: [
    'file', 'upload', 'download', 'stream', 'buffer',
    'read', 'write', 'create', 'delete', 'modify',
  ],
};

// ============================================================================
// Directory Management
// ============================================================================

/**
 * Ensure .goodvibes directories exist with lazy creation
 */
export function ensureGoodVibesDirs(): void {
  const dirs = [GOODVIBES_DIR, STATE_DIR, TELEMETRY_DIR];
  for (const dir of dirs) {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
      debug('Created directory: ' + dir);
    }
  }
}

// ============================================================================
// Git Utilities
// ============================================================================

/**
 * Get git branch and commit info for the current directory
 */
export function getGitInfo(cwd: string): GitInfo {
  const result: GitInfo = {};

  try {
    // Get current branch
    const branch = execSync('git rev-parse --abbrev-ref HEAD', {
      cwd,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    }).trim();
    result.branch = branch;
  } catch {
    // Not a git repository or git not available
  }

  try {
    // Get current commit (short hash)
    const commit = execSync('git rev-parse --short HEAD', {
      cwd,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    }).trim();
    result.commit = commit;
  } catch {
    // Ignore errors
  }

  return result;
}

/**
 * Derive project name from working directory path
 */
export function deriveProjectName(cwd: string): string {
  // Get the directory name
  const dirName = path.basename(cwd);

  // If it looks like a temp directory, try parent
  if (dirName.match(/^[a-f0-9]{8,}$/i) || dirName === 'tmp' || dirName === 'temp') {
    const parentDir = path.basename(path.dirname(cwd));
    if (parentDir && parentDir !== '.' && parentDir !== '/') {
      return parentDir;
    }
  }

  return dirName || 'unknown-project';
}

// ============================================================================
// Active Agents State Management
// ============================================================================

/**
 * Load active agents state from file
 */
export function loadActiveAgents(): ActiveAgentsState {
  ensureGoodVibesDirs();

  if (fs.existsSync(ACTIVE_AGENTS_FILE)) {
    try {
      const content = fs.readFileSync(ACTIVE_AGENTS_FILE, 'utf-8');
      return JSON.parse(content);
    } catch (error) {
      logError('loadActiveAgents', error);
    }
  }

  return {
    agents: {},
    last_updated: new Date().toISOString(),
  };
}

/**
 * Save active agents state to file
 */
export function saveActiveAgents(state: ActiveAgentsState): void {
  ensureGoodVibesDirs();
  state.last_updated = new Date().toISOString();
  fs.writeFileSync(ACTIVE_AGENTS_FILE, JSON.stringify(state, null, 2));
}

/**
 * Register a new active agent
 */
export function registerActiveAgent(entry: ActiveAgentEntry): void {
  const state = loadActiveAgents();
  state.agents[entry.agent_id] = entry;
  saveActiveAgents(state);
  debug('Registered active agent: ' + entry.agent_id + ' (' + entry.agent_type + ')');
}

/**
 * Look up and remove an active agent entry
 */
export function popActiveAgent(agentId: string): ActiveAgentEntry | null {
  const state = loadActiveAgents();
  const entry = state.agents[agentId];

  if (entry) {
    delete state.agents[agentId];
    saveActiveAgents(state);
    debug('Popped active agent: ' + agentId);
    return entry;
  }

  debug('Agent not found in active agents: ' + agentId);
  return null;
}

/**
 * Clean up stale agents (older than 24 hours)
 */
export function cleanupStaleAgents(): number {
  const state = loadActiveAgents();
  const now = Date.now();
  const maxAge = 24 * 60 * 60 * 1000; // 24 hours
  let removed = 0;

  for (const [agentId, entry] of Object.entries(state.agents)) {
    const startedAt = new Date(entry.started_at).getTime();
    if (now - startedAt > maxAge) {
      delete state.agents[agentId];
      removed++;
    }
  }

  if (removed > 0) {
    saveActiveAgents(state);
    debug('Cleaned up ' + removed + ' stale agent entries');
  }

  return removed;
}

// ============================================================================
// Transcript Parsing
// ============================================================================

/**
 * Parse a transcript file to extract useful information
 */
export function parseTranscript(transcriptPath: string): ParsedTranscript {
  const result: ParsedTranscript = {
    files_modified: [],
    tools_used: [],
    error_count: 0,
    success_indicators: [],
  };

  if (!transcriptPath || !fs.existsSync(transcriptPath)) {
    debug('Transcript file not found: ' + transcriptPath);
    return result;
  }

  try {
    const content = fs.readFileSync(transcriptPath, 'utf-8');

    // Try to parse as JSONL (each line is a JSON object)
    const lines = content.split('\n').filter(line => line.trim());

    for (const line of lines) {
      try {
        const entry = JSON.parse(line);
        processTranscriptEntry(entry, result);
      } catch {
        // Not JSON, try to parse as plain text
        processPlainTextLine(line, result);
      }
    }

    // Extract final output (last assistant message)
    const lastOutput = extractLastOutput(content);
    if (lastOutput) {
      result.final_output = lastOutput;
    }

  } catch (error) {
    logError('parseTranscript', error);
  }

  // Deduplicate arrays
  result.files_modified = [...new Set(result.files_modified)];
  result.tools_used = [...new Set(result.tools_used)];
  result.success_indicators = [...new Set(result.success_indicators)];

  return result;
}

/**
 * Process a single transcript entry (JSON format)
 */
function processTranscriptEntry(
  entry: Record<string, unknown>,
  result: ParsedTranscript
): void {
  // Check for tool usage
  if (entry.type === 'tool_use' || entry.tool_name || entry.name) {
    const toolName = (entry.tool_name || entry.name) as string;
    if (toolName) {
      result.tools_used.push(toolName);

      // Check for file modifications
      if (toolName === 'Write' || toolName === 'Edit' || toolName === 'write_file' || toolName === 'edit_file') {
        const input = entry.tool_input || entry.input || entry.parameters;
        if (input && typeof input === 'object') {
          const inputObj = input as Record<string, unknown>;
          const filePath = inputObj.file_path || inputObj.path || inputObj.file;
          if (typeof filePath === 'string') {
            result.files_modified.push(filePath);
          }
        }
      }
    }
  }

  // Check for errors
  if (entry.type === 'error' || entry.error) {
    result.error_count++;
  }

  // Check for success indicators
  const text = String(entry.content || entry.text || entry.message || '').toLowerCase();
  if (text.includes('successfully') || text.includes('completed') || text.includes('done')) {
    result.success_indicators.push(text.substring(0, 100));
  }
}

/**
 * Process a plain text line from transcript
 */
function processPlainTextLine(line: string, result: ParsedTranscript): void {
  const lowerLine = line.toLowerCase();

  // Look for tool usage patterns
  const toolPatterns = [
    /using\s+(\w+)\s+tool/i,
    /calling\s+(\w+)/i,
    /<tool_use\s+name="(\w+)"/i,
    /invoke\s+name="(\w+)"/i,
  ];

  for (const pattern of toolPatterns) {
    const match = line.match(pattern);
    if (match) {
      result.tools_used.push(match[1]);
    }
  }

  // Look for file paths being modified
  const filePatterns = [
    /(?:writing|editing|creating|modifying)\s+["']?([^\s"']+\.[a-z]{1,4})["']?/i,
    /file[_\s]path["']?\s*[:=]\s*["']([^"']+)["']/i,
  ];

  for (const pattern of filePatterns) {
    const match = line.match(pattern);
    if (match) {
      result.files_modified.push(match[1]);
    }
  }

  // Count errors
  if (lowerLine.includes('error:') || lowerLine.includes('failed:') || lowerLine.includes('exception')) {
    result.error_count++;
  }
}

/**
 * Extract the last assistant output from transcript
 */
function extractLastOutput(content: string): string | undefined {
  // Try to find the last assistant message in various formats
  const patterns = [
    /"role"\s*:\s*"assistant"[^}]*"content"\s*:\s*"([^"]+)"/g,
    /Assistant:\s*(.+?)(?=\n\n|Human:|$)/gs,
  ];

  let lastOutput: string | undefined;

  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(content)) !== null) {
      lastOutput = match[1];
    }
  }

  // Truncate if too long
  if (lastOutput && lastOutput.length > 500) {
    lastOutput = lastOutput.substring(0, 500) + '...';
  }

  return lastOutput;
}

// ============================================================================
// Keyword Extraction
// ============================================================================

/**
 * Extract keywords from task description and transcript content
 */
export function extractKeywords(
  taskDescription?: string,
  transcriptContent?: string,
  agentType?: string
): string[] {
  const keywords: Set<string> = new Set();
  const searchText = [
    taskDescription || '',
    transcriptContent || '',
    agentType || '',
  ].join(' ').toLowerCase();

  // Check for each keyword category
  for (const [category, categoryKeywords] of Object.entries(KEYWORD_CATEGORIES)) {
    for (const keyword of categoryKeywords) {
      // Use word boundary matching for accuracy
      const pattern = new RegExp('\\b' + escapeRegex(keyword) + '\\b', 'i');
      if (pattern.test(searchText)) {
        keywords.add(keyword);
        // Also add the category as a meta-keyword
        keywords.add('category:' + category);
      }
    }
  }

  // Add agent type as keyword if it's a known type
  if (agentType) {
    const agentKeyword = agentType.replace(/^goodvibes:/, '').replace(/-/g, ' ');
    keywords.add('agent:' + agentKeyword);
  }

  return Array.from(keywords).sort();
}

/**
 * Escape special regex characters
 */
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// ============================================================================
// Telemetry Writing
// ============================================================================

/**
 * Write a telemetry record to the monthly JSONL file
 */
export function writeTelemetryRecord(record: TelemetryRecord): void {
  ensureGoodVibesDirs();

  // Get current month for filename (YYYY-MM)
  const now = new Date();
  const yearMonth = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0');
  const telemetryFile = path.join(TELEMETRY_DIR, yearMonth + '.jsonl');

  // Append record as a single line of JSON
  const line = JSON.stringify(record) + '\n';
  fs.appendFileSync(telemetryFile, line);

  debug('Wrote telemetry record to ' + telemetryFile);
}

/**
 * Create a telemetry record from agent start entry and stop data
 */
export function createTelemetryRecord(
  startEntry: ActiveAgentEntry,
  parsedTranscript: ParsedTranscript,
  keywords: string[]
): TelemetryRecord {
  const endedAt = new Date().toISOString();
  const startedAt = new Date(startEntry.started_at).getTime();
  const endedAtMs = new Date(endedAt).getTime();
  const durationMs = endedAtMs - startedAt;

  // Determine success based on error count and success indicators
  const success = parsedTranscript.error_count === 0 ||
    parsedTranscript.success_indicators.length > 0;

  return {
    type: 'subagent_complete',
    agent_id: startEntry.agent_id,
    agent_type: startEntry.agent_type,
    session_id: startEntry.session_id,
    project_name: startEntry.project_name,
    started_at: startEntry.started_at,
    ended_at: endedAt,
    duration_ms: durationMs,
    cwd: startEntry.cwd,
    git_branch: startEntry.git_branch,
    git_commit: startEntry.git_commit,
    task_description: startEntry.task_description,
    files_modified: parsedTranscript.files_modified,
    tools_used: parsedTranscript.tools_used,
    keywords,
    success,
    final_summary: parsedTranscript.final_output,
  };
}
