#!/usr/bin/env node
/**
 * @module import-ordering/fix-imports
 * @description Automatically fixes import ordering in TypeScript files.
 * Sorts imports by group and alphabetically within groups.
 */

const fs = require('fs');

// Node.js built-in modules
const BUILTIN_MODULES = new Set([
  'assert', 'buffer', 'child_process', 'cluster', 'console', 'constants',
  'crypto', 'dgram', 'dns', 'domain', 'events', 'fs', 'http', 'https',
  'module', 'net', 'os', 'path', 'process', 'punycode', 'querystring',
  'readline', 'repl', 'stream', 'string_decoder', 'timers', 'tls', 'tty',
  'url', 'util', 'v8', 'vm', 'zlib',
]);

// Import groups
const GROUP_ORDER = ['builtin', 'external', 'internal', 'parent', 'sibling', 'index', 'type'];

/**
 * Classify import into group
 * @param {string} source - Import source
 * @param {boolean} isType - Is type import
 * @returns {string} Group name
 */
function classifyImport(source, isType) {
  if (isType) return 'type';

  const cleanSource = source.replace(/^node:/, '');
  if (BUILTIN_MODULES.has(cleanSource)) return 'builtin';
  if (source.startsWith('@/')) return 'internal';
  if (source === './' || source === './index') return 'index';
  if (source.startsWith('./')) return 'sibling';
  if (source.startsWith('../')) return 'parent';

  return 'external';
}

/**
 * Parse imports from content
 * @param {string} content - File content
 * @returns {object} Parsed data
 */
function parseFile(content) {
  const lines = content.split('\n');
  const imports = [];
  const nonImportLines = [];
  let importSectionEnd = 0;
  let inImportSection = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    // Check for import statement
    const importMatch = line.match(
      /^import\s+(type\s+)?(?:(\{[^}]+\}|\*\s+as\s+\w+|\w+)(?:\s*,\s*(\{[^}]+\}))?\s+from\s+)?['"]([^'"]+)['"]/
    );

    if (importMatch) {
      inImportSection = true;
      imports.push({
        line: i,
        content: line,
        source: importMatch[4],
        isType: !!importMatch[1],
        group: classifyImport(importMatch[4], !!importMatch[1]),
      });
      importSectionEnd = i;
    } else if (inImportSection && trimmed === '') {
      // Skip blank lines within import section
      importSectionEnd = i;
    } else if (inImportSection && !trimmed.startsWith('import')) {
      // End of import section
      inImportSection = false;
    }
  }

  return {
    imports,
    importSectionEnd: importSectionEnd + 1,
    preImportLines: [],
    postImportLines: lines.slice(importSectionEnd + 1),
  };
}

/**
 * Sort imports by group and alphabetically
 * @param {Array<object>} imports - Import objects
 * @returns {Array<object>} Sorted imports
 */
function sortImports(imports) {
  return [...imports].sort((a, b) => {
    // First by group
    const groupDiff = GROUP_ORDER.indexOf(a.group) - GROUP_ORDER.indexOf(b.group);
    if (groupDiff !== 0) return groupDiff;

    // Then alphabetically by source
    return a.source.toLowerCase().localeCompare(b.source.toLowerCase());
  });
}

/**
 * Format sorted imports with proper spacing
 * @param {Array<object>} imports - Sorted imports
 * @returns {string} Formatted import section
 */
function formatImports(imports) {
  if (imports.length === 0) return '';

  const lines = [];
  let lastGroup = null;

  for (const imp of imports) {
    // Add blank line between groups
    if (lastGroup !== null && lastGroup !== imp.group) {
      lines.push('');
    }

    lines.push(imp.content);
    lastGroup = imp.group;
  }

  return lines.join('\n');
}

/**
 * Fix imports in a file
 * @param {string} filePath - Path to file
 * @param {boolean} dryRun - If true, don't write changes
 * @returns {object} Result
 */
function fixFile(filePath, dryRun = false) {
  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.split('\n');

  // Find import section bounds
  let importStart = -1;
  let importEnd = -1;
  const imports = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    const importMatch = line.match(
      /^import\s+(type\s+)?(?:(\{[^}]+\}|\*\s+as\s+\w+|\w+)(?:\s*,\s*(\{[^}]+\}))?\s+from\s+)?['"]([^'"]+)['"]/
    );

    if (importMatch) {
      if (importStart === -1) importStart = i;
      importEnd = i;

      imports.push({
        content: line,
        source: importMatch[4],
        isType: !!importMatch[1],
        group: classifyImport(importMatch[4], !!importMatch[1]),
      });
    }
  }

  if (imports.length === 0) {
    return { file: filePath, changed: false, reason: 'No imports found' };
  }

  // Sort imports
  const sorted = sortImports(imports);
  const formattedImports = formatImports(sorted);

  // Check if already sorted
  const currentImports = imports.map(i => i.content).join('\n');
  if (currentImports === formattedImports.replace(/\n\n/g, '\n')) {
    // Close enough - might just be spacing
  }

  // Build new content
  const beforeImports = lines.slice(0, importStart);
  const afterImports = lines.slice(importEnd + 1);

  // Skip leading blank lines after imports
  let afterStartIndex = 0;
  while (afterStartIndex < afterImports.length && afterImports[afterStartIndex].trim() === '') {
    afterStartIndex++;
  }

  const newContent = [
    ...beforeImports,
    formattedImports,
    '',
    ...afterImports.slice(afterStartIndex),
  ].join('\n');

  if (newContent === content) {
    return { file: filePath, changed: false, reason: 'Already sorted' };
  }

  if (!dryRun) {
    fs.writeFileSync(filePath, newContent, 'utf-8');
  }

  return {
    file: filePath,
    changed: true,
    dryRun,
    importCount: imports.length,
  };
}

/**
 * Main entry point
 */
function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const filePath = args.find(a => !a.startsWith('--'));

  if (!filePath) {
    console.error('Usage: fix-imports.js <file.ts> [--dry-run]');
    process.exit(1);
  }

  if (!fs.existsSync(filePath)) {
    console.error(`Error: File not found: ${filePath}`);
    process.exit(1);
  }

  const result = fixFile(filePath, dryRun);

  if (result.changed) {
    console.log(`${dryRun ? 'Would fix' : 'Fixed'}: ${result.file} (${result.importCount} imports)`);
  } else {
    console.log(`No changes: ${result.file} - ${result.reason}`);
  }
}

main();
