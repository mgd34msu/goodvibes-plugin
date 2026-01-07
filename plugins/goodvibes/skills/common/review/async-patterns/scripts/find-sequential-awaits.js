#!/usr/bin/env node
/**
 * @module async-patterns/find-sequential-awaits
 * @description Finds sequential await statements that could be parallelized.
 * Analyzes data dependencies to determine safe parallelization.
 */

const fs = require('fs');

/**
 * Extract variable name from await line
 * @param {string} line - Source line
 * @returns {string|null} Variable name or null
 */
function extractVarName(line) {
  const match = line.match(/(?:const|let|var)\s+(\w+)\s*=/);
  return match ? match[1] : null;
}

/**
 * Extract awaited expression
 * @param {string} line - Source line
 * @returns {string|null} Expression or null
 */
function extractAwaitExpr(line) {
  const match = line.match(/await\s+(.+?)(?:;|$)/);
  return match ? match[1].trim() : null;
}

/**
 * Check if expression depends on variable
 * @param {string} expr - Expression to check
 * @param {string} varName - Variable name to look for
 * @returns {boolean} True if dependent
 */
function dependsOn(expr, varName) {
  // Simple check: does the expression contain the variable name?
  const pattern = new RegExp(`\\b${varName}\\b`);
  return pattern.test(expr);
}

/**
 * Analyze a file for sequential awaits
 * @param {string} filePath - Path to file
 */
function analyzeFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.split('\n');

  // Find all await statements
  const awaits = [];
  lines.forEach((line, index) => {
    if (line.includes('await ') && !line.trim().startsWith('//')) {
      awaits.push({
        line: index + 1,
        content: line,
        varName: extractVarName(line),
        expr: extractAwaitExpr(line),
      });
    }
  });

  // Group consecutive awaits
  const groups = [];
  let currentGroup = [];

  for (let i = 0; i < awaits.length; i++) {
    if (currentGroup.length === 0) {
      currentGroup.push(awaits[i]);
    } else {
      const lastLine = currentGroup[currentGroup.length - 1].line;
      // Consider consecutive if within 3 lines
      if (awaits[i].line - lastLine <= 3) {
        currentGroup.push(awaits[i]);
      } else {
        if (currentGroup.length > 1) {
          groups.push(currentGroup);
        }
        currentGroup = [awaits[i]];
      }
    }
  }

  if (currentGroup.length > 1) {
    groups.push(currentGroup);
  }

  // Analyze each group for parallelization potential
  const suggestions = [];

  for (const group of groups) {
    // Build dependency graph
    const canParallelize = [];
    const mustSequence = [];

    for (let i = 0; i < group.length; i++) {
      let hasDependency = false;

      for (let j = 0; j < i; j++) {
        if (group[j].varName && group[i].expr) {
          if (dependsOn(group[i].expr, group[j].varName)) {
            hasDependency = true;
            mustSequence.push({
              dependent: group[i],
              dependsOn: group[j],
            });
            break;
          }
        }
      }

      if (!hasDependency) {
        canParallelize.push(group[i]);
      }
    }

    if (canParallelize.length >= 2) {
      // Generate Promise.all suggestion
      const varNames = canParallelize
        .filter(a => a.varName)
        .map(a => a.varName);
      const exprs = canParallelize.map(a => a.expr).filter(Boolean);

      suggestions.push({
        lines: canParallelize.map(a => a.line),
        type: 'can-parallelize',
        original: canParallelize.map(a => a.content.trim()),
        suggestion: generatePromiseAll(varNames, exprs),
      });
    }

    if (mustSequence.length > 0) {
      suggestions.push({
        lines: mustSequence.map(s => s.dependent.line),
        type: 'has-dependency',
        note: 'These awaits have data dependencies and must remain sequential',
        dependencies: mustSequence.map(s => ({
          line: s.dependent.line,
          dependsOnVar: s.dependsOn.varName,
          definedAtLine: s.dependsOn.line,
        })),
      });
    }
  }

  return suggestions;
}

/**
 * Generate Promise.all code
 * @param {string[]} varNames - Variable names
 * @param {string[]} exprs - Await expressions
 * @returns {string} Generated code
 */
function generatePromiseAll(varNames, exprs) {
  if (varNames.length === exprs.length && varNames.length > 0) {
    return `const [${varNames.join(', ')}] = await Promise.all([
  ${exprs.join(',\n  ')},
]);`;
  }

  return `await Promise.all([
  ${exprs.join(',\n  ')},
]);`;
}

/**
 * Main entry point
 */
function main() {
  const filePath = process.argv[2];

  if (!filePath) {
    console.error('Usage: find-sequential-awaits.js <file.ts>');
    process.exit(1);
  }

  if (!fs.existsSync(filePath)) {
    console.error(`Error: File not found: ${filePath}`);
    process.exit(1);
  }

  const suggestions = analyzeFile(filePath);

  if (suggestions.length === 0) {
    console.log('No sequential await groups found that could be parallelized.');
    return;
  }

  console.log(`Found ${suggestions.length} await groups to review:\n`);

  suggestions.forEach((s, i) => {
    console.log(`--- Group ${i + 1} (lines ${s.lines.join(', ')}) ---`);
    console.log(`Type: ${s.type}`);

    if (s.type === 'can-parallelize') {
      console.log('\nOriginal:');
      s.original.forEach(line => console.log(`  ${line}`));
      console.log('\nSuggested:');
      console.log(s.suggestion.split('\n').map(l => `  ${l}`).join('\n'));
    } else if (s.type === 'has-dependency') {
      console.log(`\n${s.note}`);
      s.dependencies.forEach(d => {
        console.log(`  Line ${d.line} depends on '${d.dependsOnVar}' (line ${d.definedAtLine})`);
      });
    }

    console.log('\n');
  });
}

main();
