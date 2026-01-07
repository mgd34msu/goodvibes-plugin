#!/usr/bin/env node
/**
 * @module config-hygiene/check-config
 * @description Checks configuration hygiene issues in a project.
 * Analyzes gitignore, package.json scripts, and ESLint config.
 */

const fs = require('fs');
const path = require('path');

// Patterns that should be in gitignore
const RECOMMENDED_GITIGNORE = [
  '*.swp',
  '*.swo',
  '*~',
  '*.bak',
  '*.orig',
  '.DS_Store',
  'Thumbs.db',
  '.idea/',
  '.vscode/',
  'node_modules/',
  'dist/',
  'build/',
  '*.tsbuildinfo',
  '.env',
  '*.log',
  'coverage/',
];

// Backup file patterns
const BACKUP_PATTERNS = ['*.bak', '*.orig', '*~', '*.swp', '*.swo'];

/**
 * Check gitignore for missing patterns
 * @param {string} projectRoot - Project root directory
 * @returns {object} Gitignore analysis
 */
function checkGitignore(projectRoot) {
  const gitignorePath = path.join(projectRoot, '.gitignore');
  const issues = [];

  if (!fs.existsSync(gitignorePath)) {
    return {
      exists: false,
      issues: [{
        type: 'missing-gitignore',
        severity: 'P1',
        message: 'No .gitignore file found',
      }],
    };
  }

  const content = fs.readFileSync(gitignorePath, 'utf-8');
  const lines = content.split('\n').map(l => l.trim());

  const missingPatterns = RECOMMENDED_GITIGNORE.filter(pattern => {
    return !lines.some(line => {
      // Exact match or pattern match
      return line === pattern || line.startsWith(pattern.replace('*', ''));
    });
  });

  if (missingPatterns.length > 0) {
    issues.push({
      type: 'missing-patterns',
      severity: 'P2',
      message: `Missing ${missingPatterns.length} recommended patterns`,
      patterns: missingPatterns,
    });
  }

  return { exists: true, issues };
}

/**
 * Find backup files in repository
 * @param {string} dir - Directory to search
 * @param {string[]} files - Accumulator
 * @returns {string[]}
 */
function findBackupFiles(dir, files = []) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === '.git' || entry.name.startsWith('.')) {
        continue;
      }
      findBackupFiles(fullPath, files);
    } else if (entry.isFile()) {
      const isBackup = BACKUP_PATTERNS.some(pattern => {
        if (pattern.startsWith('*')) {
          return entry.name.endsWith(pattern.slice(1));
        }
        return entry.name === pattern;
      });

      if (isBackup) {
        files.push(fullPath);
      }
    }
  }

  return files;
}

/**
 * Check package.json scripts
 * @param {string} projectRoot - Project root
 * @returns {object} Package.json analysis
 */
function checkPackageJson(projectRoot) {
  const packagePath = path.join(projectRoot, 'package.json');
  const issues = [];

  if (!fs.existsSync(packagePath)) {
    return { exists: false, issues: [] };
  }

  const pkg = JSON.parse(fs.readFileSync(packagePath, 'utf-8'));
  const scripts = pkg.scripts || {};

  // Check for silent failure in prepare
  if (scripts.prepare && scripts.prepare.includes('|| true')) {
    issues.push({
      type: 'silent-prepare',
      severity: 'P2',
      message: 'prepare script uses || true which hides failures',
      script: scripts.prepare,
      fix: 'Use conditional CI check instead',
    });
  }

  // Check lint:strict threshold
  if (scripts['lint:strict']) {
    const match = scripts['lint:strict'].match(/--max-warnings\s+(\d+)/);
    if (match) {
      const threshold = parseInt(match[1], 10);
      if (threshold > 100) {
        issues.push({
          type: 'permissive-lint',
          severity: 'P2',
          message: `lint:strict allows ${threshold} warnings (consider lowering)`,
          script: scripts['lint:strict'],
          threshold,
        });
      }
    }
  }

  return { exists: true, issues, scripts };
}

/**
 * Check ESLint config for duplication
 * @param {string} projectRoot - Project root
 * @returns {object} ESLint config analysis
 */
function checkEslintConfig(projectRoot) {
  const configPaths = [
    'eslint.config.js',
    'eslint.config.mjs',
    'eslint.config.ts',
    '.eslintrc.js',
    '.eslintrc.json',
  ];

  const issues = [];
  let configPath = null;

  for (const p of configPaths) {
    const fullPath = path.join(projectRoot, p);
    if (fs.existsSync(fullPath)) {
      configPath = fullPath;
      break;
    }
  }

  if (!configPath) {
    return { exists: false, issues: [] };
  }

  const content = fs.readFileSync(configPath, 'utf-8');

  // Check for duplicated plugins
  const pluginMatches = content.match(/plugins:\s*\{/g) || [];
  if (pluginMatches.length > 3) {
    issues.push({
      type: 'duplicated-plugins',
      severity: 'P3',
      message: `plugins defined ${pluginMatches.length} times - consider extracting`,
      count: pluginMatches.length,
    });
  }

  // Check for duplicated disabled rules
  const disabledRuleMatches = content.match(/'off'/g) || [];
  if (disabledRuleMatches.length > 10) {
    issues.push({
      type: 'many-disabled-rules',
      severity: 'P3',
      message: `${disabledRuleMatches.length} rules disabled - consider documenting why`,
      count: disabledRuleMatches.length,
    });
  }

  return { exists: true, configPath, issues };
}

/**
 * Main entry point
 */
function main() {
  const projectRoot = process.argv[2] || '.';

  if (!fs.existsSync(projectRoot)) {
    console.error(`Error: Directory not found: ${projectRoot}`);
    process.exit(1);
  }

  const gitignoreResults = checkGitignore(projectRoot);
  const backupFiles = findBackupFiles(projectRoot);
  const packageResults = checkPackageJson(projectRoot);
  const eslintResults = checkEslintConfig(projectRoot);

  const allIssues = [
    ...gitignoreResults.issues,
    ...packageResults.issues,
    ...eslintResults.issues,
  ];

  if (backupFiles.length > 0) {
    allIssues.push({
      type: 'backup-files',
      severity: 'P2',
      message: `Found ${backupFiles.length} backup/artifact files in repository`,
      files: backupFiles,
    });
  }

  const report = {
    summary: {
      totalIssues: allIssues.length,
      bySeverity: {
        P1: allIssues.filter(i => i.severity === 'P1').length,
        P2: allIssues.filter(i => i.severity === 'P2').length,
        P3: allIssues.filter(i => i.severity === 'P3').length,
      },
    },
    gitignore: gitignoreResults,
    backupFiles: backupFiles.length > 0 ? backupFiles : 'none',
    packageJson: packageResults,
    eslintConfig: eslintResults,
    allIssues,
  };

  console.log(JSON.stringify(report, null, 2));
}

main();
