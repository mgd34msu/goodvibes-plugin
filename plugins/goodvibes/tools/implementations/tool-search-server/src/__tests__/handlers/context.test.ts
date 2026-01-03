/**
 * Unit tests for context handlers
 *
 * Tests cover:
 * - handleDetectStack
 * - handleScanPatterns
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';

import {
  handleDetectStack,
  handleScanPatterns,
} from '../../handlers/context.js';
import { samplePackageJson } from '../setup.js';

// Mock modules
vi.mock('fs');
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
      it('should detect Next.js framework', () => {
        vi.mocked(fs.existsSync).mockReturnValue(true);
        vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({
          dependencies: { next: '^14.0.0', react: '^18.0.0' },
        }));

        const result = handleDetectStack({});
        const data = JSON.parse(result.content[0].text);

        expect(data.frontend.framework).toBe('next');
      });

      it('should detect Nuxt framework', () => {
        vi.mocked(fs.existsSync).mockReturnValue(true);
        vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({
          dependencies: { nuxt: '^3.0.0' },
        }));

        const result = handleDetectStack({});
        const data = JSON.parse(result.content[0].text);

        expect(data.frontend.framework).toBe('nuxt');
      });

      it('should detect Remix framework', () => {
        vi.mocked(fs.existsSync).mockReturnValue(true);
        vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({
          dependencies: { '@remix-run/react': '^2.0.0' },
        }));

        const result = handleDetectStack({});
        const data = JSON.parse(result.content[0].text);

        expect(data.frontend.framework).toBe('remix');
      });

      it('should detect Astro framework', () => {
        vi.mocked(fs.existsSync).mockReturnValue(true);
        vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({
          dependencies: { astro: '^4.0.0' },
        }));

        const result = handleDetectStack({});
        const data = JSON.parse(result.content[0].text);

        expect(data.frontend.framework).toBe('astro');
      });

      it('should detect React UI library', () => {
        vi.mocked(fs.existsSync).mockReturnValue(true);
        vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({
          dependencies: { react: '^18.0.0' },
        }));

        const result = handleDetectStack({});
        const data = JSON.parse(result.content[0].text);

        expect(data.frontend.ui_library).toBe('react');
      });

      it('should detect Vue UI library', () => {
        vi.mocked(fs.existsSync).mockReturnValue(true);
        vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({
          dependencies: { vue: '^3.0.0' },
        }));

        const result = handleDetectStack({});
        const data = JSON.parse(result.content[0].text);

        expect(data.frontend.ui_library).toBe('vue');
      });

      it('should detect Svelte UI library', () => {
        vi.mocked(fs.existsSync).mockReturnValue(true);
        vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({
          dependencies: { svelte: '^4.0.0' },
        }));

        const result = handleDetectStack({});
        const data = JSON.parse(result.content[0].text);

        expect(data.frontend.ui_library).toBe('svelte');
      });

      it('should detect Tailwind styling', () => {
        vi.mocked(fs.existsSync).mockReturnValue(true);
        vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({
          devDependencies: { tailwindcss: '^3.0.0' },
        }));

        const result = handleDetectStack({});
        const data = JSON.parse(result.content[0].text);

        expect(data.frontend.styling).toBe('tailwind');
      });

      it('should detect styled-components styling', () => {
        vi.mocked(fs.existsSync).mockReturnValue(true);
        vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({
          dependencies: { 'styled-components': '^6.0.0' },
        }));

        const result = handleDetectStack({});
        const data = JSON.parse(result.content[0].text);

        expect(data.frontend.styling).toBe('styled-components');
      });

      it('should detect Emotion styling', () => {
        vi.mocked(fs.existsSync).mockReturnValue(true);
        vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({
          dependencies: { '@emotion/react': '^11.0.0' },
        }));

        const result = handleDetectStack({});
        const data = JSON.parse(result.content[0].text);

        expect(data.frontend.styling).toBe('emotion');
      });

      it('should detect Zustand state management', () => {
        vi.mocked(fs.existsSync).mockReturnValue(true);
        vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({
          dependencies: { zustand: '^4.0.0' },
        }));

        const result = handleDetectStack({});
        const data = JSON.parse(result.content[0].text);

        expect(data.frontend.state_management).toBe('zustand');
      });

      it('should detect Redux state management', () => {
        vi.mocked(fs.existsSync).mockReturnValue(true);
        vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({
          dependencies: { '@reduxjs/toolkit': '^2.0.0' },
        }));

        const result = handleDetectStack({});
        const data = JSON.parse(result.content[0].text);

        expect(data.frontend.state_management).toBe('redux');
      });

      it('should detect Jotai state management', () => {
        vi.mocked(fs.existsSync).mockReturnValue(true);
        vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({
          dependencies: { jotai: '^2.0.0' },
        }));

        const result = handleDetectStack({});
        const data = JSON.parse(result.content[0].text);

        expect(data.frontend.state_management).toBe('jotai');
      });
    });

    describe('backend detection', () => {
      it('should set runtime to node', () => {
        vi.mocked(fs.existsSync).mockReturnValue(true);
        vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({}));

        const result = handleDetectStack({});
        const data = JSON.parse(result.content[0].text);

        expect(data.backend.runtime).toBe('node');
      });

      it('should detect Express framework', () => {
        vi.mocked(fs.existsSync).mockReturnValue(true);
        vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({
          dependencies: { express: '^4.0.0' },
        }));

        const result = handleDetectStack({});
        const data = JSON.parse(result.content[0].text);

        expect(data.backend.framework).toBe('express');
      });

      it('should detect Fastify framework', () => {
        vi.mocked(fs.existsSync).mockReturnValue(true);
        vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({
          dependencies: { fastify: '^4.0.0' },
        }));

        const result = handleDetectStack({});
        const data = JSON.parse(result.content[0].text);

        expect(data.backend.framework).toBe('fastify');
      });

      it('should detect Hono framework', () => {
        vi.mocked(fs.existsSync).mockReturnValue(true);
        vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({
          dependencies: { hono: '^3.0.0' },
        }));

        const result = handleDetectStack({});
        const data = JSON.parse(result.content[0].text);

        expect(data.backend.framework).toBe('hono');
      });

      it('should detect Next.js API routes', () => {
        vi.mocked(fs.existsSync).mockReturnValue(true);
        vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({
          dependencies: { next: '^14.0.0' },
        }));

        const result = handleDetectStack({});
        const data = JSON.parse(result.content[0].text);

        expect(data.backend.framework).toBe('next-api');
      });

      it('should detect Prisma ORM', () => {
        vi.mocked(fs.existsSync).mockReturnValue(true);
        vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({
          dependencies: { '@prisma/client': '^5.0.0' },
        }));

        const result = handleDetectStack({});
        const data = JSON.parse(result.content[0].text);

        expect(data.backend.orm).toBe('prisma');
      });

      it('should detect Drizzle ORM', () => {
        vi.mocked(fs.existsSync).mockReturnValue(true);
        vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({
          dependencies: { 'drizzle-orm': '^0.29.0' },
        }));

        const result = handleDetectStack({});
        const data = JSON.parse(result.content[0].text);

        expect(data.backend.orm).toBe('drizzle');
      });

      it('should detect TypeORM', () => {
        vi.mocked(fs.existsSync).mockReturnValue(true);
        vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({
          dependencies: { typeorm: '^0.3.0' },
        }));

        const result = handleDetectStack({});
        const data = JSON.parse(result.content[0].text);

        expect(data.backend.orm).toBe('typeorm');
      });
    });

    describe('build detection', () => {
      it('should detect pnpm package manager', () => {
        vi.mocked(fs.existsSync).mockImplementation((p: fs.PathLike) => {
          const pathStr = String(p);
          return pathStr.includes('pnpm-lock.yaml') || pathStr.includes('package.json');
        });
        vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({}));

        const result = handleDetectStack({});
        const data = JSON.parse(result.content[0].text);

        expect(data.build.package_manager).toBe('pnpm');
      });

      it('should detect yarn package manager', () => {
        vi.mocked(fs.existsSync).mockImplementation((p: fs.PathLike) => {
          const pathStr = String(p);
          return pathStr.includes('yarn.lock') || pathStr.includes('package.json');
        });
        vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({}));

        const result = handleDetectStack({});
        const data = JSON.parse(result.content[0].text);

        expect(data.build.package_manager).toBe('yarn');
      });

      it('should detect TypeScript from dependencies', () => {
        vi.mocked(fs.existsSync).mockReturnValue(true);
        vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({
          devDependencies: { typescript: '^5.0.0' },
        }));

        const result = handleDetectStack({});
        const data = JSON.parse(result.content[0].text);

        expect(data.build.typescript).toBe(true);
      });

      it('should detect TypeScript from tsconfig.json', () => {
        vi.mocked(fs.existsSync).mockImplementation((p: fs.PathLike) => {
          const pathStr = String(p);
          return pathStr.includes('tsconfig.json') || pathStr.includes('package.json');
        });
        vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({}));

        const result = handleDetectStack({});
        const data = JSON.parse(result.content[0].text);

        expect(data.build.typescript).toBe(true);
      });

      it('should detect Vite bundler', () => {
        vi.mocked(fs.existsSync).mockReturnValue(true);
        vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({
          devDependencies: { vite: '^5.0.0' },
        }));

        const result = handleDetectStack({});
        const data = JSON.parse(result.content[0].text);

        expect(data.build.bundler).toBe('vite');
      });

      it('should detect Turbopack bundler', () => {
        vi.mocked(fs.existsSync).mockReturnValue(true);
        vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({
          devDependencies: { turbo: '^1.0.0' },
        }));

        const result = handleDetectStack({});
        const data = JSON.parse(result.content[0].text);

        expect(data.build.bundler).toBe('turbopack');
      });

      it('should detect Webpack bundler', () => {
        vi.mocked(fs.existsSync).mockReturnValue(true);
        vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({
          devDependencies: { webpack: '^5.0.0' },
        }));

        const result = handleDetectStack({});
        const data = JSON.parse(result.content[0].text);

        expect(data.build.bundler).toBe('webpack');
      });
    });

    describe('config detection', () => {
      it('should detect config files', () => {
        vi.mocked(fs.existsSync).mockImplementation((p: fs.PathLike) => {
          const pathStr = String(p);
          return (
            pathStr.includes('package.json') ||
            pathStr.includes('tsconfig.json') ||
            pathStr.includes('tailwind.config') ||
            pathStr.includes('next.config')
          );
        });
        vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({}));

        const result = handleDetectStack({});
        const data = JSON.parse(result.content[0].text);

        expect(data.detected_configs).toContain('tsconfig.json');
      });
    });

    describe('skill recommendations', () => {
      it('should recommend Next.js skill', () => {
        vi.mocked(fs.existsSync).mockReturnValue(true);
        vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({
          dependencies: { next: '^14.0.0' },
        }));

        const result = handleDetectStack({});
        const data = JSON.parse(result.content[0].text);

        expect(data.recommended_skills).toContain('webdev/meta-frameworks/nextjs');
      });

      it('should recommend Tailwind skill', () => {
        vi.mocked(fs.existsSync).mockReturnValue(true);
        vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({
          devDependencies: { tailwindcss: '^3.0.0' },
        }));

        const result = handleDetectStack({});
        const data = JSON.parse(result.content[0].text);

        expect(data.recommended_skills).toContain('webdev/styling/tailwind');
      });

      it('should recommend Prisma skill', () => {
        vi.mocked(fs.existsSync).mockReturnValue(true);
        vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({
          dependencies: { prisma: '^5.0.0' },
        }));

        const result = handleDetectStack({});
        const data = JSON.parse(result.content[0].text);

        expect(data.recommended_skills).toContain('webdev/databases-orms/prisma');
      });
    });

    describe('path handling', () => {
      it('should use current directory by default', () => {
        vi.mocked(fs.existsSync).mockReturnValue(true);
        vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({}));

        handleDetectStack({});

        expect(fs.existsSync).toHaveBeenCalled();
      });

      it('should use provided path', () => {
        const readCalls: string[] = [];
        vi.mocked(fs.existsSync).mockReturnValue(true);
        vi.mocked(fs.readFileSync).mockImplementation((p: fs.PathLike) => {
          readCalls.push(String(p));
          return JSON.stringify({});
        });

        handleDetectStack({ path: 'custom/path' });

        expect(readCalls.some(c => c.includes('custom'))).toBe(true);
      });
    });
  });

  describe('handleScanPatterns', () => {
    it('should detect barrel exports', () => {
      // The handler checks for index.ts or index.js in the scanPath (default: src)
      vi.mocked(fs.existsSync).mockImplementation((p: fs.PathLike) => {
        const pathStr = String(p);
        // Match src/index.ts or src/index.js
        return (
          pathStr.endsWith('index.ts') ||
          pathStr.endsWith('index.js') ||
          pathStr.endsWith('src') ||
          pathStr.includes('package.json')
        );
      });
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({}));

      const result = handleScanPatterns({});
      const data = JSON.parse(result.content[0].text);

      expect(data.structure.barrel_exports).toBe(true);
    });

    it('should detect architecture layers', () => {
      vi.mocked(fs.existsSync).mockImplementation((p: fs.PathLike) => {
        const pathStr = String(p);
        return (
          pathStr.includes('components') ||
          pathStr.includes('hooks') ||
          pathStr.includes('utils') ||
          pathStr.includes('lib') ||
          pathStr.includes('src') ||
          pathStr.includes('package.json')
        );
      });
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({}));

      const result = handleScanPatterns({});
      const data = JSON.parse(result.content[0].text);

      expect(data.architecture.layers).toContain('components');
      expect(data.architecture.layers).toContain('hooks');
      expect(data.architecture.layers).toContain('utils');
      expect(data.architecture.layers).toContain('lib');
    });

    it('should detect __tests__ location', () => {
      // The handler checks for __tests__ in projectRoot (parent of scanPath)
      // scanPath defaults to 'src', so projectRoot is one level up
      vi.mocked(fs.existsSync).mockImplementation((p: fs.PathLike) => {
        const pathStr = String(p);
        return (
          pathStr.endsWith('__tests__') ||
          pathStr.endsWith('src') ||
          pathStr.includes('package.json')
        );
      });
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({}));

      const result = handleScanPatterns({});
      const data = JSON.parse(result.content[0].text);

      expect(data.testing.location).toBe('__tests__');
    });

    it('should detect tests folder location', () => {
      vi.mocked(fs.existsSync).mockImplementation((p: fs.PathLike) => {
        const pathStr = String(p);
        return (
          (pathStr.endsWith('tests') && !pathStr.includes('__tests__')) ||
          pathStr.includes('package.json') ||
          pathStr.includes('src')
        );
      });
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({}));

      const result = handleScanPatterns({});
      const data = JSON.parse(result.content[0].text);

      expect(data.testing.location).toBe('tests');
    });

    it('should detect Vitest framework', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({
        devDependencies: { vitest: '^1.0.0' },
      }));

      const result = handleScanPatterns({});
      const data = JSON.parse(result.content[0].text);

      expect(data.testing.framework).toBe('vitest');
    });

    it('should detect Jest framework', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({
        devDependencies: { jest: '^29.0.0' },
      }));

      const result = handleScanPatterns({});
      const data = JSON.parse(result.content[0].text);

      expect(data.testing.framework).toBe('jest');
    });

    it('should detect Playwright framework', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({
        devDependencies: { '@playwright/test': '^1.40.0' },
      }));

      const result = handleScanPatterns({});
      const data = JSON.parse(result.content[0].text);

      expect(data.testing.framework).toBe('playwright');
    });

    it('should detect Tailwind styling approach', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({
        devDependencies: { tailwindcss: '^3.0.0' },
      }));

      const result = handleScanPatterns({});
      const data = JSON.parse(result.content[0].text);

      expect(data.styling.approach).toBe('utility-first');
      expect(data.styling.class_naming).toBe('tailwind');
    });

    it('should detect CSS-in-JS styling approach', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({
        dependencies: { 'styled-components': '^6.0.0' },
      }));

      const result = handleScanPatterns({});
      const data = JSON.parse(result.content[0].text);

      expect(data.styling.approach).toBe('css-in-js');
    });

    it('should return default naming conventions', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({}));

      const result = handleScanPatterns({});
      const data = JSON.parse(result.content[0].text);

      expect(data.naming.components).toBe('PascalCase');
      expect(data.naming.files).toBe('kebab-case');
      expect(data.naming.functions).toBe('camelCase');
      expect(data.naming.variables).toBe('camelCase');
    });

    it('should use src as default path', () => {
      const existsCalls: string[] = [];
      vi.mocked(fs.existsSync).mockImplementation((p: fs.PathLike) => {
        existsCalls.push(String(p));
        return String(p).includes('src') || String(p).includes('package.json');
      });
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({}));

      handleScanPatterns({});

      expect(existsCalls.some(c => c.includes('src'))).toBe(true);
    });

    it('should use custom path when provided', () => {
      const existsCalls: string[] = [];
      vi.mocked(fs.existsSync).mockImplementation((p: fs.PathLike) => {
        existsCalls.push(String(p));
        return String(p).includes('package.json');
      });
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({}));

      handleScanPatterns({ path: 'custom/source' });

      expect(existsCalls.some(c => c.includes('custom'))).toBe(true);
    });
  });
});
