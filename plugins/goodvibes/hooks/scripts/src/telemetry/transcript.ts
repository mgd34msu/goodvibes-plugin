/**
 * Transcript Parsing
 *
 * Provides transcript parsing, keyword extraction, and content analysis.
 */

import * as fs from 'fs';
import { debug, logError } from '../shared.js';

// ============================================================================
// Constants
// ============================================================================

/** Maximum length for truncated output text. */
export const MAX_OUTPUT_LENGTH = 500;

// ============================================================================
// Types
// ============================================================================

/** Parsed transcript data extracted from session logs. */
export interface ParsedTranscript {
  files_modified: string[];
  tools_used: string[];
  final_output?: string;
  error_count: number;
  success_indicators: string[];
}

// ============================================================================
// Keyword Categories
// ============================================================================

/** Keyword categories for classifying agent tasks and transcript content. */
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
      } catch (parseError) {
        // Not JSON, try to parse as plain text
        debug('Line not JSON, parsing as plain text');
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
  if (lastOutput && lastOutput.length > MAX_OUTPUT_LENGTH) {
    lastOutput = lastOutput.substring(0, MAX_OUTPUT_LENGTH) + '...';
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
