/**
 * Keyword Categories
 *
 * Consolidated keyword definitions used for:
 * - Tech stack detection (shared.ts)
 * - Transcript classification (telemetry/transcript.ts)
 * - Task categorization
 *
 * This is the single authoritative source for keyword categories.
 */

// =============================================================================
// Stack Detection Keywords (for tech stack identification)
// =============================================================================

/**
 * Keyword categories optimized for tech stack detection.
 * Used by shared.ts for extractKeywords() and stack detection.
 */
export const STACK_KEYWORD_CATEGORIES: Record<string, string[]> = {
  frameworks_frontend: [
    'react',
    'nextjs',
    'next.js',
    'vue',
    'nuxt',
    'svelte',
    'sveltekit',
    'angular',
    'solid',
    'solidjs',
    'qwik',
    'astro',
    'remix',
    'gatsby',
  ],
  frameworks_backend: ['express', 'fastify', 'hono', 'koa', 'nest', 'nestjs'],
  languages: ['typescript', 'javascript', 'python', 'rust', 'go', 'golang'],
  databases: [
    'postgresql',
    'postgres',
    'mysql',
    'sqlite',
    'mongodb',
    'redis',
    'supabase',
    'firebase',
    'turso',
  ],
  orms: ['prisma', 'drizzle', 'typeorm', 'sequelize', 'knex', 'kysely'],
  api: ['rest', 'graphql', 'trpc', 'grpc', 'websocket', 'socket.io'],
  auth: ['clerk', 'nextauth', 'auth.js', 'lucia', 'auth0', 'jwt', 'oauth'],
  ui: [
    'tailwind',
    'tailwindcss',
    'shadcn',
    'radix',
    'chakra',
    'mantine',
    'mui',
  ],
  state: ['zustand', 'redux', 'jotai', 'recoil', 'mobx', 'valtio'],
  testing: ['vitest', 'jest', 'playwright', 'cypress', 'testing-library'],
  build: ['vite', 'webpack', 'esbuild', 'rollup', 'turbopack', 'bun'],
  devops: [
    'docker',
    'kubernetes',
    'vercel',
    'netlify',
    'cloudflare',
    'aws',
    'railway',
  ],
  ai: ['openai', 'anthropic', 'claude', 'gpt', 'llm', 'langchain', 'vercel-ai'],
};

// =============================================================================
// Transcript Classification Keywords (for task/content analysis)
// =============================================================================

/**
 * Keyword categories optimized for transcript and task classification.
 * More comprehensive coverage for understanding what tasks are about.
 */
export const TRANSCRIPT_KEYWORD_CATEGORIES: Record<string, string[]> = {
  // Frameworks (frontend + backend combined)
  frameworks: [
    'react',
    'next',
    'nextjs',
    'vue',
    'angular',
    'svelte',
    'remix',
    'astro',
    'express',
    'fastify',
    'hono',
    'koa',
    'nest',
    'nestjs',
    'django',
    'flask',
    'fastapi',
    'rails',
    'laravel',
    'spring',
    'springboot',
  ],

  // Databases (includes hosted services and ORMs)
  databases: [
    'postgres',
    'postgresql',
    'mysql',
    'mariadb',
    'sqlite',
    'mongodb',
    'mongo',
    'redis',
    'dynamodb',
    'supabase',
    'planetscale',
    'turso',
    'neon',
    'prisma',
    'drizzle',
    'kysely',
    'typeorm',
    'sequelize',
  ],

  // Authentication
  auth: [
    'auth',
    'authentication',
    'authorization',
    'oauth',
    'jwt',
    'session',
    'clerk',
    'auth0',
    'nextauth',
    'lucia',
    'passport',
    'login',
    'signup',
    'password',
    'token',
  ],

  // Testing
  testing: [
    'test',
    'testing',
    'jest',
    'vitest',
    'mocha',
    'chai',
    'playwright',
    'cypress',
    'puppeteer',
    'unit test',
    'integration test',
    'e2e',
    'coverage',
  ],

  // API
  api: [
    'api',
    'rest',
    'graphql',
    'trpc',
    'grpc',
    'endpoint',
    'route',
    'handler',
    'middleware',
    'openapi',
    'swagger',
    'apollo',
  ],

  // DevOps / Infrastructure
  devops: [
    'docker',
    'kubernetes',
    'k8s',
    'terraform',
    'ansible',
    'ci',
    'cd',
    'pipeline',
    'deploy',
    'deployment',
    'aws',
    'gcp',
    'azure',
    'vercel',
    'netlify',
    'railway',
    'github actions',
    'gitlab ci',
  ],

  // Frontend / UI
  frontend: [
    'css',
    'tailwind',
    'styled-components',
    'sass',
    'scss',
    'component',
    'ui',
    'ux',
    'responsive',
    'animation',
    'form',
    'modal',
    'table',
    'button',
    'input',
  ],

  // State Management
  state: [
    'state',
    'redux',
    'zustand',
    'jotai',
    'recoil',
    'mobx',
    'context',
    'provider',
    'store',
  ],

  // TypeScript
  typescript: [
    'typescript',
    'type',
    'interface',
    'generic',
    'enum',
    'zod',
    'yup',
    'io-ts',
    'validation',
    'schema',
  ],

  // Performance
  performance: [
    'performance',
    'optimization',
    'cache',
    'caching',
    'lazy',
    'bundle',
    'minify',
    'compress',
    'speed',
  ],

  // Security
  security: [
    'security',
    'xss',
    'csrf',
    'sql injection',
    'sanitize',
    'encrypt',
    'hash',
    'ssl',
    'https',
    'cors',
  ],

  // File Operations
  files: [
    'file',
    'upload',
    'download',
    'stream',
    'buffer',
    'read',
    'write',
    'create',
    'delete',
    'modify',
  ],
};

// =============================================================================
// Unified Access
// =============================================================================

/**
 * Default keyword categories - uses stack detection keywords.
 * This is the primary export for backwards compatibility with shared.ts.
 */
export const KEYWORD_CATEGORIES = STACK_KEYWORD_CATEGORIES;

/**
 * Flat list of all stack detection keywords.
 */
export const ALL_STACK_KEYWORDS = Object.values(
  STACK_KEYWORD_CATEGORIES
).flat();

/**
 * Flat list of all transcript classification keywords.
 */
export const ALL_TRANSCRIPT_KEYWORDS = Object.values(
  TRANSCRIPT_KEYWORD_CATEGORIES
).flat();

/**
 * Combined flat list of all unique keywords from both categories.
 */
export const ALL_KEYWORDS = [
  ...new Set([...ALL_STACK_KEYWORDS, ...ALL_TRANSCRIPT_KEYWORDS]),
];

// =============================================================================
// Utility Functions
// =============================================================================

/** Maximum number of keywords to extract from text. */
const MAX_EXTRACTED_KEYWORDS = 50;

/**
 * Escape special regex characters in a string.
 */
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Extract known keywords from text using stack detection categories.
 *
 * @param text - Text to search for keywords
 * @returns Array of found keywords (max 50)
 */
export function extractStackKeywords(text: string): string[] {
  const found = new Set<string>();
  const lowerText = text.toLowerCase();

  for (const keyword of ALL_STACK_KEYWORDS) {
    const regex = new RegExp(`\\b${escapeRegex(keyword)}\\b`, 'i');
    if (regex.test(lowerText)) {
      found.add(keyword);
    }
  }

  return Array.from(found).slice(0, MAX_EXTRACTED_KEYWORDS);
}

/**
 * Extract keywords from text with category metadata.
 * Used for transcript classification.
 *
 * @param taskDescription - Optional task description
 * @param transcriptContent - Optional transcript content
 * @param agentType - Optional agent type
 * @returns Array of keywords including category meta-keywords
 */
export function extractTranscriptKeywords(
  taskDescription?: string,
  transcriptContent?: string,
  agentType?: string
): string[] {
  const keywords = new Set<string>();
  const searchText = [
    taskDescription || '',
    transcriptContent || '',
    agentType || '',
  ]
    .join(' ')
    .toLowerCase();

  // Check for each keyword category
  for (const [category, categoryKeywords] of Object.entries(
    TRANSCRIPT_KEYWORD_CATEGORIES
  )) {
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
    const agentKeyword = agentType
      .replace(/^goodvibes:/, '')
      .replace(/-/g, ' ');
    keywords.add('agent:' + agentKeyword);
  }

  return Array.from(keywords).sort();
}
