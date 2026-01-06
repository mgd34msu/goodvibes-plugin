#!/usr/bin/env node
/**
 * Audit JSDoc coverage for all exported items in src/
 */

import { readFileSync, readdirSync, statSync } from 'fs';
import { join, relative } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const srcDir = join(__dirname, 'src');

function getAllTsFiles(dir) {
  let files = [];
  const items = readdirSync(dir);

  for (const item of items) {
    const fullPath = join(dir, item);
    const stat = statSync(fullPath);

    if (stat.isDirectory()) {
      if (!item.includes('__tests__') && !item.includes('test-utils')) {
        files = files.concat(getAllTsFiles(fullPath));
      }
    } else if (item.endsWith('.ts') && !item.endsWith('.test.ts') && !item.endsWith('.spec.ts')) {
      files.push(fullPath);
    }
  }

  return files;
}

function checkFileForMissingJSDoc(filePath) {
  const content = readFileSync(filePath, 'utf-8');
  const lines = content.split('\n');
  const issues = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    // Check for exported functions
    if (line.startsWith('export function') || line.startsWith('export async function')) {
      const prevLine = i > 0 ? lines[i - 1].trim() : '';
      if (!prevLine.includes('*/') && !prevLine.startsWith('//')) {
        const funcName = line.match(/function\s+(\w+)/)?.[1] || 'unknown';
        issues.push({ line: i + 1, type: 'function', name: funcName });
      }
    }

    // Check for exported const (functions or values)
    if (line.startsWith('export const')) {
      const prevLine = i > 0 ? lines[i - 1].trim() : '';
      if (!prevLine.includes('*/') && !prevLine.startsWith('//')) {
        const constName = line.match(/const\s+(\w+)/)?.[1] || 'unknown';
        issues.push({ line: i + 1, type: 'const', name: constName });
      }
    }

    // Check for exported types/interfaces
    if (line.startsWith('export type') || line.startsWith('export interface')) {
      const prevLine = i > 0 ? lines[i - 1].trim() : '';
      if (!prevLine.includes('*/') && !prevLine.startsWith('//')) {
        const typeName = line.match(/(?:type|interface)\s+(\w+)/)?.[1] || 'unknown';
        issues.push({ line: i + 1, type: line.startsWith('export type') ? 'type' : 'interface', name: typeName });
      }
    }
  }

  return issues;
}

const files = getAllTsFiles(srcDir);
let totalIssues = 0;
let filesWithIssues = 0;

console.log('='.repeat(80));
console.log('JSDoc Coverage Audit Report');
console.log('='.repeat(80));
console.log('');

for (const file of files) {
  const issues = checkFileForMissingJSDoc(file);

  if (issues.length > 0) {
    filesWithIssues++;
    totalIssues += issues.length;
    const relPath = relative(srcDir, file);
    console.log(`📄 ${relPath}`);

    for (const issue of issues) {
      console.log(`  Line ${issue.line}: export ${issue.type} ${issue.name} (missing JSDoc)`);
    }
    console.log('');
  }
}

console.log('='.repeat(80));
console.log(`Summary: ${totalIssues} missing JSDoc comments across ${filesWithIssues} files`);
console.log(`Total files scanned: ${files.length}`);
console.log(`Files with complete coverage: ${files.length - filesWithIssues}`);
console.log('='.repeat(80));

process.exit(totalIssues > 0 ? 1 : 0);
