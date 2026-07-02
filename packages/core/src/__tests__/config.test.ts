/**
 * Config loader + R15 namespacing sanity.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import * as path from 'path';
import {
  loadConfig,
  resetConfigCache,
  getStatePath,
  projectConfigPath,
  configForEnvelope,
  describeConfigKeys,
  DEFAULT_CONFIG,
  CONFIG_KEYS,
} from '../config/index.js';

describe('config defaults', () => {
  beforeEach(() => resetConfigCache());

  it('defaults to restricted mode and read_only true', () => {
    const cfg = loadConfig('/nonexistent/project');
    expect(cfg.mode).toBe('restricted');
    expect(configForEnvelope(cfg)).toEqual({ mode: 'restricted', read_only: true });
  });

  it('carries the mandated budget defaults', () => {
    const cfg = loadConfig('/nonexistent/project');
    expect(cfg.budgets.analyzer_ms).toBe(20000);
    expect(cfg.budgets.search_ms).toBe(15000);
    expect(cfg.budgets.http_default_ms).toBe(30000);
    expect(cfg.budgets.http_max_ms).toBe(120000);
    expect(cfg.ppid_poll_ms).toBe(5000);
  });

  it('DEFAULT_CONFIG and CONFIG_KEYS agree on documented defaults', () => {
    expect(DEFAULT_CONFIG.mode).toBe(CONFIG_KEYS.mode.default);
    expect(DEFAULT_CONFIG.budgets.analyzer_ms).toBe(CONFIG_KEYS['budgets.analyzer_ms'].default);
  });

  it('documents every key from one source of truth', () => {
    const doc = describeConfigKeys();
    for (const key of Object.keys(CONFIG_KEYS)) {
      expect(doc).toContain(key);
    }
  });
});

describe('R15 state namespacing', () => {
  it('namespaces all project state under .goodvibes/v2/', () => {
    expect(getStatePath('/proj', 'telemetry', 'telemetry.db')).toBe(
      path.join('/proj', '.goodvibes', 'v2', 'telemetry', 'telemetry.db'),
    );
    expect(projectConfigPath('/proj')).toBe(path.join('/proj', '.goodvibes', 'v2', 'config.json'));
  });
});
