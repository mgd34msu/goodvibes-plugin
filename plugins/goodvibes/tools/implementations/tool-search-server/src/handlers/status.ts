/**
 * Plugin status handler
 *
 * Provides the plugin_status MCP tool for checking the health and
 * configuration of the GoodVibes plugin installation.
 *
 * @module handlers/status
 */

import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'js-yaml';

import { PluginStatus, Registry } from '../types.js';
import { PLUGIN_ROOT, HOOK_SCRIPT_MAP } from '../config.js';
import { success } from '../utils.js';

/**
 * Handles the plugin_status MCP tool call.
 *
 * Performs a comprehensive health check of the GoodVibes plugin by:
 * - Verifying the plugin manifest exists and is valid JSON
 * - Checking all registry files (agents, skills, tools) exist and are valid YAML
 * - Validating hooks configuration and ensuring all hook scripts exist
 * - Reporting any issues found during the checks
 *
 * @returns MCP tool response with detailed plugin status information
 *
 * @example
 * handlePluginStatus();
 * // Returns: {
 * //   version: '1.0.0',
 * //   status: 'healthy',  // or 'degraded' or 'error'
 * //   issues: [],
 * //   manifest: { exists: true, valid: true, version: '1.0.0' },
 * //   registries: { agents: { exists: true, count: 5 }, ... },
 * //   hooks: { config_exists: true, config_valid: true, events: [...] },
 * //   mcp_server: { running: true }
 * // }
 */
export function handlePluginStatus() {
  const status: PluginStatus = {
    version: '1.0.0',
    status: 'healthy',
    issues: [],
    manifest: { exists: false, valid: false },
    registries: {
      agents: { exists: false, count: 0 },
      skills: { exists: false, count: 0 },
      tools: { exists: false, count: 0 },
    },
    hooks: {
      config_exists: false,
      config_valid: false,
      events: [],
    },
    mcp_server: { running: true },
  };

  // Check manifest
  const manifestPath = path.join(PLUGIN_ROOT, '.claude-plugin', 'plugin.json');
  if (fs.existsSync(manifestPath)) {
    status.manifest.exists = true;
    try {
      const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
      status.manifest.valid = true;
      status.manifest.version = manifest.version;
      status.version = manifest.version || '1.0.0';
    } catch {
      status.issues.push('Manifest exists but is invalid JSON');
    }
  } else {
    status.issues.push('Plugin manifest not found');
  }

  // Check registries
  const registryChecks = [
    { key: 'agents' as const, path: 'agents/_registry.yaml' },
    { key: 'skills' as const, path: 'skills/_registry.yaml' },
    { key: 'tools' as const, path: 'tools/_registry.yaml' },
  ];

  for (const check of registryChecks) {
    const regPath = path.join(PLUGIN_ROOT, check.path);
    if (fs.existsSync(regPath)) {
      status.registries[check.key].exists = true;
      try {
        const reg = yaml.load(fs.readFileSync(regPath, 'utf-8')) as Registry;
        status.registries[check.key].count = reg?.search_index?.length || 0;
      } catch {
        status.issues.push(`${check.key} registry exists but is invalid`);
      }
    } else {
      status.issues.push(`${check.key} registry not found`);
    }
  }

  // Check hooks
  const hooksPath = path.join(PLUGIN_ROOT, 'hooks', 'hooks.json');
  if (fs.existsSync(hooksPath)) {
    status.hooks.config_exists = true;
    try {
      const hooksConfig = JSON.parse(fs.readFileSync(hooksPath, 'utf-8'));
      status.hooks.config_valid = true;

      const hookEvents = Object.keys(hooksConfig.hooks || {});
      for (const event of hookEvents) {
        const scriptName = HOOK_SCRIPT_MAP[event] || `${event.toLowerCase()}.js`;
        const scriptPath = path.join(PLUGIN_ROOT, 'hooks', 'scripts', 'dist', scriptName);
        const exists = fs.existsSync(scriptPath);
        status.hooks.events.push({ name: event, script: scriptName, exists });
        if (!exists) {
          status.issues.push(`Hook script missing: ${scriptName}`);
        }
      }
    } catch {
      status.issues.push('Hooks config exists but is invalid JSON');
    }
  } else {
    status.issues.push('Hooks config not found');
  }

  // Determine overall status
  if (status.issues.length > 3) {
    status.status = 'error';
  } else if (status.issues.length > 0) {
    status.status = 'degraded';
  }

  return success(status);
}
