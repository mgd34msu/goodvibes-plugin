/**
 * Unit tests for schemas/index.ts
 *
 * Tests cover:
 * - LazySchemaLoader class
 * - TOOL_SCHEMAS combined export
 * - Domain schema exports
 * - Schema structure validation
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  LazySchemaLoader,
  TOOL_SCHEMAS,
  DISCOVERY_SCHEMAS,
  CONTEXT_SCHEMAS,
  LSP_SCHEMAS,
  FRONTEND_SCHEMAS,
  VALIDATION_SCHEMAS,
  SECURITY_SCHEMAS,
  ERROR_SCHEMAS,
  DEPS_SCHEMAS,
  BUILD_SCHEMAS,
  ENV_SCHEMAS,
  PROCESS_SCHEMAS,
  RUNTIME_SCHEMAS,
  TYPES_SCHEMAS,
  GIT_SCHEMAS,
  PROJECT_SCHEMAS,
  TEST_SCHEMAS,
  ANALYSIS_SCHEMAS,
  type SchemaDomain,
  type ToolSchema,
} from '../../schemas/index.js';

describe('LazySchemaLoader', () => {
  let loader: LazySchemaLoader;

  beforeEach(() => {
    loader = new LazySchemaLoader();
  });

  describe('getByDomain', () => {
    it('should load schemas for discovery domain', () => {
      const schemas = loader.getByDomain('discovery');

      expect(schemas).toBeDefined();
      expect(schemas.length).toBeGreaterThan(0);
      expect(schemas).toBe(DISCOVERY_SCHEMAS);
    });

    it('should load schemas for context domain', () => {
      const schemas = loader.getByDomain('context');

      expect(schemas).toBeDefined();
      expect(schemas.length).toBeGreaterThan(0);
      expect(schemas).toBe(CONTEXT_SCHEMAS);
    });

    it('should load schemas for lsp domain', () => {
      const schemas = loader.getByDomain('lsp');

      expect(schemas).toBeDefined();
      expect(schemas.length).toBeGreaterThan(0);
      expect(schemas).toBe(LSP_SCHEMAS);
    });

    it('should load schemas for frontend domain', () => {
      const schemas = loader.getByDomain('frontend');

      expect(schemas).toBeDefined();
      expect(schemas.length).toBeGreaterThan(0);
      expect(schemas).toBe(FRONTEND_SCHEMAS);
    });

    it('should load schemas for validation domain', () => {
      const schemas = loader.getByDomain('validation');

      expect(schemas).toBeDefined();
      expect(schemas.length).toBeGreaterThan(0);
      expect(schemas).toBe(VALIDATION_SCHEMAS);
    });

    it('should load schemas for security domain', () => {
      const schemas = loader.getByDomain('security');

      expect(schemas).toBeDefined();
      expect(schemas.length).toBeGreaterThan(0);
      expect(schemas).toBe(SECURITY_SCHEMAS);
    });

    it('should load schemas for error domain', () => {
      const schemas = loader.getByDomain('error');

      expect(schemas).toBeDefined();
      expect(schemas.length).toBeGreaterThan(0);
      expect(schemas).toBe(ERROR_SCHEMAS);
    });

    it('should load schemas for deps domain', () => {
      const schemas = loader.getByDomain('deps');

      expect(schemas).toBeDefined();
      expect(schemas.length).toBeGreaterThan(0);
      expect(schemas).toBe(DEPS_SCHEMAS);
    });

    it('should load schemas for build domain', () => {
      const schemas = loader.getByDomain('build');

      expect(schemas).toBeDefined();
      expect(schemas.length).toBeGreaterThan(0);
      expect(schemas).toBe(BUILD_SCHEMAS);
    });

    it('should load schemas for env domain', () => {
      const schemas = loader.getByDomain('env');

      expect(schemas).toBeDefined();
      expect(schemas.length).toBeGreaterThan(0);
      expect(schemas).toBe(ENV_SCHEMAS);
    });

    it('should load schemas for process domain', () => {
      const schemas = loader.getByDomain('process');

      expect(schemas).toBeDefined();
      expect(schemas.length).toBeGreaterThan(0);
      expect(schemas).toBe(PROCESS_SCHEMAS);
    });

    it('should load schemas for runtime domain', () => {
      const schemas = loader.getByDomain('runtime');

      expect(schemas).toBeDefined();
      expect(schemas.length).toBeGreaterThan(0);
      expect(schemas).toBe(RUNTIME_SCHEMAS);
    });

    it('should load schemas for types domain', () => {
      const schemas = loader.getByDomain('types');

      expect(schemas).toBeDefined();
      expect(schemas.length).toBeGreaterThan(0);
      expect(schemas).toBe(TYPES_SCHEMAS);
    });

    it('should load schemas for git domain', () => {
      const schemas = loader.getByDomain('git');

      expect(schemas).toBeDefined();
      expect(schemas.length).toBeGreaterThan(0);
      expect(schemas).toBe(GIT_SCHEMAS);
    });

    it('should load schemas for project domain', () => {
      const schemas = loader.getByDomain('project');

      expect(schemas).toBeDefined();
      expect(schemas.length).toBeGreaterThan(0);
      expect(schemas).toBe(PROJECT_SCHEMAS);
    });

    it('should load schemas for test domain', () => {
      const schemas = loader.getByDomain('test');

      expect(schemas).toBeDefined();
      expect(schemas.length).toBeGreaterThan(0);
      expect(schemas).toBe(TEST_SCHEMAS);
    });

    it('should load schemas for analysis domain', () => {
      const schemas = loader.getByDomain('analysis');

      expect(schemas).toBeDefined();
      expect(schemas.length).toBeGreaterThan(0);
      expect(schemas).toBe(ANALYSIS_SCHEMAS);
    });

    it('should cache loaded domains', () => {
      // First load
      const firstLoad = loader.getByDomain('discovery');
      expect(loader.isDomainLoaded('discovery')).toBe(true);

      // Second load should return the same reference
      const secondLoad = loader.getByDomain('discovery');
      expect(secondLoad).toBe(firstLoad);
    });

    it('should populate schema map when loading domain', () => {
      loader.getByDomain('discovery');

      // Schema map should be populated with schemas from discovery domain
      const schema = loader.getByToolName('search_skills');
      expect(schema).toBeDefined();
      expect(schema?.name).toBe('search_skills');
    });
  });

  describe('getByDomains', () => {
    it('should load schemas for multiple domains', () => {
      const schemas = loader.getByDomains(['discovery', 'security']);

      expect(schemas.length).toBe(DISCOVERY_SCHEMAS.length + SECURITY_SCHEMAS.length);
    });

    it('should handle empty domains array', () => {
      const schemas = loader.getByDomains([]);

      expect(schemas).toEqual([]);
    });

    it('should handle single domain array', () => {
      const schemas = loader.getByDomains(['build']);

      expect(schemas.length).toBe(BUILD_SCHEMAS.length);
    });

    it('should combine all domain schemas correctly', () => {
      const schemas = loader.getByDomains(['error', 'deps', 'build']);

      expect(schemas.length).toBe(
        ERROR_SCHEMAS.length + DEPS_SCHEMAS.length + BUILD_SCHEMAS.length
      );
    });
  });

  describe('getByToolName', () => {
    it('should find tool by name after domain is loaded', () => {
      loader.getByDomain('discovery');

      const schema = loader.getByToolName('search_skills');

      expect(schema).toBeDefined();
      expect(schema?.name).toBe('search_skills');
      expect(schema?.description).toContain('Search the skill registry');
    });

    it('should find tool by name even if domain not yet loaded', () => {
      // Do not load any domain first
      const schema = loader.getByToolName('scan_for_secrets');

      expect(schema).toBeDefined();
      expect(schema?.name).toBe('scan_for_secrets');
    });

    it('should return undefined for non-existent tool', () => {
      const schema = loader.getByToolName('non_existent_tool');

      expect(schema).toBeUndefined();
    });

    it('should use cache for repeated lookups', () => {
      // First lookup
      const first = loader.getByToolName('search_skills');
      // Second lookup should use cache
      const second = loader.getByToolName('search_skills');

      expect(first).toBe(second);
    });

    it('should find tools from any domain lazily', () => {
      // Look up tools from various domains
      const securityTool = loader.getByToolName('scan_for_secrets');
      const lspTool = loader.getByToolName('find_references');
      const buildTool = loader.getByToolName('analyze_bundle');

      expect(securityTool).toBeDefined();
      expect(lspTool).toBeDefined();
      expect(buildTool).toBeDefined();
    });

    it('should mark domain as loaded when tool is found', () => {
      expect(loader.isDomainLoaded('security')).toBe(false);

      loader.getByToolName('scan_for_secrets');

      expect(loader.isDomainLoaded('security')).toBe(true);
    });

    it('should search through all domains when tool not in cache', () => {
      // This tool is in the 'analysis' domain (one of the last)
      const schema = loader.getByToolName('identify_tech_debt');

      expect(schema).toBeDefined();
      expect(schema?.name).toBe('identify_tech_debt');
    });
  });

  describe('isDomainLoaded', () => {
    it('should return false for unloaded domain', () => {
      expect(loader.isDomainLoaded('discovery')).toBe(false);
    });

    it('should return true after domain is loaded', () => {
      loader.getByDomain('discovery');

      expect(loader.isDomainLoaded('discovery')).toBe(true);
    });
  });

  describe('getLoadedDomains', () => {
    it('should return empty array initially', () => {
      const loaded = loader.getLoadedDomains();

      expect(loaded).toEqual([]);
    });

    it('should return loaded domains after loading', () => {
      loader.getByDomain('discovery');
      loader.getByDomain('security');

      const loaded = loader.getLoadedDomains();

      expect(loaded).toContain('discovery');
      expect(loaded).toContain('security');
      expect(loaded.length).toBe(2);
    });
  });

  describe('getAllSchemas', () => {
    it('should return all schemas from all domains', () => {
      const allSchemas = loader.getAllSchemas();

      expect(allSchemas.length).toBe(TOOL_SCHEMAS.length);
    });

    it('should load all domains', () => {
      loader.getAllSchemas();

      const allDomains: SchemaDomain[] = [
        'discovery', 'context', 'lsp', 'frontend', 'validation',
        'security', 'error', 'deps', 'build', 'env', 'process',
        'runtime', 'types', 'git', 'project', 'test', 'analysis'
      ];

      for (const domain of allDomains) {
        expect(loader.isDomainLoaded(domain)).toBe(true);
      }
    });
  });
});

describe('TOOL_SCHEMAS', () => {
  it('should be a non-empty array', () => {
    expect(Array.isArray(TOOL_SCHEMAS)).toBe(true);
    expect(TOOL_SCHEMAS.length).toBeGreaterThan(0);
  });

  it('should contain all schemas from individual domain exports', () => {
    const totalCount =
      DISCOVERY_SCHEMAS.length +
      CONTEXT_SCHEMAS.length +
      LSP_SCHEMAS.length +
      FRONTEND_SCHEMAS.length +
      VALIDATION_SCHEMAS.length +
      SECURITY_SCHEMAS.length +
      ERROR_SCHEMAS.length +
      DEPS_SCHEMAS.length +
      BUILD_SCHEMAS.length +
      ENV_SCHEMAS.length +
      PROCESS_SCHEMAS.length +
      RUNTIME_SCHEMAS.length +
      TYPES_SCHEMAS.length +
      GIT_SCHEMAS.length +
      PROJECT_SCHEMAS.length +
      TEST_SCHEMAS.length +
      ANALYSIS_SCHEMAS.length;

    // TOOL_SCHEMAS may include additional schemas not in domain exports
    expect(TOOL_SCHEMAS.length).toBeGreaterThanOrEqual(totalCount);
  });

  it('should have unique tool names', () => {
    const names = TOOL_SCHEMAS.map(s => s.name);
    const uniqueNames = new Set(names);

    expect(uniqueNames.size).toBe(names.length);
  });

  describe('schema structure validation', () => {
    it('should have required properties for each schema', () => {
      for (const schema of TOOL_SCHEMAS) {
        expect(schema.name).toBeDefined();
        expect(typeof schema.name).toBe('string');
        expect(schema.name.length).toBeGreaterThan(0);

        expect(schema.description).toBeDefined();
        expect(typeof schema.description).toBe('string');
        expect(schema.description.length).toBeGreaterThan(0);

        expect(schema.inputSchema).toBeDefined();
        expect(typeof schema.inputSchema).toBe('object');
        expect(schema.inputSchema.type).toBe('object');
      }
    });

    it('should have valid inputSchema structure', () => {
      for (const schema of TOOL_SCHEMAS) {
        const inputSchema = schema.inputSchema;

        expect(inputSchema.type).toBe('object');

        // Properties should be an object if present
        if (inputSchema.properties) {
          expect(typeof inputSchema.properties).toBe('object');
        }

        // Required should be an array if present
        if (inputSchema.required) {
          expect(Array.isArray(inputSchema.required)).toBe(true);
        }
      }
    });
  });
});

describe('Domain Schema Exports', () => {
  const domainSchemas = {
    DISCOVERY_SCHEMAS,
    CONTEXT_SCHEMAS,
    LSP_SCHEMAS,
    FRONTEND_SCHEMAS,
    VALIDATION_SCHEMAS,
    SECURITY_SCHEMAS,
    ERROR_SCHEMAS,
    DEPS_SCHEMAS,
    BUILD_SCHEMAS,
    ENV_SCHEMAS,
    PROCESS_SCHEMAS,
    RUNTIME_SCHEMAS,
    TYPES_SCHEMAS,
    GIT_SCHEMAS,
    PROJECT_SCHEMAS,
    TEST_SCHEMAS,
    ANALYSIS_SCHEMAS,
  };

  it.each(Object.entries(domainSchemas))(
    '%s should be a valid schema array',
    (name, schemas) => {
      expect(Array.isArray(schemas)).toBe(true);
      expect(schemas.length).toBeGreaterThan(0);
    }
  );

  it.each(Object.entries(domainSchemas))(
    '%s schemas should have valid structure',
    (name, schemas) => {
      for (const schema of schemas as ToolSchema[]) {
        expect(schema.name).toBeDefined();
        expect(schema.description).toBeDefined();
        expect(schema.inputSchema).toBeDefined();
        expect(schema.inputSchema.type).toBe('object');
      }
    }
  );
});

describe('SchemaDomain Type', () => {
  it('should include all expected domains', () => {
    const allDomains: SchemaDomain[] = [
      'discovery',
      'context',
      'lsp',
      'frontend',
      'validation',
      'security',
      'error',
      'deps',
      'build',
      'env',
      'process',
      'runtime',
      'types',
      'git',
      'project',
      'test',
      'analysis',
    ];

    // This test verifies that all domains are valid at compile time
    expect(allDomains).toHaveLength(17);
  });
});

describe('ToolSchema Interface', () => {
  it('should accept valid schema objects', () => {
    const validSchema: ToolSchema = {
      name: 'test_tool',
      description: 'A test tool',
      inputSchema: {
        type: 'object',
        properties: {
          param1: { type: 'string' },
        },
        required: ['param1'],
      },
    };

    expect(validSchema.name).toBe('test_tool');
    expect(validSchema.description).toBe('A test tool');
    expect(validSchema.inputSchema.type).toBe('object');
  });

  it('should work with minimal schema', () => {
    const minimalSchema: ToolSchema = {
      name: 'minimal',
      description: 'Minimal schema',
      inputSchema: {
        type: 'object',
      },
    };

    expect(minimalSchema.name).toBe('minimal');
  });
});
