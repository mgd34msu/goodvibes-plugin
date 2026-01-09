/**
 * Unit tests for scaffolding handler
 *
 * Tests cover:
 * - handleScaffoldProject
 * - handleListTemplates
 * - Template copying
 * - Variable substitution
 * - Post-create commands
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as yaml from 'js-yaml';

import {
  handleScaffoldProject,
  handleListTemplates,
} from '../../handlers/scaffolding.js';
import { sampleTemplateRegistry, sampleTemplateConfig } from '../setup.js';

// Mock modules
vi.mock('fs');
vi.mock('../../config.js', () => ({
  PLUGIN_ROOT: '/mock/plugin/root',
  PROJECT_ROOT: '/mock/project/root',
}));

vi.mock('../../utils.js', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual as object,
    safeExec: vi.fn().mockResolvedValue({ stdout: 'success', stderr: '', error: undefined }),
    detectPackageManager: vi.fn().mockResolvedValue('npm'),
  };
});

describe('scaffolding handlers', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    // Re-setup mocks after clearing
    const utils = await import('../../utils.js');
    vi.mocked(utils.safeExec).mockResolvedValue({ stdout: 'success', stderr: '', error: undefined });
    vi.mocked(utils.detectPackageManager).mockResolvedValue('npm');
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('handleListTemplates', () => {
    it('should list all templates', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.promises.readFile).mockResolvedValue(yaml.dump(sampleTemplateRegistry));

      const result = await handleListTemplates({});
      const data = JSON.parse(result.content[0].text);

      expect(data.templates.length).toBe(2);
      expect(data.total).toBe(2);
    });

    it('should filter templates by category', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.promises.readFile).mockResolvedValue(yaml.dump(sampleTemplateRegistry));

      const result = await handleListTemplates({ category: 'minimal' });
      const data = JSON.parse(result.content[0].text);

      expect(data.templates.length).toBe(1);
      expect(data.templates[0].category).toBe('minimal');
    });

    it('should return available categories', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.promises.readFile).mockResolvedValue(yaml.dump(sampleTemplateRegistry));

      const result = await handleListTemplates({});
      const data = JSON.parse(result.content[0].text);

      expect(data.categories).toContain('minimal');
      expect(data.categories).toContain('full');
    });

    it('should throw error when registry not found', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);

      await expect(handleListTemplates({})).rejects.toThrow('Template registry not found');
    });

    it('should handle registry without templates array', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.promises.readFile).mockResolvedValue(yaml.dump({
        // Registry exists but has no templates field
        version: '1.0.0',
      }));

      const result = await handleListTemplates({});
      const data = JSON.parse(result.content[0].text);

      // Should default to empty array
      expect(data.templates).toEqual([]);
      expect(data.total).toBe(0);
    });

    it('should include template metadata', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.promises.readFile).mockResolvedValue(yaml.dump(sampleTemplateRegistry));

      const result = await handleListTemplates({});
      const data = JSON.parse(result.content[0].text);

      expect(data.templates[0]).toHaveProperty('name');
      expect(data.templates[0]).toHaveProperty('description');
      expect(data.templates[0]).toHaveProperty('stack');
      expect(data.templates[0]).toHaveProperty('complexity');
    });

    describe('response format', () => {
      it('should return properly formatted response', async () => {
        vi.mocked(fs.existsSync).mockReturnValue(true);
        vi.mocked(fs.promises.readFile).mockResolvedValue(yaml.dump(sampleTemplateRegistry));

        const result = await handleListTemplates({});

        expect(result).toHaveProperty('content');
        expect(result.content).toHaveLength(1);
        expect(result.content[0]).toHaveProperty('type', 'text');
      });

      it('should return valid JSON', async () => {
        vi.mocked(fs.existsSync).mockReturnValue(true);
        vi.mocked(fs.promises.readFile).mockResolvedValue(yaml.dump(sampleTemplateRegistry));

        const result = await handleListTemplates({});

        expect(() => JSON.parse(result.content[0].text)).not.toThrow();
      });
    });
  });

  describe('handleScaffoldProject', () => {
    beforeEach(() => {
      // Setup basic mocks for template existence
      vi.mocked(fs.existsSync).mockImplementation((p: fs.PathLike) => {
        const pathStr = String(p);
        return (
          pathStr.includes('next-app') ||
          pathStr.includes('next-saas') ||
          pathStr.includes('template.yaml') ||
          pathStr.includes('files')
        );
      });
      vi.mocked(fs.promises.readFile).mockImplementation(async (p) => {
        if (String(p).includes('template.yaml')) {
          return yaml.dump(sampleTemplateConfig);
        }
        return '{"name": "{{projectName}}", "author": "{{author}}"}';
      });
      // Mock readdir to return only files (no directories to avoid recursion)
      const mockDirent = {
        name: 'package.json.hbs',
        isDirectory: () => false,
        isFile: () => true,
        isBlockDevice: () => false,
        isCharacterDevice: () => false,
        isFIFO: () => false,
        isSocket: () => false,
        isSymbolicLink: () => false,
        parentPath: '',
      };
      // @ts-expect-error - Vitest mock type inference issue with Node.js fs.Dirent generic parameter
      vi.mocked(fs.promises.readdir).mockResolvedValue([mockDirent]);
      vi.mocked(fs.promises.mkdir).mockResolvedValue(undefined);
      vi.mocked(fs.promises.writeFile).mockResolvedValue(undefined);
    });

    it('should throw error when template not found', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);

      await expect(
        handleScaffoldProject({
          template: 'nonexistent-template',
          output_dir: './new-project',
        })
      ).rejects.toThrow('Template not found: nonexistent-template');
    });

    it('should throw error when template.yaml not found', async () => {
      vi.mocked(fs.existsSync).mockImplementation((p: fs.PathLike) => {
        return String(p).includes('next-app') && !String(p).includes('template.yaml');
      });

      await expect(
        handleScaffoldProject({
          template: 'next-app',
          output_dir: './new-project',
        })
      ).rejects.toThrow('Template config not found');
    });

    it('should create output directory', async () => {
      const result = await handleScaffoldProject({
        template: 'next-app',
        output_dir: './my-new-project',
      });

      expect(fs.promises.mkdir).toHaveBeenCalled();
    });

    it('should apply variable substitutions', async () => {
      const writeCalls: Array<{ path: string; content: string }> = [];
      vi.mocked(fs.promises.writeFile).mockImplementation(async (p, content) => {
        writeCalls.push({ path: String(p), content: String(content) });
      });
      vi.mocked(fs.promises.readFile).mockImplementation(async (p) => {
        if (String(p).includes('template.yaml')) {
          return yaml.dump(sampleTemplateConfig);
        }
        return '{"name": "{{projectName}}", "author": "{{author}}"}';
      });

      await handleScaffoldProject({
        template: 'next-app',
        output_dir: './test-project',
        variables: { projectName: 'my-app', author: 'Test Author' },
      });

      const packageWrite = writeCalls.find(c => c.path.includes('package.json'));
      if (packageWrite) {
        expect(packageWrite.content).toContain('my-app');
        expect(packageWrite.content).toContain('Test Author');
      }
    });

    it('should remove .hbs extension from output files', async () => {
      const writeCalls: string[] = [];
      vi.mocked(fs.promises.writeFile).mockImplementation(async (p) => {
        writeCalls.push(String(p));
      });

      await handleScaffoldProject({
        template: 'next-app',
        output_dir: './test-project',
      });

      expect(writeCalls.every(p => !p.endsWith('.hbs'))).toBe(true);
    });

    it('should recursively copy directories', async () => {
      // Setup mocks with a directory entry that contains files
      const mockFileDirent = {
        name: 'index.ts',
        isDirectory: () => false,
        isFile: () => true,
        isBlockDevice: () => false,
        isCharacterDevice: () => false,
        isFIFO: () => false,
        isSocket: () => false,
        isSymbolicLink: () => false,
        parentPath: '',
      };
      const mockDirDirent = {
        name: 'src',
        isDirectory: () => true,
        isFile: () => false,
        isBlockDevice: () => false,
        isCharacterDevice: () => false,
        isFIFO: () => false,
        isSocket: () => false,
        isSymbolicLink: () => false,
        parentPath: '',
      };

      let readdirCallCount = 0;
      vi.mocked(fs.promises.readdir).mockImplementation((async () => {
        readdirCallCount++;
        if (readdirCallCount === 1) {
          // First call - return directory
          return [mockDirDirent];
        }
        // Second call (inside src dir) - return file
        return [mockFileDirent];
      }) as unknown as typeof fs.promises.readdir);

      vi.mocked(fs.promises.readFile).mockImplementation(async (p) => {
        if (String(p).includes('template.yaml')) {
          return yaml.dump(sampleTemplateConfig);
        }
        return 'console.log("hello");';
      });

      const mkdirCalls: string[] = [];
      vi.mocked(fs.promises.mkdir).mockImplementation(async (p) => {
        mkdirCalls.push(String(p));
        return undefined;
      });

      const result = await handleScaffoldProject({
        template: 'next-app',
        output_dir: './test-project',
      });
      const data = JSON.parse(result.content[0].text);

      // Should have called mkdir for the src subdirectory
      expect(mkdirCalls.some(p => p.includes('src'))).toBe(true);
      expect(data.success).toBe(true);
    });

    it('should run npm install by default', async () => {
      const { safeExec } = await import('../../utils.js');

      await handleScaffoldProject({
        template: 'next-app',
        output_dir: './test-project',
      });

      expect(safeExec).toHaveBeenCalledWith(
        expect.stringContaining('install'),
        expect.any(String),
        expect.any(Number)
      );
    });

    it('should skip npm install when run_install is false', async () => {
      const { safeExec } = await import('../../utils.js');
      vi.mocked(safeExec).mockClear();

      await handleScaffoldProject({
        template: 'next-app',
        output_dir: './test-project',
        run_install: false,
      });

      const installCalls = vi.mocked(safeExec).mock.calls.filter(
        call => call[0].includes('install')
      );
      expect(installCalls.length).toBe(0);
    });

    it('should run git init by default', async () => {
      const { safeExec } = await import('../../utils.js');

      await handleScaffoldProject({
        template: 'next-app',
        output_dir: './test-project',
      });

      expect(safeExec).toHaveBeenCalledWith(
        expect.stringContaining('git init'),
        expect.any(String),
        expect.any(Number)
      );
    });

    it('should skip git init when run_git_init is false', async () => {
      const { safeExec } = await import('../../utils.js');
      vi.mocked(safeExec).mockClear();

      await handleScaffoldProject({
        template: 'next-app',
        output_dir: './test-project',
        run_git_init: false,
      });

      const gitCalls = vi.mocked(safeExec).mock.calls.filter(
        call => call[0].includes('git init')
      );
      expect(gitCalls.length).toBe(0);
    });

    it('should use correct package manager for install', async () => {
      const { safeExec, detectPackageManager } = await import('../../utils.js');
      vi.mocked(detectPackageManager).mockResolvedValue('pnpm');

      await handleScaffoldProject({
        template: 'next-app',
        output_dir: './test-project',
      });

      expect(safeExec).toHaveBeenCalledWith(
        expect.stringContaining('pnpm install'),
        expect.any(String),
        expect.any(Number)
      );
    });

    it('should return success response with created files', async () => {
      const result = await handleScaffoldProject({
        template: 'next-app',
        output_dir: './test-project',
      });
      const data = JSON.parse(result.content[0].text);

      expect(data.success).toBe(true);
      expect(data.template).toBe('next-app');
      expect(data.output_dir).toBe('./test-project');
      expect(data.created_files).toBeDefined();
    });

    it('should include variables_applied in response', async () => {
      const result = await handleScaffoldProject({
        template: 'next-app',
        output_dir: './test-project',
        variables: { projectName: 'my-app' },
      });
      const data = JSON.parse(result.content[0].text);

      expect(data.variables_applied).toBeDefined();
      expect(data.variables_applied.projectName).toBe('my-app');
    });

    it('should include post_create_results in response', async () => {
      const { safeExec } = await import('../../utils.js');
      vi.mocked(safeExec).mockResolvedValue({
        stdout: 'Success',
        stderr: '',
      });

      const result = await handleScaffoldProject({
        template: 'next-app',
        output_dir: './test-project',
      });
      const data = JSON.parse(result.content[0].text);

      expect(data.post_create_results).toBeDefined();
      expect(Array.isArray(data.post_create_results)).toBe(true);
    });

    it('should include recommended_skills from template config', async () => {
      const result = await handleScaffoldProject({
        template: 'next-app',
        output_dir: './test-project',
      });
      const data = JSON.parse(result.content[0].text);

      expect(data.recommended_skills).toBeDefined();
      expect(data.recommended_skills).toContain('nextjs-basics');
    });

    it('should include next_steps in response', async () => {
      const result = await handleScaffoldProject({
        template: 'next-app',
        output_dir: './test-project',
      });
      const data = JSON.parse(result.content[0].text);

      expect(data.next_steps).toBeDefined();
      expect(data.next_steps.some((s: string) => s.includes('cd'))).toBe(true);
      expect(data.next_steps.some((s: string) => s.includes('dev'))).toBe(true);
    });

    it('should add SaaS-specific next steps for next-saas template', async () => {
      vi.mocked(fs.existsSync).mockImplementation((p: fs.PathLike) => {
        const pathStr = String(p);
        return (
          pathStr.includes('next-saas') ||
          pathStr.includes('template.yaml') ||
          pathStr.includes('files')
        );
      });

      const result = await handleScaffoldProject({
        template: 'next-saas',
        output_dir: './saas-project',
      });
      const data = JSON.parse(result.content[0].text);

      expect(data.next_steps.some((s: string) => s.includes('.env'))).toBe(true);
      expect(data.next_steps.some((s: string) => s.includes('prisma'))).toBe(true);
    });

    it('should use default values from template config', async () => {
      const result = await handleScaffoldProject({
        template: 'next-app',
        output_dir: './test-project',
      });
      const data = JSON.parse(result.content[0].text);

      expect(data.variables_applied.projectName).toBe('my-app');
      expect(data.variables_applied.author).toBe('Developer');
    });

    it('should handle template variable without default', async () => {
      vi.mocked(fs.promises.readFile).mockImplementation(async (p) => {
        if (String(p).includes('template.yaml')) {
          // Template with variable that has no default
          return yaml.dump({
            name: 'test-template',
            variables: [
              { name: 'projectName' }, // No default provided
            ],
          });
        }
        return '{}';
      });

      const result = await handleScaffoldProject({
        template: 'next-app',
        output_dir: './test-project',
      });
      const data = JSON.parse(result.content[0].text);

      // Should use empty string as fallback when no default
      expect(data.variables_applied.projectName).toBe('');
    });

    it('should handle template without files directory', async () => {
      vi.mocked(fs.existsSync).mockImplementation((p: fs.PathLike) => {
        const pathStr = String(p);
        // Template exists but files dir doesn't
        if (pathStr.includes('files')) return false;
        return (
          pathStr.includes('next-app') ||
          pathStr.includes('template.yaml')
        );
      });

      const result = await handleScaffoldProject({
        template: 'next-app',
        output_dir: './test-project',
      });
      const data = JSON.parse(result.content[0].text);

      // Should succeed even without files directory
      expect(data.success).toBe(true);
      expect(data.created_files).toEqual([]);
    });

    it('should handle template without required_skills', async () => {
      vi.mocked(fs.promises.readFile).mockImplementation(async (p) => {
        if (String(p).includes('template.yaml')) {
          // Template without required_skills field
          return yaml.dump({
            name: 'test-template',
          });
        }
        return '{}';
      });

      const result = await handleScaffoldProject({
        template: 'next-app',
        output_dir: './test-project',
      });
      const data = JSON.parse(result.content[0].text);

      // Should default to empty array
      expect(data.recommended_skills).toEqual([]);
    });

    it('should handle template without variables field', async () => {
      vi.mocked(fs.promises.readFile).mockImplementation(async (p) => {
        if (String(p).includes('template.yaml')) {
          // Template without variables field
          return yaml.dump({
            name: 'test-template',
            required_skills: ['test-skill'],
          });
        }
        return '{}';
      });

      const result = await handleScaffoldProject({
        template: 'next-app',
        output_dir: './test-project',
      });
      const data = JSON.parse(result.content[0].text);

      expect(data.success).toBe(true);
    });

    describe('response format', () => {
      it('should return properly formatted response', async () => {
        const result = await handleScaffoldProject({
          template: 'next-app',
          output_dir: './test-project',
        });

        expect(result).toHaveProperty('content');
        expect(result.content).toHaveLength(1);
        expect(result.content[0]).toHaveProperty('type', 'text');
      });

      it('should return valid JSON', async () => {
        const result = await handleScaffoldProject({
          template: 'next-app',
          output_dir: './test-project',
        });

        expect(() => JSON.parse(result.content[0].text)).not.toThrow();
      });
    });
  });
});
