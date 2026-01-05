/**
 * Configuration reading handlers
 *
 * Provides handlers for reading and parsing various configuration files
 * commonly used in modern web development projects.
 *
 * @module handlers/config
 */

import * as fs from 'fs';
import * as path from 'path';
import { ToolResponse } from '../types.js';
import { PROJECT_ROOT } from '../config.js';

/**
 * Arguments for the read_config MCP tool
 */
export interface ReadConfigArgs {
  /** Configuration type to read (e.g., 'tsconfig', 'eslint', 'prettier') */
  config: string;
  /** Project path to read config from (defaults to PROJECT_ROOT) */
  path?: string;
  /** Whether to resolve extends/references in config files (not yet implemented) */
  resolve_extends?: boolean;
}

/**
 * Known configuration file paths by config type.
 *
 * Maps configuration type names to arrays of possible file paths
 * to check, in order of preference.
 */
const CONFIG_PATHS: Record<string, string[]> = {
  'package.json': ['package.json'],
  'tsconfig': ['tsconfig.json'],
  'eslint': ['.eslintrc.js', '.eslintrc.json', '.eslintrc', 'eslint.config.js', 'eslint.config.mjs'],
  'prettier': ['.prettierrc', '.prettierrc.json', '.prettierrc.js', 'prettier.config.js'],
  'tailwind': ['tailwind.config.js', 'tailwind.config.ts', 'tailwind.config.mjs'],
  'next': ['next.config.js', 'next.config.mjs', 'next.config.ts'],
  'vite': ['vite.config.ts', 'vite.config.js'],
  'prisma': ['prisma/schema.prisma'],
  'env': ['.env', '.env.local', '.env.example'],
};

/**
 * Handles the read_config MCP tool call.
 *
 * Reads and parses configuration files from a project. Supports multiple
 * configuration types including package.json, tsconfig, ESLint, Prettier,
 * Tailwind, Next.js, Vite, Prisma, and environment files.
 *
 * @param args - The read_config tool arguments
 * @param args.config - Configuration type to read (e.g., 'tsconfig', 'eslint')
 * @param args.path - Project path (defaults to PROJECT_ROOT)
 * @param args.resolve_extends - Whether to resolve extended configs (not implemented)
 * @returns MCP tool response with config content and metadata
 * @throws Error if the specified config file is not found
 *
 * @example
 * handleReadConfig({ config: 'tsconfig' });
 * // Returns: {
 * //   config_type: 'tsconfig',
 * //   file_path: 'tsconfig.json',
 * //   format: 'json',
 * //   content: { compilerOptions: {...} },
 * //   extends: [],
 * //   env_vars: []
 * // }
 *
 * @example
 * handleReadConfig({ config: 'tailwind', path: './packages/ui' });
 * // Reads tailwind config from a subdirectory
 */
export function handleReadConfig(args: ReadConfigArgs): ToolResponse {
  const projectPath = path.resolve(PROJECT_ROOT, args.path || '.');

  const filesToTry = args.config === 'custom' && args.path
    ? [args.path]
    : CONFIG_PATHS[args.config] || [args.config];

  for (const file of filesToTry) {
    const filePath = path.join(projectPath, file);
    if (fs.existsSync(filePath)) {
      const content = fs.readFileSync(filePath, 'utf-8');

      // Try to parse JSON
      let parsed: unknown = null;
      try {
        if (file.endsWith('.json')) {
          parsed = JSON.parse(content);
        }
      } catch {
        // Not JSON, return raw content
      }

      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            config_type: args.config,
            file_path: file,
            format: file.endsWith('.json') ? 'json' : file.endsWith('.js') || file.endsWith('.ts') ? 'javascript' : 'text',
            content: parsed || content,
            extends: [],
            env_vars: [],
          }, null, 2),
        }],
      };
    }
  }

  throw new Error(`Config '${args.config}' not found`);
}
