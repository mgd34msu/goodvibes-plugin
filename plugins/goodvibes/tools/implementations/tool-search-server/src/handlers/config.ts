/**
 * Configuration reading handlers
 */

import * as fs from 'fs';
import * as path from 'path';
import { ToolResponse } from '../types.js';
import { PROJECT_ROOT } from '../config.js';

export interface ReadConfigArgs {
  config: string;
  path?: string;
  resolve_extends?: boolean;
}

/**
 * Known configuration file paths by config type
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
 * Handle read_config tool call
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
