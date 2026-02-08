import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { getMaxFileBytes, getMaxTokenEstimate, getPageSizeLines, getCacheMode, getCacheMaxMb, setConfigValue } from '../runtime-config.js';

describe('Size Gate Config Getters', () => {
  const testConfigDir = path.join(process.cwd(), '.goodvibes');
  const testConfigPath = path.join(testConfigDir, 'goodvibes.json');
  let originalConfig: string | null = null;

  beforeEach(() => {
    // Save original config if it exists
    if (fs.existsSync(testConfigPath)) {
      originalConfig = fs.readFileSync(testConfigPath, 'utf-8');
    }
  });

  afterEach(() => {
    // Restore original config
    if (originalConfig) {
      fs.mkdirSync(testConfigDir, { recursive: true });
      fs.writeFileSync(testConfigPath, originalConfig, 'utf-8');
      originalConfig = null;
    } else if (fs.existsSync(testConfigPath)) {
      // Clean up test config if there was no original
      fs.unlinkSync(testConfigPath);
    }
  });

  describe('getMaxFileBytes', () => {
    it('returns default value (524288) when not configured', () => {
      expect(getMaxFileBytes()).toBe(524288);
    });

    it('returns custom value when configured', async () => {
      await setConfigValue('max_file_bytes', 1048576); // 1MB
      expect(getMaxFileBytes()).toBe(1048576);
    });

    it('returns default when value is 0', async () => {
      await setConfigValue('max_file_bytes', 0);
      expect(getMaxFileBytes()).toBe(524288);
    });

    it('returns default when value is negative', async () => {
      await setConfigValue('max_file_bytes', -100);
      expect(getMaxFileBytes()).toBe(524288);
    });

    it('returns default when value is not a number', async () => {
      await setConfigValue('max_file_bytes', 'invalid');
      expect(getMaxFileBytes()).toBe(524288);
    });

    it('returns default when value is null', async () => {
      await setConfigValue('max_file_bytes', null);
      expect(getMaxFileBytes()).toBe(524288);
    });
  });

  describe('getMaxTokenEstimate', () => {
    it('returns default value (50000) when not configured', () => {
      expect(getMaxTokenEstimate()).toBe(50000);
    });

    it('returns custom value when configured', async () => {
      await setConfigValue('max_token_estimate', 100000);
      expect(getMaxTokenEstimate()).toBe(100000);
    });

    it('returns default when value is 0', async () => {
      await setConfigValue('max_token_estimate', 0);
      expect(getMaxTokenEstimate()).toBe(50000);
    });

    it('returns default when value is negative', async () => {
      await setConfigValue('max_token_estimate', -1000);
      expect(getMaxTokenEstimate()).toBe(50000);
    });

    it('returns default when value is not a number', async () => {
      await setConfigValue('max_token_estimate', 'invalid');
      expect(getMaxTokenEstimate()).toBe(50000);
    });

    it('returns default when value is null', async () => {
      await setConfigValue('max_token_estimate', null);
      expect(getMaxTokenEstimate()).toBe(50000);
    });
  });

  describe('getPageSizeLines', () => {
    it('returns default value (200) when not configured', () => {
      expect(getPageSizeLines()).toBe(200);
    });

    it('returns custom value when configured', async () => {
      await setConfigValue('page_size_lines', 500);
      expect(getPageSizeLines()).toBe(500);
    });

    it('returns default when value is 0', async () => {
      await setConfigValue('page_size_lines', 0);
      expect(getPageSizeLines()).toBe(200);
    });

    it('returns default when value is negative', async () => {
      await setConfigValue('page_size_lines', -50);
      expect(getPageSizeLines()).toBe(200);
    });

    it('returns default when value is not a number', async () => {
      await setConfigValue('page_size_lines', 'invalid');
      expect(getPageSizeLines()).toBe(200);
    });

    it('returns default when value is null', async () => {
      await setConfigValue('page_size_lines', null);
      expect(getPageSizeLines()).toBe(200);
    });
  });

  describe('getCacheMode', () => {
    it('returns default value (with_content) when not configured', () => {
      expect(getCacheMode()).toBe('with_content');
    });

    it('returns hash_only when configured', async () => {
      await setConfigValue('cache_mode', 'hash_only');
      expect(getCacheMode()).toBe('hash_only');
    });

    it('returns with_content when configured', async () => {
      await setConfigValue('cache_mode', 'with_content');
      expect(getCacheMode()).toBe('with_content');
    });

    it('returns default when value is invalid', async () => {
      await setConfigValue('cache_mode', 'invalid_mode');
      expect(getCacheMode()).toBe('with_content');
    });

    it('returns default when value is null', async () => {
      await setConfigValue('cache_mode', null);
      expect(getCacheMode()).toBe('with_content');
    });
  });

  describe('getCacheMaxMb', () => {
    it('returns default value (200) when not configured', () => {
      expect(getCacheMaxMb()).toBe(200);
    });

    it('returns custom value when configured', async () => {
      await setConfigValue('cache_max_mb', 500);
      expect(getCacheMaxMb()).toBe(500);
    });

    it('returns custom small value when configured', async () => {
      await setConfigValue('cache_max_mb', 1);
      expect(getCacheMaxMb()).toBe(1);
    });

    it('returns default when value is 0', async () => {
      await setConfigValue('cache_max_mb', 0);
      expect(getCacheMaxMb()).toBe(200);
    });

    it('returns default when value is negative', async () => {
      await setConfigValue('cache_max_mb', -100);
      expect(getCacheMaxMb()).toBe(200);
    });

    it('returns default when value is not a number', async () => {
      await setConfigValue('cache_max_mb', 'invalid');
      expect(getCacheMaxMb()).toBe(200);
    });

    it('returns default when value is null', async () => {
      await setConfigValue('cache_max_mb', null);
      expect(getCacheMaxMb()).toBe(200);
    });
  });

  describe('Integration - All Size Gate Settings', () => {
    it('allows setting all size gate configs simultaneously', async () => {
      await setConfigValue('max_file_bytes', 2097152); // 2MB
      await setConfigValue('max_token_estimate', 75000);
      await setConfigValue('page_size_lines', 300);

      expect(getMaxFileBytes()).toBe(2097152);
      expect(getMaxTokenEstimate()).toBe(75000);
      expect(getPageSizeLines()).toBe(300);
    });
  });

  describe('Integration - Cache Settings', () => {
    it('allows setting cache_mode and cache_max_mb together', async () => {
      await setConfigValue('cache_mode', 'hash_only');
      await setConfigValue('cache_max_mb', 512);

      expect(getCacheMode()).toBe('hash_only');
      expect(getCacheMaxMb()).toBe(512);
    });

    it('maintains independence from size gate settings', async () => {
      await setConfigValue('cache_mode', 'with_content');
      await setConfigValue('cache_max_mb', 1024);
      await setConfigValue('max_file_bytes', 1048576);

      expect(getCacheMode()).toBe('with_content');
      expect(getCacheMaxMb()).toBe(1024);
      expect(getMaxFileBytes()).toBe(1048576);
    });
  });
});
