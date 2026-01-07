#!/usr/bin/env node
/**
 * @module documentation/check-docs
 * @description Checks documentation coverage in TypeScript files.
 * Reports missing JSDoc, module docs, and incomplete documentation.
 */

const fs = require('fs');
const path = require('path');

/**
 * Parse file for documentation issues
 * @param {string} content - File content
 * @param {string} filePath - File path
 * @returns {object} Documentation analysis
 */
function analyzeFile(content, filePath) {
  const lines = content.split('\n');
  const issues = [];
  const stats = {
    exportedFunctions: 0,
    documentedFunctions: 0,
    hasModuleDoc: false,
    missingReturns: 0,
    missingParams: 0,
  };

  // Check for module-level JSDoc
  const moduleDocMatch = content.match(/^\/\*\*[\s\S]*?@module/);
  stats.hasModuleDoc = !!moduleDocMatch;

  if (!stats.hasModuleDoc) {
    issues.push({
      line: 1,
      type: 'missing-module-doc',
      severity: 'P3',
      message: 'Missing @module JSDoc at file top',
    });
  }

  // Track if previous line(s) have JSDoc
  let hasJsDoc = false;
  let jsDocContent = '';
  let jsDocStartLine = -1;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    // Track JSDoc blocks
    if (trimmed.startsWith('/**')) {
      hasJsDoc = true;
      jsDocContent = '';
      jsDocStartLine = i + 1;
    }

    if (hasJsDoc) {
      jsDocContent += line + '\n';
    }

    if (trimmed.endsWith('*/') && hasJsDoc) {
      // JSDoc block ended, next declaration will have it
    }

    // Check for exported functions
    const exportFuncMatch = trimmed.match(
      /^export\s+(async\s+)?function\s+(\w+)/
    );
    const exportConstFuncMatch = trimmed.match(
      /^export\s+const\s+(\w+)\s*=\s*(?:async\s*)?\(/
    );
    const exportArrowMatch = trimmed.match(
      /^export\s+const\s+(\w+)\s*=\s*(?:async\s*)?\([^)]*\)\s*(?::\s*[^=]+)?\s*=>/
    );

    const funcName =
      (exportFuncMatch && exportFuncMatch[2]) ||
      (exportConstFuncMatch && exportConstFuncMatch[1]) ||
      (exportArrowMatch && exportArrowMatch[1]);

    if (funcName) {
      stats.exportedFunctions++;

      // Check if JSDoc was on previous line(s)
      const prevLineIdx = i - 1;
      let foundDoc = false;

      // Look back for JSDoc ending
      for (let j = prevLineIdx; j >= Math.max(0, prevLineIdx - 10); j--) {
        const prevLine = lines[j].trim();
        if (prevLine.endsWith('*/')) {
          foundDoc = true;
          break;
        }
        if (prevLine && !prevLine.startsWith('*') && !prevLine.startsWith('//')) {
          break;
        }
      }

      if (foundDoc) {
        stats.documentedFunctions++;

        // Check JSDoc completeness
        if (!jsDocContent.includes('@returns') && !jsDocContent.includes('@return')) {
          // Check if function has non-void return
          const funcLine = line;
          if (!funcLine.includes(': void') && !funcLine.includes(': Promise<void>')) {
            issues.push({
              line: i + 1,
              type: 'missing-returns',
              severity: 'P3',
              message: `Function '${funcName}' missing @returns in JSDoc`,
              function: funcName,
            });
            stats.missingReturns++;
          }
        }
      } else {
        issues.push({
          line: i + 1,
          type: 'missing-jsdoc',
          severity: 'P3',
          message: `Exported function '${funcName}' missing JSDoc`,
          function: funcName,
        });
      }

      // Reset JSDoc tracking
      hasJsDoc = false;
      jsDocContent = '';
    }

    // Check for exported classes
    const exportClassMatch = trimmed.match(/^export\s+class\s+(\w+)/);
    if (exportClassMatch) {
      const className = exportClassMatch[1];

      // Look back for JSDoc
      let foundDoc = false;
      for (let j = i - 1; j >= Math.max(0, i - 10); j--) {
        const prevLine = lines[j].trim();
        if (prevLine.endsWith('*/')) {
          foundDoc = true;
          break;
        }
        if (prevLine && !prevLine.startsWith('*') && !prevLine.startsWith('//')) {
          break;
        }
      }

      if (!foundDoc) {
        issues.push({
          line: i + 1,
          type: 'missing-class-doc',
          severity: 'P3',
          message: `Exported class '${className}' missing JSDoc`,
          class: className,
        });
      }
    }
  }

  return {
    file: filePath,
    stats,
    issues,
    coverage: stats.exportedFunctions > 0
      ? Math.round((stats.documentedFunctions / stats.exportedFunctions) * 100)
      : 100,
  };
}

/**
 * Recursively find TypeScript files
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
      if (entry.name.endsWith('.d.ts') || entry.name.includes('.test.') || entry.name.includes('.spec.')) {
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
  let totalExported = 0;
  let totalDocumented = 0;
  let totalIssues = 0;

  for (const file of files) {
    const content = fs.readFileSync(file, 'utf-8');
    const result = analyzeFile(content, file);

    totalExported += result.stats.exportedFunctions;
    totalDocumented += result.stats.documentedFunctions;
    totalIssues += result.issues.length;

    if (result.issues.length > 0) {
      results.push(result);
    }
  }

  const report = {
    summary: {
      totalFiles: files.length,
      filesWithIssues: results.length,
      totalExportedFunctions: totalExported,
      totalDocumentedFunctions: totalDocumented,
      overallCoverage: totalExported > 0
        ? Math.round((totalDocumented / totalExported) * 100)
        : 100,
      totalIssues,
    },
    files: results,
  };

  console.log(JSON.stringify(report, null, 2));
}

main();
