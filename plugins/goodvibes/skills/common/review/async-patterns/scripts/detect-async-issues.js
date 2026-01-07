#!/usr/bin/env node
/**
 * @module async-patterns/detect-async-issues
 * @description Detects async/await pattern issues in TypeScript files.
 * Finds unnecessary async, sequential awaits, and await non-promise.
 */

const fs = require('fs');
const path = require('path');

/**
 * Analyze a function for async issues
 * @param {string} content - File content
 * @param {string} filePath - File path for reporting
 * @returns {Array<object>} Issues found
 */
function analyzeFile(content, filePath) {
  const issues = [];
  const lines = content.split('\n');

  // Track async function blocks
  let inAsyncFunction = false;
  let asyncFunctionStart = -1;
  let asyncFunctionName = '';
  let hasAwait = false;
  let braceDepth = 0;
  let awaitLines = [];

  lines.forEach((line, lineIndex) => {
    // Detect async function declaration
    const asyncMatch = line.match(/async\s+(?:function\s+)?(\w+)?\s*\(/);
    if (asyncMatch && !inAsyncFunction) {
      inAsyncFunction = true;
      asyncFunctionStart = lineIndex + 1;
      asyncFunctionName = asyncMatch[1] || 'anonymous';
      hasAwait = false;
      braceDepth = 0;
      awaitLines = [];
    }

    // Track braces
    if (inAsyncFunction) {
      braceDepth += (line.match(/\{/g) || []).length;
      braceDepth -= (line.match(/\}/g) || []).length;

      // Track await statements
      if (line.includes('await ')) {
        hasAwait = true;
        awaitLines.push({
          line: lineIndex + 1,
          content: line.trim(),
        });
      }

      // Function ended
      if (braceDepth <= 0 && line.includes('}')) {
        // Check for require-await issue
        if (!hasAwait) {
          issues.push({
            file: filePath,
            line: asyncFunctionStart,
            type: 'require-await',
            severity: 'P2',
            message: `Async function '${asyncFunctionName}' has no await expression`,
            fix: 'Remove async keyword or add await expression',
          });
        }

        // Check for sequential awaits (potential parallelization)
        if (awaitLines.length >= 2) {
          // Simple heuristic: consecutive await lines
          for (let i = 1; i < awaitLines.length; i++) {
            if (awaitLines[i].line - awaitLines[i - 1].line <= 2) {
              // Check if they look independent (no variable from previous)
              const prevVar = awaitLines[i - 1].content.match(/(?:const|let)\s+(\w+)/);
              const currContent = awaitLines[i].content;

              if (prevVar && !currContent.includes(prevVar[1])) {
                issues.push({
                  file: filePath,
                  line: awaitLines[i - 1].line,
                  type: 'sequential-await',
                  severity: 'P2',
                  message: 'Sequential awaits may be parallelizable',
                  fix: 'Consider Promise.all for independent operations',
                  context: {
                    firstAwait: awaitLines[i - 1].content,
                    secondAwait: awaitLines[i].content,
                  },
                });
              }
            }
          }
        }

        inAsyncFunction = false;
        asyncFunctionStart = -1;
        asyncFunctionName = '';
        awaitLines = [];
      }
    }

    // Detect await on obvious non-promises
    const awaitNonPromise = line.match(/await\s+(\w+)\s*(?:;|$)/);
    if (awaitNonPromise) {
      const varName = awaitNonPromise[1];
      // Check if it's likely a sync value (simple heuristic)
      const syncPatterns = ['config', 'settings', 'options', 'data', 'result'];
      const lowerVar = varName.toLowerCase();
      if (syncPatterns.some(p => lowerVar.includes(p))) {
        // This is a weak heuristic - needs manual review
        issues.push({
          file: filePath,
          line: lineIndex + 1,
          type: 'potential-await-thenable',
          severity: 'P3',
          message: `Possible await on non-Promise: ${varName}`,
          fix: 'Verify this is actually a Promise, remove await if not',
        });
      }
    }
  });

  return issues;
}

/**
 * Recursively find TypeScript files
 * @param {string} dir - Directory to search
 * @param {string[]} files - Accumulator
 * @returns {string[]}
 */
function findTypeScriptFiles(dir, files = []) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name.startsWith('.')) {
        continue;
      }
      findTypeScriptFiles(fullPath, files);
    } else if (entry.isFile() && /\.tsx?$/.test(entry.name)) {
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
    const content = fs.readFileSync(file, 'utf-8');
    const issues = analyzeFile(content, file);
    allIssues.push(...issues);
  }

  const report = {
    summary: {
      totalFiles: files.length,
      totalIssues: allIssues.length,
      byType: {},
    },
    issues: allIssues,
  };

  // Count by type
  for (const issue of allIssues) {
    report.summary.byType[issue.type] =
      (report.summary.byType[issue.type] || 0) + 1;
  }

  console.log(JSON.stringify(report, null, 2));
}

main();
