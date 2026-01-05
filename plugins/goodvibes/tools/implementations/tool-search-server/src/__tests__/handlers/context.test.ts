/**
 * Unit tests for context handlers
 *
 * Tests cover:
 * - handleDetectStack
 * - handleScanPatterns
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fsPromises from 'fs/promises';

import {
  handleDetectStack,
  handleScanPatterns,
} from '../../handlers/context.js';
import { samplePackageJson } from '../setup.js';

// Mock modules
vi.mock('fs/promises', () => ({
  access: vi.fn(),
  readFile: vi.fn(),
}));
vi.mock('../../config.js', () => ({
  PLUGIN_ROOT: '/mock/plugin/root',
  PROJECT_ROOT: '/mock/project/root',
}));

describe('context handlers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('handleDetectStack', () => {
    describe('frontend detection', () => {
      it('should detect Next.js framework', async () => {
        vi.mocked(fsPromises.access).mockResolvedValue(undefined);
        vi.mocked(fsPromises.readFile).mockResolvedValue(JSON.stringify({
          dependencies: { next: '^14.0.0', react: '^18.0.0' },
        }));

        const result = await handleDetectStack({});
        const data = JSON.parse(result.content[0].text);

        expect(data.frontend.framework).toBe('next');
      });

      it('should detect Nuxt framework', async () => {
        vi.mocked(fsPromises.access).mockResolvedValue(undefined);
        vi.mocked(fsPromises.readFile).mockResolvedValue(JSON.stringify({
          dependencies: { nuxt: '^3.0.0' },
        }));

        const result = await handleDetectStack({});
        const data = JSON.parse(result.content[0].text);

        expect(data.frontend.framework).toBe('nuxt');
      });

      it('should detect Remix framework', async () => {
        vi.mocked(fsPromises.access).mockResolvedValue(undefined);
        vi.mocked(fsPromises.readFile).mockResolvedValue(JSON.stringify({
          dependencies: { '@remix-run/react': '^2.0.0' },
        }));

        const result = await handleDetectStack({});
        const data = JSON.parse(result.content[0].text);

        expect(data.frontend.framework).toBe('remix');
      });

      it('should detect Astro framework', async () => {
        vi.mocked(fsPromises.access).mockResolvedValue(undefined);
        vi.mocked(fsPromises.readFile).mockResolvedValue(JSON.stringify({
          dependencies: { astro: '^4.0.0' },
        }));

        const result = await handleDetectStack({});
        const data = JSON.parse(result.content[0].text);

        expect(data.frontend.framework).toBe('astro');
      });

      it('should detect React UI library', async () => {
        vi.mocked(fsPromises.access).mockResolvedValue(undefined);
        vi.mocked(fsPromises.readFile).mockResolvedValue(JSON.stringify({
          dependencies: { react: '^18.0.0' },
        }));

        const result = await handleDetectStack({});
        const data = JSON.parse(result.content[0].text);

        expect(data.frontend.ui_library).toBe('react');
      });

      it('should detect Vue UI library', async () => {
        vi.mocked(fsPromises.access).mockResolvedValue(undefined);
        vi.mocked(fsPromises.readFile).mockResolvedValue(JSON.stringify({
          dependencies: { vue: '^3.0.0' },
        }));

        const result = await handleDetectStack({});
        const data = JSON.parse(result.content[0].text);

        expect(data.frontend.ui_library).toBe('vue');
      });

      it('should detect Svelte UI library', async () => {
        vi.mocked(fsPromises.access).mockResolvedValue(undefined);
        vi.mocked(fsPromises.readFile).mockResolvedValue(JSON.stringify({
          dependencies: { svelte: '^4.0.0' },
        }));

        const result = await handleDetectStack({});
        const data = JSON.parse(result.content[0].text);

        expect(data.frontend.ui_library).toBe('svelte');
      });

      it('should detect Tailwind styling', async () => {
        vi.mocked(fsPromises.access).mockResolvedValue(undefined);
        vi.mocked(fsPromises.readFile).mockResolvedValue(JSON.stringify({
          devDependencies: { tailwindcss: '^3.0.0' },
        }));

        const result = await handleDetectStack({});
        const data = JSON.parse(result.content[0].text);

        expect(data.frontend.styling).toBe('tailwind');
      });

      it('should detect styled-components styling', async () => {
        vi.mocked(fsPromises.access).mockResolvedValue(undefined);
        vi.mocked(fsPromises.readFile).mockResolvedValue(JSON.stringify({
          dependencies: { 'styled-components': '^6.0.0' },
        }));

        const result = await handleDetectStack({});
        const data = JSON.parse(result.content[0].text);

        expect(data.frontend.styling).toBe('styled-components');
      });

      it('should detect Emotion styling', async () => {
        vi.mocked(fsPromises.access).mockResolvedValue(undefined);
        vi.mocked(fsPromises.readFile).mockResolvedValue(JSON.stringify({
          dependencies: { '@emotion/react': '^11.0.0' },
        }));

        const result = await handleDetectStack({});
        const data = JSON.parse(result.content[0].text);

        expect(data.frontend.styling).toBe('emotion');
      });

      it('should detect Zustand state management', async () => {
        vi.mocked(fsPromises.access).mockResolvedValue(undefined);
        vi.mocked(fsPromises.readFile).mockResolvedValue(JSON.stringify({
          dependencies: { zustand: '^4.0.0' },
        }));

        const result = await handleDetectStack({});
        const data = JSON.parse(result.content[0].text);

        expect(data.frontend.state_management).toBe('zustand');
      });

      it('should detect Redux state management', async () => {
        vi.mocked(fsPromises.access).mockResolvedValue(undefined);
        vi.mocked(fsPromises.readFile).mockResolvedValue(JSON.stringify({
          dependencies: { '@reduxjs/toolkit': '^2.0.0' },
        }));

        const result = await handleDetectStack({});
        const data = JSON.parse(result.content[0].text);

        expect(data.frontend.state_management).toBe('redux');
      });

      it('should detect Jotai state management', async () => {
        vi.mocked(fsPromises.access).mockResolvedValue(undefined);
        vi.mocked(fsPromises.readFile).mockResolvedValue(JSON.stringify({
          dependencies: { jotai: '^2.0.0' },
        }));

        const result = await handleDetectStack({});
        const data = JSON.parse(result.content[0].text);

        expect(data.frontend.state_management).toBe('jotai');
      });
    });

    describe('backend detection', () => {
      it('should set runtime to node', async () => {
        vi.mocked(fsPromises.access).mockResolvedValue(undefined);
        vi.mocked(fsPromises.readFile).mockResolvedValue(JSON.stringify({}));

        const result = await handleDetectStack({});
        const data = JSON.parse(result.content[0].text);

        expect(data.backend.runtime).toBe('node');
      });

      it('should detect Express framework', async () => {
        vi.mocked(fsPromises.access).mockResolvedValue(undefined);
        vi.mocked(fsPromises.readFile).mockResolvedValue(JSON.stringify({
          dependencies: { express: '^4.0.0' },
        }));

        const result = await handleDetectStack({});
        const data = JSON.parse(result.content[0].text);

        expect(data.backend.framework).toBe('express');
      });

      it('should detect Fastify framework', async () => {
        vi.mocked(fsPromises.access).mockResolvedValue(undefined);
        vi.mocked(fsPromises.readFile).mockResolvedValue(JSON.stringify({
          dependencies: { fastify: '^4.0.0' },
        }));

        const result = await handleDetectStack({});
        const data = JSON.parse(result.content[0].text);

        expect(data.backend.framework).toBe('fastify');
      });

      it('should detect Hono framework', async () => {
        vi.mocked(fsPromises.access).mockResolvedValue(undefined);
        vi.mocked(fsPromises.readFile).mockResolvedValue(JSON.stringify({
          dependencies: { hono: '^3.0.0' },
        }));

        const result = await handleDetectStack({});
        const data = JSON.parse(result.content[0].text);

        expect(data.backend.framework).toBe('hono');
      });

      it('should detect Next.js API routes', async () => {
        vi.mocked(fsPromises.access).mockResolvedValue(undefined);
        vi.mocked(fsPromises.readFile).mockResolvedValue(JSON.stringify({
          dependencies: { next: '^14.0.0' },
        }));

        const result = await handleDetectStack({});
        const data = JSON.parse(result.content[0].text);

        expect(data.backend.framework).toBe('next-api');
      });

      it('should detect Prisma ORM', async () => {
        vi.mocked(fsPromises.access).mockResolvedValue(undefined);
        vi.mocked(fsPromises.readFile).mockResolvedValue(JSON.stringify({
          dependencies: { '@prisma/client': '^5.0.0' },
        }));

        const result = await handleDetectStack({});
        const data = JSON.parse(result.content[0].text);

        expect(data.backend.orm).toBe('prisma');
      });

      it('should detect Drizzle ORM', async () => {
        vi.mocked(fsPromises.access).mockResolvedValue(undefined);
        vi.mocked(fsPromises.readFile).mockResolvedValue(JSON.stringify({
          dependencies: { 'drizzle-orm': '^0.29.0' },
        }));

        const result = await handleDetectStack({});
        const data = JSON.parse(result.content[0].text);

        expect(data.backend.orm).toBe('drizzle');
      });

      it('should detect TypeORM', async () => {
        vi.mocked(fsPromises.access).mockResolvedValue(undefined);
        vi.mocked(fsPromises.readFile).mockResolvedValue(JSON.stringify({
          dependencies: { typeorm: '^0.3.0' },
        }));

        const result = await handleDetectStack({});
        const data = JSON.parse(result.content[0].text);

        expect(data.backend.orm).toBe('typeorm');
      });
    });

    describe('build detection', () => {
      it('should detect pnpm package manager', async () => {
        vi.mocked(fsPromises.access).mockImplementation((p) => {
          const pathStr = String(p);
          if (pathStr.includes('pnpm-lock.yaml') || pathStr.includes('package.json')) {
            return Promise.resolve();
          }
          return Promise.reject(new Error('ENOENT'));
        });
        vi.mocked(fsPromises.readFile).mockResolvedValue(JSON.stringify({}));

        const result = await handleDetectStack({});
        const data = JSON.parse(result.content[0].text);

        expect(data.build.package_manager).toBe('pnpm');
      });

      it('should detect yarn package manager', async () => {
        vi.mocked(fsPromises.access).mockImplementation((p) => {
          const pathStr = String(p);
          if (pathStr.includes('yarn.lock') || pathStr.includes('package.json')) {
            return Promise.resolve();
          }
          return Promise.reject(new Error('ENOENT'));
        });
        vi.mocked(fsPromises.readFile).mockResolvedValue(JSON.stringify({}));

        const result = await handleDetectStack({});
        const data = JSON.parse(result.content[0].text);

        expect(data.build.package_manager).toBe('yarn');
      });

      it('should detect TypeScript from dependencies', async () => {
        vi.mocked(fsPromises.access).mockResolvedValue(undefined);
        vi.mocked(fsPromises.readFile).mockResolvedValue(JSON.stringify({
          devDependencies: { typescript: '^5.0.0' },
        }));

        const result = await handleDetectStack({});
        const data = JSON.parse(result.content[0].text);

        expect(data.build.typescript).toBe(true);
      });

      it('should detect TypeScript from tsconfig.json', async () => {
        vi.mocked(fsPromises.access).mockImplementation((p) => {
          const pathStr = String(p);
          if (pathStr.includes('tsconfig.json') || pathStr.includes('package.json')) {
            return Promise.resolve();
          }
          return Promise.reject(new Error('ENOENT'));
        });
        vi.mocked(fsPromises.readFile).mockResolvedValue(JSON.stringify({}));

        const result = await handleDetectStack({});
        const data = JSON.parse(result.content[0].text);

        expect(data.build.typescript).toBe(true);
      });

      it('should detect Vite bundler', async () => {
        vi.mocked(fsPromises.access).mockResolvedValue(undefined);
        vi.mocked(fsPromises.readFile).mockResolvedValue(JSON.stringify({
          devDependencies: { vite: '^5.0.0' },
        }));

        const result = await handleDetectStack({});
        const data = JSON.parse(result.content[0].text);

        expect(data.build.bundler).toBe('vite');
      });

      it('should detect Turbopack bundler', async () => {
        vi.mocked(fsPromises.access).mockResolvedValue(undefined);
        vi.mocked(fsPromises.readFile).mockResolvedValue(JSON.stringify({
          devDependencies: { turbo: '^1.0.0' },
        }));

        const result = await handleDetectStack({});
        const data = JSON.parse(result.content[0].text);

        expect(data.build.bundler).toBe('turbopack');
      });

      it('should detect Webpack bundler', async () => {
        vi.mocked(fsPromises.access).mockResolvedValue(undefined);
        vi.mocked(fsPromises.readFile).mockResolvedValue(JSON.stringify({
          devDependencies: { webpack: '^5.0.0' },
        }));

        const result = await handleDetectStack({});
        const data = JSON.parse(result.content[0].text);

        expect(data.build.bundler).toBe('webpack');
      });
    });

    describe('config detection', () => {
      it('should detect config files', async () => {
        vi.mocked(fsPromises.access).mockImplementation((p) => {
          const pathStr = String(p);
          if (
            pathStr.includes('package.json') ||
            pathStr.includes('tsconfig.json') ||
            pathStr.includes('tailwind.config') ||
            pathStr.includes('next.config')
          ) {
            return Promise.resolve();
          }
          return Promise.reject(new Error('ENOENT'));
        });
        vi.mocked(fsPromises.readFile).mockResolvedValue(JSON.stringify({}));

        const result = await handleDetectStack({});
        const data = JSON.parse(result.content[0].text);

        expect(data.detected_configs).toContain('tsconfig.json');
      });
    });

    describe('skill recommendations', () => {
      it('should recommend Next.js skill', async () => {
        vi.mocked(fsPromises.access).mockResolvedValue(undefined);
        vi.mocked(fsPromises.readFile).mockResolvedValue(JSON.stringify({
          dependencies: { next: '^14.0.0' },
        }));

        const result = await handleDetectStack({});
        const data = JSON.parse(result.content[0].text);

        expect(data.recommended_skills).toContain('webdev/meta-frameworks/nextjs');
      });

      it('should recommend Tailwind skill', async () => {
        vi.mocked(fsPromises.access).mockResolvedValue(undefined);
        vi.mocked(fsPromises.readFile).mockResolvedValue(JSON.stringify({
          devDependencies: { tailwindcss: '^3.0.0' },
        }));

        const result = await handleDetectStack({});
        const data = JSON.parse(result.content[0].text);

        expect(data.recommended_skills).toContain('webdev/styling/tailwind');
      });

      it('should recommend Prisma skill', async () => {
        vi.mocked(fsPromises.access).mockResolvedValue(undefined);
        vi.mocked(fsPromises.readFile).mockResolvedValue(JSON.stringify({
          dependencies: { prisma: '^5.0.0' },
        }));

        const result = await handleDetectStack({});
        const data = JSON.parse(result.content[0].text);

        expect(data.recommended_skills).toContain('webdev/databases-orms/prisma');
      });
    });

    describe('path handling', () => {
      it('should use current directory by default', async () => {
        vi.mocked(fsPromises.access).mockResolvedValue(undefined);
        vi.mocked(fsPromises.readFile).mockResolvedValue(JSON.stringify({}));

        await handleDetectStack({});

        expect(fsPromises.access).toHaveBeenCalled();
      });

      it('should use provided path', async () => {
        const readCalls: string[] = [];
        vi.mocked(fsPromises.access).mockResolvedValue(undefined);
        vi.mocked(fsPromises.readFile).mockImplementation((p) => {
          readCalls.push(String(p));
          return Promise.resolve(JSON.stringify({}));
        });

        await handleDetectStack({ path: 'custom/path' });

        expect(readCalls.some(c => c.includes('custom'))).toBe(true);
      });
    });
  });

  describe('handleScanPatterns', () => {
    it('should detect barrel exports', async () => {
      // The handler checks for index.ts or index.js in the scanPath (default: src)
      vi.mocked(fsPromises.access).mockImplementation((p) => {
        const pathStr = String(p);
        // Match src/index.ts or src/index.js
        if (
          pathStr.endsWith('index.ts') ||
          pathStr.endsWith('index.js') ||
          pathStr.endsWith('src') ||
          pathStr.includes('package.json')
        ) {
          return Promise.resolve();
        }
        return Promise.reject(new Error('ENOENT'));
      });
      vi.mocked(fsPromises.readFile).mockResolvedValue(JSON.stringify({}));

      const result = await handleScanPatterns({});
      const data = JSON.parse(result.content[0].text);

      expect(data.structure.barrel_exports).toBe(true);
    });

    it('should detect architecture layers', async () => {
      vi.mocked(fsPromises.access).mockImplementation((p) => {
        const pathStr = String(p);
        if (
          pathStr.includes('components') ||
          pathStr.includes('hooks') ||
          pathStr.includes('utils') ||
          pathStr.includes('lib') ||
          pathStr.includes('src') ||
          pathStr.includes('package.json')
        ) {
          return Promise.resolve();
        }
        return Promise.reject(new Error('ENOENT'));
      });
      vi.mocked(fsPromises.readFile).mockResolvedValue(JSON.stringify({}));

      const result = await handleScanPatterns({});
      const data = JSON.parse(result.content[0].text);

      expect(data.architecture.layers).toContain('components');
      expect(data.architecture.layers).toContain('hooks');
      expect(data.architecture.layers).toContain('utils');
      expect(data.architecture.layers).toContain('lib');
    });

    it('should detect __tests__ location', async () => {
      // The handler checks for __tests__ in projectRoot (parent of scanPath)
      // scanPath defaults to 'src', so projectRoot is one level up
      vi.mocked(fsPromises.access).mockImplementation((p) => {
        const pathStr = String(p);
        if (
          pathStr.endsWith('__tests__') ||
          pathStr.endsWith('src') ||
          pathStr.includes('package.json')
        ) {
          return Promise.resolve();
        }
        return Promise.reject(new Error('ENOENT'));
      });
      vi.mocked(fsPromises.readFile).mockResolvedValue(JSON.stringify({}));

      const result = await handleScanPatterns({});
      const data = JSON.parse(result.content[0].text);

      expect(data.testing.location).toBe('__tests__');
    });

    it('should detect tests folder location', async () => {
      vi.mocked(fsPromises.access).mockImplementation((p) => {
        const pathStr = String(p);
        if (
          (pathStr.endsWith('tests') && !pathStr.includes('__tests__')) ||
          pathStr.includes('package.json') ||
          pathStr.includes('src')
        ) {
          return Promise.resolve();
        }
        return Promise.reject(new Error('ENOENT'));
      });
      vi.mocked(fsPromises.readFile).mockResolvedValue(JSON.stringify({}));

      const result = await handleScanPatterns({});
      const data = JSON.parse(result.content[0].text);

      expect(data.testing.location).toBe('tests');
    });

    it('should detect Vitest framework', async () => {
      vi.mocked(fsPromises.access).mockResolvedValue(undefined);
      vi.mocked(fsPromises.readFile).mockResolvedValue(JSON.stringify({
        devDependencies: { vitest: '^1.0.0' },
      }));

      const result = await handleScanPatterns({});
      const data = JSON.parse(result.content[0].text);

      expect(data.testing.framework).toBe('vitest');
    });

    it('should detect Jest framework', async () => {
      vi.mocked(fsPromises.access).mockResolvedValue(undefined);
      vi.mocked(fsPromises.readFile).mockResolvedValue(JSON.stringify({
        devDependencies: { jest: '^29.0.0' },
      }));

      const result = await handleScanPatterns({});
      const data = JSON.parse(result.content[0].text);

      expect(data.testing.framework).toBe('jest');
    });

    it('should detect Playwright framework', async () => {
      vi.mocked(fsPromises.access).mockResolvedValue(undefined);
      vi.mocked(fsPromises.readFile).mockResolvedValue(JSON.stringify({
        devDependencies: { '@playwright/test': '^1.40.0' },
      }));

      const result = await handleScanPatterns({});
      const data = JSON.parse(result.content[0].text);

      expect(data.testing.framework).toBe('playwright');
    });

    it('should detect Tailwind styling approach', async () => {
      vi.mocked(fsPromises.access).mockResolvedValue(undefined);
      vi.mocked(fsPromises.readFile).mockResolvedValue(JSON.stringify({
        devDependencies: { tailwindcss: '^3.0.0' },
      }));

      const result = await handleScanPatterns({});
      const data = JSON.parse(result.content[0].text);

      expect(data.styling.approach).toBe('utility-first');
      expect(data.styling.class_naming).toBe('tailwind');
    });

    it('should detect CSS-in-JS styling approach', async () => {
      vi.mocked(fsPromises.access).mockResolvedValue(undefined);
      vi.mocked(fsPromises.readFile).mockResolvedValue(JSON.stringify({
        dependencies: { 'styled-components': '^6.0.0' },
      }));

      const result = await handleScanPatterns({});
      const data = JSON.parse(result.content[0].text);

      expect(data.styling.approach).toBe('css-in-js');
    });

    it('should return default naming conventions', async () => {
      vi.mocked(fsPromises.access).mockResolvedValue(undefined);
      vi.mocked(fsPromises.readFile).mockResolvedValue(JSON.stringify({}));

      const result = await handleScanPatterns({});
      const data = JSON.parse(result.content[0].text);

      expect(data.naming.components).toBe('PascalCase');
      expect(data.naming.files).toBe('kebab-case');
      expect(data.naming.functions).toBe('camelCase');
      expect(data.naming.variables).toBe('camelCase');
    });

    it('should use src as default path', async () => {
      const existsCalls: string[] = [];
      vi.mocked(fsPromises.access).mockImplementation((p) => {
        existsCalls.push(String(p));
        if (String(p).includes('src') || String(p).includes('package.json')) {
          return Promise.resolve();
        }
        return Promise.reject(new Error('ENOENT'));
      });
      vi.mocked(fsPromises.readFile).mockResolvedValue(JSON.stringify({}));

      await handleScanPatterns({});

      expect(existsCalls.some(c => c.includes('src'))).toBe(true);
    });

    it('should use custom path when provided', async () => {
      const existsCalls: string[] = [];
      vi.mocked(fsPromises.access).mockImplementation((p) => {
        existsCalls.push(String(p));
        if (String(p).includes('package.json')) {
          return Promise.resolve();
        }
        return Promise.reject(new Error('ENOENT'));
      });
      vi.mocked(fsPromises.readFile).mockResolvedValue(JSON.stringify({}));

      await handleScanPatterns({ path: 'custom/source' });

      expect(existsCalls.some(c => c.includes('custom'))).toBe(true);
    });
  });
});
