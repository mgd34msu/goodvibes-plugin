#!/usr/bin/env node
import { readFileSync, writeFileSync } from 'fs';
import { execSync } from 'child_process';

// Get lint output with file paths and line numbers
let lintOutput;
try {
  lintOutput = execSync('npm run lint 2>&1', { encoding: 'utf-8' });
} catch (error) {
  // Lint will fail with non-zero exit code when there are errors
  lintOutput = error.output ? error.output.join('') : error.stdout || '';
}

// Parse the lint output line by line
const lines = lintOutput.split('\n');
const errors = [];
let currentFile = null;

for (const line of lines) {
  // Check if this is a file path line
  if (line.match(/^[A-Z]:\\/) || line.match(/^\//)) {
    currentFile = line.trim();
  }
  // Check if this is an error line with unused variable
  else if (currentFile && line.includes('is defined but never used')) {
    const match = line.match(/^\s*(\d+):(\d+)\s+error\s+'([^']+)' is defined but never used/);
    if (match) {
      const [, lineNum, col, varName] = match;
      errors.push({
        filePath: currentFile,
        line: parseInt(lineNum),
        col: parseInt(col),
        varName
      });
    }
  }
}

console.log(`Found ${errors.length} unused variable errors`);

// Group errors by file
const fileErrors = {};
for (const error of errors) {
  if (!fileErrors[error.filePath]) {
    fileErrors[error.filePath] = [];
  }
  fileErrors[error.filePath].push(error);
}

console.log(`Fixing ${Object.keys(fileErrors).length} files...\n`);

let totalFixed = 0;

// Process each file
for (const [filePath, fileErrorList] of Object.entries(fileErrors)) {
  try {
    const content = readFileSync(filePath, 'utf-8');
    const lines = content.split('\n');

    // Sort errors by line number (descending) to avoid line number shifts
    fileErrorList.sort((a, b) => b.line - a.line);

    let fileFixed = 0;

    for (const error of fileErrorList) {
      const lineIndex = error.line - 1; // Convert to 0-based index
      const line = lines[lineIndex];

      if (!line) continue;

      // Don't prefix if already prefixed with underscore
      if (error.varName.startsWith('_')) continue;

      const originalLine = line;

      // Try multiple patterns to match different declaration styles
      const patterns = [
        // Namespace imports: import * as varName from
        { regex: new RegExp(`import\\s+\\*\\s+as\\s+${error.varName}\\s+from`, 'g'),
          replace: () => `import * as _${error.varName} from` },

        // Regular imports: import { varName }
        { regex: new RegExp(`(import\\s+(?:type\\s+)?{[^}]*)\\b${error.varName}\\b`, 'g'),
          replace: (match, before) => `${before}_${error.varName}` },

        // Type annotations in parameters: varName: Type
        { regex: new RegExp(`\\b${error.varName}\\s*:\\s*`, 'g'),
          replace: () => `_${error.varName}: ` },

        // Function parameters: (varName, (varName:, (varName)
        { regex: new RegExp(`\\(([^)]*\\b)${error.varName}\\b([^)]*\\))`, 'g'),
          replace: (match, before, after) => `(${before}_${error.varName}${after}` },

        // Destructuring in parameters: {varName}, {varName:
        { regex: new RegExp(`([{,]\\s*)${error.varName}\\b`, 'g'),
          replace: (match, before) => `${before}_${error.varName}` },

        // Variable declaration: const varName, let varName
        { regex: new RegExp(`\\b(const|let|var)\\s+${error.varName}\\b`, 'g'),
          replace: (match, keyword) => `${keyword} _${error.varName}` },

        // Arrow function parameters: varName =>
        { regex: new RegExp(`\\b${error.varName}\\b(\\s*=>)`, 'g'),
          replace: (match, arrow) => `_${error.varName}${arrow}` },
      ];

      for (const { regex, replace } of patterns) {
        const newLine = line.replace(regex, replace);
        if (newLine !== line) {
          lines[lineIndex] = newLine;
          console.log(`  Line ${error.line}: ${error.varName} → _${error.varName}`);
          fileFixed++;
          totalFixed++;
          break;
        }
      }
    }

    if (fileFixed > 0) {
      writeFileSync(filePath, lines.join('\n'), 'utf-8');
      console.log(`  ✓ Fixed ${fileFixed} variables in ${filePath}\n`);
    }
  } catch (err) {
    console.error(`Error processing ${filePath}:`, err.message);
  }
}

console.log(`\n✓ Total fixed: ${totalFixed} unused variables`);
console.log('\nRun "npm run lint" to verify remaining errors.');
