/**
 * Unit tests for handlers/registry.ts
 *
 * Tests cover:
 * - TOOL_HANDLERS registry
 * - getHandler function
 * - hasHandler function
 * - getRegisteredTools function
 * - Handler categories
 * - noContext wrapper function
 */

import { describe, it, expect, vi } from 'vitest';
import {
  TOOL_HANDLERS,
  getHandler,
  hasHandler,
  getRegisteredTools,
} from '../../handlers/registry.js';
import type { HandlerContext } from '../../handlers/types.js';

// Mock context for testing
const mockContext: HandlerContext = {
  skillsIndex: null,
  agentsIndex: null,
  toolsIndex: null,
  skillsRegistry: null,
};

describe('TOOL_HANDLERS Registry', () => {
  it('should be a non-empty object', () => {
    expect(typeof TOOL_HANDLERS).toBe('object');
    expect(Object.keys(TOOL_HANDLERS).length).toBeGreaterThan(0);
  });

  it('should contain all expected search handlers', () => {
    expect(TOOL_HANDLERS).toHaveProperty('search_skills');
    expect(TOOL_HANDLERS).toHaveProperty('search_agents');
    expect(TOOL_HANDLERS).toHaveProperty('search_tools');
    expect(TOOL_HANDLERS).toHaveProperty('recommend_skills');
  });

  it('should contain all expected content handlers', () => {
    expect(TOOL_HANDLERS).toHaveProperty('get_skill_content');
    expect(TOOL_HANDLERS).toHaveProperty('get_agent_content');
    expect(TOOL_HANDLERS).toHaveProperty('skill_dependencies');
  });

  it('should contain all expected context handlers', () => {
    expect(TOOL_HANDLERS).toHaveProperty('detect_stack');
    expect(TOOL_HANDLERS).toHaveProperty('check_versions');
    expect(TOOL_HANDLERS).toHaveProperty('scan_patterns');
  });

  it('should contain all expected docs handlers', () => {
    expect(TOOL_HANDLERS).toHaveProperty('fetch_docs');
    expect(TOOL_HANDLERS).toHaveProperty('generate_openapi');
    expect(TOOL_HANDLERS).toHaveProperty('explain_codebase');
  });

  it('should contain all expected schema handlers', () => {
    expect(TOOL_HANDLERS).toHaveProperty('get_schema');
    expect(TOOL_HANDLERS).toHaveProperty('get_database_schema');
    expect(TOOL_HANDLERS).toHaveProperty('get_api_routes');
    expect(TOOL_HANDLERS).toHaveProperty('read_config');
  });

  it('should contain all expected validation handlers', () => {
    expect(TOOL_HANDLERS).toHaveProperty('validate_implementation');
    expect(TOOL_HANDLERS).toHaveProperty('run_smoke_test');
    expect(TOOL_HANDLERS).toHaveProperty('check_types');
  });

  it('should contain all expected scaffolding handlers', () => {
    expect(TOOL_HANDLERS).toHaveProperty('scaffold_project');
    expect(TOOL_HANDLERS).toHaveProperty('list_templates');
  });

  it('should contain all expected status handlers', () => {
    expect(TOOL_HANDLERS).toHaveProperty('plugin_status');
    expect(TOOL_HANDLERS).toHaveProperty('project_issues');
  });

  it('should contain all expected LSP handlers', () => {
    expect(TOOL_HANDLERS).toHaveProperty('find_references');
    expect(TOOL_HANDLERS).toHaveProperty('go_to_definition');
    expect(TOOL_HANDLERS).toHaveProperty('get_implementations');
    expect(TOOL_HANDLERS).toHaveProperty('rename_symbol');
    expect(TOOL_HANDLERS).toHaveProperty('get_code_actions');
    expect(TOOL_HANDLERS).toHaveProperty('apply_code_action');
    expect(TOOL_HANDLERS).toHaveProperty('get_call_hierarchy');
    expect(TOOL_HANDLERS).toHaveProperty('get_type_hierarchy');
    expect(TOOL_HANDLERS).toHaveProperty('get_document_symbols');
    expect(TOOL_HANDLERS).toHaveProperty('get_symbol_info');
    expect(TOOL_HANDLERS).toHaveProperty('get_signature_help');
    expect(TOOL_HANDLERS).toHaveProperty('get_diagnostics');
    expect(TOOL_HANDLERS).toHaveProperty('find_dead_code');
    expect(TOOL_HANDLERS).toHaveProperty('get_api_surface');
    expect(TOOL_HANDLERS).toHaveProperty('detect_breaking_changes');
    expect(TOOL_HANDLERS).toHaveProperty('semantic_diff');
    expect(TOOL_HANDLERS).toHaveProperty('get_inlay_hints');
    expect(TOOL_HANDLERS).toHaveProperty('workspace_symbols');
    expect(TOOL_HANDLERS).toHaveProperty('safe_delete_check');
    expect(TOOL_HANDLERS).toHaveProperty('validate_edits_preview');
  });

  it('should contain all expected dependency handlers', () => {
    expect(TOOL_HANDLERS).toHaveProperty('analyze_dependencies');
    expect(TOOL_HANDLERS).toHaveProperty('find_circular_deps');
  });

  it('should contain all expected error handlers', () => {
    expect(TOOL_HANDLERS).toHaveProperty('parse_error_stack');
    expect(TOOL_HANDLERS).toHaveProperty('explain_type_error');
  });

  it('should contain all expected test handlers', () => {
    expect(TOOL_HANDLERS).toHaveProperty('find_tests_for_file');
    expect(TOOL_HANDLERS).toHaveProperty('get_test_coverage');
    expect(TOOL_HANDLERS).toHaveProperty('suggest_test_cases');
  });

  it('should contain all expected security handlers', () => {
    expect(TOOL_HANDLERS).toHaveProperty('scan_for_secrets');
    expect(TOOL_HANDLERS).toHaveProperty('check_permissions');
  });

  it('should contain all expected project handlers', () => {
    expect(TOOL_HANDLERS).toHaveProperty('get_env_config');
    expect(TOOL_HANDLERS).toHaveProperty('get_conventions');
  });

  it('should contain all expected framework handlers', () => {
    expect(TOOL_HANDLERS).toHaveProperty('get_react_component_tree');
    expect(TOOL_HANDLERS).toHaveProperty('get_prisma_operations');
  });

  it('should contain all expected build handlers', () => {
    expect(TOOL_HANDLERS).toHaveProperty('analyze_bundle');
  });

  it('should contain all expected process handlers', () => {
    expect(TOOL_HANDLERS).toHaveProperty('start_dev_server');
    expect(TOOL_HANDLERS).toHaveProperty('watch_for_errors');
    expect(TOOL_HANDLERS).toHaveProperty('health_monitor');
  });

  it('should contain all expected runtime handlers', () => {
    expect(TOOL_HANDLERS).toHaveProperty('browser_automation');
    expect(TOOL_HANDLERS).toHaveProperty('verify_runtime_behavior');
    expect(TOOL_HANDLERS).toHaveProperty('lighthouse_audit');
    expect(TOOL_HANDLERS).toHaveProperty('visual_regression');
  });

  it('should contain all expected edit handlers', () => {
    expect(TOOL_HANDLERS).toHaveProperty('retry_with_learning');
    expect(TOOL_HANDLERS).toHaveProperty('resolve_merge_conflict');
    expect(TOOL_HANDLERS).toHaveProperty('atomic_multi_edit');
    expect(TOOL_HANDLERS).toHaveProperty('auto_rollback');
    expect(TOOL_HANDLERS).toHaveProperty('validate_api_contract');
  });

  it('should contain all expected analysis handlers', () => {
    expect(TOOL_HANDLERS).toHaveProperty('profile_function');
    expect(TOOL_HANDLERS).toHaveProperty('log_analyzer');
    expect(TOOL_HANDLERS).toHaveProperty('generate_types');
    expect(TOOL_HANDLERS).toHaveProperty('identify_tech_debt');
    expect(TOOL_HANDLERS).toHaveProperty('detect_memory_leaks');
  });

  it('should contain all expected database handlers', () => {
    expect(TOOL_HANDLERS).toHaveProperty('query_database');
  });

  it('should contain all expected environment handlers', () => {
    expect(TOOL_HANDLERS).toHaveProperty('validate_env_complete');
  });

  it('should contain all expected package handlers', () => {
    expect(TOOL_HANDLERS).toHaveProperty('upgrade_package');
  });

  it('should contain all expected sync handlers', () => {
    expect(TOOL_HANDLERS).toHaveProperty('sync_api_types');
  });

  it('should contain all expected fixture handlers', () => {
    expect(TOOL_HANDLERS).toHaveProperty('generate_fixture');
  });

  it('should contain all expected git handlers', () => {
    expect(TOOL_HANDLERS).toHaveProperty('create_pull_request');
  });

  it('should contain all expected frontend handlers', () => {
    expect(TOOL_HANDLERS).toHaveProperty('trace_component_state');
    expect(TOOL_HANDLERS).toHaveProperty('analyze_render_triggers');
    expect(TOOL_HANDLERS).toHaveProperty('analyze_responsive_breakpoints');
    expect(TOOL_HANDLERS).toHaveProperty('analyze_stacking_context');
    expect(TOOL_HANDLERS).toHaveProperty('analyze_layout_hierarchy');
    expect(TOOL_HANDLERS).toHaveProperty('diagnose_overflow');
    expect(TOOL_HANDLERS).toHaveProperty('get_accessibility_tree');
    expect(TOOL_HANDLERS).toHaveProperty('get_sizing_strategy');
    expect(TOOL_HANDLERS).toHaveProperty('analyze_event_flow');
    expect(TOOL_HANDLERS).toHaveProperty('analyze_tailwind_conflicts');
  });

  it('should have handler functions for all registered tools', () => {
    for (const [toolName, handler] of Object.entries(TOOL_HANDLERS)) {
      expect(typeof handler).toBe('function');
    }
  });
});

describe('getHandler', () => {
  it('should return handler for registered tool', () => {
    const handler = getHandler('plugin_status');

    expect(handler).toBeDefined();
    expect(typeof handler).toBe('function');
  });

  it('should return undefined for non-existent tool', () => {
    const handler = getHandler('non_existent_tool');

    expect(handler).toBeUndefined();
  });

  it('should return the same handler as direct access', () => {
    const directHandler = TOOL_HANDLERS['detect_stack'];
    const getHandlerResult = getHandler('detect_stack');

    expect(getHandlerResult).toBe(directHandler);
  });

  it('should work for all registered tools', () => {
    const allTools = getRegisteredTools();

    for (const toolName of allTools) {
      const handler = getHandler(toolName);
      expect(handler).toBeDefined();
      expect(typeof handler).toBe('function');
    }
  });
});

describe('hasHandler', () => {
  it('should return true for registered tool', () => {
    expect(hasHandler('plugin_status')).toBe(true);
    expect(hasHandler('detect_stack')).toBe(true);
    expect(hasHandler('find_references')).toBe(true);
  });

  it('should return false for non-existent tool', () => {
    expect(hasHandler('non_existent_tool')).toBe(false);
    expect(hasHandler('')).toBe(false);
    expect(hasHandler('PLUGIN_STATUS')).toBe(false); // Case sensitive
  });

  it('should be case sensitive', () => {
    expect(hasHandler('plugin_status')).toBe(true);
    expect(hasHandler('Plugin_Status')).toBe(false);
    expect(hasHandler('PLUGIN_STATUS')).toBe(false);
  });
});

describe('getRegisteredTools', () => {
  it('should return array of tool names', () => {
    const tools = getRegisteredTools();

    expect(Array.isArray(tools)).toBe(true);
    expect(tools.length).toBeGreaterThan(0);
  });

  it('should return all registered tools', () => {
    const tools = getRegisteredTools();
    const handlerKeys = Object.keys(TOOL_HANDLERS);

    expect(tools.length).toBe(handlerKeys.length);
    expect(tools.sort()).toEqual(handlerKeys.sort());
  });

  it('should include known tools', () => {
    const tools = getRegisteredTools();

    expect(tools).toContain('plugin_status');
    expect(tools).toContain('search_skills');
    expect(tools).toContain('detect_stack');
    expect(tools).toContain('find_references');
    expect(tools).toContain('scan_for_secrets');
  });

  it('should return unique tool names', () => {
    const tools = getRegisteredTools();
    const uniqueTools = new Set(tools);

    expect(uniqueTools.size).toBe(tools.length);
  });
});

describe('Handler Function Signatures', () => {
  it('should be callable functions', () => {
    const tools = getRegisteredTools();

    for (const toolName of tools) {
      const handler = getHandler(toolName);
      // Check handler is a callable function
      expect(typeof handler).toBe('function');
      // Note: We don't check handler.length because arrow functions
      // and wrapped handlers may not preserve parameter count
    }
  });

  it('plugin_status handler should work without args', async () => {
    const handler = getHandler('plugin_status');
    expect(handler).toBeDefined();

    // plugin_status doesn't need context or args
    const result = handler!(mockContext, {});

    // Should return a response object (may be sync or async)
    const response = result instanceof Promise ? await result : result;
    expect(response).toHaveProperty('content');
    expect(Array.isArray(response.content)).toBe(true);
  });

  it('search_skills handler should handle null index gracefully', async () => {
    const handler = getHandler('search_skills');
    expect(handler).toBeDefined();

    const result = handler!(mockContext, { query: 'test' });
    const response = result instanceof Promise ? await result : result;

    expect(response).toHaveProperty('content');
    // Should return error or empty result when index is null
    expect(response.content[0]).toHaveProperty('type', 'text');
  });

  it('search_agents handler should handle null index gracefully', async () => {
    const handler = getHandler('search_agents');
    expect(handler).toBeDefined();

    const result = handler!(mockContext, { query: 'test' });
    const response = result instanceof Promise ? await result : result;

    expect(response).toHaveProperty('content');
    expect(response.content[0]).toHaveProperty('type', 'text');
  });

  it('search_tools handler should handle null index gracefully', async () => {
    const handler = getHandler('search_tools');
    expect(handler).toBeDefined();

    const result = handler!(mockContext, { query: 'test' });
    const response = result instanceof Promise ? await result : result;

    expect(response).toHaveProperty('content');
    expect(response.content[0]).toHaveProperty('type', 'text');
  });

  it('recommend_skills handler should handle null index gracefully', async () => {
    const handler = getHandler('recommend_skills');
    expect(handler).toBeDefined();

    const result = handler!(mockContext, { task: 'build a form' });
    const response = result instanceof Promise ? await result : result;

    expect(response).toHaveProperty('content');
    expect(response.content[0]).toHaveProperty('type', 'text');
  });

  it('skill_dependencies handler should throw when skill not found', async () => {
    const handler = getHandler('skill_dependencies');
    expect(handler).toBeDefined();

    // skill_dependencies throws when skill is not found with null index
    await expect(async () => {
      const result = handler!(mockContext, { skill: 'test/skill' });
      // Handle both sync and async
      if (result instanceof Promise) {
        await result;
      }
    }).rejects.toThrow('Skill not found');
  });
});

describe('Handler Categories', () => {
  const categorizedHandlers = {
    search: ['search_skills', 'search_agents', 'search_tools', 'recommend_skills'],
    content: ['get_skill_content', 'get_agent_content', 'skill_dependencies'],
    context: ['detect_stack', 'check_versions', 'scan_patterns'],
    docs: ['fetch_docs', 'generate_openapi', 'explain_codebase'],
    schema: ['get_schema', 'get_database_schema', 'get_api_routes', 'read_config'],
    validation: ['validate_implementation', 'run_smoke_test', 'check_types'],
    scaffolding: ['scaffold_project', 'list_templates'],
    status: ['plugin_status', 'project_issues'],
    lsp: [
      'find_references', 'go_to_definition', 'get_implementations', 'rename_symbol',
      'get_code_actions', 'apply_code_action', 'get_call_hierarchy', 'get_type_hierarchy',
      'get_document_symbols', 'get_symbol_info', 'get_signature_help', 'get_diagnostics',
      'find_dead_code', 'get_api_surface', 'detect_breaking_changes', 'semantic_diff',
      'get_inlay_hints', 'workspace_symbols', 'safe_delete_check', 'validate_edits_preview',
    ],
    deps: ['analyze_dependencies', 'find_circular_deps'],
    error: ['parse_error_stack', 'explain_type_error'],
    test: ['find_tests_for_file', 'get_test_coverage', 'suggest_test_cases'],
    security: ['scan_for_secrets', 'check_permissions'],
    project: ['get_env_config', 'get_conventions'],
    framework: ['get_react_component_tree', 'get_prisma_operations'],
    build: ['analyze_bundle'],
    process: ['start_dev_server', 'watch_for_errors', 'health_monitor'],
    runtime: ['browser_automation', 'verify_runtime_behavior', 'lighthouse_audit', 'visual_regression'],
    edit: ['retry_with_learning', 'resolve_merge_conflict', 'atomic_multi_edit', 'auto_rollback', 'validate_api_contract'],
    analysis: ['profile_function', 'log_analyzer', 'generate_types', 'identify_tech_debt', 'detect_memory_leaks'],
    database: ['query_database'],
    env: ['validate_env_complete'],
    package: ['upgrade_package'],
    sync: ['sync_api_types'],
    fixtures: ['generate_fixture'],
    git: ['create_pull_request'],
    frontend: [
      'trace_component_state', 'analyze_render_triggers', 'analyze_responsive_breakpoints',
      'analyze_stacking_context', 'analyze_layout_hierarchy', 'diagnose_overflow',
      'get_accessibility_tree', 'get_sizing_strategy', 'analyze_event_flow',
      'analyze_tailwind_conflicts',
    ],
  };

  it.each(Object.entries(categorizedHandlers))(
    '%s category handlers should all be registered',
    (category, toolNames) => {
      for (const toolName of toolNames) {
        expect(hasHandler(toolName)).toBe(true);
      }
    }
  );

  it('should have all categorized handlers in TOOL_HANDLERS', () => {
    const allCategorizedTools = Object.values(categorizedHandlers).flat();
    const registeredTools = getRegisteredTools();

    for (const tool of allCategorizedTools) {
      expect(registeredTools).toContain(tool);
    }
  });
});

describe('Registry Consistency', () => {
  it('should have no duplicate handlers', () => {
    const tools = getRegisteredTools();
    const uniqueTools = new Set(tools);

    expect(uniqueTools.size).toBe(tools.length);
  });

  it('should have all handlers as functions', () => {
    for (const [name, handler] of Object.entries(TOOL_HANDLERS)) {
      expect(typeof handler).toBe('function');
    }
  });

  it('should not have undefined handlers', () => {
    for (const [name, handler] of Object.entries(TOOL_HANDLERS)) {
      expect(handler).not.toBeUndefined();
      expect(handler).not.toBeNull();
    }
  });

  it('should have consistent total count', () => {
    const toolsFromKeys = Object.keys(TOOL_HANDLERS);
    const toolsFromGetter = getRegisteredTools();

    expect(toolsFromKeys.length).toBe(toolsFromGetter.length);
  });
});
