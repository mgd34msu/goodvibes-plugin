/**
 * Unit tests for content handlers
 *
 * Tests cover:
 * - handleGetSkillContent
 * - handleGetAgentContent
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';

import {
  handleGetSkillContent,
  handleGetAgentContent,
} from '../../handlers/content.js';
import { sampleSkillContent } from '../setup.js';

// Mock modules
vi.mock('fs');
vi.mock('../../config.js', () => ({
  PLUGIN_ROOT: '/mock/plugin/root',
}));

describe('content handlers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Setup default mock for fs.promises.readFile
    vi.mocked(fs.promises.readFile).mockResolvedValue('');
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('handleGetSkillContent', () => {
    it('should return content from SKILL.md in skill directory', async () => {
      vi.mocked(fs.existsSync).mockImplementation((p: fs.PathLike) => {
        return String(p).includes('SKILL.md');
      });
      vi.mocked(fs.promises.readFile).mockResolvedValue(sampleSkillContent);

      const result = await handleGetSkillContent({ path: 'testing/react-testing' });

      expect(result.content[0].text).toBe(sampleSkillContent);
    });

    it('should try path with .md extension', async () => {
      const checkCalls: string[] = [];
      vi.mocked(fs.existsSync).mockImplementation((p: fs.PathLike) => {
        checkCalls.push(String(p));
        return String(p).endsWith('.md') && !String(p).includes('SKILL.md');
      });
      vi.mocked(fs.promises.readFile).mockResolvedValue('# Skill Content');

      await handleGetSkillContent({ path: 'testing/skill' });

      expect(checkCalls.some(c => c.endsWith('skill.md'))).toBe(true);
    });

    it('should try path directly as fallback', async () => {
      const checkCalls: string[] = [];
      vi.mocked(fs.existsSync).mockImplementation((p: fs.PathLike) => {
        checkCalls.push(String(p));
        const pathStr = String(p);
        return pathStr.endsWith('skill-file');
      });
      vi.mocked(fs.promises.readFile).mockResolvedValue('Direct content');

      await handleGetSkillContent({ path: 'skill-file' });

      expect(checkCalls.length).toBeGreaterThanOrEqual(1);
    });

    it('should throw error when skill not found', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);

      await expect(
        handleGetSkillContent({ path: 'nonexistent/skill' })
      ).rejects.toThrow('Skill not found: nonexistent/skill');
    });

    it('should return content in correct format', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.promises.readFile).mockResolvedValue('# Test Skill');

      const result = await handleGetSkillContent({ path: 'test/skill' });

      expect(result).toHaveProperty('content');
      expect(result.content).toHaveLength(1);
      expect(result.content[0]).toHaveProperty('type', 'text');
      expect(result.content[0]).toHaveProperty('text', '# Test Skill');
    });

    it('should prioritize SKILL.md over other paths', async () => {
      const readCalls: string[] = [];
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.promises.readFile).mockImplementation(async (p) => {
        readCalls.push(String(p));
        return 'Content';
      });

      await handleGetSkillContent({ path: 'test/skill' });

      // Should read the first path that exists (SKILL.md)
      expect(readCalls[0]).toContain('SKILL.md');
    });

    it('should handle nested skill paths', async () => {
      vi.mocked(fs.existsSync).mockImplementation((p: fs.PathLike) => {
        const pathStr = String(p);
        // Platform-independent: check for category, subcategory, and skill in path
        return pathStr.includes('category') && pathStr.includes('subcategory') && pathStr.includes('skill');
      });
      vi.mocked(fs.promises.readFile).mockResolvedValue('Nested content');

      const result = await handleGetSkillContent({ path: 'category/subcategory/skill' });

      expect(result.content[0].text).toBe('Nested content');
    });

    it('should preserve file content encoding', async () => {
      const unicodeContent = '# Skill with Unicode\n\nEmojis: \u2705 \u274C\nSpecial: \u00E9\u00E0\u00FC';
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.promises.readFile).mockResolvedValue(unicodeContent);

      const result = await handleGetSkillContent({ path: 'unicode/skill' });

      expect(result.content[0].text).toBe(unicodeContent);
    });
  });

  describe('handleGetAgentContent', () => {
    const sampleAgentContent = `# Code Reviewer Agent

You are a code reviewer specializing in best practices.

## Capabilities
- Code review
- Best practice enforcement
`;

    it('should return content from agent.md file', async () => {
      vi.mocked(fs.existsSync).mockImplementation((p: fs.PathLike) => {
        return String(p).endsWith('.md');
      });
      vi.mocked(fs.promises.readFile).mockResolvedValue(sampleAgentContent);

      const result = await handleGetAgentContent({ path: 'code-reviewer' });

      expect(result.content[0].text).toBe(sampleAgentContent);
    });

    it('should try path directly', async () => {
      const checkCalls: string[] = [];
      vi.mocked(fs.existsSync).mockImplementation((p: fs.PathLike) => {
        checkCalls.push(String(p));
        return String(p).endsWith('agent-file');
      });
      vi.mocked(fs.promises.readFile).mockResolvedValue('Agent content');

      await handleGetAgentContent({ path: 'agent-file' });

      expect(checkCalls.some(c => c.endsWith('agent-file'))).toBe(true);
    });

    it('should try index.md in agent directory', async () => {
      const checkCalls: string[] = [];
      vi.mocked(fs.existsSync).mockImplementation((p: fs.PathLike) => {
        checkCalls.push(String(p));
        return String(p).includes('index.md');
      });
      vi.mocked(fs.promises.readFile).mockResolvedValue('Index content');

      await handleGetAgentContent({ path: 'test-agent' });

      expect(checkCalls.some(c => c.includes('index.md'))).toBe(true);
    });

    it('should throw error when agent not found', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);

      await expect(
        handleGetAgentContent({ path: 'nonexistent-agent' })
      ).rejects.toThrow('Agent not found: nonexistent-agent');
    });

    it('should return content in correct format', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.promises.readFile).mockResolvedValue('# Test Agent');

      const result = await handleGetAgentContent({ path: 'test-agent' });

      expect(result).toHaveProperty('content');
      expect(result.content).toHaveLength(1);
      expect(result.content[0]).toHaveProperty('type', 'text');
      expect(result.content[0]).toHaveProperty('text', '# Test Agent');
    });

    it('should prioritize .md extension over direct path', async () => {
      const readCalls: string[] = [];
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.promises.readFile).mockImplementation(async (p) => {
        readCalls.push(String(p));
        return 'Content';
      });

      await handleGetAgentContent({ path: 'test-agent' });

      expect(readCalls[0]).toContain('.md');
    });

    it('should handle agent paths with dashes and underscores', async () => {
      vi.mocked(fs.existsSync).mockImplementation((p: fs.PathLike) => {
        return String(p).includes('my-special_agent');
      });
      vi.mocked(fs.promises.readFile).mockResolvedValue('Special agent content');

      const result = await handleGetAgentContent({ path: 'my-special_agent' });

      expect(result.content[0].text).toBe('Special agent content');
    });

    it('should preserve markdown formatting', async () => {
      const markdownContent = `# Agent

## Section
- Item 1
- Item 2

\`\`\`code
example
\`\`\`
`;
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.promises.readFile).mockResolvedValue(markdownContent);

      const result = await handleGetAgentContent({ path: 'markdown-agent' });

      expect(result.content[0].text).toBe(markdownContent);
      expect(result.content[0].text).toContain('```code');
    });
  });

  describe('error handling', () => {
    it('should handle file read errors for skills', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.promises.readFile).mockRejectedValue(new Error('Permission denied'));

      await expect(
        handleGetSkillContent({ path: 'error/skill' })
      ).rejects.toThrow('Permission denied');
    });

    it('should handle file read errors for agents', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.promises.readFile).mockRejectedValue(new Error('Permission denied'));

      await expect(
        handleGetAgentContent({ path: 'error-agent' })
      ).rejects.toThrow('Permission denied');
    });

    it('should handle empty file paths for skills', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);

      await expect(
        handleGetSkillContent({ path: '' })
      ).rejects.toThrow('Skill not found: ');
    });

    it('should handle empty file paths for agents', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);

      await expect(
        handleGetAgentContent({ path: '' })
      ).rejects.toThrow('Agent not found: ');
    });
  });
});
