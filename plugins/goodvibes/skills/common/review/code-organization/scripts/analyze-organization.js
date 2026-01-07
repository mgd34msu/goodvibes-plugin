#!/usr/bin/env node
/**
 * @module code-organization/analyze-organization
 * @description Analyzes code organization issues in a codebase.
 * Checks file sizes, complexity, nesting depth, and structure.
 */

const fs = require('fs');
const path = require('path');

// Configuration
const CONFIG = {
  maxFileLines: 350,
  maxFunctionLines: 50,
  maxDirectoryDepth: 5,
  maxComplexity: 10, // Approximate cyclomatic complexity
};

/**
 * Count lines in a file
 * @param {string} filePath - Path to file
 * @returns {number} Line count
 */
function countLines(filePath) {
  const content = fs.readFileSync(filePath, 'utf-8');
  return content.split('\n').length;
}

/**
 * Estimate cyclomatic complexity of a file
 * @param {string} content - File content
 * @returns {object} Complexity analysis
 */
function analyzeComplexity(content) {
  const lines = content.split('\n');
  const functions = [];
  let currentFunction = null;
  let braceDepth = 0;
  let complexity = 0;

  const complexityPatterns = [
    /\bif\s*\(/g,
    /\belse\s+if\s*\(/g,
    /\bfor\s*\(/g,
    /\bwhile\s*\(/g,
    /\bswitch\s*\(/g,
    /\bcase\s+/g,
    /\bcatch\s*\(/g,
    /\?\s*[^:]+\s*:/g, // Ternary
    /\|\|/g, // Logical OR
    /&&/g, // Logical AND
  ];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Detect function start
    const funcMatch = line.match(
      /(?:async\s+)?(?:function\s+(\w+)|(\w+)\s*=\s*(?:async\s*)?\([^)]*\)\s*(?::\s*[^=]+)?\s*=>|(\w+)\s*\([^)]*\)\s*(?::\s*[^{]+)?\s*\{)/
    );

    if (funcMatch && !line.includes('=>') || (funcMatch && line.includes('{')) || line.match(/function\s*\(/)) {
      const name = funcMatch[1] || funcMatch[2] || funcMatch[3] || 'anonymous';
      currentFunction = {
        name,
        startLine: i + 1,
        complexity: 1, // Base complexity
      };
    }

    // Track braces for function scope
    braceDepth += (line.match(/\{/g) || []).length;
    braceDepth -= (line.match(/\}/g) || []).length;

    // Count complexity patterns
    if (currentFunction) {
      for (const pattern of complexityPatterns) {
        const matches = line.match(pattern);
        if (matches) {
          currentFunction.complexity += matches.length;
        }
      }
    }

    // Function end
    if (currentFunction && braceDepth === 0 && line.includes('}')) {
      currentFunction.endLine = i + 1;
      currentFunction.lines = currentFunction.endLine - currentFunction.startLine + 1;
      functions.push(currentFunction);
      currentFunction = null;
    }
  }

  return {
    functions,
    highComplexity: functions.filter(f => f.complexity > CONFIG.maxComplexity),
    longFunctions: functions.filter(f => f.lines > CONFIG.maxFunctionLines),
  };
}

/**
 * Analyze a single file
 * @param {string} filePath - Path to file
 * @returns {object} File analysis
 */
function analyzeFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf-8');
  const lineCount = content.split('\n').length;
  const complexity = analyzeComplexity(content);

  const issues = [];

  if (lineCount > CONFIG.maxFileLines) {
    issues.push({
      type: 'large-file',
      severity: 'P2',
      message: `File has ${lineCount} lines (max: ${CONFIG.maxFileLines})`,
      details: { lineCount, max: CONFIG.maxFileLines },
    });
  }

  for (const func of complexity.highComplexity) {
    issues.push({
      type: 'high-complexity',
      severity: 'P1',
      message: `Function '${func.name}' has complexity ${func.complexity} (max: ${CONFIG.maxComplexity})`,
      details: func,
    });
  }

  for (const func of complexity.longFunctions) {
    issues.push({
      type: 'long-function',
      severity: 'P2',
      message: `Function '${func.name}' has ${func.lines} lines (max: ${CONFIG.maxFunctionLines})`,
      details: func,
    });
  }

  return {
    file: filePath,
    lineCount,
    functionCount: complexity.functions.length,
    issues,
  };
}

/**
 * Analyze directory structure
 * @param {string} baseDir - Base directory
 * @returns {Array<object>} Structure issues
 */
function analyzeStructure(baseDir) {
  const issues = [];

  function checkDepth(dir, depth = 0, relativePath = '') {
    if (depth > CONFIG.maxDirectoryDepth) {
      issues.push({
        type: 'deep-nesting',
        severity: 'P3',
        message: `Directory depth ${depth} exceeds max ${CONFIG.maxDirectoryDepth}`,
        path: relativePath,
      });
      return;
    }

    const entries = fs.readdirSync(dir, { withFileTypes: true });

    for (const entry of entries) {
      if (entry.isDirectory()) {
        if (entry.name === 'node_modules' || entry.name.startsWith('.')) {
          continue;
        }
        checkDepth(
          path.join(dir, entry.name),
          depth + 1,
          path.join(relativePath, entry.name)
        );
      }
    }
  }

  checkDepth(baseDir);
  return issues;
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
  const fileResults = [];
  const allIssues = [];

  // Analyze files
  for (const file of files) {
    const result = analyzeFile(file);
    if (result.issues.length > 0) {
      fileResults.push(result);
      allIssues.push(...result.issues);
    }
  }

  // Analyze structure
  const structureIssues = analyzeStructure(targetDir);
  allIssues.push(...structureIssues);

  const report = {
    summary: {
      totalFiles: files.length,
      filesWithIssues: fileResults.length,
      totalIssues: allIssues.length,
      byType: {},
      bySeverity: {
        P1: allIssues.filter(i => i.severity === 'P1').length,
        P2: allIssues.filter(i => i.severity === 'P2').length,
        P3: allIssues.filter(i => i.severity === 'P3').length,
      },
    },
    config: CONFIG,
    fileIssues: fileResults,
    structureIssues,
  };

  // Count by type
  for (const issue of allIssues) {
    report.summary.byType[issue.type] =
      (report.summary.byType[issue.type] || 0) + 1;
  }

  console.log(JSON.stringify(report, null, 2));
}

main();
