/**
 * Unit tests for npm handler
 *
 * Tests cover:
 * - handleCheckVersions
 * - fetchNpmPackageInfo
 * - fetchNpmReadme
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';

import {
  handleCheckVersions,
  fetchNpmPackageInfo,
  fetchNpmReadme,
} from '../../handlers/npm.js';
import { samplePackageJson } from '../setup.js';

// Mock modules
vi.mock('fs');
vi.mock('../../config.js', () => ({
  PROJECT_ROOT: '/mock/project/root',
}));
vi.mock('../../utils.js', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual as object,
    readJsonFile: vi.fn(),
    safeExec: vi.fn(),
  };
});

describe('npm handlers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('fetchNpmPackageInfo', () => {
    it('should fetch latest version from npm', async () => {
      const { safeExec } = await import('../../utils.js');
      vi.mocked(safeExec)
        .mockResolvedValueOnce({ stdout: '18.2.0', stderr: '' })
        .mockResolvedValueOnce({ stdout: '{"latest": "18.2.0"}', stderr: '' });

      const result = await fetchNpmPackageInfo('react');

      expect(result?.latest).toBe('18.2.0');
    });

    it('should return null on error', async () => {
      const { safeExec } = await import('../../utils.js');
      vi.mocked(safeExec).mockResolvedValue({
        stdout: '',
        stderr: 'npm ERR!',
        error: 'Command failed',
      });

      const result = await fetchNpmPackageInfo('nonexistent-package-xyz');

      expect(result).toBeNull();
    });

    it('should return null when stdout is empty', async () => {
      const { safeExec } = await import('../../utils.js');
      vi.mocked(safeExec).mockResolvedValue({ stdout: '', stderr: '' });

      const result = await fetchNpmPackageInfo('empty-package');

      expect(result).toBeNull();
    });

    it('should parse dist-tags for wanted version', async () => {
      const { safeExec } = await import('../../utils.js');
      vi.mocked(safeExec)
        .mockResolvedValueOnce({ stdout: '14.0.0', stderr: '' })
        .mockResolvedValueOnce({
          stdout: '{"latest": "14.0.0", "canary": "14.1.0-canary"}',
          stderr: '',
        });

      const result = await fetchNpmPackageInfo('next');

      expect(result?.latest).toBe('14.0.0');
      expect(result?.wanted).toBe('14.0.0');
    });

    it('should handle invalid JSON in dist-tags', async () => {
      const { safeExec } = await import('../../utils.js');
      vi.mocked(safeExec)
        .mockResolvedValueOnce({ stdout: '5.0.0', stderr: '' })
        .mockResolvedValueOnce({ stdout: 'invalid json', stderr: '' });

      const result = await fetchNpmPackageInfo('prisma');

      expect(result?.latest).toBe('5.0.0');
      expect(result?.wanted).toBeUndefined();
    });
  });

  describe('fetchNpmReadme', () => {
    it('should fetch readme and metadata', async () => {
      const { safeExec } = await import('../../utils.js');
      vi.mocked(safeExec).mockResolvedValue({
        stdout: JSON.stringify({
          readme: '# React\n\nA JavaScript library for building user interfaces.',
          description: 'React is a JavaScript library for building user interfaces.',
          'repository.url': 'git+https://github.com/facebook/react.git',
          homepage: 'https://react.dev/',
        }),
        stderr: '',
      });

      const result = await fetchNpmReadme('react');

      expect(result?.readme).toContain('React');
      expect(result?.description).toBeDefined();
      expect(result?.homepage).toBe('https://react.dev/');
    });

    it('should return null on error', async () => {
      const { safeExec } = await import('../../utils.js');
      vi.mocked(safeExec).mockResolvedValue({
        stdout: '',
        stderr: 'npm ERR!',
        error: 'Command failed',
      });

      const result = await fetchNpmReadme('nonexistent-package');

      expect(result).toBeNull();
    });

    it('should truncate long readmes', async () => {
      const { safeExec } = await import('../../utils.js');
      const longReadme = 'x'.repeat(10000);
      vi.mocked(safeExec).mockResolvedValue({
        stdout: JSON.stringify({ readme: longReadme }),
        stderr: '',
      });

      const result = await fetchNpmReadme('long-readme-pkg');

      expect(result?.readme?.length).toBeLessThanOrEqual(8000);
    });

    it('should clean up repository URL', async () => {
      const { safeExec } = await import('../../utils.js');
      vi.mocked(safeExec).mockResolvedValue({
        stdout: JSON.stringify({
          'repository.url': 'git+https://github.com/user/repo.git',
        }),
        stderr: '',
      });

      const result = await fetchNpmReadme('pkg-with-repo');

      expect(result?.repository).toBe('https://github.com/user/repo');
    });
  });

  describe('handleCheckVersions', () => {
    it('should read package.json and check versions', async () => {
      const { readJsonFile } = await import('../../utils.js');
      vi.mocked(readJsonFile).mockReturnValue(samplePackageJson);

      const result = await handleCheckVersions({});
      const data = JSON.parse(result.content[0].text);

      expect(data.packages).toBeDefined();
      expect(data.packages.length).toBeGreaterThan(0);
    });

    it('should throw error when package.json not found', async () => {
      const { readJsonFile } = await import('../../utils.js');
      vi.mocked(readJsonFile).mockReturnValue(null);

      await expect(handleCheckVersions({})).rejects.toThrow('package.json not found');
    });

    it('should check specific packages when provided', async () => {
      const { readJsonFile } = await import('../../utils.js');
      vi.mocked(readJsonFile).mockReturnValue(samplePackageJson);

      const result = await handleCheckVersions({
        packages: ['react', 'next'],
      });
      const data = JSON.parse(result.content[0].text);

      expect(data.packages.length).toBe(2);
      expect(data.packages.some((p: any) => p.name === 'react')).toBe(true);
      expect(data.packages.some((p: any) => p.name === 'next')).toBe(true);
    });

    it('should limit packages to 20 when none specified', async () => {
      const { readJsonFile } = await import('../../utils.js');
      const manyDeps: Record<string, string> = {};
      for (let i = 0; i < 30; i++) {
        manyDeps[`package-${i}`] = '^1.0.0';
      }
      vi.mocked(readJsonFile).mockReturnValue({
        dependencies: manyDeps,
      });

      const result = await handleCheckVersions({});
      const data = JSON.parse(result.content[0].text);

      expect(data.packages.length).toBeLessThanOrEqual(20);
    });

    it('should include installed version', async () => {
      const { readJsonFile } = await import('../../utils.js');
      vi.mocked(readJsonFile).mockReturnValue(samplePackageJson);

      const result = await handleCheckVersions({
        packages: ['react'],
      });
      const data = JSON.parse(result.content[0].text);

      expect(data.packages[0].installed).toBe('^18.2.0');
    });

    it('should mark as not installed when package not in dependencies', async () => {
      const { readJsonFile } = await import('../../utils.js');
      vi.mocked(readJsonFile).mockReturnValue(samplePackageJson);

      const result = await handleCheckVersions({
        packages: ['not-installed-pkg'],
      });
      const data = JSON.parse(result.content[0].text);

      expect(data.packages[0].installed).toBe('not installed');
    });

    it('should check latest versions when check_latest is true', async () => {
      const { readJsonFile, safeExec } = await import('../../utils.js');
      vi.mocked(readJsonFile).mockReturnValue(samplePackageJson);
      vi.mocked(safeExec)
        .mockResolvedValueOnce({ stdout: '18.3.0', stderr: '' })
        .mockResolvedValueOnce({ stdout: '{"latest": "18.3.0"}', stderr: '' });

      const result = await handleCheckVersions({
        packages: ['react'],
        check_latest: true,
      });
      const data = JSON.parse(result.content[0].text);

      expect(data.packages[0].latest).toBe('18.3.0');
    });

    it('should detect outdated packages', async () => {
      const { readJsonFile, safeExec } = await import('../../utils.js');
      vi.mocked(readJsonFile).mockReturnValue({
        dependencies: { react: '^18.0.0' },
      });
      vi.mocked(safeExec)
        .mockResolvedValueOnce({ stdout: '18.3.0', stderr: '' })
        .mockResolvedValueOnce({ stdout: '{"latest": "18.3.0"}', stderr: '' });

      const result = await handleCheckVersions({
        packages: ['react'],
        check_latest: true,
      });
      const data = JSON.parse(result.content[0].text);

      expect(data.packages[0].outdated).toBe(true);
    });

    it('should detect breaking changes (major version bump)', async () => {
      const { readJsonFile, safeExec } = await import('../../utils.js');
      vi.mocked(readJsonFile).mockReturnValue({
        dependencies: { next: '^13.0.0' },
      });
      vi.mocked(safeExec)
        .mockResolvedValueOnce({ stdout: '14.0.0', stderr: '' })
        .mockResolvedValueOnce({ stdout: '{"latest": "14.0.0"}', stderr: '' });

      const result = await handleCheckVersions({
        packages: ['next'],
        check_latest: true,
      });
      const data = JSON.parse(result.content[0].text);

      expect(data.packages[0].breaking_changes).toBe(true);
    });

    it('should include summary in response', async () => {
      const { readJsonFile, safeExec } = await import('../../utils.js');
      vi.mocked(readJsonFile).mockReturnValue(samplePackageJson);
      vi.mocked(safeExec)
        .mockResolvedValue({ stdout: '1.0.0', stderr: '' });

      const result = await handleCheckVersions({
        packages: ['react', 'next'],
        check_latest: true,
      });
      const data = JSON.parse(result.content[0].text);

      expect(data.summary).toBeDefined();
      expect(data.summary.total).toBe(2);
      expect(data.summary).toHaveProperty('outdated');
      expect(data.summary).toHaveProperty('major_updates');
      expect(data.summary).toHaveProperty('up_to_date');
    });

    it('should use custom path when provided', async () => {
      const { readJsonFile } = await import('../../utils.js');
      vi.mocked(readJsonFile).mockReturnValue(samplePackageJson);

      await handleCheckVersions({ path: 'custom/project/path' });

      expect(readJsonFile).toHaveBeenCalledWith(
        expect.stringContaining('custom')
      );
    });

    it('should continue when npm lookup fails', async () => {
      const { readJsonFile, safeExec } = await import('../../utils.js');
      vi.mocked(readJsonFile).mockReturnValue(samplePackageJson);
      vi.mocked(safeExec).mockRejectedValue(new Error('Network error'));

      const result = await handleCheckVersions({
        packages: ['react'],
        check_latest: true,
      });
      const data = JSON.parse(result.content[0].text);

      expect(data.packages.length).toBe(1);
      expect(data.packages[0].latest).toBeUndefined();
    });

    it('should merge dependencies and devDependencies', async () => {
      const { readJsonFile } = await import('../../utils.js');
      vi.mocked(readJsonFile).mockReturnValue({
        dependencies: { react: '^18.0.0' },
        devDependencies: { vitest: '^1.0.0' },
      });

      const result = await handleCheckVersions({
        packages: ['react', 'vitest'],
      });
      const data = JSON.parse(result.content[0].text);

      expect(data.packages.some((p: any) => p.name === 'react')).toBe(true);
      expect(data.packages.some((p: any) => p.name === 'vitest')).toBe(true);
    });

    describe('response format', () => {
      it('should return properly formatted response', async () => {
        const { readJsonFile } = await import('../../utils.js');
        vi.mocked(readJsonFile).mockReturnValue(samplePackageJson);

        const result = await handleCheckVersions({});

        expect(result).toHaveProperty('content');
        expect(result.content).toHaveLength(1);
        expect(result.content[0]).toHaveProperty('type', 'text');
      });

      it('should return valid JSON', async () => {
        const { readJsonFile } = await import('../../utils.js');
        vi.mocked(readJsonFile).mockReturnValue(samplePackageJson);

        const result = await handleCheckVersions({});

        expect(() => JSON.parse(result.content[0].text)).not.toThrow();
      });
    });
  });
});
