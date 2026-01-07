#!/usr/bin/env node
/**
 * @module error-handling/detect-error-issues
 * @description Detects error handling issues in TypeScript/JavaScript files.
 * Finds floating promises, silent catches, and non-Error throws.
 */

const fs = require('fs');
const path = require('path');

// Issue patterns to detect
const PATTERNS = {
  floatingPromise: {
    // Async function call not awaited or assigned
    regex: /^\s*(?!return|await|void|const|let|var|if|while|for|\}|\.then|\.catch)[a-zA-Z_$][a-zA-Z0-9_$]*\s*\([^)]*\)\s*;?\s*$/gm,
    severity: 'P0',
    message: 'Potential floating promise (async call not awaited)',
    fix: 'Add await, void prefix with .catch(), or assign to variable',
  },
  silentCatch: {
    // Catch block with underscore-prefixed or unused error
    regex: /catch\s*\(\s*_?\w*\s*\)\s*\{\s*(?:\/\/[^\n]*\n\s*)?\}/g,
    severity: 'P1',
    message: 'Silent catch block (error swallowed)',
    fix: 'Log error with context before handling',
  },
  emptyCatch: {
    regex: /catch\s*\{\s*\}/g,
    severity: 'P1',
    message: 'Empty catch block',
    fix: 'Add error handling or logging',
  },
  throwString: {
    regex: /throw\s+['"`][^'"`]*['"`]/g,
    severity: 'P1',
    message: 'Throwing string literal instead of Error',
    fix: 'Use throw new Error("message")',
  },
  throwObject: {
    regex: /throw\s+\{[^}]+\}/g,
    severity: 'P1',
    message: 'Throwing plain object instead of Error',
    fix: 'Use custom Error class with properties',
  },
  catchAny: {
    regex: /catch\s*\(\s*(\w+)\s*\)\s*\{[^}]*\1\s*;?\s*\}/g,
    severity: 'P2',
    message: 'Catch block only references error (no handling)',
    fix: 'Add proper error handling logic',
  },
};

/**
 * Scans a file for error handling issues
 * @param {string} filePath - Path to source file
 * @returns {Array<object>} Array of issue objects
 */
function scanFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.split('\n');
  const issues = [];

  // Track if we're in a try-catch block
  let inTryCatch = false;
  let catchStart = -1;

  lines.forEach((line, lineIndex) => {
    // Track try-catch blocks
    if (line.includes('try {') || line.includes('try{')) {
      inTryCatch = true;
    }
    if (inTryCatch && line.includes('catch')) {
      catchStart = lineIndex;
    }
    if (catchStart >= 0 && line.includes('}')) {
      inTryCatch = false;
      catchStart = -1;
    }

    // Check for patterns
    for (const [patternName, pattern] of Object.entries(PATTERNS)) {
      // Skip floating promise check inside catch blocks
      if (patternName === 'floatingPromise' && inTryCatch) {
        continue;
      }

      let match;
      const regex = new RegExp(pattern.regex.source, 'g');

      while ((match = regex.exec(line)) !== null) {
        // Skip if line is a comment
        if (line.trim().startsWith('//') || line.trim().startsWith('*')) {
          continue;
        }

        // For floating promises, verify it looks like a function call
        if (patternName === 'floatingPromise') {
          const trimmed = line.trim();
          // Skip obvious non-promises
          if (
            trimmed.startsWith('import') ||
            trimmed.startsWith('export') ||
            trimmed.startsWith('type ') ||
            trimmed.startsWith('interface ') ||
            trimmed.includes('= ') ||
            trimmed.includes('=>')
          ) {
            continue;
          }
        }

        issues.push({
          file: filePath,
          line: lineIndex + 1,
          column: match.index + 1,
          pattern: patternName,
          severity: pattern.severity,
          message: pattern.message,
          fix: pattern.fix,
          snippet: line.trim().substring(0, 80),
        });
      }
    }
  });

  return issues;
}

/**
 * Recursively find source files
 * @param {string} dir - Directory to search
 * @param {string[]} files - Accumulator
 * @returns {string[]}
 */
function findSourceFiles(dir, files = []) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name.startsWith('.')) {
        continue;
      }
      findSourceFiles(fullPath, files);
    } else if (entry.isFile() && /\.[jt]sx?$/.test(entry.name)) {
      if (entry.name.endsWith('.d.ts')) {
        continue;
      }
      files.push(fullPath);
    }
  }

  return files;
}

/**
 * Main entry point
 */
function main() {
  const targetDir = process.argv[2] || '.';

  if (!fs.existsSync(targetDir)) {
    console.error(`Error: Directory not found: ${targetDir}`);
    process.exit(1);
  }

  const files = findSourceFiles(targetDir);
  const allIssues = [];

  for (const file of files) {
    const issues = scanFile(file);
    allIssues.push(...issues);
  }

  // Group by severity
  const bySeverity = {
    P0: allIssues.filter(i => i.severity === 'P0'),
    P1: allIssues.filter(i => i.severity === 'P1'),
    P2: allIssues.filter(i => i.severity === 'P2'),
  };

  const report = {
    summary: {
      totalFiles: files.length,
      totalIssues: allIssues.length,
      bySeverity: {
        P0: bySeverity.P0.length,
        P1: bySeverity.P1.length,
        P2: bySeverity.P2.length,
      },
      byPattern: {},
    },
    issues: allIssues,
  };

  // Count by pattern
  for (const issue of allIssues) {
    report.summary.byPattern[issue.pattern] =
      (report.summary.byPattern[issue.pattern] || 0) + 1;
  }

  console.log(JSON.stringify(report, null, 2));
}

main();
