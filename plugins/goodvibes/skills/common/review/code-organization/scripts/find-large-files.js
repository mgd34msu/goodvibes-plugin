#!/usr/bin/env node
/**
 * @module code-organization/find-large-files
 * @description Finds files exceeding line count threshold.
 * Reports files that should be considered for splitting.
 */

const fs = require('fs');
const path = require('path');

/**
 * Find files exceeding line threshold
 * @param {string} dir - Directory to search
 * @param {number} maxLines - Maximum lines threshold
 * @param {string[]} results - Accumulator
 * @returns {string[]}
 */
function findLargeFiles(dir, maxLines, results = []) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name.startsWith('.') || entry.name === 'dist') {
        continue;
      }
      findLargeFiles(fullPath, maxLines, results);
    } else if (entry.isFile() && /\.[jt]sx?$/.test(entry.name)) {
      if (entry.name.endsWith('.d.ts')) {
        continue;
      }

      const content = fs.readFileSync(fullPath, 'utf-8');
      const lineCount = content.split('\n').length;

      if (lineCount > maxLines) {
        results.push({
          file: fullPath,
          lines: lineCount,
          excess: lineCount - maxLines,
        });
      }
    }
  }

  return results;
}

/**
 * Analyze file contents for split suggestions
 * @param {string} filePath - Path to file
 * @returns {object} Analysis with suggestions
 */
function analyzeForSplit(filePath) {
  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.split('\n');

  const sections = {
    imports: 0,
    types: 0,
    constants: 0,
    functions: 0,
    classes: 0,
    exports: 0,
  };

  let currentSection = 'imports';

  for (const line of lines) {
    const trimmed = line.trim();

    if (trimmed.startsWith('import ')) {
      sections.imports++;
    } else if (trimmed.match(/^(?:export\s+)?(?:interface|type)\s+/)) {
      sections.types++;
      currentSection = 'types';
    } else if (trimmed.match(/^(?:export\s+)?const\s+[A-Z_]+\s*=/)) {
      sections.constants++;
      currentSection = 'constants';
    } else if (trimmed.match(/^(?:export\s+)?(?:async\s+)?function\s+/)) {
      sections.functions++;
      currentSection = 'functions';
    } else if (trimmed.match(/^(?:export\s+)?class\s+/)) {
      sections.classes++;
      currentSection = 'classes';
    } else if (trimmed.startsWith('export {') || trimmed.startsWith('export default')) {
      sections.exports++;
    }
  }

  const suggestions = [];

  if (sections.types > 5) {
    suggestions.push({
      type: 'extract-types',
      message: `Extract ${sections.types} type definitions to types.ts`,
    });
  }

  if (sections.constants > 3) {
    suggestions.push({
      type: 'extract-constants',
      message: `Extract ${sections.constants} constants to constants.ts`,
    });
  }

  if (sections.functions > 5) {
    suggestions.push({
      type: 'extract-functions',
      message: `Consider grouping ${sections.functions} functions by responsibility`,
    });
  }

  if (sections.classes > 1) {
    suggestions.push({
      type: 'extract-classes',
      message: `Extract ${sections.classes} classes to separate files`,
    });
  }

  return {
    sections,
    suggestions,
  };
}

/**
 * Main entry point
 */
function main() {
  const args = process.argv.slice(2);
  let targetDir = '.';
  let maxLines = 350;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--max-lines' || args[i] === '-m') {
      maxLines = parseInt(args[++i], 10);
    } else if (!args[i].startsWith('-')) {
      targetDir = args[i];
    }
  }

  if (!fs.existsSync(targetDir)) {
    console.error(`Error: Directory not found: ${targetDir}`);
    process.exit(1);
  }

  const largeFiles = findLargeFiles(targetDir, maxLines);

  if (largeFiles.length === 0) {
    console.log(`No files exceed ${maxLines} lines.`);
    return;
  }

  // Sort by line count descending
  largeFiles.sort((a, b) => b.lines - a.lines);

  console.log(`Found ${largeFiles.length} files exceeding ${maxLines} lines:\n`);

  for (const file of largeFiles) {
    console.log(`--- ${file.file} ---`);
    console.log(`Lines: ${file.lines} (+${file.excess} over limit)`);

    const analysis = analyzeForSplit(file.file);

    console.log('Content breakdown:');
    for (const [section, count] of Object.entries(analysis.sections)) {
      if (count > 0) {
        console.log(`  ${section}: ${count}`);
      }
    }

    if (analysis.suggestions.length > 0) {
      console.log('Suggestions:');
      for (const s of analysis.suggestions) {
        console.log(`  - ${s.message}`);
      }
    }

    console.log('');
  }
}

main();
