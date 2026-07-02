/**
 * Ported from v1 precision-engine `__tests__/utils/secrets-guard.test.ts`
 * (assertions intact; only the import path changes). The protected basenames are
 * unchanged in v2, so the guard's behavior is identical.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { isSecretFile, ensureGitignore } from '../fetch/secrets-guard.js';

describe('secrets-guard', () => {
  describe('isSecretFile', () => {
    it('should identify goodvibes.secrets.json', () => {
      expect(isSecretFile('goodvibes.secrets.json')).toBe(true);
      expect(isSecretFile('/some/path/goodvibes.secrets.json')).toBe(true);
      expect(isSecretFile('.goodvibes/v2/goodvibes.secrets.json')).toBe(true);
    });

    it('should identify goodvibes.cookies.json', () => {
      expect(isSecretFile('goodvibes.cookies.json')).toBe(true);
      expect(isSecretFile('/some/path/goodvibes.cookies.json')).toBe(true);
    });

    it('should not flag non-secret files', () => {
      expect(isSecretFile('goodvibes.json')).toBe(false);
      expect(isSecretFile('package.json')).toBe(false);
      expect(isSecretFile('secrets.json')).toBe(false);
      expect(isSecretFile('test.secrets.json')).toBe(false);
    });
  });

  describe('ensureGitignore', () => {
    let tmpDir: string;

    beforeEach(async () => {
      tmpDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'secrets-guard-test-'));
    });

    afterEach(async () => {
      await fs.promises.rm(tmpDir, { recursive: true, force: true });
    });

    it('should create .gitignore with entries if it does not exist', async () => {
      await ensureGitignore(tmpDir);
      const content = await fs.promises.readFile(path.join(tmpDir, '.gitignore'), 'utf-8');
      expect(content).toContain('goodvibes.secrets.json');
      expect(content).toContain('goodvibes.cookies.json');
    });

    it('should append missing entries to existing .gitignore', async () => {
      await fs.promises.writeFile(path.join(tmpDir, '.gitignore'), 'node_modules/\n', 'utf-8');
      await ensureGitignore(tmpDir);
      const content = await fs.promises.readFile(path.join(tmpDir, '.gitignore'), 'utf-8');
      expect(content).toContain('node_modules/');
      expect(content).toContain('goodvibes.secrets.json');
      expect(content).toContain('goodvibes.cookies.json');
    });

    it('should not duplicate entries that already exist', async () => {
      await fs.promises.writeFile(
        path.join(tmpDir, '.gitignore'),
        'goodvibes.secrets.json\ngoodvibes.cookies.json\n',
        'utf-8',
      );
      await ensureGitignore(tmpDir);
      const content = await fs.promises.readFile(path.join(tmpDir, '.gitignore'), 'utf-8');
      const secretsCount = (content.match(/goodvibes\.secrets\.json/g) || []).length;
      const cookiesCount = (content.match(/goodvibes\.cookies\.json/g) || []).length;
      expect(secretsCount).toBe(1);
      expect(cookiesCount).toBe(1);
    });

    it('should only append entries that are actually missing', async () => {
      await fs.promises.writeFile(path.join(tmpDir, '.gitignore'), 'goodvibes.secrets.json\n', 'utf-8');
      await ensureGitignore(tmpDir);
      const content = await fs.promises.readFile(path.join(tmpDir, '.gitignore'), 'utf-8');
      const secretsCount = (content.match(/goodvibes\.secrets\.json/g) || []).length;
      expect(secretsCount).toBe(1);
      expect(content).toContain('goodvibes.cookies.json');
    });
  });
});
