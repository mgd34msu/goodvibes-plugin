/**
 * Context gathering handlers
 */

import * as fs from 'fs';
import * as path from 'path';
import { StackInfo } from '../types.js';
import { PLUGIN_ROOT, PROJECT_ROOT } from '../config.js';

function success(data: unknown) {
  return {
    content: [{
      type: 'text',
      text: JSON.stringify(data, null, 2),
    }],
  };
}

function readJsonFile(filePath: string): Record<string, unknown> | null {
  try {
    if (!fs.existsSync(filePath)) return null;
    const content = fs.readFileSync(filePath, 'utf-8');
    return JSON.parse(content);
  } catch {
    return null;
  }
}

function detectPackageManager(projectPath: string): string {
  if (fs.existsSync(path.join(projectPath, 'pnpm-lock.yaml'))) return 'pnpm';
  if (fs.existsSync(path.join(projectPath, 'yarn.lock'))) return 'yarn';
  if (fs.existsSync(path.join(projectPath, 'bun.lockb'))) return 'bun';
  return 'npm';
}

export function handleDetectStack(args: { path?: string; deep?: boolean }) {
  const projectPath = path.resolve(PROJECT_ROOT, args.path || '.');
  const stack: StackInfo = {
    frontend: {},
    backend: {},
    build: { typescript: false },
    detected_configs: [],
    recommended_skills: [],
  };

  const pkg = readJsonFile(path.join(projectPath, 'package.json')) as Record<string, Record<string, string>> | null;
  const deps = { ...pkg?.dependencies, ...pkg?.devDependencies };

  // Detect frontend
  if (deps?.['next']) { stack.frontend.framework = 'next'; stack.recommended_skills.push('webdev/meta-frameworks/nextjs'); }
  else if (deps?.['nuxt']) { stack.frontend.framework = 'nuxt'; stack.recommended_skills.push('webdev/meta-frameworks/nuxt'); }
  else if (deps?.['@remix-run/react']) { stack.frontend.framework = 'remix'; }
  else if (deps?.['astro']) { stack.frontend.framework = 'astro'; }

  if (deps?.['react']) { stack.frontend.ui_library = 'react'; }
  else if (deps?.['vue']) { stack.frontend.ui_library = 'vue'; }
  else if (deps?.['svelte']) { stack.frontend.ui_library = 'svelte'; }

  if (deps?.['tailwindcss']) { stack.frontend.styling = 'tailwind'; stack.recommended_skills.push('webdev/styling/tailwind'); }
  else if (deps?.['styled-components']) { stack.frontend.styling = 'styled-components'; }
  else if (deps?.['@emotion/react']) { stack.frontend.styling = 'emotion'; }

  if (deps?.['zustand']) { stack.frontend.state_management = 'zustand'; stack.recommended_skills.push('webdev/state-management/zustand'); }
  else if (deps?.['@reduxjs/toolkit']) { stack.frontend.state_management = 'redux'; }
  else if (deps?.['jotai']) { stack.frontend.state_management = 'jotai'; }
  else if (deps?.['recoil']) { stack.frontend.state_management = 'recoil'; }

  // Detect backend
  stack.backend.runtime = 'node';
  if (deps?.['express']) { stack.backend.framework = 'express'; }
  else if (deps?.['fastify']) { stack.backend.framework = 'fastify'; }
  else if (deps?.['hono']) { stack.backend.framework = 'hono'; }
  else if (deps?.['next']) { stack.backend.framework = 'next-api'; }

  if (deps?.['prisma'] || deps?.['@prisma/client']) {
    stack.backend.orm = 'prisma';
    stack.recommended_skills.push('webdev/databases-orms/prisma');
  }
  else if (deps?.['drizzle-orm']) { stack.backend.orm = 'drizzle'; stack.recommended_skills.push('webdev/databases-orms/drizzle'); }
  else if (deps?.['typeorm']) { stack.backend.orm = 'typeorm'; }

  // Detect build
  stack.build.package_manager = detectPackageManager(projectPath);
  stack.build.typescript = !!deps?.['typescript'] || fs.existsSync(path.join(projectPath, 'tsconfig.json'));

  if (deps?.['vite']) { stack.build.bundler = 'vite'; stack.recommended_skills.push('webdev/build-tools/vite'); }
  else if (deps?.['turbo']) { stack.build.bundler = 'turbopack'; }
  else if (deps?.['webpack']) { stack.build.bundler = 'webpack'; }
  else if (deps?.['esbuild']) { stack.build.bundler = 'esbuild'; }

  // Detect config files
  const configFiles = [
    'next.config.js', 'next.config.mjs', 'next.config.ts',
    'vite.config.ts', 'vite.config.js',
    'tailwind.config.js', 'tailwind.config.ts',
    'tsconfig.json',
    'prisma/schema.prisma',
    '.eslintrc.js', '.eslintrc.json', 'eslint.config.js',
    '.prettierrc', '.prettierrc.json',
    'drizzle.config.ts',
  ];

  for (const config of configFiles) {
    if (fs.existsSync(path.join(projectPath, config))) {
      stack.detected_configs.push(config);
    }
  }

  return success(stack);
}

export function handleScanPatterns(args: { path?: string; pattern_types?: string[] }) {
  const scanPath = path.resolve(PROJECT_ROOT, args.path || 'src');

  const patterns = {
    naming: {
      components: 'PascalCase',
      files: 'kebab-case',
      functions: 'camelCase',
      variables: 'camelCase',
    },
    structure: {
      component_pattern: 'unknown',
      colocation: false,
      barrel_exports: false,
    },
    architecture: {
      pattern: 'unknown',
      layers: [] as string[],
      state_location: 'unknown',
    },
    testing: {
      framework: 'unknown',
      location: 'unknown',
      naming: 'unknown',
    },
    styling: {
      approach: 'unknown',
      class_naming: 'unknown',
    },
  };

  if (fs.existsSync(scanPath)) {
    // Check for barrel exports
    if (fs.existsSync(path.join(scanPath, 'index.ts')) || fs.existsSync(path.join(scanPath, 'index.js'))) {
      patterns.structure.barrel_exports = true;
    }

    // Check for common folders
    if (fs.existsSync(path.join(scanPath, 'components'))) patterns.architecture.layers.push('components');
    if (fs.existsSync(path.join(scanPath, 'lib'))) patterns.architecture.layers.push('lib');
    if (fs.existsSync(path.join(scanPath, 'utils'))) patterns.architecture.layers.push('utils');
    if (fs.existsSync(path.join(scanPath, 'hooks'))) patterns.architecture.layers.push('hooks');
    if (fs.existsSync(path.join(scanPath, 'services'))) patterns.architecture.layers.push('services');

    // Check for test files
    const projectRoot = path.resolve(scanPath, '..');
    if (fs.existsSync(path.join(projectRoot, '__tests__'))) {
      patterns.testing.location = '__tests__';
    } else if (fs.existsSync(path.join(projectRoot, 'tests'))) {
      patterns.testing.location = 'tests';
    }

    // Check for test framework
    const pkg = readJsonFile(path.join(projectRoot, 'package.json')) as Record<string, Record<string, string>> | null;
    const deps = { ...pkg?.dependencies, ...pkg?.devDependencies };
    if (deps?.['vitest']) patterns.testing.framework = 'vitest';
    else if (deps?.['jest']) patterns.testing.framework = 'jest';
    else if (deps?.['@playwright/test']) patterns.testing.framework = 'playwright';

    // Check styling
    if (deps?.['tailwindcss']) {
      patterns.styling.approach = 'utility-first';
      patterns.styling.class_naming = 'tailwind';
    } else if (deps?.['styled-components']) {
      patterns.styling.approach = 'css-in-js';
    }
  }

  return success(patterns);
}
