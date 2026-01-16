/**
 * Unit tests for all domain schema files
 *
 * Tests cover:
 * - Discovery schemas (search, content retrieval, recommendations)
 * - Context schemas (stack detection, patterns, versions)
 * - LSP schemas (Language Server Protocol tools)
 * - Frontend schemas (React, responsive, layout, accessibility)
 * - Validation schemas (implementation validation, smoke tests)
 * - Security schemas (secrets scanning, permissions)
 * - Error schemas (stack parsing, type error explanation)
 * - Deps schemas (dependency analysis)
 * - Build schemas (bundle analysis)
 * - Env schemas (environment configuration)
 * - Process schemas (dev server, health monitoring)
 * - Runtime schemas (browser automation, lighthouse)
 * - Types schemas (type generation, fixtures)
 * - Git schemas (PR creation, merge conflicts)
 * - Project schemas (scaffolding, status, database)
 * - Test schemas (test discovery, coverage)
 * - Analysis schemas (profiling, log analysis)
 */

import { describe, it, expect } from 'vitest';
import { DISCOVERY_SCHEMAS } from '../../schemas/discovery-schemas.js';
import { CONTEXT_SCHEMAS } from '../../schemas/context-schemas.js';
import { LSP_SCHEMAS } from '../../schemas/lsp-schemas.js';
import { FRONTEND_SCHEMAS } from '../../schemas/frontend-schemas.js';
import { VALIDATION_SCHEMAS } from '../../schemas/validation-schemas.js';
import { SECURITY_SCHEMAS } from '../../schemas/security-schemas.js';
import { ERROR_SCHEMAS } from '../../schemas/error-schemas.js';
import { DEPS_SCHEMAS } from '../../schemas/deps-schemas.js';
import { BUILD_SCHEMAS } from '../../schemas/build-schemas.js';
import { ENV_SCHEMAS } from '../../schemas/env-schemas.js';
import { PROCESS_SCHEMAS } from '../../schemas/process-schemas.js';
import { RUNTIME_SCHEMAS } from '../../schemas/runtime-schemas.js';
import { TYPES_SCHEMAS } from '../../schemas/types-schemas.js';
import { GIT_SCHEMAS } from '../../schemas/git-schemas.js';
import { PROJECT_SCHEMAS } from '../../schemas/project-schemas.js';
import { TEST_SCHEMAS } from '../../schemas/test-schemas.js';
import { ANALYSIS_SCHEMAS } from '../../schemas/analysis-schemas.js';

/**
 * Helper to validate schema structure
 */
function validateSchema(schema: {
  name: string;
  description: string;
  inputSchema: {
    type: string;
    properties?: Record<string, unknown>;
    required?: string[];
  };
}) {
  expect(schema.name).toBeDefined();
  expect(typeof schema.name).toBe('string');
  expect(schema.name.length).toBeGreaterThan(0);

  expect(schema.description).toBeDefined();
  expect(typeof schema.description).toBe('string');
  expect(schema.description.length).toBeGreaterThan(0);

  expect(schema.inputSchema).toBeDefined();
  expect(schema.inputSchema.type).toBe('object');
}

/**
 * Helper to validate required fields are in properties
 */
function validateRequiredFields(schema: {
  inputSchema: {
    properties?: Record<string, unknown>;
    required?: string[];
  };
}) {
  if (schema.inputSchema.required && schema.inputSchema.properties) {
    for (const field of schema.inputSchema.required) {
      expect(schema.inputSchema.properties[field]).toBeDefined();
    }
  }
}

describe('DISCOVERY_SCHEMAS', () => {
  it('should export array with correct schemas', () => {
    expect(Array.isArray(DISCOVERY_SCHEMAS)).toBe(true);
    expect(DISCOVERY_SCHEMAS.length).toBe(7);
  });

  it('should include search_skills schema', () => {
    const schema = DISCOVERY_SCHEMAS.find(s => s.name === 'search_skills');
    expect(schema).toBeDefined();
    expect(schema?.inputSchema.required).toContain('query');
    expect(schema?.inputSchema.properties?.query).toBeDefined();
    expect(schema?.inputSchema.properties?.category).toBeDefined();
    expect(schema?.inputSchema.properties?.limit).toBeDefined();
  });

  it('should include search_agents schema', () => {
    const schema = DISCOVERY_SCHEMAS.find(s => s.name === 'search_agents');
    expect(schema).toBeDefined();
    expect(schema?.inputSchema.required).toContain('query');
  });

  it('should include search_tools schema', () => {
    const schema = DISCOVERY_SCHEMAS.find(s => s.name === 'search_tools');
    expect(schema).toBeDefined();
    expect(schema?.inputSchema.required).toContain('query');
  });

  it('should include recommend_skills schema', () => {
    const schema = DISCOVERY_SCHEMAS.find(s => s.name === 'recommend_skills');
    expect(schema).toBeDefined();
    expect(schema?.inputSchema.required).toContain('task');
  });

  it('should include get_skill_content schema', () => {
    const schema = DISCOVERY_SCHEMAS.find(s => s.name === 'get_skill_content');
    expect(schema).toBeDefined();
    expect(schema?.inputSchema.required).toContain('path');
  });

  it('should include get_agent_content schema', () => {
    const schema = DISCOVERY_SCHEMAS.find(s => s.name === 'get_agent_content');
    expect(schema).toBeDefined();
    expect(schema?.inputSchema.required).toContain('path');
  });

  it('should include skill_dependencies schema', () => {
    const schema = DISCOVERY_SCHEMAS.find(s => s.name === 'skill_dependencies');
    expect(schema).toBeDefined();
    expect(schema?.inputSchema.required).toContain('skill');
    expect(schema?.inputSchema.properties?.depth).toBeDefined();
  });

  it('should have valid structure for all schemas', () => {
    for (const schema of DISCOVERY_SCHEMAS) {
      validateSchema(schema);
      validateRequiredFields(schema);
    }
  });
});

describe('CONTEXT_SCHEMAS', () => {
  it('should export array with correct schemas', () => {
    expect(Array.isArray(CONTEXT_SCHEMAS)).toBe(true);
    expect(CONTEXT_SCHEMAS.length).toBe(6);
  });

  it('should include detect_stack schema', () => {
    const schema = CONTEXT_SCHEMAS.find(s => s.name === 'detect_stack');
    expect(schema).toBeDefined();
    expect(schema?.inputSchema.properties?.path).toBeDefined();
    expect(schema?.inputSchema.properties?.deep).toBeDefined();
  });

  it('should include check_versions schema', () => {
    const schema = CONTEXT_SCHEMAS.find(s => s.name === 'check_versions');
    expect(schema).toBeDefined();
    expect(schema?.inputSchema.properties?.packages).toBeDefined();
    expect(schema?.inputSchema.properties?.check_latest).toBeDefined();
  });

  it('should include scan_patterns schema', () => {
    const schema = CONTEXT_SCHEMAS.find(s => s.name === 'scan_patterns');
    expect(schema).toBeDefined();
    expect(schema?.inputSchema.properties?.path).toBeDefined();
    expect(schema?.inputSchema.properties?.pattern_types).toBeDefined();
  });

  it('should include fetch_docs schema', () => {
    const schema = CONTEXT_SCHEMAS.find(s => s.name === 'fetch_docs');
    expect(schema).toBeDefined();
    expect(schema?.inputSchema.required).toContain('library');
  });

  it('should include read_config schema', () => {
    const schema = CONTEXT_SCHEMAS.find(s => s.name === 'read_config');
    expect(schema).toBeDefined();
    expect(schema?.inputSchema.required).toContain('config');
    // Check enum values
    const configProp = schema?.inputSchema.properties?.config as { enum?: string[] };
    expect(configProp?.enum).toContain('package.json');
    expect(configProp?.enum).toContain('tsconfig');
  });

  it('should include get_conventions schema', () => {
    const schema = CONTEXT_SCHEMAS.find(s => s.name === 'get_conventions');
    expect(schema).toBeDefined();
    expect(schema?.inputSchema.properties?.focus).toBeDefined();
  });

  it('should have valid structure for all schemas', () => {
    for (const schema of CONTEXT_SCHEMAS) {
      validateSchema(schema);
      validateRequiredFields(schema);
    }
  });
});

describe('LSP_SCHEMAS', () => {
  it('should export array with correct schemas', () => {
    expect(Array.isArray(LSP_SCHEMAS)).toBe(true);
    expect(LSP_SCHEMAS.length).toBeGreaterThan(10); // LSP has many tools
  });

  it('should include find_references schema', () => {
    const schema = LSP_SCHEMAS.find(s => s.name === 'find_references');
    expect(schema).toBeDefined();
    expect(schema?.inputSchema.required).toContain('file');
    expect(schema?.inputSchema.required).toContain('line');
    expect(schema?.inputSchema.required).toContain('column');
  });

  it('should include go_to_definition schema', () => {
    const schema = LSP_SCHEMAS.find(s => s.name === 'go_to_definition');
    expect(schema).toBeDefined();
    expect(schema?.inputSchema.required).toContain('file');
    expect(schema?.inputSchema.required).toContain('line');
    expect(schema?.inputSchema.required).toContain('column');
  });

  it('should include get_implementations schema', () => {
    const schema = LSP_SCHEMAS.find(s => s.name === 'get_implementations');
    expect(schema).toBeDefined();
  });

  it('should include rename_symbol schema', () => {
    const schema = LSP_SCHEMAS.find(s => s.name === 'rename_symbol');
    expect(schema).toBeDefined();
    expect(schema?.inputSchema.required).toContain('new_name');
  });

  it('should include get_code_actions schema', () => {
    const schema = LSP_SCHEMAS.find(s => s.name === 'get_code_actions');
    expect(schema).toBeDefined();
  });

  it('should include apply_code_action schema', () => {
    const schema = LSP_SCHEMAS.find(s => s.name === 'apply_code_action');
    expect(schema).toBeDefined();
    expect(schema?.inputSchema.required).toContain('action_title');
  });

  it('should include get_symbol_info schema', () => {
    const schema = LSP_SCHEMAS.find(s => s.name === 'get_symbol_info');
    expect(schema).toBeDefined();
  });

  it('should include get_call_hierarchy schema', () => {
    const schema = LSP_SCHEMAS.find(s => s.name === 'get_call_hierarchy');
    expect(schema).toBeDefined();
    expect(schema?.inputSchema.properties?.direction).toBeDefined();
  });

  it('should include get_type_hierarchy schema', () => {
    const schema = LSP_SCHEMAS.find(s => s.name === 'get_type_hierarchy');
    expect(schema).toBeDefined();
    expect(schema?.inputSchema.properties?.direction).toBeDefined();
    expect(schema?.inputSchema.properties?.depth).toBeDefined();
  });

  it('should include get_document_symbols schema', () => {
    const schema = LSP_SCHEMAS.find(s => s.name === 'get_document_symbols');
    expect(schema).toBeDefined();
    expect(schema?.inputSchema.required).toContain('file');
  });

  it('should include get_signature_help schema', () => {
    const schema = LSP_SCHEMAS.find(s => s.name === 'get_signature_help');
    expect(schema).toBeDefined();
  });

  it('should include get_diagnostics schema', () => {
    const schema = LSP_SCHEMAS.find(s => s.name === 'get_diagnostics');
    expect(schema).toBeDefined();
    expect(schema?.inputSchema.properties?.include_suggestions).toBeDefined();
  });

  it('should include find_dead_code schema', () => {
    const schema = LSP_SCHEMAS.find(s => s.name === 'find_dead_code');
    expect(schema).toBeDefined();
  });

  it('should include get_api_surface schema', () => {
    const schema = LSP_SCHEMAS.find(s => s.name === 'get_api_surface');
    expect(schema).toBeDefined();
  });

  it('should include safe_delete_check schema', () => {
    const schema = LSP_SCHEMAS.find(s => s.name === 'safe_delete_check');
    expect(schema).toBeDefined();
    expect(schema?.inputSchema.required).toContain('file');
    expect(schema?.inputSchema.required).toContain('line');
    expect(schema?.inputSchema.required).toContain('column');
  });

  it('should include get_inlay_hints schema', () => {
    const schema = LSP_SCHEMAS.find(s => s.name === 'get_inlay_hints');
    expect(schema).toBeDefined();
    expect(schema?.inputSchema.required).toContain('file');
  });

  it('should include workspace_symbols schema', () => {
    const schema = LSP_SCHEMAS.find(s => s.name === 'workspace_symbols');
    expect(schema).toBeDefined();
    expect(schema?.inputSchema.required).toContain('query');
    expect(schema?.inputSchema.properties?.kind).toBeDefined();
  });

  it('should include detect_breaking_changes schema', () => {
    const schema = LSP_SCHEMAS.find(s => s.name === 'detect_breaking_changes');
    expect(schema).toBeDefined();
    expect(schema?.inputSchema.required).toContain('before_ref');
  });

  it('should include semantic_diff schema', () => {
    const schema = LSP_SCHEMAS.find(s => s.name === 'semantic_diff');
    expect(schema).toBeDefined();
    expect(schema?.inputSchema.required).toContain('before_ref');
  });

  it('should have valid structure for all schemas', () => {
    for (const schema of LSP_SCHEMAS) {
      validateSchema(schema);
      validateRequiredFields(schema);
    }
  });
});

describe('FRONTEND_SCHEMAS', () => {
  it('should export array with correct schemas', () => {
    expect(Array.isArray(FRONTEND_SCHEMAS)).toBe(true);
    expect(FRONTEND_SCHEMAS.length).toBe(11);
  });

  it('should include get_react_component_tree schema', () => {
    const schema = FRONTEND_SCHEMAS.find(s => s.name === 'get_react_component_tree');
    expect(schema).toBeDefined();
    expect(schema?.inputSchema.properties?.file).toBeDefined();
    expect(schema?.inputSchema.properties?.depth).toBeDefined();
  });

  it('should include analyze_stacking_context schema', () => {
    const schema = FRONTEND_SCHEMAS.find(s => s.name === 'analyze_stacking_context');
    expect(schema).toBeDefined();
    expect(schema?.inputSchema.required).toContain('file');
  });

  it('should include analyze_responsive_breakpoints schema', () => {
    const schema = FRONTEND_SCHEMAS.find(s => s.name === 'analyze_responsive_breakpoints');
    expect(schema).toBeDefined();
    expect(schema?.inputSchema.required).toContain('file');
  });

  it('should include trace_component_state schema', () => {
    const schema = FRONTEND_SCHEMAS.find(s => s.name === 'trace_component_state');
    expect(schema).toBeDefined();
    expect(schema?.inputSchema.required).toContain('file');
    expect(schema?.inputSchema.properties?.include_children).toBeDefined();
  });

  it('should include analyze_render_triggers schema', () => {
    const schema = FRONTEND_SCHEMAS.find(s => s.name === 'analyze_render_triggers');
    expect(schema).toBeDefined();
    expect(schema?.inputSchema.required).toContain('file');
  });

  it('should include analyze_layout_hierarchy schema', () => {
    const schema = FRONTEND_SCHEMAS.find(s => s.name === 'analyze_layout_hierarchy');
    expect(schema).toBeDefined();
    expect(schema?.inputSchema.required).toContain('file');
  });

  it('should include diagnose_overflow schema', () => {
    const schema = FRONTEND_SCHEMAS.find(s => s.name === 'diagnose_overflow');
    expect(schema).toBeDefined();
    expect(schema?.inputSchema.required).toContain('file');
    expect(schema?.inputSchema.properties?.problem_description).toBeDefined();
  });

  it('should include get_accessibility_tree schema', () => {
    const schema = FRONTEND_SCHEMAS.find(s => s.name === 'get_accessibility_tree');
    expect(schema).toBeDefined();
    expect(schema?.inputSchema.required).toContain('file');
    expect(schema?.inputSchema.properties?.check_patterns).toBeDefined();
  });

  it('should include get_sizing_strategy schema', () => {
    const schema = FRONTEND_SCHEMAS.find(s => s.name === 'get_sizing_strategy');
    expect(schema).toBeDefined();
    expect(schema?.inputSchema.required).toContain('file');
    expect(schema?.inputSchema.required).toContain('selector');
  });

  it('should include analyze_event_flow schema', () => {
    const schema = FRONTEND_SCHEMAS.find(s => s.name === 'analyze_event_flow');
    expect(schema).toBeDefined();
    expect(schema?.inputSchema.required).toContain('file');
  });

  it('should include analyze_tailwind_conflicts schema', () => {
    const schema = FRONTEND_SCHEMAS.find(s => s.name === 'analyze_tailwind_conflicts');
    expect(schema).toBeDefined();
    expect(schema?.inputSchema.required).toContain('file');
    expect(schema?.inputSchema.properties?.include_arbitrary).toBeDefined();
  });

  it('should have valid structure for all schemas', () => {
    for (const schema of FRONTEND_SCHEMAS) {
      validateSchema(schema);
      validateRequiredFields(schema);
    }
  });
});

describe('VALIDATION_SCHEMAS', () => {
  it('should export array with correct schemas', () => {
    expect(Array.isArray(VALIDATION_SCHEMAS)).toBe(true);
    expect(VALIDATION_SCHEMAS.length).toBe(6);
  });

  it('should include validate_implementation schema', () => {
    const schema = VALIDATION_SCHEMAS.find(s => s.name === 'validate_implementation');
    expect(schema).toBeDefined();
    expect(schema?.inputSchema.required).toContain('files');
    expect(schema?.inputSchema.properties?.skill).toBeDefined();
  });

  it('should include run_smoke_test schema', () => {
    const schema = VALIDATION_SCHEMAS.find(s => s.name === 'run_smoke_test');
    expect(schema).toBeDefined();
    expect(schema?.inputSchema.properties?.type).toBeDefined();
    const typeProp = schema?.inputSchema.properties?.type as { enum?: string[] };
    expect(typeProp?.enum).toContain('build');
    expect(typeProp?.enum).toContain('typecheck');
    expect(typeProp?.enum).toContain('lint');
  });

  it('should include check_types schema', () => {
    const schema = VALIDATION_SCHEMAS.find(s => s.name === 'check_types');
    expect(schema).toBeDefined();
    expect(schema?.inputSchema.properties?.strict).toBeDefined();
  });

  it('should include validate_edits_preview schema', () => {
    const schema = VALIDATION_SCHEMAS.find(s => s.name === 'validate_edits_preview');
    expect(schema).toBeDefined();
    expect(schema?.inputSchema.required).toContain('edits');
  });

  it('should include validate_api_contract schema', () => {
    const schema = VALIDATION_SCHEMAS.find(s => s.name === 'validate_api_contract');
    expect(schema).toBeDefined();
    expect(schema?.inputSchema.required).toContain('spec_path');
    expect(schema?.inputSchema.required).toContain('base_url');
  });

  it('should include validate_env_complete schema', () => {
    const schema = VALIDATION_SCHEMAS.find(s => s.name === 'validate_env_complete');
    expect(schema).toBeDefined();
    expect(schema?.inputSchema.properties?.env_file).toBeDefined();
    expect(schema?.inputSchema.properties?.example_file).toBeDefined();
  });

  it('should have valid structure for all schemas', () => {
    for (const schema of VALIDATION_SCHEMAS) {
      validateSchema(schema);
      validateRequiredFields(schema);
    }
  });
});

describe('SECURITY_SCHEMAS', () => {
  it('should export array with correct schemas', () => {
    expect(Array.isArray(SECURITY_SCHEMAS)).toBe(true);
    expect(SECURITY_SCHEMAS.length).toBe(2);
  });

  it('should include scan_for_secrets schema', () => {
    const schema = SECURITY_SCHEMAS.find(s => s.name === 'scan_for_secrets');
    expect(schema).toBeDefined();
    expect(schema?.inputSchema.properties?.path).toBeDefined();
    expect(schema?.inputSchema.properties?.severity_threshold).toBeDefined();
    expect(schema?.inputSchema.properties?.max_depth).toBeDefined();
    expect(schema?.inputSchema.properties?.check_presence_only).toBeDefined();
  });

  it('should include check_permissions schema', () => {
    const schema = SECURITY_SCHEMAS.find(s => s.name === 'check_permissions');
    expect(schema).toBeDefined();
    expect(schema?.inputSchema.properties?.file).toBeDefined();
    expect(schema?.inputSchema.properties?.path).toBeDefined();
  });

  it('should have valid structure for all schemas', () => {
    for (const schema of SECURITY_SCHEMAS) {
      validateSchema(schema);
      validateRequiredFields(schema);
    }
  });
});

describe('ERROR_SCHEMAS', () => {
  it('should export array with correct schemas', () => {
    expect(Array.isArray(ERROR_SCHEMAS)).toBe(true);
    expect(ERROR_SCHEMAS.length).toBe(2);
  });

  it('should include parse_error_stack schema', () => {
    const schema = ERROR_SCHEMAS.find(s => s.name === 'parse_error_stack');
    expect(schema).toBeDefined();
    expect(schema?.inputSchema.required).toContain('error_text');
    expect(schema?.inputSchema.properties?.project_path).toBeDefined();
  });

  it('should include explain_type_error schema', () => {
    const schema = ERROR_SCHEMAS.find(s => s.name === 'explain_type_error');
    expect(schema).toBeDefined();
    expect(schema?.inputSchema.required).toContain('error_code');
    expect(schema?.inputSchema.required).toContain('error_message');
    expect(schema?.inputSchema.properties?.context).toBeDefined();
  });

  it('should have valid structure for all schemas', () => {
    for (const schema of ERROR_SCHEMAS) {
      validateSchema(schema);
      validateRequiredFields(schema);
    }
  });
});

describe('DEPS_SCHEMAS', () => {
  it('should export array with correct schemas', () => {
    expect(Array.isArray(DEPS_SCHEMAS)).toBe(true);
    expect(DEPS_SCHEMAS.length).toBe(2);
  });

  it('should include analyze_dependencies schema', () => {
    const schema = DEPS_SCHEMAS.find(s => s.name === 'analyze_dependencies');
    expect(schema).toBeDefined();
    expect(schema?.inputSchema.properties?.path).toBeDefined();
    expect(schema?.inputSchema.properties?.check_updates).toBeDefined();
    expect(schema?.inputSchema.properties?.include_dev).toBeDefined();
  });

  it('should include find_circular_deps schema', () => {
    const schema = DEPS_SCHEMAS.find(s => s.name === 'find_circular_deps');
    expect(schema).toBeDefined();
    expect(schema?.inputSchema.properties?.path).toBeDefined();
    expect(schema?.inputSchema.properties?.include_node_modules).toBeDefined();
  });

  it('should have valid structure for all schemas', () => {
    for (const schema of DEPS_SCHEMAS) {
      validateSchema(schema);
      validateRequiredFields(schema);
    }
  });
});

describe('BUILD_SCHEMAS', () => {
  it('should export array with correct schemas', () => {
    expect(Array.isArray(BUILD_SCHEMAS)).toBe(true);
    expect(BUILD_SCHEMAS.length).toBe(1);
  });

  it('should include analyze_bundle schema', () => {
    const schema = BUILD_SCHEMAS.find(s => s.name === 'analyze_bundle');
    expect(schema).toBeDefined();
    expect(schema?.inputSchema.properties?.path).toBeDefined();
    expect(schema?.inputSchema.properties?.format).toBeDefined();
    const formatProp = schema?.inputSchema.properties?.format as { enum?: string[] };
    expect(formatProp?.enum).toContain('summary');
    expect(formatProp?.enum).toContain('detailed');
  });

  it('should have valid structure for all schemas', () => {
    for (const schema of BUILD_SCHEMAS) {
      validateSchema(schema);
      validateRequiredFields(schema);
    }
  });
});

describe('ENV_SCHEMAS', () => {
  it('should export array with correct schemas', () => {
    expect(Array.isArray(ENV_SCHEMAS)).toBe(true);
    expect(ENV_SCHEMAS.length).toBe(1);
  });

  it('should include get_env_config schema', () => {
    const schema = ENV_SCHEMAS.find(s => s.name === 'get_env_config');
    expect(schema).toBeDefined();
    expect(schema?.inputSchema.properties?.path).toBeDefined();
  });

  it('should have valid structure for all schemas', () => {
    for (const schema of ENV_SCHEMAS) {
      validateSchema(schema);
      validateRequiredFields(schema);
    }
  });
});

describe('PROCESS_SCHEMAS', () => {
  it('should export array with correct schemas', () => {
    expect(Array.isArray(PROCESS_SCHEMAS)).toBe(true);
    expect(PROCESS_SCHEMAS.length).toBe(4);
  });

  it('should include start_dev_server schema', () => {
    const schema = PROCESS_SCHEMAS.find(s => s.name === 'start_dev_server');
    expect(schema).toBeDefined();
    expect(schema?.inputSchema.properties?.command).toBeDefined();
    expect(schema?.inputSchema.properties?.port).toBeDefined();
    expect(schema?.inputSchema.properties?.ready_timeout).toBeDefined();
  });

  it('should include health_monitor schema', () => {
    const schema = PROCESS_SCHEMAS.find(s => s.name === 'health_monitor');
    expect(schema).toBeDefined();
    expect(schema?.inputSchema.required).toContain('url');
    expect(schema?.inputSchema.properties?.interval_ms).toBeDefined();
    expect(schema?.inputSchema.properties?.duration_ms).toBeDefined();
  });

  it('should include watch_for_errors schema', () => {
    const schema = PROCESS_SCHEMAS.find(s => s.name === 'watch_for_errors');
    expect(schema).toBeDefined();
    expect(schema?.inputSchema.required).toContain('source');
    expect(schema?.inputSchema.properties?.source).toBeDefined();
    const sourceProp = schema?.inputSchema.properties?.source as { enum?: string[] };
    expect(sourceProp?.enum).toContain('file');
    expect(sourceProp?.enum).toContain('command');
  });

  it('should include detect_memory_leaks schema', () => {
    const schema = PROCESS_SCHEMAS.find(s => s.name === 'detect_memory_leaks');
    expect(schema).toBeDefined();
    expect(schema?.inputSchema.required).toContain('target');
    expect(schema?.inputSchema.properties?.duration_seconds).toBeDefined();
    expect(schema?.inputSchema.properties?.threshold_mb).toBeDefined();
  });

  it('should have valid structure for all schemas', () => {
    for (const schema of PROCESS_SCHEMAS) {
      validateSchema(schema);
      validateRequiredFields(schema);
    }
  });
});

describe('RUNTIME_SCHEMAS', () => {
  it('should export array with correct schemas', () => {
    expect(Array.isArray(RUNTIME_SCHEMAS)).toBe(true);
    expect(RUNTIME_SCHEMAS.length).toBe(4);
  });

  it('should include browser_automation schema', () => {
    const schema = RUNTIME_SCHEMAS.find(s => s.name === 'browser_automation');
    expect(schema).toBeDefined();
    expect(schema?.inputSchema.required).toContain('steps');
    expect(schema?.inputSchema.properties?.assertions).toBeDefined();
    expect(schema?.inputSchema.properties?.viewport).toBeDefined();
  });

  it('should include verify_runtime_behavior schema', () => {
    const schema = RUNTIME_SCHEMAS.find(s => s.name === 'verify_runtime_behavior');
    expect(schema).toBeDefined();
    expect(schema?.inputSchema.properties?.code).toBeDefined();
    expect(schema?.inputSchema.properties?.file).toBeDefined();
    expect(schema?.inputSchema.properties?.timeout).toBeDefined();
  });

  it('should include lighthouse_audit schema', () => {
    const schema = RUNTIME_SCHEMAS.find(s => s.name === 'lighthouse_audit');
    expect(schema).toBeDefined();
    expect(schema?.inputSchema.required).toContain('url');
    expect(schema?.inputSchema.properties?.categories).toBeDefined();
    expect(schema?.inputSchema.properties?.device).toBeDefined();
  });

  it('should include visual_regression schema', () => {
    const schema = RUNTIME_SCHEMAS.find(s => s.name === 'visual_regression');
    expect(schema).toBeDefined();
    expect(schema?.inputSchema.required).toContain('url');
    expect(schema?.inputSchema.required).toContain('baseline_path');
    expect(schema?.inputSchema.properties?.threshold).toBeDefined();
  });

  it('should have valid structure for all schemas', () => {
    for (const schema of RUNTIME_SCHEMAS) {
      validateSchema(schema);
      validateRequiredFields(schema);
    }
  });
});

describe('TYPES_SCHEMAS', () => {
  it('should export array with correct schemas', () => {
    expect(Array.isArray(TYPES_SCHEMAS)).toBe(true);
    expect(TYPES_SCHEMAS.length).toBe(3);
  });

  it('should include generate_types schema', () => {
    const schema = TYPES_SCHEMAS.find(s => s.name === 'generate_types');
    expect(schema).toBeDefined();
    expect(schema?.inputSchema.required).toContain('source');
    expect(schema?.inputSchema.required).toContain('input');
    const sourceProp = schema?.inputSchema.properties?.source as { enum?: string[] };
    expect(sourceProp?.enum).toContain('json');
    expect(sourceProp?.enum).toContain('api');
  });

  it('should include generate_fixture schema', () => {
    const schema = TYPES_SCHEMAS.find(s => s.name === 'generate_fixture');
    expect(schema).toBeDefined();
    expect(schema?.inputSchema.required).toContain('model');
    expect(schema?.inputSchema.properties?.count).toBeDefined();
    expect(schema?.inputSchema.properties?.scenario).toBeDefined();
    expect(schema?.inputSchema.properties?.output_format).toBeDefined();
  });

  it('should include sync_api_types schema', () => {
    const schema = TYPES_SCHEMAS.find(s => s.name === 'sync_api_types');
    expect(schema).toBeDefined();
    expect(schema?.inputSchema.properties?.backend_path).toBeDefined();
    expect(schema?.inputSchema.properties?.frontend_path).toBeDefined();
    expect(schema?.inputSchema.properties?.auto_fix).toBeDefined();
  });

  it('should have valid structure for all schemas', () => {
    for (const schema of TYPES_SCHEMAS) {
      validateSchema(schema);
      validateRequiredFields(schema);
    }
  });
});

describe('GIT_SCHEMAS', () => {
  it('should export array with correct schemas', () => {
    expect(Array.isArray(GIT_SCHEMAS)).toBe(true);
    expect(GIT_SCHEMAS.length).toBe(5);
  });

  it('should include create_pull_request schema', () => {
    const schema = GIT_SCHEMAS.find(s => s.name === 'create_pull_request');
    expect(schema).toBeDefined();
    expect(schema?.inputSchema.properties?.base).toBeDefined();
    expect(schema?.inputSchema.properties?.title).toBeDefined();
    expect(schema?.inputSchema.properties?.draft).toBeDefined();
    expect(schema?.inputSchema.properties?.labels).toBeDefined();
    expect(schema?.inputSchema.properties?.reviewers).toBeDefined();
  });

  it('should include resolve_merge_conflict schema', () => {
    const schema = GIT_SCHEMAS.find(s => s.name === 'resolve_merge_conflict');
    expect(schema).toBeDefined();
    expect(schema?.inputSchema.required).toContain('file');
    expect(schema?.inputSchema.properties?.strategy).toBeDefined();
    const strategyProp = schema?.inputSchema.properties?.strategy as { enum?: string[] };
    expect(strategyProp?.enum).toContain('analyze');
    expect(strategyProp?.enum).toContain('ours');
    expect(strategyProp?.enum).toContain('theirs');
    expect(strategyProp?.enum).toContain('auto');
  });

  it('should include auto_rollback schema', () => {
    const schema = GIT_SCHEMAS.find(s => s.name === 'auto_rollback');
    expect(schema).toBeDefined();
    expect(schema?.inputSchema.required).toContain('trigger');
    expect(schema?.inputSchema.properties?.scope).toBeDefined();
    expect(schema?.inputSchema.properties?.dry_run).toBeDefined();
  });

  it('should include retry_with_learning schema', () => {
    const schema = GIT_SCHEMAS.find(s => s.name === 'retry_with_learning');
    expect(schema).toBeDefined();
    expect(schema?.inputSchema.required).toContain('command');
    expect(schema?.inputSchema.properties?.max_attempts).toBeDefined();
    expect(schema?.inputSchema.properties?.fix_strategies).toBeDefined();
  });

  it('should include atomic_multi_edit schema', () => {
    const schema = GIT_SCHEMAS.find(s => s.name === 'atomic_multi_edit');
    expect(schema).toBeDefined();
    expect(schema?.inputSchema.required).toContain('edits');
    expect(schema?.inputSchema.properties?.validation).toBeDefined();
    expect(schema?.inputSchema.properties?.dry_run).toBeDefined();
  });

  it('should have valid structure for all schemas', () => {
    for (const schema of GIT_SCHEMAS) {
      validateSchema(schema);
      validateRequiredFields(schema);
    }
  });
});

describe('TEST_SCHEMAS', () => {
  it('should export array with correct schemas', () => {
    expect(Array.isArray(TEST_SCHEMAS)).toBe(true);
    expect(TEST_SCHEMAS.length).toBe(3);
  });

  it('should include find_tests_for_file schema', () => {
    const schema = TEST_SCHEMAS.find(s => s.name === 'find_tests_for_file');
    expect(schema).toBeDefined();
    expect(schema?.inputSchema.required).toContain('file');
    expect(schema?.inputSchema.properties?.include_indirect).toBeDefined();
  });

  it('should include get_test_coverage schema', () => {
    const schema = TEST_SCHEMAS.find(s => s.name === 'get_test_coverage');
    expect(schema).toBeDefined();
    expect(schema?.inputSchema.properties?.file).toBeDefined();
    expect(schema?.inputSchema.properties?.path).toBeDefined();
    expect(schema?.inputSchema.properties?.coverage_path).toBeDefined();
  });

  it('should include suggest_test_cases schema', () => {
    const schema = TEST_SCHEMAS.find(s => s.name === 'suggest_test_cases');
    expect(schema).toBeDefined();
    expect(schema?.inputSchema.required).toContain('file');
    expect(schema?.inputSchema.required).toContain('function');
    expect(schema?.inputSchema.properties?.include_existing).toBeDefined();
  });

  it('should have valid structure for all schemas', () => {
    for (const schema of TEST_SCHEMAS) {
      validateSchema(schema);
      validateRequiredFields(schema);
    }
  });
});

describe('ANALYSIS_SCHEMAS', () => {
  it('should export array with correct schemas', () => {
    expect(Array.isArray(ANALYSIS_SCHEMAS)).toBe(true);
    expect(ANALYSIS_SCHEMAS.length).toBe(3);
  });

  it('should include profile_function schema', () => {
    const schema = ANALYSIS_SCHEMAS.find(s => s.name === 'profile_function');
    expect(schema).toBeDefined();
    expect(schema?.inputSchema.required).toContain('file');
    expect(schema?.inputSchema.required).toContain('function_name');
    expect(schema?.inputSchema.properties?.iterations).toBeDefined();
    expect(schema?.inputSchema.properties?.warmup).toBeDefined();
  });

  it('should include log_analyzer schema', () => {
    const schema = ANALYSIS_SCHEMAS.find(s => s.name === 'log_analyzer');
    expect(schema).toBeDefined();
    expect(schema?.inputSchema.required).toContain('path');
    expect(schema?.inputSchema.properties?.format).toBeDefined();
    expect(schema?.inputSchema.properties?.time_range).toBeDefined();
    expect(schema?.inputSchema.properties?.group_by).toBeDefined();
  });

  it('should include identify_tech_debt schema', () => {
    const schema = ANALYSIS_SCHEMAS.find(s => s.name === 'identify_tech_debt');
    expect(schema).toBeDefined();
    expect(schema?.inputSchema.properties?.path).toBeDefined();
    expect(schema?.inputSchema.properties?.categories).toBeDefined();
    expect(schema?.inputSchema.properties?.threshold).toBeDefined();
    expect(schema?.inputSchema.properties?.exclude).toBeDefined();
  });

  it('should have valid structure for all schemas', () => {
    for (const schema of ANALYSIS_SCHEMAS) {
      validateSchema(schema);
      validateRequiredFields(schema);
    }
  });
});

describe('PROJECT_SCHEMAS', () => {
  it('should export array with correct schemas', () => {
    expect(Array.isArray(PROJECT_SCHEMAS)).toBe(true);
    expect(PROJECT_SCHEMAS.length).toBeGreaterThan(5);
  });

  it('should include scaffold_project schema', () => {
    const schema = PROJECT_SCHEMAS.find(s => s.name === 'scaffold_project');
    expect(schema).toBeDefined();
    expect(schema?.inputSchema.required).toContain('template');
    expect(schema?.inputSchema.required).toContain('output_dir');
    expect(schema?.inputSchema.properties?.run_install).toBeDefined();
    expect(schema?.inputSchema.properties?.run_git_init).toBeDefined();
  });

  it('should include list_templates schema', () => {
    const schema = PROJECT_SCHEMAS.find(s => s.name === 'list_templates');
    expect(schema).toBeDefined();
    expect(schema?.inputSchema.properties?.category).toBeDefined();
  });

  it('should include plugin_status schema', () => {
    const schema = PROJECT_SCHEMAS.find(s => s.name === 'plugin_status');
    expect(schema).toBeDefined();
    expect(schema?.inputSchema.type).toBe('object');
  });

  it('should include project_issues schema', () => {
    const schema = PROJECT_SCHEMAS.find(s => s.name === 'project_issues');
    expect(schema).toBeDefined();
    expect(schema?.inputSchema.properties?.path).toBeDefined();
    expect(schema?.inputSchema.properties?.include_low_priority).toBeDefined();
  });

  it('should include generate_openapi schema', () => {
    const schema = PROJECT_SCHEMAS.find(s => s.name === 'generate_openapi');
    expect(schema).toBeDefined();
    expect(schema?.inputSchema.properties?.output_path).toBeDefined();
    expect(schema?.inputSchema.properties?.format).toBeDefined();
  });

  it('should include get_schema schema', () => {
    const schema = PROJECT_SCHEMAS.find(s => s.name === 'get_schema');
    expect(schema).toBeDefined();
    expect(schema?.inputSchema.required).toContain('source');
    const sourceProp = schema?.inputSchema.properties?.source as { enum?: string[] };
    expect(sourceProp?.enum).toContain('prisma');
    expect(sourceProp?.enum).toContain('drizzle');
    expect(sourceProp?.enum).toContain('typeorm');
    expect(sourceProp?.enum).toContain('sql');
  });

  it('should include get_database_schema schema', () => {
    const schema = PROJECT_SCHEMAS.find(s => s.name === 'get_database_schema');
    expect(schema).toBeDefined();
    expect(schema?.inputSchema.properties?.path).toBeDefined();
  });

  it('should include get_api_routes schema', () => {
    const schema = PROJECT_SCHEMAS.find(s => s.name === 'get_api_routes');
    expect(schema).toBeDefined();
    expect(schema?.inputSchema.properties?.framework).toBeDefined();
  });

  it('should include get_prisma_operations schema', () => {
    const schema = PROJECT_SCHEMAS.find(s => s.name === 'get_prisma_operations');
    expect(schema).toBeDefined();
    expect(schema?.inputSchema.properties?.include_n1_detection).toBeDefined();
  });

  it('should include query_database schema', () => {
    const schema = PROJECT_SCHEMAS.find(s => s.name === 'query_database');
    expect(schema).toBeDefined();
    expect(schema?.inputSchema.required).toContain('query');
    expect(schema?.inputSchema.properties?.database_url).toBeDefined();
    expect(schema?.inputSchema.properties?.readonly).toBeDefined();
    expect(schema?.inputSchema.properties?.format).toBeDefined();
  });

  it('should include upgrade_package schema', () => {
    const schema = PROJECT_SCHEMAS.find(s => s.name === 'upgrade_package');
    expect(schema).toBeDefined();
    expect(schema?.inputSchema.required).toContain('package');
    expect(schema?.inputSchema.properties?.target_version).toBeDefined();
    expect(schema?.inputSchema.properties?.dry_run).toBeDefined();
  });

  it('should include explain_codebase schema', () => {
    const schema = PROJECT_SCHEMAS.find(s => s.name === 'explain_codebase');
    expect(schema).toBeDefined();
    expect(schema?.inputSchema.properties?.depth).toBeDefined();
    expect(schema?.inputSchema.properties?.focus).toBeDefined();
    expect(schema?.inputSchema.properties?.include_architecture).toBeDefined();
  });

  it('should have valid structure for all schemas', () => {
    for (const schema of PROJECT_SCHEMAS) {
      validateSchema(schema);
      validateRequiredFields(schema);
    }
  });
});

describe('Cross-domain Schema Validation', () => {
  const allSchemas = [
    ...DISCOVERY_SCHEMAS,
    ...CONTEXT_SCHEMAS,
    ...LSP_SCHEMAS,
    ...FRONTEND_SCHEMAS,
    ...VALIDATION_SCHEMAS,
    ...SECURITY_SCHEMAS,
    ...ERROR_SCHEMAS,
    ...DEPS_SCHEMAS,
    ...BUILD_SCHEMAS,
    ...ENV_SCHEMAS,
    ...PROCESS_SCHEMAS,
    ...RUNTIME_SCHEMAS,
    ...TYPES_SCHEMAS,
    ...GIT_SCHEMAS,
    ...PROJECT_SCHEMAS,
    ...TEST_SCHEMAS,
    ...ANALYSIS_SCHEMAS,
  ];

  it('should have no duplicate tool names across all domains', () => {
    const names = allSchemas.map(s => s.name);
    const uniqueNames = new Set(names);
    const duplicates = names.filter((name, index) => names.indexOf(name) !== index);

    expect(duplicates).toEqual([]);
    expect(uniqueNames.size).toBe(names.length);
  });

  it('should use consistent property types', () => {
    for (const schema of allSchemas) {
      if (schema.inputSchema.properties) {
        for (const [propName, propDef] of Object.entries(schema.inputSchema.properties)) {
          expect(propDef).toBeDefined();

          // Check that property definitions have a type
          const def = propDef as { type?: string; description?: string };
          if (def.type) {
            expect(['string', 'integer', 'number', 'boolean', 'array', 'object']).toContain(def.type);
          }
        }
      }
    }
  });

  it('should have descriptions for all tools', () => {
    for (const schema of allSchemas) {
      expect(schema.description).toBeDefined();
      expect(schema.description.length).toBeGreaterThan(10);
    }
  });
});
