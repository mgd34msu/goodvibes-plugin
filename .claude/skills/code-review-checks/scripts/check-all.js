#!/usr/bin/env node
/**
 * Comprehensive code review checker that detects common issues.
 *
 * @example
 * node check-all.js --path src/
 * node check-all.js --category critical --path src/
 * node check-all.js --files changed.txt --fail-on critical,major
 */

import { execSync } from 'child_process';
import { readFileSync, existsSync, statSync, readdirSync } from 'fs';
import { join, relative, resolve } from 'path';

// Configuration
const MAX_FUNCTION_LINES = 50;
const MAX_FILE_LINES = 300;

// Issue definitions with severity and detection
const CHECKS = {
  // Critical [P0]
  asAny: {
    name: 'as any type assertions',
    severity: 'critical',
    pattern: /as any/g,
    message: 'Type safety violation: use proper types instead of "as any"',
    exclude: ['__tests__', 'test', '.test.ts', '.spec.ts']
  },
  deprecated: {
    name: '@deprecated in code',
    severity: 'critical',
    pattern: /@deprecated/g,
    message: 'Deprecated code found: remove or update callers'
  },
  hardcodedSecrets: {
    name: 'hardcoded secrets',
    severity: 'critical',
    pattern: /(api[_-]?key|secret|password|token|credential)\s*[:=]\s*['"][^'"]+['"]/gi,
    message: 'Possible hardcoded secret: use environment variables'
  },
  apiKeyPatterns: {
    name: 'API key patterns',
    severity: 'critical',
    pattern: /['"]sk[-_][a-zA-Z0-9]{20,}['"]/g,
    message: 'API key pattern detected: use environment variables'
  },

  // Major [P1]
  silentCatch: {
    name: 'silent catch blocks',
    severity: 'major',
    pattern: /catch\s*\(\s*_e?r?r?o?r?\s*\)/g,
    message: 'Silent catch block: log error with context before swallowing'
  },
  emptyCatch: {
    name: 'empty catch blocks',
    severity: 'major',
    pattern: /catch\s*\([^)]*\)\s*\{\s*\}/g,
    message: 'Empty catch block: add error handling or logging'
  },
  consoleLog: {
    name: 'console.log in production',
    severity: 'major',
    pattern: /console\.(log|warn|error)\s*\(/g,
    message: 'Console statement: use proper logging utilities',
    exclude: ['__tests__', 'test', '.test.ts', '.spec.ts']
  },
  anyType: {
    name: 'any type usage',
    severity: 'major',
    pattern: /:\s*any\b|<any>/g,
    message: 'Using "any" type: use "unknown" with type narrowing',
    exclude: ['__tests__', 'test', '.test.ts', '.spec.ts']
  },

  // Minor [P2]
  mutableDefault: {
    name: 'mutable default parameters',
    severity: 'minor',
    pattern: /\(\s*\w+\s*=\s*\[\s*\]|\(\s*\w+\s*=\s*\{\s*\}/g,
    message: 'Mutable default parameter: use "param ?? []" pattern inside function'
  },
  magicNumber: {
    name: 'magic numbers',
    severity: 'minor',
    pattern: /[^a-zA-Z0-9_'"][1-9][0-9]{2,}[^0-9]/g,
    message: 'Magic number: extract to named constant'
  }
};

/**
 * Parse command line arguments
 */
function parseArgs() {
  const args = process.argv.slice(2);
  const result = {
    path: 'src/',
    category: null,
    files: null,
    failOn: [],
    verbose: false,
    json: false
  };

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--path':
        result.path = args[++i];
        break;
      case '--category':
        result.category = args[++i];
        break;
      case '--files':
        result.files = args[++i];
        break;
      case '--fail-on':
        result.failOn = args[++i].split(',');
        break;
      case '--verbose':
      case '-v':
        result.verbose = true;
        break;
      case '--json':
        result.json = true;
        break;
      case '--help':
      case '-h':
        printHelp();
        process.exit(0);
    }
  }
  return result;
}

function printHelp() {
  console.log(`
Usage: check-all.js [options]

Options:
  --path <dir>        Directory to check (default: src/)
  --category <cat>    Only run checks of this severity (critical|major|minor)
  --files <file>      File containing list of files to check
  --fail-on <cats>    Exit non-zero if issues found (comma-separated)
  --verbose, -v       Show detailed output
  --json              Output results as JSON
  --help, -h          Show this help

Examples:
  node check-all.js --path src/
  node check-all.js --category critical --path src/
  node check-all.js --fail-on critical,major
`);
}

/**
 * Collect TypeScript files from path or file list
 */
function collectFiles(options) {
  const files = [];

  if (options.files && existsSync(options.files)) {
    const content = readFileSync(options.files, 'utf-8');
    const lines = content.split('\n').filter(l => l.trim() && l.endsWith('.ts'));
    files.push(...lines.map(f => resolve(f.trim())));
  } else if (existsSync(options.path)) {
    const collectRecursive = (dir) => {
      const entries = readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = join(dir, entry.name);
        if (entry.isDirectory() && !entry.name.startsWith('.') && entry.name !== 'node_modules') {
          collectRecursive(fullPath);
        } else if (entry.isFile() && entry.name.endsWith('.ts')) {
          files.push(fullPath);
        }
      }
    };
    collectRecursive(resolve(options.path));
  }

  return files;
}

/**
 * Check if file should be excluded from a check
 */
function shouldExclude(filePath, excludePatterns) {
  if (!excludePatterns) return false;
  return excludePatterns.some(pattern => filePath.includes(pattern));
}

/**
 * Run pattern-based checks on a file
 */
function checkFile(filePath, options) {
  const issues = [];
  const content = readFileSync(filePath, 'utf-8');
  const lines = content.split('\n');
  const relativePath = relative(process.cwd(), filePath);

  // Run pattern checks
  for (const [checkId, check] of Object.entries(CHECKS)) {
    // Filter by category if specified
    if (options.category && check.severity !== options.category) continue;

    // Skip if file matches exclude patterns
    if (shouldExclude(filePath, check.exclude)) continue;

    let match;
    const regex = new RegExp(check.pattern.source, check.pattern.flags);

    while ((match = regex.exec(content)) !== null) {
      // Find line number
      const upToMatch = content.substring(0, match.index);
      const lineNum = upToMatch.split('\n').length;

      issues.push({
        file: relativePath,
        line: lineNum,
        check: checkId,
        severity: check.severity,
        name: check.name,
        message: check.message,
        match: match[0].substring(0, 50)
      });
    }
  }

  // Check file length
  if (!options.category || options.category === 'minor') {
    if (lines.length > MAX_FILE_LINES && !shouldExclude(filePath, ['__tests__', 'test'])) {
      issues.push({
        file: relativePath,
        line: 1,
        check: 'fileLength',
        severity: 'minor',
        name: 'file too long',
        message: `File has ${lines.length} lines (max: ${MAX_FILE_LINES})`,
        match: `${lines.length} lines`
      });
    }
  }

  // Check function lengths
  if (!options.category || options.category === 'major') {
    const functionStarts = [];
    let braceDepth = 0;
    let currentFunction = null;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      // Detect function start
      const funcMatch = line.match(/^\s*(export\s+)?(async\s+)?function\s+(\w+)|^\s*(export\s+)?const\s+(\w+)\s*=\s*(async\s+)?\([^)]*\)\s*(:\s*[^=]+)?\s*=>/);
      if (funcMatch) {
        const funcName = funcMatch[3] || funcMatch[5] || 'anonymous';
        currentFunction = { name: funcName, startLine: i + 1, braceDepth };
      }

      // Track braces
      const openBraces = (line.match(/\{/g) || []).length;
      const closeBraces = (line.match(/\}/g) || []).length;
      braceDepth += openBraces - closeBraces;

      // Detect function end
      if (currentFunction && braceDepth <= currentFunction.braceDepth) {
        const length = (i + 1) - currentFunction.startLine;
        if (length > MAX_FUNCTION_LINES) {
          issues.push({
            file: relativePath,
            line: currentFunction.startLine,
            check: 'functionLength',
            severity: 'major',
            name: 'function too long',
            message: `Function "${currentFunction.name}" has ${length} lines (max: ${MAX_FUNCTION_LINES})`,
            match: `${currentFunction.name}: ${length} lines`
          });
        }
        currentFunction = null;
      }
    }
  }

  return issues;
}

/**
 * Check for sequential async patterns
 */
function checkSequentialAsync(filePath, options) {
  if (options.category && options.category !== 'major') return [];

  const issues = [];
  const content = readFileSync(filePath, 'utf-8');
  const lines = content.split('\n');
  const relativePath = relative(process.cwd(), filePath);

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // await inside for/while loop
    if (/for\s*\([^)]*\)\s*\{/.test(line) || /while\s*\([^)]*\)\s*\{/.test(line)) {
      // Look ahead for await
      for (let j = i + 1; j < Math.min(i + 20, lines.length); j++) {
        if (/^\s*\}/.test(lines[j])) break;
        if (/await\s+/.test(lines[j])) {
          issues.push({
            file: relativePath,
            line: j + 1,
            check: 'sequentialAsync',
            severity: 'major',
            name: 'sequential async in loop',
            message: 'Use Promise.all() for independent async operations',
            match: lines[j].trim().substring(0, 50)
          });
          break;
        }
      }
    }
  }

  return issues;
}

/**
 * Check for missing barrel files
 */
function checkBarrelFiles(basePath, options) {
  if (options.category && options.category !== 'minor') return [];

  const issues = [];

  const checkDir = (dir) => {
    if (!existsSync(dir)) return;

    const entries = readdirSync(dir, { withFileTypes: true });
    const tsFiles = entries.filter(e => e.isFile() && e.name.endsWith('.ts') && e.name !== 'index.ts');
    const hasIndex = entries.some(e => e.isFile() && e.name === 'index.ts');
    const subDirs = entries.filter(e => e.isDirectory() && !e.name.startsWith('.') && e.name !== 'node_modules' && e.name !== '__tests__');

    // Directory with multiple .ts files but no index.ts
    if (tsFiles.length > 1 && !hasIndex) {
      issues.push({
        file: relative(process.cwd(), dir),
        line: 0,
        check: 'missingBarrel',
        severity: 'minor',
        name: 'missing barrel file',
        message: `Directory has ${tsFiles.length} .ts files but no index.ts`,
        match: tsFiles.map(f => f.name).join(', ')
      });
    }

    // Recurse into subdirectories
    for (const subDir of subDirs) {
      checkDir(join(dir, subDir.name));
    }
  };

  checkDir(resolve(basePath));
  return issues;
}

/**
 * Check for circular dependencies using madge
 */
function checkCircularDeps(basePath, options) {
  if (options.category && options.category !== 'minor') return [];

  try {
    const result = execSync(`npx madge --circular "${basePath}" 2>/dev/null`, { encoding: 'utf-8' });
    if (result.trim()) {
      return [{
        file: basePath,
        line: 0,
        check: 'circularDeps',
        severity: 'minor',
        name: 'circular dependencies',
        message: 'Circular dependencies detected',
        match: result.trim().substring(0, 100)
      }];
    }
  } catch {
    // madge not available or no circular deps
  }
  return [];
}

/**
 * Format and print results
 */
function printResults(issues, options) {
  if (options.json) {
    console.log(JSON.stringify(issues, null, 2));
    return;
  }

  if (issues.length === 0) {
    console.log('\n[PASS] No issues found!\n');
    return;
  }

  // Group by severity
  const bySeverity = {
    critical: issues.filter(i => i.severity === 'critical'),
    major: issues.filter(i => i.severity === 'major'),
    minor: issues.filter(i => i.severity === 'minor')
  };

  console.log('\n=== Code Review Check Results ===\n');

  for (const [severity, items] of Object.entries(bySeverity)) {
    if (items.length === 0) continue;

    const icon = severity === 'critical' ? '[P0]' : severity === 'major' ? '[P1]' : '[P2]';
    console.log(`${icon} ${severity.toUpperCase()} (${items.length} issues):`);
    console.log('-'.repeat(40));

    // Group by check type
    const byCheck = {};
    for (const item of items) {
      if (!byCheck[item.check]) byCheck[item.check] = [];
      byCheck[item.check].push(item);
    }

    for (const [check, checkItems] of Object.entries(byCheck)) {
      console.log(`\n  ${checkItems[0].name} (${checkItems.length}):`);
      for (const item of checkItems.slice(0, options.verbose ? 100 : 5)) {
        console.log(`    ${item.file}:${item.line}`);
        if (options.verbose) {
          console.log(`      -> ${item.message}`);
          console.log(`      -> ${item.match}`);
        }
      }
      if (!options.verbose && checkItems.length > 5) {
        console.log(`    ... and ${checkItems.length - 5} more`);
      }
    }
    console.log('');
  }

  // Summary
  console.log('=== Summary ===');
  console.log(`Critical: ${bySeverity.critical.length}`);
  console.log(`Major:    ${bySeverity.major.length}`);
  console.log(`Minor:    ${bySeverity.minor.length}`);
  console.log(`Total:    ${issues.length}\n`);
}

/**
 * Main entry point
 */
function main() {
  const options = parseArgs();
  const files = collectFiles(options);
  const allIssues = [];

  console.log(`Checking ${files.length} files...`);

  for (const file of files) {
    try {
      allIssues.push(...checkFile(file, options));
      allIssues.push(...checkSequentialAsync(file, options));
    } catch (error) {
      if (options.verbose) {
        console.error(`Error checking ${file}: ${error.message}`);
      }
    }
  }

  // Directory-level checks
  allIssues.push(...checkBarrelFiles(options.path, options));
  allIssues.push(...checkCircularDeps(options.path, options));

  printResults(allIssues, options);

  // Exit with error if fail-on conditions met
  if (options.failOn.length > 0) {
    const failingIssues = allIssues.filter(i => options.failOn.includes(i.severity));
    if (failingIssues.length > 0) {
      console.error(`\n[FAIL] Found ${failingIssues.length} issues in fail-on categories: ${options.failOn.join(', ')}`);
      process.exit(1);
    }
  }
}

main();
