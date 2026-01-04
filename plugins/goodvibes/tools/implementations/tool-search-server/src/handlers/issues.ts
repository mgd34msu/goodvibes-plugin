/**
 * Project Issues Handler
 *
 * Scans project for actionable issues:
 * - High-priority TODOs (FIXME, BUG) with file:line locations
 * - Health warnings (missing deps, multiple lockfiles, etc.)
 * - Environment issues (missing vars, exposed secrets)
 *
 * NOTE: Some TODO scanning logic is duplicated from hooks/scripts/src/context/todo-scanner.ts
 * This is intentional - the MCP server and hooks are separate npm packages with different
 * compilation targets. A shared module would require significant restructuring.
 * If you fix bugs here, also fix them in todo-scanner.ts!
 */

import * as fs from 'fs';
import * as path from 'path';

import { success } from '../utils.js';

// Types
/**
 * Arguments for the project_issues MCP tool
 */
export interface ProjectIssuesArgs {
  /** Project root path to scan (defaults to current working directory) */
  path?: string;
  /** Whether to include low-priority TODOs in results (defaults to false) */
  include_low_priority?: boolean;
}

interface TodoItem {
  type: 'TODO' | 'FIXME' | 'HACK' | 'XXX' | 'BUG' | 'NOTE';
  text: string;
  file: string;
  line: number;
  priority: 'high' | 'medium' | 'low';
}

interface HealthWarning {
  type: 'error' | 'warning' | 'info';
  message: string;
}

interface EnvironmentIssue {
  type: 'missing_var' | 'sensitive_exposed';
  message: string;
}

interface ProjectIssuesResult {
  total_issues: number;
  todos: {
    high_priority: TodoItem[];
    medium_priority: TodoItem[];
    low_priority: TodoItem[];
    total: number;
  };
  health: {
    warnings: HealthWarning[];
    suggestions: string[];
  };
  environment: {
    issues: EnvironmentIssue[];
  };
  formatted: string;
}

// Constants
const SCAN_EXTENSIONS = new Set([
  '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs',
  '.vue', '.svelte', '.py', '.rb', '.go', '.rs',
  '.java', '.kt', '.swift', '.cs', '.php',
]);

const SKIP_DIRS = new Set([
  'node_modules', '.git', 'dist', 'build', 'out',
  '.next', '.nuxt', '.svelte-kit', 'coverage',
  '.cache', 'vendor', '__pycache__', '.venv', 'venv', 'target',
  '__tests__', 'tests', 'test', '__mocks__', 'fixtures', '__fixtures__',
]);

const TEST_FILE_PATTERNS = [
  /\.test\.[jt]sx?$/,
  /\.spec\.[jt]sx?$/,
  /_test\.[jt]sx?$/,
  /_spec\.[jt]sx?$/,
  /\.stories\.[jt]sx?$/,
];

const TODO_PATTERN = /\b(TODO|FIXME|HACK|XXX|BUG|NOTE)\b[:\s]*(.+?)(?:\*\/|-->|$)/gi;

const LOCKFILES: Record<string, string> = {
  'package-lock.json': 'npm',
  'yarn.lock': 'yarn',
  'pnpm-lock.yaml': 'pnpm',
  'bun.lockb': 'bun',
};

const SENSITIVE_PATTERNS = [
  /api[_-]?key/i,
  /secret/i,
  /password/i,
  /token/i,
  /private[_-]?key/i,
  /credentials/i,
  /auth/i,
  /aws[_-]?secret/i,
  /github[_-]?token/i,
  /jwt[_-]?secret/i,
  /encryption[_-]?key/i,
  /access[_-]?key/i,
  /client[_-]?secret/i,
];

// Output formatting constants
const ICONS = {
  error: '🔴',
  warning: '🟡',
  info: '🔵',
  suggestion: '💡',
} as const;

const ENV_FILES = ['.env', '.env.local', '.env.development', '.env.production'];
const ENV_EXAMPLE_FILES = ['.env.example', '.env.sample', '.env.template'];

/**
 * Check if a filename is a test file
 */
function isTestFile(filename: string): boolean {
  return TEST_FILE_PATTERNS.some(pattern => pattern.test(filename));
}

/**
 * Determine TODO priority
 */
function getPriority(type: string, text: string): 'high' | 'medium' | 'low' {
  const upperType = type.toUpperCase();
  const lowerText = text.toLowerCase();

  if (upperType === 'FIXME' || upperType === 'BUG') return 'high';
  if (lowerText.includes('urgent') || lowerText.includes('critical') || lowerText.includes('important')) {
    return 'high';
  }
  if (lowerText.includes('security') || lowerText.includes('vulnerability')) return 'high';

  if (upperType === 'NOTE') return 'low';
  if (lowerText.includes('maybe') || lowerText.includes('consider') || lowerText.includes('nice to have')) {
    return 'low';
  }

  return 'medium';
}

/**
 * Scan a file for TODOs
 */
function scanFile(filePath: string, relativePath: string): TodoItem[] {
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    const lines = content.split('\n');
    const items: TodoItem[] = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      TODO_PATTERN.lastIndex = 0;
      let match;

      while ((match = TODO_PATTERN.exec(line)) !== null) {
        const type = match[1].toUpperCase() as TodoItem['type'];
        const text = match[2].trim();

        if (text.length < 3) continue;

        items.push({
          type,
          text: text.slice(0, 100),
          file: relativePath,
          line: i + 1,
          priority: getPriority(type, text),
        });
      }
    }

    return items;
  } catch (err) {
    // Log but continue - file may be unreadable or deleted during scan
    console.error(`[issues] Failed to scan file ${filePath}:`, err instanceof Error ? err.message : err);
    return [];
  }
}

/**
 * Recursively scan directory for TODOs
 */
function scanDirectory(dir: string, baseDir: string, items: TodoItem[], maxFiles: number = 500): void {
  if (items.length >= maxFiles * 10) return;

  let filesScanned = 0;

  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });

    for (const entry of entries) {
      if (filesScanned >= maxFiles) break;

      const fullPath = path.join(dir, entry.name);
      const relativePath = path.relative(baseDir, fullPath);

      if (entry.isDirectory()) {
        if (!SKIP_DIRS.has(entry.name)) {
          scanDirectory(fullPath, baseDir, items, maxFiles - filesScanned);
        }
      } else if (entry.isFile()) {
        const ext = path.extname(entry.name).toLowerCase();
        if (SCAN_EXTENSIONS.has(ext) && !isTestFile(entry.name)) {
          filesScanned++;
          const fileItems = scanFile(fullPath, relativePath);
          items.push(...fileItems);
        }
      }
    }
  } catch (err) {
    // Log but continue - directory may be inaccessible
    console.error(`[issues] Failed to read directory ${dir}:`, err instanceof Error ? err.message : err);
  }
}

/**
 * Check project health
 */
function checkHealth(cwd: string): { warnings: HealthWarning[]; suggestions: string[] } {
  const warnings: HealthWarning[] = [];
  const suggestions: string[] = [];

  // Check node_modules and lockfiles
  const hasNodeModules = fs.existsSync(path.join(cwd, 'node_modules'));
  const lockfiles: string[] = [];
  let packageManager: string | null = null;

  for (const [file, manager] of Object.entries(LOCKFILES)) {
    if (fs.existsSync(path.join(cwd, file))) {
      lockfiles.push(file);
      if (!packageManager) packageManager = manager;
    }
  }

  if (lockfiles.length > 0 && !hasNodeModules) {
    warnings.push({
      type: 'warning',
      message: `node_modules not found. Run \`${packageManager} install\` to install dependencies.`,
    });
  }

  if (lockfiles.length > 1) {
    warnings.push({
      type: 'warning',
      message: `Multiple lockfiles found (${lockfiles.join(', ')}). This can cause inconsistent installs.`,
    });
  }

  // Check TypeScript config
  const tsconfigPath = path.join(cwd, 'tsconfig.json');
  if (fs.existsSync(tsconfigPath)) {
    try {
      const content = fs.readFileSync(tsconfigPath, 'utf-8');
      const jsonContent = content.replace(/\/\*[\s\S]*?\*\/|\/\/.*/g, '');
      const tsconfig = JSON.parse(jsonContent);
      const compilerOptions = tsconfig.compilerOptions || {};

      if (!compilerOptions.strict) {
        warnings.push({
          type: 'info',
          message: 'TypeScript strict mode is not enabled. Consider enabling for better type safety.',
        });
      }
    } catch (err) {
      console.error(`[issues] Failed to parse tsconfig.json:`, err instanceof Error ? err.message : err);
    }
  }

  // Check package.json scripts
  const packageJsonPath = path.join(cwd, 'package.json');
  if (fs.existsSync(packageJsonPath)) {
    try {
      const content = fs.readFileSync(packageJsonPath, 'utf-8');
      const packageJson = JSON.parse(content);
      const scripts = Object.keys(packageJson.scripts || {});

      if (!scripts.includes('lint') && !scripts.includes('eslint')) {
        suggestions.push('Add a `lint` script to catch code issues');
      }
      if (!scripts.includes('test') && !scripts.includes('jest') && !scripts.includes('vitest')) {
        suggestions.push('Add a `test` script for automated testing');
      }
    } catch (err) {
      console.error(`[issues] Failed to parse package.json:`, err instanceof Error ? err.message : err);
    }
  }

  return { warnings, suggestions: suggestions.slice(0, 3) };
}

/**
 * Check environment configuration
 */
function checkEnvironment(cwd: string): EnvironmentIssue[] {
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
      } catch (err) {
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
      } catch (err) {
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
    } catch (err) {
      console.error(`[issues] Failed to read .gitignore:`, err instanceof Error ? err.message : err);
    }
  }

  return issues;
}

/**
 * Format issues for display
 */
function formatIssues(result: ProjectIssuesResult): string {
  const sections: string[] = [];

  sections.push(`## Project Issues (${result.total_issues} total)\n`);

  // High-priority TODOs
  sections.push(`### High-Priority TODOs (${result.todos.high_priority.length})`);
  if (result.todos.high_priority.length > 0) {
    for (const todo of result.todos.high_priority.slice(0, 10)) {
      sections.push(`- **${todo.type}** in \`${todo.file}:${todo.line}\`: ${todo.text}`);
    }
    if (result.todos.high_priority.length > 10) {
      sections.push(`  _(${result.todos.high_priority.length - 10} more...)_`);
    }
  } else {
    sections.push('No high-priority TODOs found.');
  }
  sections.push('');

  // Health warnings
  sections.push(`### Health Warnings (${result.health.warnings.length})`);
  if (result.health.warnings.length > 0) {
    for (const warning of result.health.warnings) {
      const icon = ICONS[warning.type] || ICONS.info;
      sections.push(`- ${icon} ${warning.message}`);
    }
  } else {
    sections.push('No health warnings.');
  }
  sections.push('');

  // Environment issues
  sections.push(`### Environment Issues (${result.environment.issues.length})`);
  if (result.environment.issues.length > 0) {
    for (const issue of result.environment.issues) {
      const icon = issue.type === 'sensitive_exposed' ? ICONS.error : ICONS.warning;
      sections.push(`- ${icon} ${issue.message}`);
    }
  } else {
    sections.push('No environment issues found.');
  }
  sections.push('');

  // Medium-priority TODOs (if any)
  if (result.todos.medium_priority.length > 0) {
    sections.push(`### Medium-Priority TODOs (${result.todos.medium_priority.length})`);
    for (const todo of result.todos.medium_priority.slice(0, 5)) {
      sections.push(`- ${todo.type} in \`${todo.file}:${todo.line}\`: ${todo.text}`);
    }
    if (result.todos.medium_priority.length > 5) {
      sections.push(`  _(${result.todos.medium_priority.length - 5} more...)_`);
    }
    sections.push('');
  }

  // Suggestions
  if (result.health.suggestions.length > 0) {
    sections.push('### Suggestions');
    for (const suggestion of result.health.suggestions) {
      sections.push(`- ${ICONS.suggestion} ${suggestion}`);
    }
  }

  return sections.join('\n');
}

/**
 * Main handler
 */
export function handleProjectIssues(args: ProjectIssuesArgs) {
  const cwd = args.path ? path.resolve(args.path) : process.cwd();

  // Validate path exists and is a directory
  if (!fs.existsSync(cwd)) {
    return success(`## Project Issues\n\nError: Path does not exist: ${cwd}`);
  }

  const stats = fs.statSync(cwd);
  if (!stats.isDirectory()) {
    return success(`## Project Issues\n\nError: Path is not a directory: ${cwd}`);
  }

  // Scan for TODOs
  const allTodos: TodoItem[] = [];
  scanDirectory(cwd, cwd, allTodos);

  const highPriority = allTodos.filter(t => t.priority === 'high');
  const mediumPriority = allTodos.filter(t => t.priority === 'medium');
  const lowPriority = allTodos.filter(t => t.priority === 'low');

  // Check health
  const health = checkHealth(cwd);

  // Check environment
  const envIssues = checkEnvironment(cwd);

  // Build result
  const totalIssues = highPriority.length + health.warnings.filter(w => w.type !== 'info').length + envIssues.length;

  const result: ProjectIssuesResult = {
    total_issues: totalIssues,
    todos: {
      high_priority: highPriority,
      medium_priority: args.include_low_priority ? mediumPriority : mediumPriority.slice(0, 10),
      low_priority: args.include_low_priority ? lowPriority : [],
      total: allTodos.length,
    },
    health: {
      warnings: health.warnings,
      suggestions: health.suggestions,
    },
    environment: {
      issues: envIssues,
    },
    formatted: '',
  };

  result.formatted = formatIssues(result);

  return success(result.formatted);
}
