#!/usr/bin/env node
/**
 * @module config-hygiene/fix-gitignore
 * @description Adds missing patterns to .gitignore file.
 * Creates gitignore if it doesn't exist.
 */

const fs = require('fs');
const path = require('path');

// Complete Node.js gitignore template
const GITIGNORE_TEMPLATE = `# Dependencies
node_modules/
.pnp/
.pnp.js

# Build outputs
dist/
build/
out/
*.tsbuildinfo

# Environment
.env
.env.local
.env.development.local
.env.test.local
.env.production.local
!.env.example

# Logs
*.log
npm-debug.log*
yarn-debug.log*
yarn-error.log*
lerna-debug.log*

# Editor artifacts
*.swp
*.swo
*~
*.bak
*.orig

# OS files
.DS_Store
.DS_Store?
._*
.Spotlight-V100
.Trashes
ehthumbs.db
Thumbs.db

# IDE
.idea/
.vscode/
*.sublime-project
*.sublime-workspace
*.code-workspace

# Test coverage
coverage/
.nyc_output/

# Cache
.cache/
.eslintcache
.parcel-cache/
.next/
.nuxt/

# Temporary
tmp/
temp/

# Package manager locks (keep one, ignore others)
# Uncomment the ones you don't use:
# package-lock.json
# yarn.lock
# pnpm-lock.yaml

# Debug
.debug/

# Local development
.local/
`;

/**
 * Read existing gitignore patterns
 * @param {string} gitignorePath - Path to .gitignore
 * @returns {Set<string>} Existing patterns
 */
function readExistingPatterns(gitignorePath) {
  if (!fs.existsSync(gitignorePath)) {
    return new Set();
  }

  const content = fs.readFileSync(gitignorePath, 'utf-8');
  const patterns = new Set();

  content.split('\n').forEach(line => {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith('#')) {
      patterns.add(trimmed);
    }
  });

  return patterns;
}

/**
 * Find missing patterns from template
 * @param {Set<string>} existing - Existing patterns
 * @returns {string[]} Missing patterns
 */
function findMissingPatterns(existing) {
  const templatePatterns = [];

  GITIGNORE_TEMPLATE.split('\n').forEach(line => {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith('#')) {
      if (!existing.has(trimmed)) {
        templatePatterns.push(trimmed);
      }
    }
  });

  return templatePatterns;
}

/**
 * Add missing patterns to gitignore
 * @param {string} gitignorePath - Path to .gitignore
 * @param {string[]} patterns - Patterns to add
 * @param {boolean} dryRun - If true, don't write changes
 */
function addPatterns(gitignorePath, patterns, dryRun = false) {
  if (patterns.length === 0) {
    console.log('.gitignore is already comprehensive');
    return;
  }

  const addition = `
# Added by config-hygiene
${patterns.join('\n')}
`;

  if (dryRun) {
    console.log('Would add the following patterns:');
    console.log(addition);
    return;
  }

  if (fs.existsSync(gitignorePath)) {
    fs.appendFileSync(gitignorePath, addition);
  } else {
    fs.writeFileSync(gitignorePath, GITIGNORE_TEMPLATE);
  }

  console.log(`Added ${patterns.length} patterns to .gitignore`);
}

/**
 * Create fresh gitignore from template
 * @param {string} gitignorePath - Path to .gitignore
 * @param {boolean} dryRun - If true, don't write changes
 */
function createFromTemplate(gitignorePath, dryRun = false) {
  if (dryRun) {
    console.log('Would create .gitignore from template');
    return;
  }

  fs.writeFileSync(gitignorePath, GITIGNORE_TEMPLATE);
  console.log('Created .gitignore from template');
}

/**
 * Main entry point
 */
function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const createNew = args.includes('--create');
  const projectRoot = args.find(a => !a.startsWith('--')) || '.';

  const gitignorePath = path.join(projectRoot, '.gitignore');

  if (createNew) {
    createFromTemplate(gitignorePath, dryRun);
    return;
  }

  const existing = readExistingPatterns(gitignorePath);
  const missing = findMissingPatterns(existing);

  if (missing.length === 0) {
    console.log('.gitignore already has all recommended patterns');
    return;
  }

  console.log(`Found ${missing.length} missing patterns:`);
  missing.forEach(p => console.log(`  ${p}`));
  console.log('');

  addPatterns(gitignorePath, missing, dryRun);
}

main();
