/**
 * Comprehensive tests for shared/gitignore.ts
 * Target: 100% coverage (lines, branches, functions)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as path from 'path';

// =============================================================================
// Mock Setup
// =============================================================================

const mockAccess = vi.fn();
const mockReadFile = vi.fn();
const mockWriteFile = vi.fn();

vi.mock('fs/promises', () => ({
  access: (...args: unknown[]) => mockAccess(...args),
  readFile: (...args: unknown[]) => mockReadFile(...args),
  writeFile: (...args: unknown[]) => mockWriteFile(...args),
}));

// =============================================================================
// Tests
// =============================================================================

describe('gitignore', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ===========================================================================
  // SECURITY_GITIGNORE_ENTRIES
  // ===========================================================================

  describe('SECURITY_GITIGNORE_ENTRIES', () => {
    it('should export security entries as a non-empty object', async () => {
      const { SECURITY_GITIGNORE_ENTRIES } =
        await import('../../shared/gitignore.js');

      expect(SECURITY_GITIGNORE_ENTRIES).toBeDefined();
      expect(typeof SECURITY_GITIGNORE_ENTRIES).toBe('object');
      expect(Object.keys(SECURITY_GITIGNORE_ENTRIES).length).toBeGreaterThan(0);
    });

    it('should contain GoodVibes plugin state category', async () => {
      const { SECURITY_GITIGNORE_ENTRIES } =
        await import('../../shared/gitignore.js');

      expect(
        SECURITY_GITIGNORE_ENTRIES['GoodVibes plugin state']
      ).toBeDefined();
      expect(SECURITY_GITIGNORE_ENTRIES['GoodVibes plugin state']).toContain(
        '.goodvibes/'
      );
    });

    it('should contain Environment files category', async () => {
      const { SECURITY_GITIGNORE_ENTRIES } =
        await import('../../shared/gitignore.js');

      expect(SECURITY_GITIGNORE_ENTRIES['Environment files']).toBeDefined();
      expect(SECURITY_GITIGNORE_ENTRIES['Environment files']).toContain('.env');
      expect(SECURITY_GITIGNORE_ENTRIES['Environment files']).toContain(
        '.env.local'
      );
    });

    it('should contain Secret files category', async () => {
      const { SECURITY_GITIGNORE_ENTRIES } =
        await import('../../shared/gitignore.js');

      expect(SECURITY_GITIGNORE_ENTRIES['Secret files']).toBeDefined();
      expect(SECURITY_GITIGNORE_ENTRIES['Secret files']).toContain('*.pem');
      expect(SECURITY_GITIGNORE_ENTRIES['Secret files']).toContain('*.key');
      expect(SECURITY_GITIGNORE_ENTRIES['Secret files']).toContain(
        'credentials.json'
      );
    });

    it('should contain Cloud credentials category', async () => {
      const { SECURITY_GITIGNORE_ENTRIES } =
        await import('../../shared/gitignore.js');

      expect(SECURITY_GITIGNORE_ENTRIES['Cloud credentials']).toBeDefined();
      expect(SECURITY_GITIGNORE_ENTRIES['Cloud credentials']).toContain(
        '.aws/'
      );
      expect(SECURITY_GITIGNORE_ENTRIES['Cloud credentials']).toContain(
        '.gcp/'
      );
    });

    it('should contain Database files category', async () => {
      const { SECURITY_GITIGNORE_ENTRIES } =
        await import('../../shared/gitignore.js');

      expect(SECURITY_GITIGNORE_ENTRIES['Database files']).toBeDefined();
      expect(SECURITY_GITIGNORE_ENTRIES['Database files']).toContain('*.db');
      expect(SECURITY_GITIGNORE_ENTRIES['Database files']).toContain(
        '*.sqlite'
      );
    });

    it('should contain Log files category', async () => {
      const { SECURITY_GITIGNORE_ENTRIES } =
        await import('../../shared/gitignore.js');

      expect(SECURITY_GITIGNORE_ENTRIES['Log files']).toBeDefined();
      expect(SECURITY_GITIGNORE_ENTRIES['Log files']).toContain('*.log');
      expect(SECURITY_GITIGNORE_ENTRIES['Log files']).toContain('logs/');
    });

    it('should have arrays for all categories', async () => {
      const { SECURITY_GITIGNORE_ENTRIES } =
        await import('../../shared/gitignore.js');

      for (const [category, patterns] of Object.entries(
        SECURITY_GITIGNORE_ENTRIES
      )) {
        expect(Array.isArray(patterns)).toBe(true);
        expect(patterns.length).toBeGreaterThan(0);
      }
    });
  });

  // ===========================================================================
  // ensureSecureGitignore
  // ===========================================================================

  describe('ensureSecureGitignore', () => {
    // -------------------------------------------------------------------------
    // Case: .gitignore does not exist - creates new file with all entries
    // -------------------------------------------------------------------------
    it('should create new .gitignore with all security entries when file does not exist', async () => {
      mockAccess.mockRejectedValue(
        new Error('ENOENT: no such file or directory')
      );
      mockWriteFile.mockResolvedValue(undefined);

      const { ensureSecureGitignore, SECURITY_GITIGNORE_ENTRIES } =
        await import('../../shared/gitignore.js');
      const cwd = '/project/root';

      await ensureSecureGitignore(cwd);

      expect(mockAccess).toHaveBeenCalledWith(path.join(cwd, '.gitignore'));
      expect(mockReadFile).not.toHaveBeenCalled();
      expect(mockWriteFile).toHaveBeenCalledTimes(1);

      const writtenContent = mockWriteFile.mock.calls[0][1] as string;

      // Verify all categories are present
      for (const [section, patterns] of Object.entries(
        SECURITY_GITIGNORE_ENTRIES
      )) {
        expect(writtenContent).toContain(`# ${section}`);
        for (const pattern of patterns) {
          expect(writtenContent).toContain(pattern);
        }
      }
    });

    // -------------------------------------------------------------------------
    // Case: .gitignore exists but is empty - adds all entries
    // -------------------------------------------------------------------------
    it('should add all security entries to empty .gitignore', async () => {
      mockAccess.mockResolvedValue(undefined);
      mockReadFile.mockResolvedValue('');
      mockWriteFile.mockResolvedValue(undefined);

      const { ensureSecureGitignore, SECURITY_GITIGNORE_ENTRIES } =
        await import('../../shared/gitignore.js');
      const cwd = '/test/project';

      await ensureSecureGitignore(cwd);

      expect(mockAccess).toHaveBeenCalledWith(path.join(cwd, '.gitignore'));
      expect(mockReadFile).toHaveBeenCalledWith(
        path.join(cwd, '.gitignore'),
        'utf-8'
      );
      expect(mockWriteFile).toHaveBeenCalledTimes(1);

      const writtenContent = mockWriteFile.mock.calls[0][1] as string;

      // Verify all entries are added
      for (const patterns of Object.values(SECURITY_GITIGNORE_ENTRIES)) {
        for (const pattern of patterns) {
          expect(writtenContent).toContain(pattern);
        }
      }
    });

    // -------------------------------------------------------------------------
    // Case: .gitignore exists with all entries already present - no changes
    // -------------------------------------------------------------------------
    it('should not modify .gitignore when all security entries already exist', async () => {
      const existingContent = `# Existing gitignore
node_modules/

# GoodVibes plugin state
.goodvibes/

# Environment files
.env
.env.local
.env.*.local
*.env

# Secret files
*.pem
*.key
credentials.json
secrets.json
service-account*.json

# Cloud credentials
.aws/
.gcp/
kubeconfig

# Database files
*.db
*.sqlite
*.sqlite3
prisma/*.db

# Log files
*.log
logs/
`;
      mockAccess.mockResolvedValue(undefined);
      mockReadFile.mockResolvedValue(existingContent);

      const { ensureSecureGitignore } =
        await import('../../shared/gitignore.js');
      const cwd = '/project';

      await ensureSecureGitignore(cwd);

      expect(mockWriteFile).not.toHaveBeenCalled();
    });

    // -------------------------------------------------------------------------
    // Case: .gitignore exists with some entries missing - adds only missing
    // -------------------------------------------------------------------------
    it('should add only missing security entries to partial .gitignore', async () => {
      const partialContent = `# Existing gitignore
node_modules/

# Some security entries
.env
*.log
`;
      mockAccess.mockResolvedValue(undefined);
      mockReadFile.mockResolvedValue(partialContent);
      mockWriteFile.mockResolvedValue(undefined);

      const { ensureSecureGitignore } =
        await import('../../shared/gitignore.js');
      const cwd = '/partial/project';

      await ensureSecureGitignore(cwd);

      expect(mockWriteFile).toHaveBeenCalledTimes(1);

      const writtenContent = mockWriteFile.mock.calls[0][1] as string;

      // Should contain original content
      expect(writtenContent).toContain('node_modules/');

      // Should add missing entries
      expect(writtenContent).toContain('.goodvibes/');
      expect(writtenContent).toContain('.env.local');
      expect(writtenContent).toContain('*.pem');
      expect(writtenContent).toContain('.aws/');
      expect(writtenContent).toContain('*.db');
      expect(writtenContent).toContain('logs/');

      // Should not duplicate existing entries
      const envCount = (writtenContent.match(/^\.env$/gm) || []).length;
      expect(envCount).toBe(1);
    });

    // -------------------------------------------------------------------------
    // Case: .gitignore with trailing whitespace - properly trimmed
    // -------------------------------------------------------------------------
    it('should trim trailing whitespace from existing content', async () => {
      const contentWithWhitespace = `node_modules/
dist/


`;
      mockAccess.mockResolvedValue(undefined);
      mockReadFile.mockResolvedValue(contentWithWhitespace);
      mockWriteFile.mockResolvedValue(undefined);

      const { ensureSecureGitignore } =
        await import('../../shared/gitignore.js');

      await ensureSecureGitignore('/test');

      const writtenContent = mockWriteFile.mock.calls[0][1] as string;

      // Should start with trimmed original content followed by newline
      expect(writtenContent.startsWith('node_modules/\ndist/\n')).toBe(true);
      // Should not have multiple consecutive blank lines at the start
      expect(writtenContent).not.toMatch(/^node_modules\/\ndist\/\n\n\n/);
    });

    // -------------------------------------------------------------------------
    // Case: Verify section headers are added correctly
    // -------------------------------------------------------------------------
    it('should add section headers for each category with missing entries', async () => {
      mockAccess.mockResolvedValue(undefined);
      mockReadFile.mockResolvedValue('# Empty gitignore\n');
      mockWriteFile.mockResolvedValue(undefined);

      const { ensureSecureGitignore } =
        await import('../../shared/gitignore.js');

      await ensureSecureGitignore('/headers/test');

      const writtenContent = mockWriteFile.mock.calls[0][1] as string;

      expect(writtenContent).toContain('# GoodVibes plugin state');
      expect(writtenContent).toContain('# Environment files');
      expect(writtenContent).toContain('# Secret files');
      expect(writtenContent).toContain('# Cloud credentials');
      expect(writtenContent).toContain('# Database files');
      expect(writtenContent).toContain('# Log files');
    });

    // -------------------------------------------------------------------------
    // Case: Only one category missing
    // -------------------------------------------------------------------------
    it('should add only the category with missing entries', async () => {
      // All entries except GoodVibes plugin state
      const almostComplete = `# Environment files
.env
.env.local
.env.*.local
*.env

# Secret files
*.pem
*.key
credentials.json
secrets.json
service-account*.json

# Cloud credentials
.aws/
.gcp/
kubeconfig

# Database files
*.db
*.sqlite
*.sqlite3
prisma/*.db

# Log files
*.log
logs/
`;
      mockAccess.mockResolvedValue(undefined);
      mockReadFile.mockResolvedValue(almostComplete);
      mockWriteFile.mockResolvedValue(undefined);

      const { ensureSecureGitignore } =
        await import('../../shared/gitignore.js');

      await ensureSecureGitignore('/almost/complete');

      const writtenContent = mockWriteFile.mock.calls[0][1] as string;

      // Should only add the missing GoodVibes category
      expect(writtenContent).toContain('# GoodVibes plugin state');
      expect(writtenContent).toContain('.goodvibes/');

      // Count section headers - should only have one new one added
      const goodVibesMatches = writtenContent.match(
        /# GoodVibes plugin state/g
      );
      expect(goodVibesMatches?.length).toBe(1);
    });

    // -------------------------------------------------------------------------
    // Case: Handle different path formats
    // -------------------------------------------------------------------------
    it('should handle Windows-style paths', async () => {
      mockAccess.mockRejectedValue(new Error('ENOENT'));
      mockWriteFile.mockResolvedValue(undefined);

      const { ensureSecureGitignore } =
        await import('../../shared/gitignore.js');
      const cwd = 'C:\\Users\\test\\project';

      await ensureSecureGitignore(cwd);

      expect(mockAccess).toHaveBeenCalledWith(path.join(cwd, '.gitignore'));
      expect(mockWriteFile).toHaveBeenCalledWith(
        path.join(cwd, '.gitignore'),
        expect.any(String)
      );
    });

    it('should handle Unix-style paths', async () => {
      mockAccess.mockRejectedValue(new Error('ENOENT'));
      mockWriteFile.mockResolvedValue(undefined);

      const { ensureSecureGitignore } =
        await import('../../shared/gitignore.js');
      const cwd = '/home/user/project';

      await ensureSecureGitignore(cwd);

      expect(mockAccess).toHaveBeenCalledWith(path.join(cwd, '.gitignore'));
      expect(mockWriteFile).toHaveBeenCalledWith(
        path.join(cwd, '.gitignore'),
        expect.any(String)
      );
    });

    // -------------------------------------------------------------------------
    // Case: Content ends with newline properly
    // -------------------------------------------------------------------------
    it('should ensure content ends with a newline', async () => {
      mockAccess.mockRejectedValue(new Error('ENOENT'));
      mockWriteFile.mockResolvedValue(undefined);

      const { ensureSecureGitignore } =
        await import('../../shared/gitignore.js');

      await ensureSecureGitignore('/test');

      const writtenContent = mockWriteFile.mock.calls[0][1] as string;
      expect(writtenContent.endsWith('\n')).toBe(true);
    });

    // -------------------------------------------------------------------------
    // Case: Verify idempotency
    // -------------------------------------------------------------------------
    it('should be idempotent - running twice should not change result', async () => {
      mockAccess.mockResolvedValue(undefined);
      mockWriteFile.mockResolvedValue(undefined);

      // First run - empty file
      mockReadFile.mockResolvedValueOnce('');

      const { ensureSecureGitignore } =
        await import('../../shared/gitignore.js');

      await ensureSecureGitignore('/idempotent');

      const firstWriteContent = mockWriteFile.mock.calls[0][1] as string;

      // Second run - use the content from first write
      mockReadFile.mockResolvedValueOnce(firstWriteContent);
      vi.clearAllMocks();
      mockAccess.mockResolvedValue(undefined);
      mockReadFile.mockResolvedValue(firstWriteContent);

      await ensureSecureGitignore('/idempotent');

      // Should not write again since all entries exist
      expect(mockWriteFile).not.toHaveBeenCalled();
    });

    // -------------------------------------------------------------------------
    // Case: Partial entries within a category
    // -------------------------------------------------------------------------
    it('should add missing entries within a category that has some entries', async () => {
      const partialCategory = `# Environment files
.env
`;
      mockAccess.mockResolvedValue(undefined);
      mockReadFile.mockResolvedValue(partialCategory);
      mockWriteFile.mockResolvedValue(undefined);

      const { ensureSecureGitignore } =
        await import('../../shared/gitignore.js');

      await ensureSecureGitignore('/partial/category');

      const writtenContent = mockWriteFile.mock.calls[0][1] as string;

      // Should add the missing environment entries
      expect(writtenContent).toContain('.env.local');
      expect(writtenContent).toContain('.env.*.local');
      expect(writtenContent).toContain('*.env');

      // Original .env should still be there (not duplicated in the added section)
      expect(writtenContent).toContain('.env');
    });

    // -------------------------------------------------------------------------
    // Case: Error propagation
    // -------------------------------------------------------------------------
    it('should propagate writeFile errors', async () => {
      mockAccess.mockRejectedValue(new Error('ENOENT'));
      mockWriteFile.mockRejectedValue(new Error('EACCES: permission denied'));

      const { ensureSecureGitignore } =
        await import('../../shared/gitignore.js');

      await expect(ensureSecureGitignore('/readonly')).rejects.toThrow(
        'EACCES: permission denied'
      );
    });

    it('should propagate readFile errors (other than ENOENT)', async () => {
      mockAccess.mockResolvedValue(undefined);
      mockReadFile.mockRejectedValue(new Error('EACCES: permission denied'));

      const { ensureSecureGitignore } =
        await import('../../shared/gitignore.js');

      await expect(ensureSecureGitignore('/unreadable')).rejects.toThrow(
        'EACCES: permission denied'
      );
    });

    // -------------------------------------------------------------------------
    // Case: Empty cwd
    // -------------------------------------------------------------------------
    it('should handle empty string cwd', async () => {
      mockAccess.mockRejectedValue(new Error('ENOENT'));
      mockWriteFile.mockResolvedValue(undefined);

      const { ensureSecureGitignore } =
        await import('../../shared/gitignore.js');

      await ensureSecureGitignore('');

      expect(mockAccess).toHaveBeenCalledWith(path.join('', '.gitignore'));
      expect(mockWriteFile).toHaveBeenCalled();
    });

    // -------------------------------------------------------------------------
    // Case: Entries appear in different order in existing file
    // -------------------------------------------------------------------------
    it('should detect entries regardless of order in existing file', async () => {
      const reorderedContent = `# Log files
*.log
logs/

# Database files
*.db
*.sqlite
*.sqlite3
prisma/*.db

# Cloud credentials
.aws/
.gcp/
kubeconfig

# Secret files
*.pem
*.key
credentials.json
secrets.json
service-account*.json

# Environment files
.env
.env.local
.env.*.local
*.env

# GoodVibes plugin state
.goodvibes/
`;
      mockAccess.mockResolvedValue(undefined);
      mockReadFile.mockResolvedValue(reorderedContent);

      const { ensureSecureGitignore } =
        await import('../../shared/gitignore.js');

      await ensureSecureGitignore('/reordered');

      // All entries exist, should not write
      expect(mockWriteFile).not.toHaveBeenCalled();
    });

    // -------------------------------------------------------------------------
    // Case: Entries embedded in other content
    // -------------------------------------------------------------------------
    it('should detect entries even when surrounded by other content', async () => {
      const embeddedContent = `# My project gitignore
# Auto-generated

node_modules/
dist/
build/
.goodvibes/
.env
.env.local
.env.*.local
*.env
*.pem
*.key
credentials.json
secrets.json
service-account*.json
.aws/
.gcp/
kubeconfig
*.db
*.sqlite
*.sqlite3
prisma/*.db
*.log
logs/

# IDE files
.vscode/
.idea/
`;
      mockAccess.mockResolvedValue(undefined);
      mockReadFile.mockResolvedValue(embeddedContent);

      const { ensureSecureGitignore } =
        await import('../../shared/gitignore.js');

      await ensureSecureGitignore('/embedded');

      // All entries exist (without section headers), should not write
      expect(mockWriteFile).not.toHaveBeenCalled();
    });
  });

  // ===========================================================================
  // Edge Cases
  // ===========================================================================

  describe('edge cases', () => {
    it('should handle gitignore with only whitespace', async () => {
      mockAccess.mockResolvedValue(undefined);
      mockReadFile.mockResolvedValue('   \n\n   \n');
      mockWriteFile.mockResolvedValue(undefined);

      const { ensureSecureGitignore } =
        await import('../../shared/gitignore.js');

      await ensureSecureGitignore('/whitespace');

      expect(mockWriteFile).toHaveBeenCalled();
      const writtenContent = mockWriteFile.mock.calls[0][1] as string;
      expect(writtenContent).toContain('.goodvibes/');
    });

    it('should handle gitignore with comments only', async () => {
      mockAccess.mockResolvedValue(undefined);
      mockReadFile.mockResolvedValue(
        '# This is a comment\n# Another comment\n'
      );
      mockWriteFile.mockResolvedValue(undefined);

      const { ensureSecureGitignore } =
        await import('../../shared/gitignore.js');

      await ensureSecureGitignore('/comments');

      expect(mockWriteFile).toHaveBeenCalled();
      const writtenContent = mockWriteFile.mock.calls[0][1] as string;
      expect(writtenContent).toContain('# This is a comment');
      expect(writtenContent).toContain('.goodvibes/');
    });

    it('should handle entry that is substring of existing entry', async () => {
      // *.env is a pattern we want to add
      // But if someone has "production.env" it shouldn't match *.env pattern check
      const contentWithSimilar = `.env
.env.production
my-app.env.backup
`;
      mockAccess.mockResolvedValue(undefined);
      mockReadFile.mockResolvedValue(contentWithSimilar);
      mockWriteFile.mockResolvedValue(undefined);

      const { ensureSecureGitignore } =
        await import('../../shared/gitignore.js');

      await ensureSecureGitignore('/substring');

      // *.env should be added because it doesn't exist literally
      expect(mockWriteFile).toHaveBeenCalled();
      const writtenContent = mockWriteFile.mock.calls[0][1] as string;
      expect(writtenContent).toContain('*.env');
    });

    it('should handle very long existing gitignore content', async () => {
      const longContent =
        '# Many entries\n' + 'entry-'.padEnd(50, 'x') + '\n'.repeat(1000);
      mockAccess.mockResolvedValue(undefined);
      mockReadFile.mockResolvedValue(longContent);
      mockWriteFile.mockResolvedValue(undefined);

      const { ensureSecureGitignore } =
        await import('../../shared/gitignore.js');

      await ensureSecureGitignore('/long');

      expect(mockWriteFile).toHaveBeenCalled();
    });

    it('should handle cwd with trailing slash', async () => {
      mockAccess.mockRejectedValue(new Error('ENOENT'));
      mockWriteFile.mockResolvedValue(undefined);

      const { ensureSecureGitignore } =
        await import('../../shared/gitignore.js');

      await ensureSecureGitignore('/project/');

      expect(mockAccess).toHaveBeenCalledWith(
        path.join('/project/', '.gitignore')
      );
    });

    it('should handle special characters in path', async () => {
      mockAccess.mockRejectedValue(new Error('ENOENT'));
      mockWriteFile.mockResolvedValue(undefined);

      const { ensureSecureGitignore } =
        await import('../../shared/gitignore.js');
      const specialPath = '/path with spaces/and-dashes/under_scores';

      await ensureSecureGitignore(specialPath);

      expect(mockAccess).toHaveBeenCalledWith(
        path.join(specialPath, '.gitignore')
      );
      expect(mockWriteFile).toHaveBeenCalledWith(
        path.join(specialPath, '.gitignore'),
        expect.any(String)
      );
    });
  });
});
