/**
 * Content Migration Script
 *
 * Copies agents and skills from source .claude/ directory
 * to the plugin structure.
 *
 * Usage: npx tsx scripts/migrate-content.ts [source-path]
 */

import * as fs from 'fs';
import * as path from 'path';

const PLUGIN_ROOT = path.resolve(__dirname, '..');
const DEFAULT_SOURCE = path.resolve(PLUGIN_ROOT, '..', '.claude');

function copyDir(src: string, dest: string, filter?: (name: string) => boolean): number {
  let count = 0;

  if (!fs.existsSync(src)) {
    console.log(`Source not found: ${src}`);
    return 0;
  }

  fs.mkdirSync(dest, { recursive: true });

  const items = fs.readdirSync(src);
  for (const item of items) {
    // Skip registry files and hidden files
    if (item.startsWith('_') || item.startsWith('.')) continue;
    if (filter && !filter(item)) continue;

    const srcPath = path.join(src, item);
    const destPath = path.join(dest, item);

    const stat = fs.statSync(srcPath);
    if (stat.isDirectory()) {
      count += copyDir(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
      count++;
    }
  }

  return count;
}

function main() {
  const sourcePath = process.argv[2] || DEFAULT_SOURCE;

  console.log(`Migrating content from: ${sourcePath}`);
  console.log(`To plugin: ${PLUGIN_ROOT}\n`);

  // Migrate agents
  const agentsSrc = path.join(sourcePath, 'agents');
  const agentsDest = path.join(PLUGIN_ROOT, 'agents');
  const agentCount = copyDir(agentsSrc, agentsDest);
  console.log(`Migrated ${agentCount} agent files`);

  // Migrate skills
  const skillsSrc = path.join(sourcePath, 'skills');
  const skillsDest = path.join(PLUGIN_ROOT, 'skills');
  const skillCount = copyDir(skillsSrc, skillsDest);
  console.log(`Migrated ${skillCount} skill files`);

  console.log('\nMigration complete!');
  console.log('Run `npx tsx scripts/build-registries.ts` to rebuild indexes');
}

main();
