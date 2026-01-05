/**
 * Environment configuration checking functionality
 */

import * as fs from 'fs';
import * as path from 'path';

import { EnvironmentIssue } from './types.js';
import { SENSITIVE_PATTERNS, ENV_FILES, ENV_EXAMPLE_FILES } from './constants.js';

/**
 * Check environment configuration
 */
export function checkEnvironment(cwd: string): EnvironmentIssue[] {
  const issues: EnvironmentIssue[] = [];

  // Find env files
  const envFiles: string[] = [];
  let definedVars: string[] = [];

  for (const envFile of ENV_FILES) {
    const filePath = path.join(cwd, envFile);
    if (fs.existsSync(filePath)) {
      envFiles.push(envFile);
      try {
        const content = fs.readFileSync(filePath, 'utf-8');
        for (const line of content.split('\n')) {
          const match = line.trim().match(/^([A-Z_][A-Z0-9_]*)\s*=/i);
          if (match) definedVars.push(match[1]);
        }
      } catch (err: unknown) {
        console.error(`[issues] Failed to read ${envFile}:`, err instanceof Error ? err.message : err);
      }
    }
  }

  definedVars = [...new Set(definedVars)];

  // Check for .env.example
  let exampleVars: string[] = [];
  for (const exampleFile of ENV_EXAMPLE_FILES) {
    const filePath = path.join(cwd, exampleFile);
    if (fs.existsSync(filePath)) {
      try {
        const content = fs.readFileSync(filePath, 'utf-8');
        for (const line of content.split('\n')) {
          const match = line.trim().match(/^([A-Z_][A-Z0-9_]*)\s*=/i);
          if (match) exampleVars.push(match[1]);
        }
      } catch (err: unknown) {
        console.error(`[issues] Failed to read ${exampleFile}:`, err instanceof Error ? err.message : err);
      }
      break;
    }
  }

  // Find missing vars
  const missingVars = exampleVars.filter(v => !definedVars.includes(v));
  for (const varName of missingVars) {
    issues.push({
      type: 'missing_var',
      message: `Missing env var: ${varName} (defined in .env.example but not set)`,
    });
  }

  // Check for sensitive vars not in gitignore
  const gitignorePath = path.join(cwd, '.gitignore');
  if (fs.existsSync(gitignorePath) && envFiles.length > 0) {
    try {
      const gitignore = fs.readFileSync(gitignorePath, 'utf-8');
      // Parse gitignore patterns properly (skip comments, handle patterns)
      const patterns = gitignore
        .split('\n')
        .map(line => line.trim())
        .filter(line => line && !line.startsWith('#'));

      for (const envFile of envFiles) {
        if (envFile === '.env.example') continue;

        // Check if any pattern matches this env file
        const isIgnored = patterns.some(pattern => {
          // Exact match
          if (pattern === envFile) return true;
          // Pattern matches .env or .env* or *.env*
          if (pattern === '.env' && envFile.startsWith('.env')) return true;
          if (pattern === '.env*' || pattern === '*.env*') return true;
          // Glob-like matching for .env.* patterns
          if (pattern === '.env.*' && envFile.startsWith('.env.')) return true;
          return false;
        });

        if (!isIgnored) {
          const vars = definedVars.filter(v => SENSITIVE_PATTERNS.some(p => p.test(v)));
          for (const varName of vars.slice(0, 3)) {
            issues.push({
              type: 'sensitive_exposed',
              message: `Sensitive var ${varName} in ${envFile} may not be gitignored`,
            });
          }
        }
      }
    } catch (err: unknown) {
      console.error(`[issues] Failed to read .gitignore:`, err instanceof Error ? err.message : err);
    }
  }

  return issues;
}
