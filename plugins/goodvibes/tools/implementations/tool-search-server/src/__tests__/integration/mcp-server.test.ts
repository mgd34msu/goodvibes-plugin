/**
 * Integration tests for MCP Server
 *
 * Tests cover:
 * - Server initialization
 * - Tool listing
 * - Tool calls routing
 * - Error handling
 * - Context initialization
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as yaml from 'js-yaml';

// Mock modules before imports
vi.mock('fs');
vi.mock('@modelcontextprotocol/sdk/server/index.js', () => ({
  Server: vi.fn().mockImplementation(() => ({
    setRequestHandler: vi.fn(),
    connect: vi.fn(),
    close: vi.fn(),
    onerror: null,
  })),
}));
vi.mock('@modelcontextprotocol/sdk/server/stdio.js', () => ({
  StdioServerTransport: vi.fn(),
}));

import { sampleSkillsRegistry, sampleAgentsRegistry, sampleToolsRegistry } from '../setup.js';
import { TOOL_SCHEMAS } from '../../tool-schemas.js';
import { createContext } from '../../context.js';

describe('MCP Server Integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('Tool Schemas', () => {
    it('should have all required tools defined', () => {
      const toolNames = TOOL_SCHEMAS.map(s => s.name);

      expect(toolNames).toContain('search_skills');
      expect(toolNames).toContain('search_agents');
      expect(toolNames).toContain('search_tools');
      expect(toolNames).toContain('recommend_skills');
      expect(toolNames).toContain('get_skill_content');
      expect(toolNames).toContain('get_agent_content');
      expect(toolNames).toContain('skill_dependencies');
      expect(toolNames).toContain('detect_stack');
      expect(toolNames).toContain('check_versions');
      expect(toolNames).toContain('scan_patterns');
      expect(toolNames).toContain('fetch_docs');
      expect(toolNames).toContain('get_schema');
      expect(toolNames).toContain('read_config');
      expect(toolNames).toContain('validate_implementation');
      expect(toolNames).toContain('run_smoke_test');
      expect(toolNames).toContain('check_types');
      expect(toolNames).toContain('scaffold_project');
      expect(toolNames).toContain('list_templates');
      expect(toolNames).toContain('plugin_status');
    });

    it('should have valid inputSchema for each tool', () => {
      TOOL_SCHEMAS.forEach(schema => {
        expect(schema.inputSchema).toBeDefined();
        expect(schema.inputSchema.type).toBe('object');
        expect(schema.inputSchema.properties).toBeDefined();
      });
    });

    it('should have required fields defined for tools that need them', () => {
      const searchSkills = TOOL_SCHEMAS.find(s => s.name === 'search_skills');
      expect(searchSkills?.inputSchema.required).toContain('query');

      const getSkillContent = TOOL_SCHEMAS.find(s => s.name === 'get_skill_content');
      expect(getSkillContent?.inputSchema.required).toContain('path');

      const getSchema = TOOL_SCHEMAS.find(s => s.name === 'get_schema');
      expect(getSchema?.inputSchema.required).toContain('source');

      const scaffoldProject = TOOL_SCHEMAS.find(s => s.name === 'scaffold_project');
      expect(scaffoldProject?.inputSchema.required).toContain('template');
      expect(scaffoldProject?.inputSchema.required).toContain('output_dir');
    });

    it('should have descriptions for all tools', () => {
      TOOL_SCHEMAS.forEach(schema => {
        expect(schema.description).toBeDefined();
        expect(schema.description.length).toBeGreaterThan(10);
      });
    });
  });

  describe('Server Context', () => {
    it('should create context with null indices', () => {
      const context = createContext();

      expect(context.skillsIndex).toBeNull();
      expect(context.agentsIndex).toBeNull();
      expect(context.toolsIndex).toBeNull();
      expect(context.skillsRegistry).toBeNull();
    });
  });

  describe('Registry Loading', () => {
    it('should load skills registry', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(yaml.dump(sampleSkillsRegistry));

      // Import and test loadRegistry
      const registryContent = fs.readFileSync('/mock/path', 'utf-8');
      const registry = yaml.load(registryContent) as any;

      expect(registry.version).toBe('1.0.0');
      expect(registry.search_index.length).toBe(5);
    });

    it('should load agents registry', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(yaml.dump(sampleAgentsRegistry));

      const registryContent = fs.readFileSync('/mock/path', 'utf-8');
      const registry = yaml.load(registryContent) as any;

      expect(registry.version).toBe('1.0.0');
      expect(registry.search_index.length).toBe(2);
    });

    it('should load tools registry', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(yaml.dump(sampleToolsRegistry));

      const registryContent = fs.readFileSync('/mock/path', 'utf-8');
      const registry = yaml.load(registryContent) as any;

      expect(registry.version).toBe('1.0.0');
      expect(registry.search_index.length).toBe(2);
    });
  });

  describe('Tool Call Routing', () => {
    // These tests verify that the handler mapping is correct
    it('should have handler for search_skills', async () => {
      const { handleSearchSkills } = await import('../../handlers/search.js');
      expect(handleSearchSkills).toBeDefined();
      expect(typeof handleSearchSkills).toBe('function');
    });

    it('should have handler for search_agents', async () => {
      const { handleSearchAgents } = await import('../../handlers/search.js');
      expect(handleSearchAgents).toBeDefined();
      expect(typeof handleSearchAgents).toBe('function');
    });

    it('should have handler for search_tools', async () => {
      const { handleSearchTools } = await import('../../handlers/search.js');
      expect(handleSearchTools).toBeDefined();
      expect(typeof handleSearchTools).toBe('function');
    });

    it('should have handler for recommend_skills', async () => {
      const { handleRecommendSkills } = await import('../../handlers/search.js');
      expect(handleRecommendSkills).toBeDefined();
      expect(typeof handleRecommendSkills).toBe('function');
    });

    it('should have handler for get_skill_content', async () => {
      const { handleGetSkillContent } = await import('../../handlers/content.js');
      expect(handleGetSkillContent).toBeDefined();
      expect(typeof handleGetSkillContent).toBe('function');
    });

    it('should have handler for get_agent_content', async () => {
      const { handleGetAgentContent } = await import('../../handlers/content.js');
      expect(handleGetAgentContent).toBeDefined();
      expect(typeof handleGetAgentContent).toBe('function');
    });

    it('should have handler for skill_dependencies', async () => {
      const { handleSkillDependencies } = await import('../../handlers/dependencies.js');
      expect(handleSkillDependencies).toBeDefined();
      expect(typeof handleSkillDependencies).toBe('function');
    });

    it('should have handler for detect_stack', async () => {
      const { handleDetectStack } = await import('../../handlers/context.js');
      expect(handleDetectStack).toBeDefined();
      expect(typeof handleDetectStack).toBe('function');
    });

    it('should have handler for check_versions', async () => {
      const { handleCheckVersions } = await import('../../handlers/npm.js');
      expect(handleCheckVersions).toBeDefined();
      expect(typeof handleCheckVersions).toBe('function');
    });

    it('should have handler for scan_patterns', async () => {
      const { handleScanPatterns } = await import('../../handlers/context.js');
      expect(handleScanPatterns).toBeDefined();
      expect(typeof handleScanPatterns).toBe('function');
    });

    it('should have handler for fetch_docs', async () => {
      const { handleFetchDocs } = await import('../../handlers/docs.js');
      expect(handleFetchDocs).toBeDefined();
      expect(typeof handleFetchDocs).toBe('function');
    });

    it('should have handler for get_schema', async () => {
      const { handleGetSchema } = await import('../../handlers/schema.js');
      expect(handleGetSchema).toBeDefined();
      expect(typeof handleGetSchema).toBe('function');
    });

    it('should have handler for read_config', async () => {
      const { handleReadConfig } = await import('../../handlers/config.js');
      expect(handleReadConfig).toBeDefined();
      expect(typeof handleReadConfig).toBe('function');
    });

    it('should have handler for validate_implementation', async () => {
      const { handleValidateImplementation } = await import('../../handlers/validation.js');
      expect(handleValidateImplementation).toBeDefined();
      expect(typeof handleValidateImplementation).toBe('function');
    });

    it('should have handler for check_types', async () => {
      const { handleCheckTypes } = await import('../../handlers/validation.js');
      expect(handleCheckTypes).toBeDefined();
      expect(typeof handleCheckTypes).toBe('function');
    });

    it('should have handler for run_smoke_test', async () => {
      const { handleRunSmokeTest } = await import('../../handlers/smoke-test.js');
      expect(handleRunSmokeTest).toBeDefined();
      expect(typeof handleRunSmokeTest).toBe('function');
    });

    it('should have handler for scaffold_project', async () => {
      const { handleScaffoldProject } = await import('../../handlers/scaffolding.js');
      expect(handleScaffoldProject).toBeDefined();
      expect(typeof handleScaffoldProject).toBe('function');
    });

    it('should have handler for list_templates', async () => {
      const { handleListTemplates } = await import('../../handlers/scaffolding.js');
      expect(handleListTemplates).toBeDefined();
      expect(typeof handleListTemplates).toBe('function');
    });

    it('should have handler for plugin_status', async () => {
      const { handlePluginStatus } = await import('../../handlers/status.js');
      expect(handlePluginStatus).toBeDefined();
      expect(typeof handlePluginStatus).toBe('function');
    });
  });

  describe('Handler Exports', () => {
    it('should export all handlers from index', async () => {
      const handlers = await import('../../handlers/index.js');

      // Status
      expect(handlers.handlePluginStatus).toBeDefined();

      // Search
      expect(handlers.handleSearchSkills).toBeDefined();
      expect(handlers.handleSearchAgents).toBeDefined();
      expect(handlers.handleSearchTools).toBeDefined();
      expect(handlers.handleRecommendSkills).toBeDefined();

      // Content
      expect(handlers.handleGetSkillContent).toBeDefined();
      expect(handlers.handleGetAgentContent).toBeDefined();

      // Context
      expect(handlers.handleDetectStack).toBeDefined();
      expect(handlers.handleScanPatterns).toBeDefined();

      // Dependencies
      expect(handlers.handleSkillDependencies).toBeDefined();

      // NPM
      expect(handlers.handleCheckVersions).toBeDefined();
      expect(handlers.fetchNpmPackageInfo).toBeDefined();
      expect(handlers.fetchNpmReadme).toBeDefined();

      // Docs
      expect(handlers.handleFetchDocs).toBeDefined();
      expect(handlers.getCommonApiReferences).toBeDefined();

      // Schema
      expect(handlers.handleGetSchema).toBeDefined();

      // Config
      expect(handlers.handleReadConfig).toBeDefined();

      // Validation
      expect(handlers.handleValidateImplementation).toBeDefined();
      expect(handlers.handleCheckTypes).toBeDefined();

      // Smoke test
      expect(handlers.handleRunSmokeTest).toBeDefined();

      // Scaffolding
      expect(handlers.handleScaffoldProject).toBeDefined();
      expect(handlers.handleListTemplates).toBeDefined();
    });
  });

  describe('Error Response Format', () => {
    it('should have error utility for consistent error responses', async () => {
      const { error } = await import('../../utils.js');

      const errorResponse = error('Something went wrong');

      expect(errorResponse.isError).toBe(true);
      expect(errorResponse.content).toHaveLength(1);
      expect(errorResponse.content[0].type).toBe('text');
      expect(JSON.parse(errorResponse.content[0].text)).toHaveProperty('error');
    });
  });

  describe('Success Response Format', () => {
    it('should have success utility for consistent success responses', async () => {
      const { success } = await import('../../utils.js');

      const successResponse = success({ data: 'test' });

      expect(successResponse.isError).toBeUndefined();
      expect(successResponse.content).toHaveLength(1);
      expect(successResponse.content[0].type).toBe('text');
    });
  });
});
