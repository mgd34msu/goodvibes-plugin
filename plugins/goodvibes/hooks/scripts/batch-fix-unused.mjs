#!/usr/bin/env node
import { readFileSync, writeFileSync } from 'fs';

// Map of file:line to variable name that needs to be fixed
const fixes = [
  ['src/__tests__/automation/test-runner.test.ts', 572, 'callCount'],
  ['src/__tests__/automation/test-runner.test.ts', 691, 'eslintCallCount'],
  ['src/__tests__/post-tool-use-failure/error-categories.test.ts', 124, 'category'],
  ['src/__tests__/post-tool-use-failure/error-categories.test.ts', 922, 'category'],
  ['src/__tests__/post-tool-use-failure/recovery-patterns.test.ts', 67, 'category'],
  ['src/__tests__/post-tool-use-failure/recovery-patterns.test.ts', 170, 'fixContext'],
  ['src/__tests__/subagent-stop/test-verification.test.ts', 614, 'result'],
  ['src/__tests__/telemetry.test.ts', 108, '_error'],
  ['src/__tests__/telemetry.test.ts', 138, '_error'],
  ['src/__tests__/telemetry.test.ts', 213, 'options'],
  ['src/__tests__/telemetry.test.ts', 234, 'options'],
  ['src/context/formatter.ts', 13, 'RunHookOptions'],
  ['src/memory/index.ts', 48, 'MemoryDecision'],
  ['src/memory/index.ts', 49, 'MemoryPattern'],
  ['src/memory/index.ts', 50, 'MemoryFailure'],
  ['src/memory/index.ts', 51, 'MemoryPreference'],
  ['src/post-tool-use/git-branch-manager.ts', 14, 'getCurrentBranch'],
  ['src/post-tool-use/git-branch-manager.ts', 17, 'hasUncommittedChanges'],
  ['src/shared/hook-runner.ts', 97, '_error'],
];

console.log(`Fixing ${fixes.length} unused variables...`);

const processedFiles = new Set();

for (const [filePath, lineNum, varName] of fixes) {
  const fullPath = `C:\\Users\\buzzkill\\Documents\\vibeplug\\plugins\\goodvibes\\hooks\\scripts\\${filePath}`;

  try {
    const content = readFileSync(fullPath, 'utf-8');
    const lines = content.split('\n');
    const lineIndex = lineNum - 1;
    const line = lines[lineIndex];

    if (!line) {
      console.error(`  ✗ Line ${lineNum} not found in ${filePath}`);
      continue;
    }

    // Skip if already prefixed
    if (varName.startsWith('_')) {
      // Remove the leading underscore for the pattern match
      const actualVar = varName.slice(1);
      if (!line.includes(actualVar)) {
        console.log(`  ✓ Already fixed: ${filePath}:${lineNum} ${varName}`);
        continue;
      }
      // Replace _error with __error (double underscore to indicate unused)
      const newLine = line.replace(new RegExp(`\\b${varName}\\b`, 'g'), `_${varName}`);
      if (newLine !== line) {
        lines[lineIndex] = newLine;
        writeFileSync(fullPath, lines.join('\n'), 'utf-8');
        console.log(`  ✓ Fixed: ${filePath}:${lineNum} ${varName} → _${varName}`);
        processedFiles.add(fullPath);
      }
      continue;
    }

    // Try multiple patterns to replace the variable name
    const patterns = [
      // Assignment: let varName =
      new RegExp(`\\blet\\s+${varName}\\b`, 'g'),
      // Assignment: const varName =
      new RegExp(`\\bconst\\s+${varName}\\b`, 'g'),
      // Import: varName,
      new RegExp(`\\b${varName}\\b(?=\\s*[,;])`, 'g'),
      // Parameter: function(varName)
      new RegExp(`\\(([^)]*)\\b${varName}\\b`, 'g'),
    ];

    let newLine = line;
    for (const pattern of patterns) {
      if (pattern.test(line)) {
        newLine = line.replace(
          new RegExp(`\\b${varName}\\b`, 'g'),
          `_${varName}`
        );
        break;
      }
    }

    if (newLine !== line) {
      lines[lineIndex] = newLine;
      writeFileSync(fullPath, lines.join('\n'), 'utf-8');
      console.log(`  ✓ Fixed: ${filePath}:${lineNum} ${varName} → _${varName}`);
      processedFiles.add(fullPath);
    } else {
      console.error(`  ✗ Could not fix: ${filePath}:${lineNum} ${varName}`);
      console.error(`    Line: ${line.trim()}`);
    }
  } catch (err) {
    console.error(`  ✗ Error processing ${filePath}:`, err.message);
  }
}

console.log(`\n✓ Modified ${processedFiles.size} files`);
console.log('\nRun "npm run lint" to verify.');
