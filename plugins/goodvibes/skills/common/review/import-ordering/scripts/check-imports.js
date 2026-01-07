#!/usr/bin/env node
/**
 * @module import-ordering/check-imports
 * @description Checks import ordering in TypeScript files.
 * Reports imports that are out of order according to standard conventions.
 */

const fs = require('fs');
const path = require('path');

// Import groups in order of priority
const GROUPS = {
  builtin: 1,
  external: 2,
  internal: 3,
  parent: 4,
  sibling: 5,
  index: 6,
  type: 7,
};

// Node.js built-in modules
const BUILTIN_MODULES = new Set([
  'assert', 'buffer', 'child_process', 'cluster', 'console', 'constants',
  'crypto', 'dgram', 'dns', 'domain', 'events', 'fs', 'http', 'https',
  'module', 'net', 'os', 'path', 'process', 'punycode', 'querystring',
  'readline', 'repl', 'stream', 'string_decoder', 'timers', 'tls', 'tty',
  'url', 'util', 'v8', 'vm', 'zlib',
]);

/**
 * Classify an import source into a group
 * @param {string} source - Import source path
 * @param {boolean} isType - Whether it's a type-only import
 * @returns {number} Group priority number
 */
function classifyImport(source, isType) {
  // Type imports always go last
  if (isType) {
    return GROUPS.type;
  }

  // Node.js builtins (with or without node: prefix)
  const cleanSource = source.replace(/^node:/, '');
  if (BUILTIN_MODULES.has(cleanSource)) {
    return GROUPS.builtin;
  }

  // Internal aliases (@/ paths)
  if (source.startsWith('@/')) {
    return GROUPS.internal;
  }

  // Relative imports
  if (source.startsWith('./')) {
    if (source === './' || source === './index') {
      return GROUPS.index;
    }
    return GROUPS.sibling;
  }

  if (source.startsWith('../')) {
    return GROUPS.parent;
  }

  // Everything else is external (npm packages)
  return GROUPS.external;
}

/**
 * Parse imports from file content
 * @param {string} content - File content
 * @returns {Array<object>} Parsed imports
 */
function parseImports(content) {
  const imports = [];
  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Match import statements
    const importMatch = line.match(
      /^import\s+(type\s+)?(?:(\{[^}]+\}|\*\s+as\s+\w+|\w+)(?:\s*,\s*(\{[^}]+\}))?\s+from\s+)?['"]([^'"]+)['"]/
    );

    if (importMatch) {
      const isType = !!importMatch[1];
      const source = importMatch[4];

      imports.push({
        line: i + 1,
        content: line.trim(),
        source,
        isType,
        group: classifyImport(source, isType),
      });
    }
  }

  return imports;
}

/**
 * Check if imports are properly ordered
 * @param {Array<object>} imports - Parsed imports
 * @returns {Array<object>} Order violations
 */
function checkOrder(imports) {
  const violations = [];

  for (let i = 1; i < imports.length; i++) {
    const prev = imports[i - 1];
    const curr = imports[i];

    // Check group order
    if (curr.group < prev.group) {
      violations.push({
        line: curr.line,
        type: 'wrong-group-order',
        message: `Import from '${curr.source}' should come before '${prev.source}'`,
        current: curr,
        shouldBeBefore: prev,
      });
    }

    // Check alphabetical order within same group
    if (curr.group === prev.group) {
      const currLower = curr.source.toLowerCase();
      const prevLower = prev.source.toLowerCase();

      if (currLower < prevLower) {
        violations.push({
          line: curr.line,
          type: 'wrong-alpha-order',
          message: `'${curr.source}' should come before '${prev.source}' (alphabetical)`,
          current: curr,
          shouldBeBefore: prev,
        });
      }
    }
  }

  return violations;
}

/**
 * Check for missing newlines between groups
 * @param {string} content - File content
 * @param {Array<object>} imports - Parsed imports
 * @returns {Array<object>} Newline violations
 */
function checkNewlines(content, imports) {
  const lines = content.split('\n');
  const violations = [];

  for (let i = 1; i < imports.length; i++) {
    const prev = imports[i - 1];
    const curr = imports[i];

    // Different groups should have a blank line between them
    if (prev.group !== curr.group) {
      const linesBetween = curr.line - prev.line - 1;
      const blankLinesBetween = lines
        .slice(prev.line, curr.line - 1)
        .filter(l => l.trim() === '').length;

      if (blankLinesBetween === 0) {
        violations.push({
          line: curr.line,
          type: 'missing-newline',
          message: `Missing blank line between import groups (${getGroupName(prev.group)} -> ${getGroupName(curr.group)})`,
        });
      }
    }

    // Same group should NOT have blank lines
    if (prev.group === curr.group && curr.line - prev.line > 1) {
      violations.push({
        line: curr.line,
        type: 'extra-newline',
        message: `Extra blank line within ${getGroupName(curr.group)} import group`,
      });
    }
  }

  return violations;
}

/**
 * Get human-readable group name
 * @param {number} group - Group number
 * @returns {string} Group name
 */
function getGroupName(group) {
  const names = Object.entries(GROUPS).find(([, v]) => v === group);
  return names ? names[0] : 'unknown';
}

/**
 * Analyze a file
 * @param {string} filePath - Path to file
 * @returns {object} Analysis results
 */
function analyzeFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf-8');
  const imports = parseImports(content);

  if (imports.length === 0) {
    return { file: filePath, imports: 0, violations: [] };
  }

  const orderViolations = checkOrder(imports);
  const newlineViolations = checkNewlines(content, imports);

  return {
    file: filePath,
    imports: imports.length,
    violations: [...orderViolations, ...newlineViolations],
  };
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
  const results = [];
  let totalViolations = 0;

  for (const file of files) {
    const result = analyzeFile(file);
    if (result.violations.length > 0) {
      results.push(result);
      totalViolations += result.violations.length;
    }
  }

  const report = {
    summary: {
      totalFiles: files.length,
      filesWithViolations: results.length,
      totalViolations,
    },
    files: results,
  };

  console.log(JSON.stringify(report, null, 2));
}

main();
