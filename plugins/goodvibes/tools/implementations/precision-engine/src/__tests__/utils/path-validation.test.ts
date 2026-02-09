import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs/promises';
import * as path from 'path';
import { validateFilePath, validateDirectoryPath } from '../../utils/path-validation.js';
import { setConfigValue, loadConfig } from '../../runtime-config.js';

describe('Sandbox Enforcement in Path Validation', () => {
  const projectRoot = process.cwd();
  const testDir = path.join(projectRoot, '.test-sandbox-validation');
  const outsideDir = path.join(path.dirname(projectRoot), '.test-outside-project');
  
  beforeEach(async () => {
    // Create test directories
    await fs.mkdir(testDir, { recursive: true });
    await fs.mkdir(outsideDir, { recursive: true });
  });

  afterEach(async () => {
    // Clean up test directories
    try {
      await fs.rm(testDir, { recursive: true, force: true });
      await fs.rm(outsideDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
    // Reset sandbox to default (disabled)
    await setConfigValue('sandbox', false);
  });

  describe('validateDirectoryPath with sandbox disabled (default)', () => {
    it('allows directory inside project root', async () => {
      await setConfigValue('sandbox', false);
      const result = await validateDirectoryPath(testDir, projectRoot);
      expect(result).toBe(testDir);
    });

    it('allows directory outside project root when sandbox is disabled', async () => {
      await setConfigValue('sandbox', false);
      const result = await validateDirectoryPath(outsideDir, projectRoot);
      expect(result).toBe(outsideDir);
    });
  });

  describe('validateDirectoryPath with sandbox enabled', () => {
    it('allows directory inside project root', async () => {
      await setConfigValue('sandbox', true);
      const result = await validateDirectoryPath(testDir, projectRoot);
      expect(result).toBe(testDir);
    });

    it('throws error for directory outside project root', async () => {
      await setConfigValue('sandbox', true);
      await expect(
        validateDirectoryPath(outsideDir, projectRoot)
      ).rejects.toThrow(/outside the project root/);
    });

    it('allows project root itself', async () => {
      await setConfigValue('sandbox', true);
      const result = await validateDirectoryPath(projectRoot, projectRoot);
      expect(result).toBe(projectRoot);
    });
  });

  describe('validateFilePath with sandbox disabled (default)', () => {
    it('allows file inside project root', async () => {
      await setConfigValue('sandbox', false);
      const testFile = path.join(testDir, 'test.txt');
      await fs.writeFile(testFile, 'test content');
      const result = await validateFilePath(testFile, projectRoot);
      expect(result).toBe(testFile);
    });

    it('allows file outside project root when sandbox is disabled', async () => {
      await setConfigValue('sandbox', false);
      const outsideFile = path.join(outsideDir, 'outside.txt');
      await fs.writeFile(outsideFile, 'outside content');
      const result = await validateFilePath(outsideFile, projectRoot);
      expect(result).toBe(outsideFile);
    });

    it('allows new file outside project root when sandbox is disabled', async () => {
      await setConfigValue('sandbox', false);
      const newFile = path.join(outsideDir, 'new-file.txt');
      const result = await validateFilePath(newFile, projectRoot, false);
      expect(result).toBe(newFile);
    });
  });

  describe('validateFilePath with sandbox enabled', () => {
    it('allows existing file inside project root', async () => {
      await setConfigValue('sandbox', true);
      const testFile = path.join(testDir, 'test.txt');
      await fs.writeFile(testFile, 'test content');
      const result = await validateFilePath(testFile, projectRoot);
      expect(result).toBe(testFile);
    });

    it('throws error for existing file outside project root', async () => {
      await setConfigValue('sandbox', true);
      const outsideFile = path.join(outsideDir, 'outside.txt');
      await fs.writeFile(outsideFile, 'outside content');
      await expect(
        validateFilePath(outsideFile, projectRoot)
      ).rejects.toThrow(/outside the project root/);
    });

    it('allows new file inside project root', async () => {
      await setConfigValue('sandbox', true);
      const newFile = path.join(testDir, 'new-file.txt');
      const result = await validateFilePath(newFile, projectRoot, false);
      expect(result).toBe(newFile);
    });

    it('throws error for new file outside project root', async () => {
      await setConfigValue('sandbox', true);
      // For a non-existent file, validateFilePath walks up to find an existing ancestor.
      // If all ancestors are outside the sandbox (or don't exist), it will eventually
      // throw "no accessible ancestor" error. This tests that sandbox enforcement
      // prevents creating files outside the project root.
      const newFile = path.join(outsideDir, 'new-file.txt');
      await expect(
        validateFilePath(newFile, projectRoot, false)
      ).rejects.toThrow(/no accessible ancestor|outside the project root/);
    });
  });

  describe('Sandbox coercion in enforcement (string "true" from config)', () => {
    it('enforces sandbox when config value is string "true"', async () => {
      // Simulate manual config edit that stored string instead of boolean
      await setConfigValue('sandbox', 'true');
      await loadConfig(); // Reload to ensure coercion happens
      
      const outsideFile = path.join(outsideDir, 'outside.txt');
      await fs.writeFile(outsideFile, 'outside content');
      
      await expect(
        validateFilePath(outsideFile, projectRoot)
      ).rejects.toThrow(/outside the project root/);
    });

    it('does not enforce sandbox when config value is string "false"', async () => {
      await setConfigValue('sandbox', 'false');
      await loadConfig();
      
      const outsideFile = path.join(outsideDir, 'outside.txt');
      await fs.writeFile(outsideFile, 'outside content');
      
      const result = await validateFilePath(outsideFile, projectRoot);
      expect(result).toBe(outsideFile);
    });

    it('does not enforce sandbox when config value is number 1', async () => {
      await setConfigValue('sandbox', 1);
      await loadConfig();
      
      const outsideFile = path.join(outsideDir, 'outside.txt');
      await fs.writeFile(outsideFile, 'outside content');
      
      const result = await validateFilePath(outsideFile, projectRoot);
      expect(result).toBe(outsideFile);
    });

    it('does not enforce sandbox when config value is null', async () => {
      await setConfigValue('sandbox', null);
      await loadConfig();
      
      const outsideFile = path.join(outsideDir, 'outside.txt');
      await fs.writeFile(outsideFile, 'outside content');
      
      const result = await validateFilePath(outsideFile, projectRoot);
      expect(result).toBe(outsideFile);
    });

    it('does not enforce sandbox when config value is undefined', async () => {
      await loadConfig(); // Ensure clean state with no sandbox config
      
      const outsideFile = path.join(outsideDir, 'outside.txt');
      await fs.writeFile(outsideFile, 'outside content');
      
      const result = await validateFilePath(outsideFile, projectRoot);
      expect(result).toBe(outsideFile);
    });
  });

  describe('Edge cases for sandbox boundary detection', () => {
    it('prevents prefix collision attack (e.g., /app-secrets vs /app)', async () => {
      await setConfigValue('sandbox', true);
      
      // Try to access a directory that starts with the project root prefix
      // but is not actually inside it
      const siblingDir = projectRoot + '-secrets';
      
      // Create the sibling directory
      await fs.mkdir(siblingDir, { recursive: true });
      
      try {
        await expect(
          validateDirectoryPath(siblingDir, projectRoot)
        ).rejects.toThrow(/outside the project root/);
      } finally {
        // Clean up
        await fs.rm(siblingDir, { recursive: true, force: true });
      }
    });

    it('handles symlinks correctly', async () => {
      await setConfigValue('sandbox', true);
      
      const symlinkPath = path.join(testDir, 'symlink-to-outside');
      
      // Create symlink to outside directory
      try {
        await fs.symlink(outsideDir, symlinkPath, 'dir');
        
        // Symlink is inside project, but it points outside
        // validateDirectoryPath should follow the symlink and detect boundary violation
        await expect(
          validateDirectoryPath(symlinkPath, projectRoot)
        ).rejects.toThrow(/outside the project root/);
      } catch (e) {
        // On some systems, symlink creation might fail
        // If it's not a permission issue, we should see the test
        if (e instanceof Error && !e.message.includes('EPERM')) {
          throw e;
        }
      }
    });
  });
});
