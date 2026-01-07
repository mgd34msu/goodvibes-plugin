#!/usr/bin/env node
/**
 * @module naming-conventions/check-naming
 * @description Checks naming convention issues in TypeScript files.
 * Finds single-letter variables, non-standard abbreviations, and naming inconsistencies.
 */

const fs = require('fs');
const path = require('path');

// Standard abbreviations that are acceptable
const STANDARD_ABBREVIATIONS = new Set([
  'url', 'api', 'id', 'html', 'css', 'json', 'http', 'https',
  'io', 'db', 'fs', 'os', 'ui', 'cli', 'regex', 'uri', 'xml',
  'sql', 'dom', 'jwt', 'uuid', 'guid', 'mime', 'ascii', 'utf',
]);

// Non-standard abbreviations to flag
const NON_STANDARD_ABBREVIATIONS = {
  cwd: 'currentWorkingDirectory',
  dir: 'directory',
  env: 'environment',
  cfg: 'config',
  ctx: 'context',
  msg: 'message',
  err: 'error',
  req: 'request',
  res: 'response',
  params: 'parameters',
  args: 'arguments',
  props: 'properties',
  opts: 'options',
  cb: 'callback',
  fn: 'function',
  val: 'value',
  num: 'number',
  str: 'string',
  arr: 'array',
  obj: 'object',
  elem: 'element',
  idx: 'index',
  len: 'length',
  src: 'source',
  dest: 'destination',
  tmp: 'temporary',
  prev: 'previous',
  curr: 'current',
};

// Acceptable single letters
const ACCEPTABLE_SINGLE_LETTERS = new Set([
  'i', 'j', 'k', // Loop indices
  'x', 'y', 'z', // Coordinates
  'n', // Count
  '_', // Unused
  'T', 'K', 'V', 'U', 'R', // Generics
]);

/**
 * Analyze a file for naming issues
 * @param {string} content - File content
 * @param {string} filePath - File path
 * @returns {Array<object>} Naming issues
 */
function analyzeFile(content, filePath) {
  const issues = [];
  const lines = content.split('\n');

  // Extract variable declarations
  const varPatterns = [
    /(?:const|let|var)\s+(\w+)\s*[=:]/g,
    /(?:const|let|var)\s*\{([^}]+)\}/g, // Destructuring
    /(\w+)\s*=>/g, // Arrow function params
    /function\s+\w+\s*\(([^)]+)\)/g, // Function params
  ];

  for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
    const line = lines[lineIndex];

    // Skip comments
    if (line.trim().startsWith('//') || line.trim().startsWith('*')) {
      continue;
    }

    // Check for single-letter variables in arrow functions
    const arrowMatch = line.match(/\.(?:map|filter|find|forEach|reduce|some|every)\s*\(\s*(\w)\s*=>/);
    if (arrowMatch) {
      const varName = arrowMatch[1];
      if (!ACCEPTABLE_SINGLE_LETTERS.has(varName)) {
        issues.push({
          file: filePath,
          line: lineIndex + 1,
          type: 'single-letter',
          severity: 'P3',
          message: `Single-letter variable '${varName}' in array method`,
          variable: varName,
          suggestion: getSingularForm(line),
        });
      }
    }

    // Check for non-standard abbreviations
    const varDecl = line.match(/(?:const|let|var)\s+(\w+)\s*[=:]/);
    if (varDecl) {
      const varName = varDecl[1].toLowerCase();
      if (NON_STANDARD_ABBREVIATIONS[varName]) {
        issues.push({
          file: filePath,
          line: lineIndex + 1,
          type: 'non-standard-abbreviation',
          severity: 'P3',
          message: `Non-standard abbreviation '${varDecl[1]}'`,
          variable: varDecl[1],
          suggestion: NON_STANDARD_ABBREVIATIONS[varName],
        });
      }
    }

    // Check for very short variable names (2 chars)
    const shortVarMatch = line.match(/(?:const|let|var)\s+(\w{1,2})\s*[=:]/);
    if (shortVarMatch) {
      const varName = shortVarMatch[1];
      if (!ACCEPTABLE_SINGLE_LETTERS.has(varName) && varName !== 'id' && varName !== 'io') {
        issues.push({
          file: filePath,
          line: lineIndex + 1,
          type: 'short-name',
          severity: 'P3',
          message: `Very short variable name '${varName}'`,
          variable: varName,
        });
      }
    }
  }

  return issues;
}

/**
 * Get singular form suggestion based on context
 * @param {string} line - Source line
 * @returns {string|null} Suggested name
 */
function getSingularForm(line) {
  const collectionMatch = line.match(/(\w+)s?\.(?:map|filter|find|forEach|reduce|some|every)/);
  if (collectionMatch) {
    const collection = collectionMatch[1];
    // Remove trailing 's' for plural
    if (collection.endsWith('ies')) {
      return collection.slice(0, -3) + 'y';
    }
    if (collection.endsWith('es')) {
      return collection.slice(0, -2);
    }
    if (collection.endsWith('s')) {
      return collection.slice(0, -1);
    }
    return collection;
  }
  return null;
}

/**
 * Find TypeScript files
 * @param {string} dir - Directory
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
