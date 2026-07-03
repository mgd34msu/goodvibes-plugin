/**
 * Config loader + state-directory resolution (incl. the 2.1.0 legacy migration).
 */

import { describe, it, expect, beforeEach } from 'vitest';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
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

describe('state directory', () => {
  it('resolves all project state under .goodvibes/', () => {
    expect(getStatePath('/proj', 'telemetry', 'telemetry.db')).toBe(
      path.join('/proj', '.goodvibes', 'telemetry', 'telemetry.db'),
    );
    expect(projectConfigPath('/proj')).toBe(path.join('/proj', '.goodvibes', 'config.json'));
  });

  it('migrates the legacy .goodvibes/v2/ layout up on first resolution (2.1.0)', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'gv-state-migration-'));
    try {
      const legacyCache = path.join(tmp, '.goodvibes', 'v2', 'cache');
      fs.mkdirSync(legacyCache, { recursive: true });
      fs.writeFileSync(path.join(legacyCache, 'last-session-summary.json'), '{"cost_usd":1.5}');
      // A v1 leftover at the destination: the legacy-v2 copy must win.
      const destState = path.join(tmp, '.goodvibes', 'state');
      fs.mkdirSync(destState, { recursive: true });
      fs.writeFileSync(path.join(destState, 'retries.json'), '{"old":"v1"}');
      fs.mkdirSync(path.join(tmp, '.goodvibes', 'v2', 'state'), { recursive: true });
      fs.writeFileSync(path.join(tmp, '.goodvibes', 'v2', 'state', 'retries.json'), '{"new":"v2"}');

      const resolved = getStatePath(tmp, 'cache', 'last-session-summary.json');
      expect(resolved).toBe(path.join(tmp, '.goodvibes', 'cache', 'last-session-summary.json'));
      expect(fs.readFileSync(resolved, 'utf-8')).toContain('1.5');
      expect(fs.readFileSync(path.join(destState, 'retries.json'), 'utf-8')).toContain('v2');
      expect(fs.existsSync(path.join(tmp, '.goodvibes', 'v2'))).toBe(false);
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });
});
