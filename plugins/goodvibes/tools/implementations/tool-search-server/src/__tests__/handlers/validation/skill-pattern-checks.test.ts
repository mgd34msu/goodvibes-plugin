/**
 * Unit tests for skill-pattern-checks validation module
 *
 * Tests cover:
 * - Required imports validation
 * - Must include patterns validation
 * - Must not include patterns validation
 */

import { describe, it, expect } from 'vitest';
import { runSkillPatternChecks } from '../../../handlers/validation/skill-pattern-checks.js';
import { ValidationContext, SkillPatterns } from '../../../handlers/validation/types.js';

function createContext(content: string, file = 'test.ts'): ValidationContext {
  const ext = file.substring(file.lastIndexOf('.'));
  return {
    content,
    lines: content.split('\n'),
    file,
    ext,
    isTypeScript: ext === '.ts' || ext === '.tsx',
    isReact: ext === '.tsx' || ext === '.jsx',
  };
}

describe('runSkillPatternChecks', () => {
  describe('required imports validation', () => {
    it('should warn about missing required import', () => {
      const ctx = createContext('const x = 1;');
      const skillPatterns: SkillPatterns = {
        required_imports: ['@testing-library/react'],
      };
      const issues = runSkillPatternChecks(ctx, skillPatterns);

      expect(issues.some(i => i.rule === 'skill/missing-import')).toBe(true);
      expect(issues.find(i => i.rule === 'skill/missing-import')?.severity).toBe('warning');
    });

    it('should warn about multiple missing imports', () => {
      const ctx = createContext('const x = 1;');
      const skillPatterns: SkillPatterns = {
        required_imports: ['react', 'react-dom', '@testing-library/react'],
      };
      const issues = runSkillPatternChecks(ctx, skillPatterns);

      expect(issues.filter(i => i.rule === 'skill/missing-import').length).toBe(3);
    });

    it('should NOT warn when import is present', () => {
      const ctx = createContext("import { render } from '@testing-library/react';");
      const skillPatterns: SkillPatterns = {
        required_imports: ['@testing-library/react'],
      };
      const issues = runSkillPatternChecks(ctx, skillPatterns);

      expect(issues.filter(i => i.rule === 'skill/missing-import').length).toBe(0);
    });

    it('should include import name in message', () => {
      const ctx = createContext('const x = 1;');
      const skillPatterns: SkillPatterns = {
        required_imports: ['vitest'],
      };
      const issues = runSkillPatternChecks(ctx, skillPatterns);

      expect(issues.find(i => i.rule === 'skill/missing-import')?.message).toContain('vitest');
    });

    it('should include suggestion', () => {
      const ctx = createContext('const x = 1;');
      const skillPatterns: SkillPatterns = {
        required_imports: ['vitest'],
      };
      const issues = runSkillPatternChecks(ctx, skillPatterns);

      expect(issues.find(i => i.rule === 'skill/missing-import')?.suggestion).toContain('import');
    });
  });

  describe('must include patterns validation', () => {
    it('should warn about missing required pattern', () => {
      const ctx = createContext('const x = 1;');
      const skillPatterns: SkillPatterns = {
        must_include: ['describe('],
      };
      const issues = runSkillPatternChecks(ctx, skillPatterns);

      expect(issues.some(i => i.rule === 'skill/missing-pattern')).toBe(true);
      expect(issues.find(i => i.rule === 'skill/missing-pattern')?.severity).toBe('warning');
    });

    it('should warn about multiple missing patterns', () => {
      const ctx = createContext('const x = 1;');
      const skillPatterns: SkillPatterns = {
        must_include: ['describe(', 'it(', 'expect('],
      };
      const issues = runSkillPatternChecks(ctx, skillPatterns);

      expect(issues.filter(i => i.rule === 'skill/missing-pattern').length).toBe(3);
    });

    it('should NOT warn when pattern is present', () => {
      const ctx = createContext("describe('test', () => { it('works', () => { expect(true).toBe(true); }); });");
      const skillPatterns: SkillPatterns = {
        must_include: ['describe(', 'it(', 'expect('],
      };
      const issues = runSkillPatternChecks(ctx, skillPatterns);

      expect(issues.filter(i => i.rule === 'skill/missing-pattern').length).toBe(0);
    });

    it('should include pattern in message', () => {
      const ctx = createContext('const x = 1;');
      const skillPatterns: SkillPatterns = {
        must_include: ['async function'],
      };
      const issues = runSkillPatternChecks(ctx, skillPatterns);

      expect(issues.find(i => i.rule === 'skill/missing-pattern')?.message).toContain('async function');
    });

    it('should include suggestion', () => {
      const ctx = createContext('const x = 1;');
      const skillPatterns: SkillPatterns = {
        must_include: ['test('],
      };
      const issues = runSkillPatternChecks(ctx, skillPatterns);

      expect(issues.find(i => i.rule === 'skill/missing-pattern')?.suggestion).toContain('Implement');
    });
  });

  describe('must not include patterns validation', () => {
    it('should warn about forbidden pattern present', () => {
      const ctx = createContext("import enzyme from 'enzyme';");
      const skillPatterns: SkillPatterns = {
        must_not_include: ['enzyme'],
      };
      const issues = runSkillPatternChecks(ctx, skillPatterns);

      expect(issues.some(i => i.rule === 'skill/forbidden-pattern')).toBe(true);
      expect(issues.find(i => i.rule === 'skill/forbidden-pattern')?.severity).toBe('warning');
    });

    it('should warn about multiple forbidden patterns', () => {
      const ctx = createContext(`
import enzyme from 'enzyme';
import { shallow } from 'enzyme';
const snapshot = toMatchSnapshot();
      `);
      const skillPatterns: SkillPatterns = {
        must_not_include: ['enzyme', 'toMatchSnapshot'],
      };
      const issues = runSkillPatternChecks(ctx, skillPatterns);

      expect(issues.filter(i => i.rule === 'skill/forbidden-pattern').length).toBe(2);
    });

    it('should NOT warn when forbidden pattern is absent', () => {
      const ctx = createContext("import { render } from '@testing-library/react';");
      const skillPatterns: SkillPatterns = {
        must_not_include: ['enzyme', 'shallow'],
      };
      const issues = runSkillPatternChecks(ctx, skillPatterns);

      expect(issues.filter(i => i.rule === 'skill/forbidden-pattern').length).toBe(0);
    });

    it('should include correct line number', () => {
      const ctx = createContext(`
// Line 1
// Line 2
import enzyme from 'enzyme';
      `);
      const skillPatterns: SkillPatterns = {
        must_not_include: ['enzyme'],
      };
      const issues = runSkillPatternChecks(ctx, skillPatterns);

      expect(issues.find(i => i.rule === 'skill/forbidden-pattern')?.line).toBe(4);
    });

    it('should include pattern in message', () => {
      const ctx = createContext('const x = eval(code);');
      const skillPatterns: SkillPatterns = {
        must_not_include: ['eval('],
      };
      const issues = runSkillPatternChecks(ctx, skillPatterns);

      expect(issues.find(i => i.rule === 'skill/forbidden-pattern')?.message).toContain('eval(');
    });

    it('should include suggestion', () => {
      const ctx = createContext('const x = eval(code);');
      const skillPatterns: SkillPatterns = {
        must_not_include: ['eval('],
      };
      const issues = runSkillPatternChecks(ctx, skillPatterns);

      expect(issues.find(i => i.rule === 'skill/forbidden-pattern')?.suggestion).toContain('Remove');
    });
  });

  describe('combined patterns', () => {
    it('should check all pattern types together', () => {
      const ctx = createContext(`
import enzyme from 'enzyme';
const x = 1;
      `);
      const skillPatterns: SkillPatterns = {
        required_imports: ['vitest'],
        must_include: ['describe('],
        must_not_include: ['enzyme'],
      };
      const issues = runSkillPatternChecks(ctx, skillPatterns);

      expect(issues.some(i => i.rule === 'skill/missing-import')).toBe(true);
      expect(issues.some(i => i.rule === 'skill/missing-pattern')).toBe(true);
      expect(issues.some(i => i.rule === 'skill/forbidden-pattern')).toBe(true);
    });
  });

  describe('issue properties', () => {
    it('should include correct file path', () => {
      const ctx = createContext('const x = 1;', 'src/tests/user.test.ts');
      const skillPatterns: SkillPatterns = {
        required_imports: ['vitest'],
      };
      const issues = runSkillPatternChecks(ctx, skillPatterns);

      expect(issues[0]?.file).toBe('src/tests/user.test.ts');
    });

    it('should set line to 1 for missing patterns', () => {
      const ctx = createContext('const x = 1;');
      const skillPatterns: SkillPatterns = {
        required_imports: ['vitest'],
        must_include: ['test('],
      };
      const issues = runSkillPatternChecks(ctx, skillPatterns);

      expect(issues.every(i => i.line === 1)).toBe(true);
    });
  });

  describe('empty patterns', () => {
    it('should return empty array for empty skill patterns', () => {
      const ctx = createContext('const x = 1;');
      const skillPatterns: SkillPatterns = {};
      const issues = runSkillPatternChecks(ctx, skillPatterns);

      expect(issues.length).toBe(0);
    });

    it('should handle undefined pattern arrays', () => {
      const ctx = createContext('const x = 1;');
      const skillPatterns: SkillPatterns = {
        required_imports: undefined,
        must_include: undefined,
        must_not_include: undefined,
      };
      const issues = runSkillPatternChecks(ctx, skillPatterns);

      expect(issues.length).toBe(0);
    });
  });

  describe('edge cases', () => {
    it('should handle empty content', () => {
      const ctx = createContext('');
      const skillPatterns: SkillPatterns = {
        required_imports: ['vitest'],
      };
      const issues = runSkillPatternChecks(ctx, skillPatterns);

      expect(issues.length).toBe(1);
    });

    it('should handle pattern at start of file', () => {
      const ctx = createContext('enzyme is here');
      const skillPatterns: SkillPatterns = {
        must_not_include: ['enzyme'],
      };
      const issues = runSkillPatternChecks(ctx, skillPatterns);

      expect(issues.find(i => i.rule === 'skill/forbidden-pattern')?.line).toBe(1);
    });
  });
});
