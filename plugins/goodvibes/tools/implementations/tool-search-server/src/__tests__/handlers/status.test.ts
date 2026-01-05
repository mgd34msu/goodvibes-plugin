/**
 * Unit tests for status handler
 *
 * Tests cover:
 * - handlePluginStatus function
 * - Manifest checking
 * - Registry checking
 * - Hooks checking
 * - Overall status determination
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as yaml from 'js-yaml';

import { handlePluginStatus } from '../../handlers/status.js';
import {
  sampleSkillsRegistry,
  sampleAgentsRegistry,
  sampleToolsRegistry,
  samplePluginManifest,
  sampleHooksJson,
} from '../setup.js';

/** Hook event status entry */
interface HookEvent {
  name: string;
  script: string;
  exists: boolean;
}

// Mock modules
vi.mock('fs');
vi.mock('../../config.js', () => ({
  PLUGIN_ROOT: '/mock/plugin/root',
  HOOK_SCRIPT_MAP: {
    SessionStart: 'session-start.js',
    PreToolUse: 'pre-tool-use.js',
    PostToolUse: 'post-tool-use.js',
  },
}));

describe('handlePluginStatus', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('manifest checking', () => {
    it('should detect existing valid manifest', () => {
      vi.mocked(fs.existsSync).mockImplementation((p) => {
        return String(p).includes('plugin.json');
      });
      vi.mocked(fs.readFileSync).mockImplementation((p) => {
        if (String(p).includes('plugin.json')) {
          return JSON.stringify(samplePluginManifest);
        }
        return '';
      });

      const result = handlePluginStatus();
      const data = JSON.parse(result.content[0].text);

      expect(data.manifest.exists).toBe(true);
      expect(data.manifest.valid).toBe(true);
      expect(data.manifest.version).toBe('1.0.0');
    });

    it('should handle missing manifest', () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);

      const result = handlePluginStatus();
      const data = JSON.parse(result.content[0].text);

      expect(data.manifest.exists).toBe(false);
      expect(data.manifest.valid).toBe(false);
      expect(data.issues).toContain('Plugin manifest not found');
    });

    it('should handle invalid manifest JSON', () => {
      vi.mocked(fs.existsSync).mockImplementation((p) => {
        return String(p).includes('plugin.json');
      });
      vi.mocked(fs.readFileSync).mockImplementation((p) => {
        if (String(p).includes('plugin.json')) {
          return 'invalid json {';
        }
        return '';
      });

      const result = handlePluginStatus();
      const data = JSON.parse(result.content[0].text);

      expect(data.manifest.exists).toBe(true);
      expect(data.manifest.valid).toBe(false);
      expect(data.issues).toContain('Manifest exists but is invalid JSON');
    });
  });

  describe('registry checking', () => {
    it('should check all three registries', () => {
      const existsCalls: string[] = [];
      vi.mocked(fs.existsSync).mockImplementation((p) => {
        existsCalls.push(String(p));
        return false;
      });

      handlePluginStatus();

      // Use platform-independent path matching (works on Windows with \ and Unix with /)
      expect(existsCalls.some(c => c.includes('agents') && c.includes('_registry.yaml'))).toBe(true);
      expect(existsCalls.some(c => c.includes('skills') && c.includes('_registry.yaml'))).toBe(true);
      expect(existsCalls.some(c => c.includes('tools') && c.includes('_registry.yaml'))).toBe(true);
    });

    it('should detect existing registries and count entries', () => {
      vi.mocked(fs.existsSync).mockImplementation((p) => {
        const pathStr = String(p);
        return pathStr.includes('_registry.yaml');
      });
      vi.mocked(fs.readFileSync).mockImplementation((p) => {
        const pathStr = String(p);
        // Use platform-independent matching
        if (pathStr.includes('skills') && pathStr.includes('_registry.yaml')) {
          return yaml.dump(sampleSkillsRegistry);
        }
        if (pathStr.includes('agents') && pathStr.includes('_registry.yaml')) {
          return yaml.dump(sampleAgentsRegistry);
        }
        if (pathStr.includes('tools') && pathStr.includes('_registry.yaml')) {
          return yaml.dump(sampleToolsRegistry);
        }
        return '';
      });

      const result = handlePluginStatus();
      const data = JSON.parse(result.content[0].text);

      expect(data.registries.skills.exists).toBe(true);
      expect(data.registries.skills.count).toBe(5);
      expect(data.registries.agents.exists).toBe(true);
      expect(data.registries.agents.count).toBe(2);
      expect(data.registries.tools.exists).toBe(true);
      expect(data.registries.tools.count).toBe(2);
    });

    it('should handle missing registries', () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);

      const result = handlePluginStatus();
      const data = JSON.parse(result.content[0].text);

      expect(data.registries.skills.exists).toBe(false);
      expect(data.registries.skills.count).toBe(0);
      expect(data.issues).toContain('skills registry not found');
      expect(data.issues).toContain('agents registry not found');
      expect(data.issues).toContain('tools registry not found');
    });

    it('should handle invalid registry YAML', () => {
      vi.mocked(fs.existsSync).mockImplementation((p) => {
        const pathStr = String(p);
        // Platform-independent matching
        return pathStr.includes('skills') && pathStr.includes('_registry.yaml');
      });
      // Return malformed YAML that js-yaml cannot parse
      vi.mocked(fs.readFileSync).mockReturnValue(':\n  -invalid:\n    [[[[');

      const result = handlePluginStatus();
      const data = JSON.parse(result.content[0].text);

      expect(data.registries.skills.exists).toBe(true);
      expect(data.issues).toContain('skills registry exists but is invalid');
    });
  });

  describe('hooks checking', () => {
    it('should detect existing hooks config', () => {
      vi.mocked(fs.existsSync).mockImplementation((p) => {
        return String(p).includes('hooks.json');
      });
      vi.mocked(fs.readFileSync).mockImplementation((p) => {
        if (String(p).includes('hooks.json')) {
          return JSON.stringify(sampleHooksJson);
        }
        return '';
      });

      const result = handlePluginStatus();
      const data = JSON.parse(result.content[0].text);

      expect(data.hooks.config_exists).toBe(true);
      expect(data.hooks.config_valid).toBe(true);
    });

    it('should check hook script existence', () => {
      vi.mocked(fs.existsSync).mockImplementation((p) => {
        const pathStr = String(p);
        if (pathStr.includes('hooks.json')) return true;
        if (pathStr.includes('session-start.js')) return true;
        if (pathStr.includes('pre-tool-use.js')) return false;
        if (pathStr.includes('post-tool-use.js')) return true;
        return false;
      });
      vi.mocked(fs.readFileSync).mockImplementation((p) => {
        if (String(p).includes('hooks.json')) {
          return JSON.stringify(sampleHooksJson);
        }
        return '';
      });

      const result = handlePluginStatus();
      const data = JSON.parse(result.content[0].text);

      const sessionStart = data.hooks.events.find((e: HookEvent) => e.name === 'SessionStart');
      const preToolUse = data.hooks.events.find((e: HookEvent) => e.name === 'PreToolUse');
      const postToolUse = data.hooks.events.find((e: HookEvent) => e.name === 'PostToolUse');

      expect(sessionStart?.exists).toBe(true);
      expect(preToolUse?.exists).toBe(false);
      expect(postToolUse?.exists).toBe(true);
    });

    it('should report missing hook scripts as issues', () => {
      vi.mocked(fs.existsSync).mockImplementation((p) => {
        return String(p).includes('hooks.json');
      });
      vi.mocked(fs.readFileSync).mockImplementation((p) => {
        if (String(p).includes('hooks.json')) {
          return JSON.stringify(sampleHooksJson);
        }
        return '';
      });

      const result = handlePluginStatus();
      const data = JSON.parse(result.content[0].text);

      expect(data.issues).toContain('Hook script missing: session-start.js');
    });

    it('should handle missing hooks config', () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);

      const result = handlePluginStatus();
      const data = JSON.parse(result.content[0].text);

      expect(data.hooks.config_exists).toBe(false);
      expect(data.hooks.config_valid).toBe(false);
      expect(data.issues).toContain('Hooks config not found');
    });

    it('should handle invalid hooks config JSON', () => {
      vi.mocked(fs.existsSync).mockImplementation((p) => {
        return String(p).includes('hooks.json');
      });
      vi.mocked(fs.readFileSync).mockReturnValue('invalid json');

      const result = handlePluginStatus();
      const data = JSON.parse(result.content[0].text);

      expect(data.hooks.config_exists).toBe(true);
      expect(data.hooks.config_valid).toBe(false);
      expect(data.issues).toContain('Hooks config exists but is invalid JSON');
    });
  });

  describe('overall status determination', () => {
    it('should be healthy when no issues', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockImplementation((p) => {
        const pathStr = String(p);
        if (pathStr.includes('plugin.json')) {
          return JSON.stringify(samplePluginManifest);
        }
        if (pathStr.includes('_registry.yaml')) {
          return yaml.dump({ version: '1.0.0', search_index: [] });
        }
        if (pathStr.includes('hooks.json')) {
          return JSON.stringify({ hooks: {} });
        }
        return '';
      });

      const result = handlePluginStatus();
      const data = JSON.parse(result.content[0].text);

      expect(data.status).toBe('healthy');
      expect(data.issues).toHaveLength(0);
    });

    it('should be degraded when 1-3 issues', () => {
      // Setup: manifest exists and valid, all registries exist with valid content,
      // but hooks.json is missing (1 issue only)
      vi.mocked(fs.existsSync).mockImplementation((p) => {
        const pathStr = String(p);
        return pathStr.includes('plugin.json') || pathStr.includes('_registry.yaml');
      });
      vi.mocked(fs.readFileSync).mockImplementation((p) => {
        if (String(p).includes('plugin.json')) {
          return JSON.stringify(samplePluginManifest);
        }
        if (String(p).includes('_registry.yaml')) {
          return yaml.dump({ version: '1.0.0', search_index: [] });
        }
        return '';
      });

      const result = handlePluginStatus();
      const data = JSON.parse(result.content[0].text);

      expect(data.status).toBe('degraded');
      expect(data.issues.length).toBeGreaterThan(0);
      expect(data.issues.length).toBeLessThanOrEqual(3);
    });

    it('should be error when more than 3 issues', () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);

      const result = handlePluginStatus();
      const data = JSON.parse(result.content[0].text);

      expect(data.status).toBe('error');
      expect(data.issues.length).toBeGreaterThan(3);
    });
  });

  describe('response format', () => {
    it('should return properly formatted response', () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);

      const result = handlePluginStatus();

      expect(result).toHaveProperty('content');
      expect(result.content).toHaveLength(1);
      expect(result.content[0]).toHaveProperty('type', 'text');
      expect(result.content[0]).toHaveProperty('text');
    });

    it('should return parseable JSON', () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);

      const result = handlePluginStatus();

      expect(() => JSON.parse(result.content[0].text)).not.toThrow();
    });

    it('should always report mcp_server as running', () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);

      const result = handlePluginStatus();
      const data = JSON.parse(result.content[0].text);

      expect(data.mcp_server.running).toBe(true);
    });

    it('should include version from manifest or default', () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);

      const result = handlePluginStatus();
      const data = JSON.parse(result.content[0].text);

      expect(data.version).toBe('1.0.0');
    });
  });
});
