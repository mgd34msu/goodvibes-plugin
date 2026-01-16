/**
 * Unit tests for tailwind-conflicts-analyzers
 *
 * Tests cover:
 * - detectConflicts: conflict detection with various types
 * - detectSpecificityIssues: specificity problem detection
 * - generateSuggestions: optimization suggestions
 */

import { describe, it, expect } from 'vitest';
import {
  detectConflicts,
  detectSpecificityIssues,
  generateSuggestions,
} from '../../../handlers/frontend/tailwind-conflicts-analyzers.js';

describe('tailwind-conflicts-analyzers', () => {
  describe('detectConflicts', () => {
    describe('category overrides', () => {
      it('should detect width override', () => {
        const { conflicts } = detectConflicts('div:1', 1, ['w-4', 'w-8'], true);

        expect(conflicts.length).toBe(1);
        expect(conflicts[0].conflict_type).toBe('override');
        expect(conflicts[0].classes).toEqual(['w-4', 'w-8']);
        expect(conflicts[0].explanation).toContain('w-8');
        expect(conflicts[0].explanation).toContain('w-4');
        expect(conflicts[0].explanation).toContain('width');
      });

      it('should detect height override', () => {
        const { conflicts } = detectConflicts('div:1', 1, ['h-screen', 'h-full'], true);

        expect(conflicts.length).toBe(1);
        expect(conflicts[0].conflict_type).toBe('override');
      });

      it('should detect padding override', () => {
        const { conflicts } = detectConflicts('div:1', 1, ['p-2', 'p-4'], true);

        expect(conflicts.length).toBe(1);
        expect(conflicts[0].conflict_type).toBe('override');
      });

      it('should detect display override', () => {
        const { conflicts } = detectConflicts('div:1', 1, ['block', 'flex'], true);

        expect(conflicts.length).toBe(1);
        expect(conflicts[0].conflict_type).toBe('override');
      });

      it('should detect position override', () => {
        const { conflicts } = detectConflicts('div:1', 1, ['relative', 'absolute'], true);

        expect(conflicts.length).toBeGreaterThan(0);
      });

      it('should detect font size override', () => {
        const { conflicts } = detectConflicts('p:1', 1, ['text-sm', 'text-lg'], true);

        expect(conflicts.length).toBe(1);
        expect(conflicts[0].conflict_type).toBe('override');
      });

      it('should detect font weight override', () => {
        const { conflicts } = detectConflicts('span:1', 1, ['font-normal', 'font-bold'], true);

        expect(conflicts.length).toBe(1);
      });
    });

    describe('contradictions', () => {
      it('should detect hidden vs flex contradiction', () => {
        const { conflicts } = detectConflicts('div:1', 1, ['hidden', 'flex'], true);

        expect(conflicts.some((c) => c.conflict_type === 'contradiction')).toBe(true);
      });

      it('should detect invisible vs visible contradiction', () => {
        const { conflicts } = detectConflicts('div:1', 1, ['invisible', 'visible'], true);

        expect(conflicts.some((c) => c.conflict_type === 'contradiction')).toBe(true);
      });

      it('should detect flex-row vs flex-col contradiction', () => {
        const { conflicts } = detectConflicts('div:1', 1, ['flex-row', 'flex-col'], true);

        expect(conflicts.some((c) => c.conflict_type === 'contradiction')).toBe(true);
      });

      it('should detect flex-wrap vs flex-nowrap contradiction', () => {
        const { conflicts } = detectConflicts('div:1', 1, ['flex-wrap', 'flex-nowrap'], true);

        expect(conflicts.some((c) => c.conflict_type === 'contradiction')).toBe(true);
      });

      it('should detect text alignment contradictions', () => {
        const { conflicts } = detectConflicts('p:1', 1, ['text-left', 'text-center'], true);

        expect(conflicts.some((c) => c.conflict_type === 'contradiction')).toBe(true);
      });

      it('should detect grow vs grow-0 contradiction', () => {
        const { conflicts } = detectConflicts('div:1', 1, ['grow', 'grow-0'], true);

        expect(conflicts.some((c) => c.conflict_type === 'contradiction')).toBe(true);
      });
    });

    describe('shorthand/longhand conflicts', () => {
      it('should detect p- followed by pt- override', () => {
        const { conflicts, redundant } = detectConflicts('div:1', 1, ['p-4', 'pt-2'], true);

        // p-4 is partially redundant because pt-2 overrides the top padding
        expect(redundant.length).toBeGreaterThan(0);
      });

      it('should detect m- followed by mt- override', () => {
        const { redundant } = detectConflicts('div:1', 1, ['m-4', 'mt-0'], true);

        expect(redundant.some((r) => r.class === 'm-4')).toBe(true);
      });

      it('should detect px- followed by pl- override', () => {
        const { redundant } = detectConflicts('div:1', 1, ['px-4', 'pl-2'], true);

        expect(redundant.some((r) => r.class === 'px-4')).toBe(true);
      });

      it('should detect rounded- followed by rounded-t- override', () => {
        // Both rounded-lg and rounded-t-none start with 'rounded-' prefix,
        // so getShorthandPrefix returns 'rounded-' for both (first match wins).
        // This means they're both treated as shorthands in the same category,
        // resulting in a category override conflict, not a shorthand/longhand redundancy.
        const { conflicts } = detectConflicts('div:1', 1, ['rounded-lg', 'rounded-t-none'], true);

        expect(conflicts.some((c) => c.conflict_type === 'override')).toBe(true);
      });
    });

    describe('size- conflicts', () => {
      it('should detect size- overriding w-', () => {
        const { conflicts } = detectConflicts('div:1', 1, ['w-4', 'size-8'], true);

        expect(conflicts.length).toBeGreaterThan(0);
        expect(conflicts.some((c) => c.explanation.includes('size-8'))).toBe(true);
      });

      it('should detect size- overriding h-', () => {
        const { conflicts } = detectConflicts('div:1', 1, ['h-4', 'size-8'], true);

        expect(conflicts.length).toBeGreaterThan(0);
      });

      it('should detect w-/h- overriding size-', () => {
        const { conflicts } = detectConflicts('div:1', 1, ['size-8', 'w-4'], true);

        expect(conflicts.some((c) => c.explanation.includes('w-4') && c.explanation.includes('overrides'))).toBe(true);
      });
    });

    describe('breakpoint grouping', () => {
      it('should only compare classes at same breakpoint', () => {
        // These don't conflict because they're at different breakpoints
        const { conflicts } = detectConflicts('div:1', 1, ['w-4', 'sm:w-8'], true);

        expect(conflicts.length).toBe(0);
      });

      it('should detect conflicts within same breakpoint', () => {
        const { conflicts } = detectConflicts('div:1', 1, ['sm:w-4', 'sm:w-8'], true);

        expect(conflicts.length).toBe(1);
      });
    });

    describe('arbitrary values', () => {
      it('should include arbitrary values when flag is true', () => {
        const { conflicts } = detectConflicts('div:1', 1, ['w-4', 'w-[200px]'], true);

        expect(conflicts.length).toBe(1);
      });

      it('should skip arbitrary values when flag is false', () => {
        const { conflicts } = detectConflicts('div:1', 1, ['w-4', 'w-[200px]'], false);

        expect(conflicts.length).toBe(0);
      });
    });

    describe('no conflicts', () => {
      it('should return empty for non-conflicting classes', () => {
        const { conflicts } = detectConflicts('div:1', 1, ['flex', 'items-center', 'gap-4', 'p-4'], true);

        expect(conflicts.length).toBe(0);
      });

      it('should return empty for empty input', () => {
        const { conflicts, redundant } = detectConflicts('div:1', 1, [], true);

        expect(conflicts.length).toBe(0);
        expect(redundant.length).toBe(0);
      });
    });
  });

  describe('detectSpecificityIssues', () => {
    it('should detect multiple important modifiers', () => {
      const issues = detectSpecificityIssues('div:1', ['!w-full', '!h-full', '!p-4']);

      expect(issues.length).toBeGreaterThan(0);
      expect(issues[0].issue).toContain('!important');
    });

    it('should not flag few important modifiers', () => {
      const issues = detectSpecificityIssues('div:1', ['!w-full', 'h-full', 'p-4']);

      expect(issues.length).toBe(0);
    });

    it('should detect z-index without position', () => {
      const issues = detectSpecificityIssues('div:1', ['z-10', 'flex', 'w-full']);

      expect(issues.length).toBe(1);
      expect(issues[0].issue).toContain('z-index');
      expect(issues[0].issue).toContain('without');
    });

    it('should not flag z-index with position', () => {
      const issues = detectSpecificityIssues('div:1', ['z-10', 'relative', 'w-full']);

      expect(issues.length).toBe(0);
    });

    it('should not flag z-auto without position', () => {
      const issues = detectSpecificityIssues('div:1', ['z-auto', 'flex']);

      expect(issues.length).toBe(0);
    });

    it('should accept any position for z-index', () => {
      expect(detectSpecificityIssues('div:1', ['z-10', 'relative']).length).toBe(0);
      expect(detectSpecificityIssues('div:1', ['z-10', 'absolute']).length).toBe(0);
      expect(detectSpecificityIssues('div:1', ['z-10', 'fixed']).length).toBe(0);
      expect(detectSpecificityIssues('div:1', ['z-10', 'sticky']).length).toBe(0);
    });
  });

  describe('generateSuggestions', () => {
    describe('size shorthand', () => {
      it('should suggest size- when w- and h- are equal', () => {
        const suggestions = generateSuggestions('div:1', ['w-4', 'h-4'], 'w-4 h-4');

        expect(suggestions.length).toBe(1);
        expect(suggestions[0].suggested).toBe('size-4');
        expect(suggestions[0].reason).toContain('shorthand');
      });

      it('should suggest prefixed size- for responsive classes', () => {
        const suggestions = generateSuggestions('div:1', ['sm:w-8', 'sm:h-8'], 'sm:w-8 sm:h-8');

        expect(suggestions.length).toBe(1);
        expect(suggestions[0].suggested).toBe('sm:size-8');
      });

      it('should not suggest size- when values differ', () => {
        const suggestions = generateSuggestions('div:1', ['w-4', 'h-8'], 'w-4 h-8');

        expect(suggestions.some((s) => s.suggested.includes('size-'))).toBe(false);
      });

      it('should not suggest when only one dimension', () => {
        const suggestions = generateSuggestions('div:1', ['w-4'], 'w-4');

        expect(suggestions.some((s) => s.suggested.includes('size-'))).toBe(false);
      });
    });

    describe('padding consolidation', () => {
      it('should suggest p- when all sides are equal', () => {
        const suggestions = generateSuggestions('div:1', ['pt-4', 'pr-4', 'pb-4', 'pl-4'], 'pt-4 pr-4 pb-4 pl-4');

        expect(suggestions.some((s) => s.suggested === 'p-4')).toBe(true);
      });

      it('should not suggest p- when sides differ', () => {
        const suggestions = generateSuggestions('div:1', ['pt-4', 'pr-2', 'pb-4', 'pl-2'], 'pt-4 pr-2 pb-4 pl-2');

        expect(suggestions.some((s) => s.suggested === 'p-4')).toBe(false);
      });

      it('should not suggest when fewer than 4 sides', () => {
        const suggestions = generateSuggestions('div:1', ['pt-4', 'pb-4'], 'pt-4 pb-4');

        expect(suggestions.some((s) => s.suggested === 'p-4')).toBe(false);
      });
    });

    describe('px/py consolidation', () => {
      it('should suggest px- when left and right are equal', () => {
        const suggestions = generateSuggestions('div:1', ['pl-4', 'pr-4'], 'pl-4 pr-4');

        expect(suggestions.some((s) => s.suggested === 'px-4')).toBe(true);
      });

      it('should not suggest px- when left and right differ', () => {
        const suggestions = generateSuggestions('div:1', ['pl-4', 'pr-2'], 'pl-4 pr-2');

        expect(suggestions.some((s) => s.suggested === 'px-4')).toBe(false);
      });
    });

    describe('no suggestions', () => {
      it('should return empty for non-optimizable classes', () => {
        const suggestions = generateSuggestions('div:1', ['flex', 'items-center', 'gap-4'], 'flex items-center gap-4');

        expect(suggestions.length).toBe(0);
      });

      it('should return empty for empty input', () => {
        const suggestions = generateSuggestions('div:1', [], '');

        expect(suggestions.length).toBe(0);
      });
    });
  });
});
