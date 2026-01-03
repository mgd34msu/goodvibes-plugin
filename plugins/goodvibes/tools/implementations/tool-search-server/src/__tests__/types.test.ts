/**
 * Unit tests for type definitions
 *
 * Tests cover:
 * - Type validation
 * - Interface compliance
 * - Response formats
 */

import { describe, it, expect } from 'vitest';
import type {
  RegistryEntry,
  Registry,
  SearchResult,
  StackInfo,
  PackageInfo,
  PluginStatus,
  ToolResponse,
} from '../types.js';

describe('Type Definitions', () => {
  describe('RegistryEntry', () => {
    it('should have required properties', () => {
      const entry: RegistryEntry = {
        name: 'Test Skill',
        path: 'test/skill',
        description: 'A test skill',
      };

      expect(entry.name).toBeDefined();
      expect(entry.path).toBeDefined();
      expect(entry.description).toBeDefined();
    });

    it('should allow optional properties', () => {
      const entry: RegistryEntry = {
        name: 'Test Skill',
        path: 'test/skill',
        description: 'A test skill',
        keywords: ['test', 'skill'],
        category: 'testing',
      };

      expect(entry.keywords).toEqual(['test', 'skill']);
      expect(entry.category).toBe('testing');
    });
  });

  describe('Registry', () => {
    it('should have version and search_index', () => {
      const registry: Registry = {
        version: '1.0.0',
        search_index: [
          {
            name: 'Test',
            path: 'test',
            description: 'Test',
          },
        ],
      };

      expect(registry.version).toBe('1.0.0');
      expect(registry.search_index).toHaveLength(1);
    });
  });

  describe('SearchResult', () => {
    it('should have required properties', () => {
      const result: SearchResult = {
        name: 'Test Skill',
        path: 'test/skill',
        description: 'A test skill',
        relevance: 0.95,
      };

      expect(result.name).toBeDefined();
      expect(result.path).toBeDefined();
      expect(result.description).toBeDefined();
      expect(result.relevance).toBeGreaterThanOrEqual(0);
      expect(result.relevance).toBeLessThanOrEqual(1);
    });
  });

  describe('StackInfo', () => {
    it('should have frontend, backend, and build sections', () => {
      const stack: StackInfo = {
        frontend: {
          framework: 'next',
          ui_library: 'react',
          styling: 'tailwind',
          state_management: 'zustand',
        },
        backend: {
          runtime: 'node',
          framework: 'express',
          database: 'postgresql',
          orm: 'prisma',
        },
        build: {
          bundler: 'vite',
          package_manager: 'pnpm',
          typescript: true,
        },
        detected_configs: ['tsconfig.json', 'tailwind.config.js'],
        recommended_skills: ['nextjs', 'prisma', 'tailwind'],
      };

      expect(stack.frontend.framework).toBe('next');
      expect(stack.backend.orm).toBe('prisma');
      expect(stack.build.typescript).toBe(true);
      expect(stack.detected_configs).toHaveLength(2);
    });

    it('should allow empty sections', () => {
      const stack: StackInfo = {
        frontend: {},
        backend: {},
        build: { typescript: false },
        detected_configs: [],
        recommended_skills: [],
      };

      expect(stack.frontend.framework).toBeUndefined();
      expect(stack.backend.runtime).toBeUndefined();
    });
  });

  describe('PackageInfo', () => {
    it('should have required properties', () => {
      const pkg: PackageInfo = {
        name: 'react',
        installed: '^18.2.0',
        outdated: false,
      };

      expect(pkg.name).toBe('react');
      expect(pkg.installed).toBe('^18.2.0');
      expect(pkg.outdated).toBe(false);
    });

    it('should allow optional properties', () => {
      const pkg: PackageInfo = {
        name: 'react',
        installed: '^18.0.0',
        latest: '18.2.0',
        wanted: '18.2.0',
        outdated: true,
        breaking_changes: false,
      };

      expect(pkg.latest).toBe('18.2.0');
      expect(pkg.wanted).toBe('18.2.0');
      expect(pkg.breaking_changes).toBe(false);
    });
  });

  describe('PluginStatus', () => {
    it('should have all required sections', () => {
      const status: PluginStatus = {
        version: '1.0.0',
        status: 'healthy',
        issues: [],
        manifest: { exists: true, valid: true, version: '1.0.0' },
        registries: {
          agents: { exists: true, count: 5 },
          skills: { exists: true, count: 20 },
          tools: { exists: true, count: 10 },
        },
        hooks: {
          config_exists: true,
          config_valid: true,
          events: [{ name: 'SessionStart', script: 'session-start.js', exists: true }],
        },
        mcp_server: { running: true },
      };

      expect(status.status).toBe('healthy');
      expect(status.manifest.valid).toBe(true);
      expect(status.registries.skills.count).toBe(20);
    });

    it('should allow degraded and error status', () => {
      const degraded: PluginStatus = {
        version: '1.0.0',
        status: 'degraded',
        issues: ['Missing registry'],
        manifest: { exists: true, valid: true },
        registries: {
          agents: { exists: false, count: 0 },
          skills: { exists: true, count: 10 },
          tools: { exists: true, count: 5 },
        },
        hooks: { config_exists: false, config_valid: false, events: [] },
        mcp_server: { running: true },
      };

      expect(degraded.status).toBe('degraded');
      expect(degraded.issues).toHaveLength(1);

      const error: PluginStatus = {
        ...degraded,
        status: 'error',
        issues: ['Issue 1', 'Issue 2', 'Issue 3', 'Issue 4'],
      };

      expect(error.status).toBe('error');
    });
  });

  describe('ToolResponse', () => {
    it('should have content array', () => {
      const response: ToolResponse = {
        content: [{ type: 'text', text: 'Hello' }],
      };

      expect(response.content).toHaveLength(1);
      expect(response.content[0].type).toBe('text');
    });

    it('should allow isError flag', () => {
      const errorResponse: ToolResponse = {
        content: [{ type: 'text', text: '{"error": "Something went wrong"}' }],
        isError: true,
      };

      expect(errorResponse.isError).toBe(true);
    });

    it('should support multiple content items', () => {
      const response: ToolResponse = {
        content: [
          { type: 'text', text: 'Part 1' },
          { type: 'text', text: 'Part 2' },
        ],
      };

      expect(response.content).toHaveLength(2);
    });
  });
});

describe('Response Format Validation', () => {
  describe('Search Response', () => {
    it('should match expected search response format', () => {
      const response = {
        skills: [
          { name: 'Test', path: 'test/path', description: 'Desc', relevance: 0.9 },
        ],
        total_count: 1,
        query: 'test',
      };

      expect(response.skills).toBeInstanceOf(Array);
      expect(response.total_count).toBe(response.skills.length);
      expect(response.query).toBeDefined();
    });
  });

  describe('Recommend Response', () => {
    it('should match expected recommend response format', () => {
      const response = {
        recommendations: [
          {
            skill: 'Test Skill',
            path: 'test/skill',
            relevance: 0.85,
            reason: 'Matches keywords',
            prerequisites: [],
            complements: [],
          },
        ],
        task_analysis: {
          category: 'testing',
          keywords: ['test', 'skill'],
          complexity: 'simple',
        },
      };

      expect(response.recommendations).toBeInstanceOf(Array);
      expect(response.task_analysis.category).toBeDefined();
      expect(response.task_analysis.complexity).toMatch(/simple|moderate|complex/);
    });
  });

  describe('Validation Response', () => {
    it('should match expected validation response format', () => {
      const response = {
        valid: true,
        score: 95,
        grade: 'A',
        issues: [],
        summary: {
          errors: 0,
          warnings: 0,
          info: 0,
          files_checked: 1,
          checks_run: ['security', 'structure'],
        },
        skill: null,
      };

      expect(response.valid).toBe(true);
      expect(response.score).toBeGreaterThanOrEqual(0);
      expect(response.score).toBeLessThanOrEqual(100);
      expect(response.grade).toMatch(/[A-F]/);
    });
  });

  describe('Schema Response', () => {
    it('should match expected schema response format', () => {
      const response = {
        source: 'prisma',
        tables: [
          {
            name: 'User',
            columns: [
              { name: 'id', type: 'String', nullable: false, primary: true, unique: false },
            ],
            relations: [],
            indexes: [],
          },
        ],
        raw_path: 'prisma/schema.prisma',
      };

      expect(response.source).toBeDefined();
      expect(response.tables).toBeInstanceOf(Array);
      expect(response.tables[0].columns).toBeInstanceOf(Array);
    });
  });

  describe('Smoke Test Response', () => {
    it('should match expected smoke test response format', () => {
      const response = {
        passed: true,
        tests: [
          {
            name: 'typecheck',
            passed: true,
            duration_ms: 1234,
            output: '',
            error: null,
          },
        ],
        summary: {
          total: 1,
          passed: 1,
          failed: 0,
          duration_ms: 1234,
        },
      };

      expect(response.passed).toBe(true);
      expect(response.tests).toBeInstanceOf(Array);
      expect(response.summary.total).toBe(response.tests.length);
    });
  });

  describe('Scaffold Response', () => {
    it('should match expected scaffold response format', () => {
      const response = {
        success: true,
        template: 'next-app',
        output_dir: './my-project',
        created_files: ['package.json', 'tsconfig.json'],
        variables_applied: { projectName: 'my-project' },
        post_create_results: [
          { command: 'npm install', success: true, output: '' },
        ],
        recommended_skills: ['nextjs-basics'],
        next_steps: ['cd ./my-project', 'npm run dev'],
      };

      expect(response.success).toBe(true);
      expect(response.created_files).toBeInstanceOf(Array);
      expect(response.next_steps).toBeInstanceOf(Array);
    });
  });
});
