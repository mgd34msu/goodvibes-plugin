#!/usr/bin/env node
/**
 * Checks for functions exceeding the maximum line length.
 *
 * @example
 * node check-function-length.js --path src/
 * node check-function-length.js --path src/ --max 40
 */

import { readFileSync, existsSync, readdirSync } from 'fs';
import { join, relative, resolve } from 'path';

const DEFAULT_MAX_LINES = 50;

/**
 * Parse command line arguments
 */
function parseArgs() {
  const args = process.argv.slice(2);
  const result = {
    path: 'src/',
    max: DEFAULT_MAX_LINES,
    verbose: false,
    json: false
  };

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--path':
        result.path = args[++i];
        break;
      case '--max':
        result.max = parseInt(args[++i], 10);
        break;
      case '--verbose':
      case '-v':
        result.verbose = true;
        break;
      case '--json':
        result.json = true;
        break;
    }
  }
  return result;
}

/**
 * Collect TypeScript files from path
 */
function collectFiles(basePath) {
  const files = [];

  const collectRecursive = (dir) => {
    if (!existsSync(dir)) return;

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

  collectRecursive(resolve(basePath));
  return files;
}

/**
 * Parse functions from a TypeScript file
 */
function parseFunctions(filePath) {
  const content = readFileSync(filePath, 'utf-8');
  const lines = content.split('\n');
  const functions = [];

  let braceStack = [];
  let currentFunction = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineNum = i + 1;

    // Detect function declarations
    const patterns = [
      // export async function foo(
      /^\s*(export\s+)?(async\s+)?function\s+(\w+)\s*(<[^>]+>)?\s*\(/,
      // export const foo = async (
      /^\s*(export\s+)?const\s+(\w+)\s*=\s*(async\s+)?\([^)]*\)\s*(:\s*[^=]+)?\s*=>/,
      // export const foo = async function(
      /^\s*(export\s+)?const\s+(\w+)\s*=\s*(async\s+)?function\s*\(/,
      // class method: async foo(
      /^\s*(public|private|protected)?\s*(static)?\s*(async)?\s*(\w+)\s*(<[^>]+>)?\s*\([^)]*\)\s*(:\s*[^{]+)?\s*\{/
    ];

    for (const pattern of patterns) {
      const match = line.match(pattern);
      if (match) {
        // Extract function name
        let name;
        if (pattern.toString().includes('function\\s+')) {
          name = match[3] || match[2];
        } else if (pattern.toString().includes('const\\s+')) {
          name = match[2];
        } else {
          name = match[4]; // class method
        }

        if (name && !['if', 'for', 'while', 'switch', 'catch'].includes(name)) {
          currentFunction = {
            name,
            startLine: lineNum,
            braceDepth: braceStack.length,
            isExported: line.includes('export'),
            isAsync: line.includes('async')
          };
        }
        break;
      }
    }

    // Track braces
    for (const char of line) {
      if (char === '{') {
        braceStack.push(lineNum);
      } else if (char === '}') {
        const openLine = braceStack.pop();

        // Check if this closes the current function
        if (currentFunction && braceStack.length === currentFunction.braceDepth) {
          currentFunction.endLine = lineNum;
          currentFunction.length = lineNum - currentFunction.startLine + 1;
          functions.push({ ...currentFunction });
          currentFunction = null;
        }
      }
    }
  }

  return functions;
}

/**
 * Check a file for long functions
 */
function checkFile(filePath, maxLines) {
  const relativePath = relative(process.cwd(), filePath);
  const functions = parseFunctions(filePath);

  return functions
    .filter(fn => fn.length > maxLines)
    .map(fn => ({
      file: relativePath,
      function: fn.name,
      startLine: fn.startLine,
      endLine: fn.endLine,
      length: fn.length,
      excess: fn.length - maxLines,
      isExported: fn.isExported,
      isAsync: fn.isAsync
    }))
    .sort((a, b) => b.length - a.length);
}

/**
 * Main entry point
 */
function main() {
  const options = parseArgs();
  const files = collectFiles(options.path);
  const allIssues = [];

  for (const file of files) {
    try {
      allIssues.push(...checkFile(file, options.max));
    } catch (error) {
      if (options.verbose) {
        console.error(`Error checking ${file}: ${error.message}`);
      }
    }
  }

  if (options.json) {
    console.log(JSON.stringify(allIssues, null, 2));
    return;
  }

  if (allIssues.length === 0) {
    console.log(`\n[PASS] All functions are under ${options.max} lines!\n`);
    return;
  }

  console.log(`\n=== Functions Exceeding ${options.max} Lines ===\n`);

  // Sort by length descending
  allIssues.sort((a, b) => b.length - a.length);

  // Group by file
  const byFile = {};
  for (const issue of allIssues) {
    if (!byFile[issue.file]) byFile[issue.file] = [];
    byFile[issue.file].push(issue);
  }

  for (const [file, issues] of Object.entries(byFile)) {
    console.log(`${file}:`);
    for (const issue of issues) {
      const prefix = issue.isExported ? 'export ' : '';
      const asyncPrefix = issue.isAsync ? 'async ' : '';
      console.log(`  ${prefix}${asyncPrefix}${issue.function}()`);
      console.log(`    Lines ${issue.startLine}-${issue.endLine} (${issue.length} lines, ${issue.excess} over limit)`);
    }
    console.log('');
  }

  // Summary stats
  const totalExcess = allIssues.reduce((sum, i) => sum + i.excess, 0);
  const avgLength = Math.round(allIssues.reduce((sum, i) => sum + i.length, 0) / allIssues.length);

  console.log('=== Summary ===');
  console.log(`Functions over limit: ${allIssues.length}`);
  console.log(`Total excess lines:   ${totalExcess}`);
  console.log(`Average length:       ${avgLength} lines`);
  console.log(`Longest function:     ${allIssues[0].function} (${allIssues[0].length} lines)`);
  console.log('');

  if (options.verbose) {
    console.log('=== Refactoring Suggestions ===');
    for (const issue of allIssues.slice(0, 5)) {
      console.log(`\n${issue.file}:${issue.startLine} - ${issue.function}()`);
      console.log('  Suggestions:');
      console.log('  - Extract helper functions for distinct operations');
      console.log('  - Move validation logic to separate function');
      console.log('  - Use early returns to reduce nesting');
      console.log('  - Consider splitting into multiple smaller functions');
    }
  }
}

main();
