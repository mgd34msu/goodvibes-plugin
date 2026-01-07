#!/usr/bin/env node
/**
 * @module type-safety/detect-type-issues
 * @description Detects TypeScript type safety issues in source files.
 * Identifies unsafe member access, assignments, returns, calls, and arguments.
 */

const fs = require('fs');
const path = require('path');

// Issue patterns to detect
const PATTERNS = {
  anyType: {
    regex: /:\s*any\b(?!\s*\[\])/g,
    severity: 'P1',
    message: 'Explicit any type usage',
    fix: 'Replace with unknown, generic, or specific interface',
  },
  jsonParse: {
    regex: /JSON\.parse\s*\([^)]+\)(?!\s*(?:as\s+unknown|:\s*unknown))/g,
    severity: 'P1',
    message: 'JSON.parse without type annotation',
    fix: 'Add explicit type: const parsed: unknown = JSON.parse(...)',
  },
  unsafeAssertion: {
    regex: /as\s+any\b/g,
    severity: 'P1',
    message: 'Unsafe type assertion to any',
    fix: 'Use as unknown first, then narrow with type guard',
  },
  dynamicAccess: {
    regex: /\[\s*\w+\s*\]\s*(?:\.|\()/g,
    severity: 'P2',
    message: 'Dynamic property access (potential any)',
    fix: 'Add index signature to type or use type guard',
  },
};

/**
 * Scans a file for type safety issues
 * @param {string} filePath - Path to TypeScript file
 * @returns {Array<{line: number, column: number, pattern: string, message: string, fix: string}>}
 */
function scanFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.split('\n');
  const issues = [];

  lines.forEach((line, lineIndex) => {
    // Skip comments
    if (line.trim().startsWith('//') || line.trim().startsWith('*')) {
      return;
    }

    for (const [patternName, pattern] of Object.entries(PATTERNS)) {
      let match;
      const regex = new RegExp(pattern.regex.source, pattern.regex.flags);

      while ((match = regex.exec(line)) !== null) {
        issues.push({
          file: filePath,
          line: lineIndex + 1,
          column: match.index + 1,
          pattern: patternName,
          severity: pattern.severity,
          message: pattern.message,
          fix: pattern.fix,
          snippet: line.trim(),
        });
      }
    }
  });

  return issues;
}

/**
 * Recursively find TypeScript files
 * @param {string} dir - Directory to search
 * @param {string[]} files - Accumulator for found files
 * @returns {string[]}
 */
function findTypeScriptFiles(dir, files = []) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      // Skip node_modules and hidden directories
      if (entry.name === 'node_modules' || entry.name.startsWith('.')) {
        continue;
      }
      findTypeScriptFiles(fullPath, files);
    } else if (entry.isFile() && /\.tsx?$/.test(entry.name)) {
      // Skip declaration files
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

  const files = findTypeScriptFiles(targetDir);
  const allIssues = [];

  for (const file of files) {
    const issues = scanFile(file);
    allIssues.push(...issues);
  }

  // Group by severity
  const bySeverity = {
    P1: allIssues.filter(i => i.severity === 'P1'),
    P2: allIssues.filter(i => i.severity === 'P2'),
  };

  // Output report
  const report = {
    summary: {
      totalFiles: files.length,
      totalIssues: allIssues.length,
      bySeverity: {
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
