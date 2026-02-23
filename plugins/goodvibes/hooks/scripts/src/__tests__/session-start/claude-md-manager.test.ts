/**
 * Comprehensive tests for session-start/claude-md-manager.ts
 *
 * Covers:
 * - Location resolution (3 strategies)
 * - CLAUDE.md creation and updates
 * - .goodvibes/GOODVIBES.md creation
 * - Prompt files creation
 * - Idempotency
 * - Error handling
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { ensureClaudeMdImports } from '../../session-start/claude-md-manager.js';

// Mock os.homedir and logging
vi.mock('os', async () => {
  const actual = await vi.importActual<typeof import('os')>('os');
  return { ...actual, homedir: vi.fn(() => actual.homedir()) };
});

vi.mock('../../shared/index.js', () => ({
  debug: vi.fn(),
  logError: vi.fn(),
}));

describe('ensureClaudeMdImports', () => {
  let tmpDir: string;
  let fakeHome: string;

  beforeEach(() => {
    // Create temporary directory for testing
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'claude-md-test-'));
    fakeHome = path.join(tmpDir, 'fakehome');
    fs.mkdirSync(fakeHome, { recursive: true });
  });

  afterEach(() => {
    // Cleanup
    fs.rmSync(tmpDir, { recursive: true, force: true });
    vi.resetAllMocks();
  });

  // =============================================================================
  // Location Resolution Tests
  // =============================================================================

  describe('Location Resolution', () => {
    it('uses ~/.claude/ when available', async () => {
      // Setup: Create ~/.claude/ directory
      const claudeHome = path.join(fakeHome, '.claude');
      fs.mkdirSync(claudeHome, { recursive: true });
      vi.mocked(os.homedir).mockReturnValue(fakeHome);

      const projectDir = path.join(tmpDir, 'my-project');
      fs.mkdirSync(projectDir, { recursive: true });

      await ensureClaudeMdImports(projectDir);

      // Verify files created in ~/.claude/, not projectDir
      expect(fs.existsSync(path.join(claudeHome, 'CLAUDE.md'))).toBe(true);
      expect(fs.existsSync(path.join(claudeHome, '.goodvibes', 'GOODVIBES.md'))).toBe(true);
      expect(fs.existsSync(path.join(projectDir, 'CLAUDE.md'))).toBe(false);
    });

    it('skips ~/.claude/ when project is inside it', async () => {
      // Setup: Create ~/.claude/ directory
      const claudeHome = path.join(fakeHome, '.claude');
      fs.mkdirSync(claudeHome, { recursive: true });
      vi.mocked(os.homedir).mockReturnValue(fakeHome);

      // Project is inside ~/.claude/
      const projectDir = path.join(claudeHome, 'my-project');
      fs.mkdirSync(projectDir, { recursive: true });

      await ensureClaudeMdImports(projectDir);

      // Verify files created in projectDir, not in parent ~/.claude/
      expect(fs.existsSync(path.join(projectDir, 'CLAUDE.md'))).toBe(true);
      expect(fs.existsSync(path.join(projectDir, '.goodvibes', 'GOODVIBES.md'))).toBe(true);
      
      // Parent ~/.claude/ should not have project-specific files
      expect(fs.existsSync(path.join(claudeHome, '.goodvibes', 'GOODVIBES.md'))).toBe(false);
    });

    it('falls back to highest ancestor CLAUDE.md', async () => {
      // Setup: No ~/.claude/ available
      vi.mocked(os.homedir).mockReturnValue(path.join(tmpDir, 'nonexistent'));

      // Create ancestor structure: ancestor -> parent -> project
      const ancestorDir = path.join(tmpDir, 'ancestor');
      const parentDir = path.join(ancestorDir, 'parent');
      const projectDir = path.join(parentDir, 'project');
      fs.mkdirSync(projectDir, { recursive: true });

      // Create CLAUDE.md at ancestor level
      fs.writeFileSync(path.join(ancestorDir, 'CLAUDE.md'), '# Ancestor\n');

      await ensureClaudeMdImports(projectDir);

      // Verify files created at ancestor level
      expect(fs.existsSync(path.join(ancestorDir, '.goodvibes', 'GOODVIBES.md'))).toBe(true);
      expect(fs.existsSync(path.join(projectDir, 'CLAUDE.md'))).toBe(false);
      expect(fs.existsSync(path.join(projectDir, '.goodvibes', 'GOODVIBES.md'))).toBe(false);
    });

    it('falls back to projectDir when no other option', async () => {
      // Setup: No ~/.claude/, no ancestor CLAUDE.md
      vi.mocked(os.homedir).mockReturnValue(path.join(tmpDir, 'nonexistent'));

      const projectDir = path.join(tmpDir, 'standalone-project');
      fs.mkdirSync(projectDir, { recursive: true });

      await ensureClaudeMdImports(projectDir);

      // Verify files created in projectDir
      expect(fs.existsSync(path.join(projectDir, 'CLAUDE.md'))).toBe(true);
      expect(fs.existsSync(path.join(projectDir, '.goodvibes', 'GOODVIBES.md'))).toBe(true);
    });

    it('prefers ~/.claude/ over ancestor CLAUDE.md', async () => {
      // Setup: Both ~/.claude/ and ancestor CLAUDE.md exist
      const claudeHome = path.join(fakeHome, '.claude');
      fs.mkdirSync(claudeHome, { recursive: true });
      vi.mocked(os.homedir).mockReturnValue(fakeHome);

      const ancestorDir = path.join(tmpDir, 'ancestor');
      const projectDir = path.join(ancestorDir, 'project');
      fs.mkdirSync(projectDir, { recursive: true });
      fs.writeFileSync(path.join(ancestorDir, 'CLAUDE.md'), '# Ancestor\n');

      await ensureClaudeMdImports(projectDir);

      // Verify ~/.claude/ wins
      expect(fs.existsSync(path.join(claudeHome, 'CLAUDE.md'))).toBe(true);
      expect(fs.existsSync(path.join(claudeHome, '.goodvibes', 'GOODVIBES.md'))).toBe(true);
      
      // Ancestor should only have its original CLAUDE.md
      expect(fs.existsSync(path.join(ancestorDir, '.goodvibes', 'GOODVIBES.md'))).toBe(false);
    });
  });

  // =============================================================================
  // CLAUDE.md Creation Tests
  // =============================================================================

  describe('CLAUDE.md Creation', () => {
    it('creates new CLAUDE.md with import when missing', async () => {
      vi.mocked(os.homedir).mockReturnValue(path.join(tmpDir, 'nonexistent'));

      const projectDir = path.join(tmpDir, 'new-project');
      fs.mkdirSync(projectDir, { recursive: true });

      await ensureClaudeMdImports(projectDir);

      const claudeMdPath = path.join(projectDir, 'CLAUDE.md');
      const content = fs.readFileSync(claudeMdPath, 'utf-8');
      
      expect(content).toBe('<!-- GOODVIBES IMPORTS -->\n@.goodvibes/GOODVIBES.md\n');
    });

    it('appends import to existing CLAUDE.md without marker', async () => {
      vi.mocked(os.homedir).mockReturnValue(path.join(tmpDir, 'nonexistent'));

      const projectDir = path.join(tmpDir, 'existing-project');
      fs.mkdirSync(projectDir, { recursive: true });

      const claudeMdPath = path.join(projectDir, 'CLAUDE.md');
      const originalContent = '# My Project\n\nSome instructions\n';
      fs.writeFileSync(claudeMdPath, originalContent);

      await ensureClaudeMdImports(projectDir);

      const content = fs.readFileSync(claudeMdPath, 'utf-8');
      
      expect(content).toContain(originalContent);
      expect(content).toContain('<!-- GOODVIBES IMPORTS -->');
      expect(content).toContain('@.goodvibes/GOODVIBES.md');
    });

    it('no-op when CLAUDE.md already has import marker', async () => {
      vi.mocked(os.homedir).mockReturnValue(path.join(tmpDir, 'nonexistent'));

      const projectDir = path.join(tmpDir, 'marked-project');
      fs.mkdirSync(projectDir, { recursive: true });

      const claudeMdPath = path.join(projectDir, 'CLAUDE.md');
      const originalContent = '# Project\n\n<!-- GOODVIBES IMPORTS -->\n@.goodvibes/GOODVIBES.md\n';
      fs.writeFileSync(claudeMdPath, originalContent);

      const statsBefore = fs.statSync(claudeMdPath);

      await ensureClaudeMdImports(projectDir);

      const statsAfter = fs.statSync(claudeMdPath);
      const content = fs.readFileSync(claudeMdPath, 'utf-8');
      
      expect(content).toBe(originalContent);
      expect(statsAfter.mtimeMs).toBe(statsBefore.mtimeMs);
    });

    it('preserves existing content when appending', async () => {
      vi.mocked(os.homedir).mockReturnValue(path.join(tmpDir, 'nonexistent'));

      const projectDir = path.join(tmpDir, 'multiline-project');
      fs.mkdirSync(projectDir, { recursive: true });

      const claudeMdPath = path.join(projectDir, 'CLAUDE.md');
      const originalContent = '# Header\n\nLine 1\nLine 2\nLine 3\n';
      fs.writeFileSync(claudeMdPath, originalContent);

      await ensureClaudeMdImports(projectDir);

      const content = fs.readFileSync(claudeMdPath, 'utf-8');
      
      // Original content should be intact
      expect(content.startsWith(originalContent)).toBe(true);
      // Import should be appended
      expect(content.endsWith('<!-- GOODVIBES IMPORTS -->\n@.goodvibes/GOODVIBES.md\n')).toBe(true);
    });
  });

  // =============================================================================
  // .goodvibes/GOODVIBES.md Tests
  // =============================================================================

  describe('.goodvibes/GOODVIBES.md', () => {
    it('creates GOODVIBES.md with correct content', async () => {
      vi.mocked(os.homedir).mockReturnValue(path.join(tmpDir, 'nonexistent'));

      const projectDir = path.join(tmpDir, 'goodvibes-test');
      fs.mkdirSync(projectDir, { recursive: true });

      await ensureClaudeMdImports(projectDir);

      const goodvibesMdPath = path.join(projectDir, '.goodvibes', 'GOODVIBES.md');
      const content = fs.readFileSync(goodvibesMdPath, 'utf-8');
      
      expect(content).toContain('<!-- UPGRADE NOTIFICATIONS -->');
      expect(content).toContain('@prompt/UPGRADE-NOTIFICATIONS.md');
      expect(content).toContain('<!-- PRIMARY GOALS -->');
      expect(content).toContain('@prompt/PRIMARY-GOALS.md');
      expect(content).toContain('<!-- CORE PRINCIPLES -->');
      expect(content).toContain('@prompt/CORE-PRINCIPLES.md');
      expect(content).toContain('<!-- SUBAGENT PROTOCOL -->');
      expect(content).toContain('@prompt/SUBAGENT-PROTOCOL.md');
      expect(content).toContain('<!-- SKILL AWARENESS -->');
      expect(content).toContain('@prompt/SKILLS.md');
    });

    it('creates parent directories', async () => {
      vi.mocked(os.homedir).mockReturnValue(path.join(tmpDir, 'nonexistent'));

      const projectDir = path.join(tmpDir, 'deep-project');
      fs.mkdirSync(projectDir, { recursive: true });

      await ensureClaudeMdImports(projectDir);

      const goodvibesDir = path.join(projectDir, '.goodvibes');
      expect(fs.existsSync(goodvibesDir)).toBe(true);
      expect(fs.statSync(goodvibesDir).isDirectory()).toBe(true);
    });

    it('skips write when content unchanged', async () => {
      vi.mocked(os.homedir).mockReturnValue(path.join(tmpDir, 'nonexistent'));

      const projectDir = path.join(tmpDir, 'unchanged-project');
      fs.mkdirSync(projectDir, { recursive: true });

      // First write
      await ensureClaudeMdImports(projectDir);

      const goodvibesMdPath = path.join(projectDir, '.goodvibes', 'GOODVIBES.md');
      const statsBefore = fs.statSync(goodvibesMdPath);

      // Wait a bit to ensure mtime would differ if file was rewritten
      await new Promise(resolve => setTimeout(resolve, 10));

      // Second write
      await ensureClaudeMdImports(projectDir);

      const statsAfter = fs.statSync(goodvibesMdPath);
      
      // mtime should be identical (file not rewritten)
      expect(statsAfter.mtimeMs).toBe(statsBefore.mtimeMs);
    });
  });

  // =============================================================================
  // Prompt Files Tests
  // =============================================================================

  describe('Prompt Files', () => {
    it('creates all 5 prompt files', async () => {
      vi.mocked(os.homedir).mockReturnValue(path.join(tmpDir, 'nonexistent'));

      const projectDir = path.join(tmpDir, 'prompt-test');
      fs.mkdirSync(projectDir, { recursive: true });

      await ensureClaudeMdImports(projectDir);

      const promptDir = path.join(projectDir, '.goodvibes', 'prompt');
      
      expect(fs.existsSync(path.join(promptDir, 'UPGRADE-NOTIFICATIONS.md'))).toBe(true);
      expect(fs.existsSync(path.join(promptDir, 'PRIMARY-GOALS.md'))).toBe(true);
      expect(fs.existsSync(path.join(promptDir, 'CORE-PRINCIPLES.md'))).toBe(true);
      expect(fs.existsSync(path.join(promptDir, 'SUBAGENT-PROTOCOL.md'))).toBe(true);
      expect(fs.existsSync(path.join(promptDir, 'SKILLS.md'))).toBe(true);
    });

    it('UPGRADE-NOTIFICATIONS.md has correct content', async () => {
      vi.mocked(os.homedir).mockReturnValue(path.join(tmpDir, 'nonexistent'));

      const projectDir = path.join(tmpDir, 'upgrade-test');
      fs.mkdirSync(projectDir, { recursive: true });

      await ensureClaudeMdImports(projectDir);

      const filePath = path.join(projectDir, '.goodvibes', 'prompt', 'UPGRADE-NOTIFICATIONS.md');
      const content = fs.readFileSync(filePath, 'utf-8');
      
      expect(content).toContain('TOOL UPGRADES AVAILABLE!');
      expect(content).toContain('precision_engine');
      expect(content).toContain('Read, Edit, Write, Glob, Grep, WebFetch');
    });

    it('PRIMARY-GOALS.md has correct content', async () => {
      vi.mocked(os.homedir).mockReturnValue(path.join(tmpDir, 'nonexistent'));

      const projectDir = path.join(tmpDir, 'goals-test');
      fs.mkdirSync(projectDir, { recursive: true });

      await ensureClaudeMdImports(projectDir);

      const filePath = path.join(projectDir, '.goodvibes', 'prompt', 'PRIMARY-GOALS.md');
      const content = fs.readFileSync(filePath, 'utf-8');
      
      expect(content).toContain('## MANDATORY');
      expect(content).toContain('Score 9.5 or higher');
      expect(content).toContain('token-efficient');
    });

    it('CORE-PRINCIPLES.md has correct content', async () => {
      vi.mocked(os.homedir).mockReturnValue(path.join(tmpDir, 'nonexistent'));

      const projectDir = path.join(tmpDir, 'principles-test');
      fs.mkdirSync(projectDir, { recursive: true });

      await ensureClaudeMdImports(projectDir);

      const filePath = path.join(projectDir, '.goodvibes', 'prompt', 'CORE-PRINCIPLES.md');
      const content = fs.readFileSync(filePath, 'utf-8');
      
      expect(content).toContain('## MANDATORY');
      expect(content).toContain('<gv> directives');
      expect(content).toContain('precision_engine');
    });

    it('SUBAGENT-PROTOCOL.md has correct content', async () => {
      vi.mocked(os.homedir).mockReturnValue(path.join(tmpDir, 'nonexistent'));

      const projectDir = path.join(tmpDir, 'subagent-test');
      fs.mkdirSync(projectDir, { recursive: true });

      await ensureClaudeMdImports(projectDir);

      const filePath = path.join(projectDir, '.goodvibes', 'prompt', 'SUBAGENT-PROTOCOL.md');
      const content = fs.readFileSync(filePath, 'utf-8');
      
      expect(content).toContain('## MANDATORY');
      expect(content).toContain('GPA Loops');
      expect(content).toContain('precision_engine');
    });

    it('SKILLS.md has correct content', async () => {
      vi.mocked(os.homedir).mockReturnValue(path.join(tmpDir, 'nonexistent'));

      const projectDir = path.join(tmpDir, 'skills-test');
      fs.mkdirSync(projectDir, { recursive: true });

      await ensureClaudeMdImports(projectDir);

      const filePath = path.join(projectDir, '.goodvibes', 'prompt', 'SKILLS.md');
      const content = fs.readFileSync(filePath, 'utf-8');
      
      expect(content).toContain('## SKILL AWARENESS');
      
      // Tier headers
      expect(content).toContain('### Protocol Skills');
      expect(content).toContain('### Orchestration Skills');
      expect(content).toContain('### Outcome Skills');
      expect(content).toContain('### Quality Skills');
      
      // One skill from each tier
      expect(content).toContain('precision-mastery');
      expect(content).toContain('task-orchestration');
      expect(content).toContain('api-design');
      expect(content).toContain('security-audit');
      
      // How to Use section
      expect(content).toContain('### How to Use Skills');
      expect(content).toContain('get_skill_content');
    });

    it('creates prompt directory', async () => {
      vi.mocked(os.homedir).mockReturnValue(path.join(tmpDir, 'nonexistent'));

      const projectDir = path.join(tmpDir, 'dir-test');
      fs.mkdirSync(projectDir, { recursive: true });

      await ensureClaudeMdImports(projectDir);

      const promptDir = path.join(projectDir, '.goodvibes', 'prompt');
      expect(fs.existsSync(promptDir)).toBe(true);
      expect(fs.statSync(promptDir).isDirectory()).toBe(true);
    });
  });

  // =============================================================================
  // Error Handling Tests
  // =============================================================================

  describe('Error Handling', () => {
    it('never throws on invalid path', async () => {
      vi.mocked(os.homedir).mockReturnValue(path.join(tmpDir, 'nonexistent'));

      // Pass an invalid path (null cast to string will cause internal errors)
      const invalidPath = '/dev/null/impossible/path';

      // Should not throw
      await expect(ensureClaudeMdImports(invalidPath)).resolves.toBeUndefined();
    });

    it('logs errors via logError', async () => {
      const { logError } = await import('../../shared/index.js');
      vi.mocked(os.homedir).mockReturnValue(path.join(tmpDir, 'nonexistent'));

      // Create a path that will cause write errors (file as directory)
      const projectDir = path.join(tmpDir, 'error-test');
      fs.mkdirSync(projectDir, { recursive: true });
      
      // Create CLAUDE.md as a read-only file to trigger write errors
      const claudeMdPath = path.join(projectDir, 'CLAUDE.md');
      fs.writeFileSync(claudeMdPath, 'existing');
      fs.chmodSync(claudeMdPath, 0o444); // Read-only

      // Create .goodvibes as a file (not directory) to cause mkdir errors
      const goodvibesPath = path.join(projectDir, '.goodvibes');
      fs.writeFileSync(goodvibesPath, 'file');

      await ensureClaudeMdImports(projectDir);

      // Should have logged an error
      expect(vi.mocked(logError)).toHaveBeenCalled();
      
      // Cleanup
      fs.chmodSync(claudeMdPath, 0o644);
    });
  });

  // =============================================================================
  // Idempotency Tests
  // =============================================================================

  describe('Idempotency', () => {
    it('multiple calls are idempotent', async () => {
      vi.mocked(os.homedir).mockReturnValue(path.join(tmpDir, 'nonexistent'));

      const projectDir = path.join(tmpDir, 'idempotent-test');
      fs.mkdirSync(projectDir, { recursive: true });

      // First call
      await ensureClaudeMdImports(projectDir);

      // Get all file contents
      const claudeMdPath = path.join(projectDir, 'CLAUDE.md');
      const goodvibesMdPath = path.join(projectDir, '.goodvibes', 'GOODVIBES.md');
      const upgradeNotificationsPath = path.join(projectDir, '.goodvibes', 'prompt', 'UPGRADE-NOTIFICATIONS.md');
      
      const claudeMdContent1 = fs.readFileSync(claudeMdPath, 'utf-8');
      const goodvibesMdContent1 = fs.readFileSync(goodvibesMdPath, 'utf-8');
      const upgradeNotificationsContent1 = fs.readFileSync(upgradeNotificationsPath, 'utf-8');

      // Second call
      await ensureClaudeMdImports(projectDir);

      const claudeMdContent2 = fs.readFileSync(claudeMdPath, 'utf-8');
      const goodvibesMdContent2 = fs.readFileSync(goodvibesMdPath, 'utf-8');
      const upgradeNotificationsContent2 = fs.readFileSync(upgradeNotificationsPath, 'utf-8');

      // Content should be identical
      expect(claudeMdContent2).toBe(claudeMdContent1);
      expect(goodvibesMdContent2).toBe(goodvibesMdContent1);
      expect(upgradeNotificationsContent2).toBe(upgradeNotificationsContent1);

      // Third call for good measure
      await ensureClaudeMdImports(projectDir);

      const claudeMdContent3 = fs.readFileSync(claudeMdPath, 'utf-8');
      const goodvibesMdContent3 = fs.readFileSync(goodvibesMdPath, 'utf-8');

      expect(claudeMdContent3).toBe(claudeMdContent1);
      expect(goodvibesMdContent3).toBe(goodvibesMdContent1);
    });
  });
});
