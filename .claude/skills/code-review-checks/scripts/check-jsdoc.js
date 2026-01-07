#!/usr/bin/env node
/**
 * Checks for missing JSDoc documentation on exported functions and types.
 *
 * @example
 * node check-jsdoc.js --path src/
 * node check-jsdoc.js --path src/ --verbose
 */

import { readFileSync, existsSync, readdirSync } from 'fs';
import { join, relative, resolve } from 'path';

/**
 * Parse command line arguments
 */
function parseArgs() {
  const args = process.argv.slice(2);
  const result = {
    path: 'src/',
    verbose: false,
    json: false
  };

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--path':
        result.path = args[++i];
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
      if (entry.isDirectory() && !entry.name.startsWith('.') && entry.name !== 'node_modules' && entry.name !== '__tests__') {
        collectRecursive(fullPath);
      } else if (entry.isFile() && entry.name.endsWith('.ts') && !entry.name.includes('.test.') && !entry.name.includes('.spec.')) {
        files.push(fullPath);
      }
    }
  };

  collectRecursive(resolve(basePath));
  return files;
}

/**
 * Check a file for missing JSDoc on exports
 */
function checkFile(filePath) {
  const content = readFileSync(filePath, 'utf-8');
  const lines = content.split('\n');
  const relativePath = relative(process.cwd(), filePath);
  const issues = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Check for exported declarations
    const exportPatterns = [
      /^export\s+(async\s+)?function\s+(\w+)/,        // export function foo
      /^export\s+const\s+(\w+)\s*=/,                   // export const foo =
      /^export\s+interface\s+(\w+)/,                   // export interface Foo
      /^export\s+type\s+(\w+)/,                        // export type Foo
      /^export\s+class\s+(\w+)/,                       // export class Foo
      /^export\s+enum\s+(\w+)/                         // export enum Foo
    ];

    for (const pattern of exportPatterns) {
      const match = line.match(pattern);
      if (match) {
        const name = match[2] || match[1];

        // Check if preceded by JSDoc (look back up to 20 lines for multi-line JSDoc)
        let hasJSDoc = false;
        for (let j = i - 1; j >= Math.max(0, i - 20); j--) {
          const prevLine = lines[j].trim();
          if (prevLine === '*/') {
            // Found end of JSDoc, look for start
            for (let k = j - 1; k >= Math.max(0, j - 50); k--) {
              if (lines[k].trim().startsWith('/**')) {
                hasJSDoc = true;
                break;
              }
            }
            break;
          }
          if (prevLine && !prevLine.startsWith('*') && !prevLine.startsWith('//')) {
            // Hit non-comment code, stop looking
            break;
          }
        }

        if (!hasJSDoc) {
          issues.push({
            file: relativePath,
            line: i + 1,
            name,
            type: pattern.toString().includes('function') ? 'function' :
                  pattern.toString().includes('interface') ? 'interface' :
                  pattern.toString().includes('type') ? 'type' :
                  pattern.toString().includes('class') ? 'class' :
                  pattern.toString().includes('enum') ? 'enum' : 'const'
          });
        }
        break; // Only match one pattern per line
      }
    }
  }

  return issues;
}

/**
 * Generate JSDoc stub for an export
 */
function generateStub(issue) {
  switch (issue.type) {
    case 'function':
      return `/**
 * [TODO: Describe what ${issue.name} does]
 *
 * @param [TODO: Add parameters]
 * @returns [TODO: Describe return value]
 *
 * @example
 * const result = ${issue.name}();
 * // result === [TODO]
 */`;
    case 'interface':
    case 'type':
      return `/**
 * [TODO: Describe ${issue.name}]
 */`;
    case 'class':
      return `/**
 * [TODO: Describe ${issue.name} class]
 *
 * @example
 * const instance = new ${issue.name}();
 */`;
    default:
      return `/**
 * [TODO: Describe ${issue.name}]
 */`;
  }
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
      allIssues.push(...checkFile(file));
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
    console.log('\n[PASS] All exports have JSDoc documentation!\n');
    return;
  }

  console.log('\n=== Missing JSDoc Documentation ===\n');

  // Group by file
  const byFile = {};
  for (const issue of allIssues) {
    if (!byFile[issue.file]) byFile[issue.file] = [];
    byFile[issue.file].push(issue);
  }

  for (const [file, issues] of Object.entries(byFile)) {
    console.log(`${file}:`);
    for (const issue of issues) {
      console.log(`  Line ${issue.line}: export ${issue.type} ${issue.name}`);
      if (options.verbose) {
        console.log('  Suggested JSDoc:');
        console.log(generateStub(issue).split('\n').map(l => '    ' + l).join('\n'));
        console.log('');
      }
    }
    console.log('');
  }

  console.log(`Total: ${allIssues.length} exports missing JSDoc across ${Object.keys(byFile).length} files\n`);
}

main();
