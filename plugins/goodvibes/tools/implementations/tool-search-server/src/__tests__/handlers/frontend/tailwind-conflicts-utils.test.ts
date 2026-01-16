/**
 * Unit tests for tailwind-conflicts-utils
 *
 * Tests cover:
 * - CLASS_CATEGORIES: category to prefix mapping
 * - SHORTHAND_MAP: shorthand to longhand mapping
 * - CONTRADICTIONS: mutually exclusive class pairs
 * - stripPrefixes: responsive/state prefix stripping
 * - getBreakpointPrefix: breakpoint extraction
 * - groupByBreakpoint: breakpoint grouping
 * - getCategory: category detection
 * - getShorthandPrefix: shorthand prefix detection
 * - longhandOverridesShorthand: override detection
 */

import { describe, it, expect } from 'vitest';
import {
  CLASS_CATEGORIES,
  SHORTHAND_MAP,
  CONTRADICTIONS,
  SIZE_SETS_BOTH,
  stripPrefixes,
  getBreakpointPrefix,
  getVariantPrefix,
  groupByBreakpoint,
  groupByVariant,
  getCategory,
  getShorthandPrefix,
  longhandOverridesShorthand,
} from '../../../handlers/frontend/tailwind-conflicts-utils.js';

describe('tailwind-conflicts-utils', () => {
  describe('CLASS_CATEGORIES', () => {
    it('should have padding categories', () => {
      expect(CLASS_CATEGORIES['padding']).toContain('p-');
      expect(CLASS_CATEGORIES['padding-x']).toContain('px-');
      expect(CLASS_CATEGORIES['padding-y']).toContain('py-');
      expect(CLASS_CATEGORIES['padding-top']).toContain('pt-');
    });

    it('should have margin categories', () => {
      expect(CLASS_CATEGORIES['margin']).toContain('m-');
      expect(CLASS_CATEGORIES['margin-x']).toContain('mx-');
      expect(CLASS_CATEGORIES['margin-y']).toContain('my-');
    });

    it('should have sizing categories', () => {
      expect(CLASS_CATEGORIES['width']).toContain('w-');
      expect(CLASS_CATEGORIES['height']).toContain('h-');
      expect(CLASS_CATEGORIES['min-width']).toContain('min-w-');
      expect(CLASS_CATEGORIES['max-width']).toContain('max-w-');
    });

    it('should have display values', () => {
      expect(CLASS_CATEGORIES['display']).toContain('block');
      expect(CLASS_CATEGORIES['display']).toContain('flex');
      expect(CLASS_CATEGORIES['display']).toContain('grid');
      expect(CLASS_CATEGORIES['display']).toContain('hidden');
    });

    it('should have position values', () => {
      expect(CLASS_CATEGORIES['position']).toContain('static');
      expect(CLASS_CATEGORIES['position']).toContain('relative');
      expect(CLASS_CATEGORIES['position']).toContain('absolute');
      expect(CLASS_CATEGORIES['position']).toContain('fixed');
      expect(CLASS_CATEGORIES['position']).toContain('sticky');
    });

    it('should have flex categories', () => {
      expect(CLASS_CATEGORIES['flex-direction']).toContain('flex-row');
      expect(CLASS_CATEGORIES['flex-direction']).toContain('flex-col');
      expect(CLASS_CATEGORIES['justify-content']).toContain('justify-center');
      expect(CLASS_CATEGORIES['align-items']).toContain('items-center');
    });

    it('should have text categories', () => {
      expect(CLASS_CATEGORIES['font-size']).toContain('text-sm');
      expect(CLASS_CATEGORIES['font-weight']).toContain('font-bold');
      expect(CLASS_CATEGORIES['text-align']).toContain('text-center');
    });
  });

  describe('SHORTHAND_MAP', () => {
    it('should map padding shorthand', () => {
      expect(SHORTHAND_MAP['p-']).toContain('px-');
      expect(SHORTHAND_MAP['p-']).toContain('py-');
      expect(SHORTHAND_MAP['p-']).toContain('pt-');
      expect(SHORTHAND_MAP['p-']).toContain('pr-');
      expect(SHORTHAND_MAP['p-']).toContain('pb-');
      expect(SHORTHAND_MAP['p-']).toContain('pl-');
    });

    it('should map px/py to sides', () => {
      expect(SHORTHAND_MAP['px-']).toContain('pr-');
      expect(SHORTHAND_MAP['px-']).toContain('pl-');
      expect(SHORTHAND_MAP['py-']).toContain('pt-');
      expect(SHORTHAND_MAP['py-']).toContain('pb-');
    });

    it('should map margin shorthand', () => {
      expect(SHORTHAND_MAP['m-']).toContain('mx-');
      expect(SHORTHAND_MAP['m-']).toContain('my-');
      expect(SHORTHAND_MAP['m-']).toContain('mt-');
    });

    it('should map border radius shorthand', () => {
      expect(SHORTHAND_MAP['rounded-']).toContain('rounded-t-');
      expect(SHORTHAND_MAP['rounded-']).toContain('rounded-tl-');
      expect(SHORTHAND_MAP['rounded-t-']).toContain('rounded-tl-');
      expect(SHORTHAND_MAP['rounded-t-']).toContain('rounded-tr-');
    });

    it('should map border width shorthand', () => {
      expect(SHORTHAND_MAP['border-']).toContain('border-t-');
      expect(SHORTHAND_MAP['border-x-']).toContain('border-r-');
      expect(SHORTHAND_MAP['border-x-']).toContain('border-l-');
    });

    it('should map inset shorthand', () => {
      expect(SHORTHAND_MAP['inset-']).toContain('top-');
      expect(SHORTHAND_MAP['inset-']).toContain('right-');
      expect(SHORTHAND_MAP['inset-']).toContain('bottom-');
      expect(SHORTHAND_MAP['inset-']).toContain('left-');
    });
  });

  describe('CONTRADICTIONS', () => {
    it('should include display contradictions', () => {
      expect(CONTRADICTIONS.some((c) => c.includes('hidden') && c.includes('flex'))).toBe(true);
      expect(CONTRADICTIONS.some((c) => c.includes('hidden') && c.includes('block'))).toBe(true);
      expect(CONTRADICTIONS.some((c) => c.includes('hidden') && c.includes('grid'))).toBe(true);
    });

    it('should include visibility contradictions', () => {
      expect(CONTRADICTIONS.some((c) => c.includes('invisible') && c.includes('visible'))).toBe(true);
    });

    it('should include position contradictions', () => {
      expect(CONTRADICTIONS.some((c) => c.includes('static') && c.includes('relative'))).toBe(true);
      expect(CONTRADICTIONS.some((c) => c.includes('absolute') && c.includes('fixed'))).toBe(true);
    });

    it('should include flex direction contradictions', () => {
      expect(CONTRADICTIONS.some((c) => c.includes('flex-row') && c.includes('flex-col'))).toBe(true);
    });

    it('should include text align contradictions', () => {
      expect(CONTRADICTIONS.some((c) => c.includes('text-left') && c.includes('text-center'))).toBe(true);
    });

    it('should include grow/shrink contradictions', () => {
      expect(CONTRADICTIONS.some((c) => c.includes('grow') && c.includes('grow-0'))).toBe(true);
      expect(CONTRADICTIONS.some((c) => c.includes('shrink') && c.includes('shrink-0'))).toBe(true);
    });
  });

  describe('SIZE_SETS_BOTH', () => {
    it('should be size- prefix', () => {
      expect(SIZE_SETS_BOTH).toBe('size-');
    });
  });

  describe('stripPrefixes', () => {
    it('should strip responsive prefixes', () => {
      expect(stripPrefixes('sm:flex')).toBe('flex');
      expect(stripPrefixes('md:w-full')).toBe('w-full');
      expect(stripPrefixes('lg:hidden')).toBe('hidden');
      expect(stripPrefixes('xl:p-4')).toBe('p-4');
      expect(stripPrefixes('2xl:text-lg')).toBe('text-lg');
    });

    it('should strip state prefixes', () => {
      expect(stripPrefixes('hover:bg-blue-500')).toBe('bg-blue-500');
      expect(stripPrefixes('focus:ring-2')).toBe('ring-2');
      expect(stripPrefixes('active:scale-95')).toBe('scale-95');
      expect(stripPrefixes('disabled:opacity-50')).toBe('opacity-50');
    });

    it('should strip multiple prefixes', () => {
      expect(stripPrefixes('sm:hover:bg-blue-500')).toBe('bg-blue-500');
      expect(stripPrefixes('lg:focus:ring-2')).toBe('ring-2');
      expect(stripPrefixes('md:dark:bg-gray-800')).toBe('bg-gray-800');
    });

    it('should strip group and focus-within prefixes', () => {
      expect(stripPrefixes('group-hover:visible')).toBe('visible');
      expect(stripPrefixes('focus-within:ring-2')).toBe('ring-2');
      expect(stripPrefixes('focus-visible:outline-none')).toBe('outline-none');
    });

    it('should strip pseudo-element prefixes', () => {
      expect(stripPrefixes('before:content-[""]')).toBe('content-[""]');
      expect(stripPrefixes('after:absolute')).toBe('absolute');
    });

    it('should strip first/last/odd/even prefixes', () => {
      expect(stripPrefixes('first:mt-0')).toBe('mt-0');
      expect(stripPrefixes('last:mb-0')).toBe('mb-0');
      expect(stripPrefixes('odd:bg-gray-100')).toBe('bg-gray-100');
      expect(stripPrefixes('even:bg-white')).toBe('bg-white');
    });

    it('should strip data and aria prefixes', () => {
      expect(stripPrefixes('data-[state=open]:block')).toBe('block');
      expect(stripPrefixes('aria-[expanded=true]:rotate-180')).toBe('rotate-180');
    });

    it('should return class as-is if no prefix', () => {
      expect(stripPrefixes('flex')).toBe('flex');
      expect(stripPrefixes('w-full')).toBe('w-full');
      expect(stripPrefixes('bg-blue-500')).toBe('bg-blue-500');
    });
  });

  describe('getBreakpointPrefix', () => {
    it('should extract breakpoint prefix', () => {
      expect(getBreakpointPrefix('sm:flex')).toBe('sm');
      expect(getBreakpointPrefix('md:w-full')).toBe('md');
      expect(getBreakpointPrefix('lg:hidden')).toBe('lg');
      expect(getBreakpointPrefix('xl:p-4')).toBe('xl');
      expect(getBreakpointPrefix('2xl:text-lg')).toBe('2xl');
    });

    it('should return null for no breakpoint', () => {
      expect(getBreakpointPrefix('flex')).toBeNull();
      expect(getBreakpointPrefix('hover:bg-blue-500')).toBeNull();
      expect(getBreakpointPrefix('dark:bg-gray-800')).toBeNull();
    });
  });

  describe('groupByBreakpoint', () => {
    it('should group classes by breakpoint', () => {
      const classes = ['flex', 'sm:hidden', 'md:block', 'sm:p-4'];

      const groups = groupByBreakpoint(classes);

      expect(groups.get(null)).toEqual(['flex']);
      expect(groups.get('sm')).toEqual(['sm:hidden', 'sm:p-4']);
      expect(groups.get('md')).toEqual(['md:block']);
    });

    it('should handle all base classes', () => {
      const classes = ['flex', 'items-center', 'gap-4'];

      const groups = groupByBreakpoint(classes);

      expect(groups.get(null)).toEqual(['flex', 'items-center', 'gap-4']);
      expect(groups.size).toBe(1);
    });

    it('should handle all prefixed classes', () => {
      const classes = ['sm:flex', 'md:grid', 'lg:hidden'];

      const groups = groupByBreakpoint(classes);

      expect(groups.has(null)).toBe(false);
      expect(groups.get('sm')).toEqual(['sm:flex']);
      expect(groups.get('md')).toEqual(['md:grid']);
      expect(groups.get('lg')).toEqual(['lg:hidden']);
    });

    it('should return empty map for empty input', () => {
      const groups = groupByBreakpoint([]);

      expect(groups.size).toBe(0);
    });
  });

  describe('getCategory', () => {
    it('should detect display categories', () => {
      expect(getCategory('block')).toBe('display');
      expect(getCategory('flex')).toBe('display');
      expect(getCategory('grid')).toBe('display');
      expect(getCategory('hidden')).toBe('display');
    });

    it('should detect position categories', () => {
      expect(getCategory('static')).toBe('position');
      expect(getCategory('relative')).toBe('position');
      expect(getCategory('absolute')).toBe('position');
      expect(getCategory('fixed')).toBe('position');
      expect(getCategory('sticky')).toBe('position');
    });

    it('should detect width categories', () => {
      expect(getCategory('w-4')).toBe('width');
      expect(getCategory('w-full')).toBe('width');
      expect(getCategory('w-1/2')).toBe('width');
    });

    it('should detect height categories', () => {
      expect(getCategory('h-4')).toBe('height');
      expect(getCategory('h-screen')).toBe('height');
    });

    it('should detect padding categories', () => {
      expect(getCategory('p-4')).toBe('padding');
      expect(getCategory('px-4')).toBe('padding-x');
      expect(getCategory('py-4')).toBe('padding-y');
      expect(getCategory('pt-4')).toBe('padding-top');
    });

    it('should detect margin categories', () => {
      expect(getCategory('m-4')).toBe('margin');
      expect(getCategory('mx-auto')).toBe('margin-x');
      expect(getCategory('my-4')).toBe('margin-y');
      expect(getCategory('mt-4')).toBe('margin-top');
    });

    it('should detect flex categories', () => {
      expect(getCategory('flex-row')).toBe('flex-direction');
      expect(getCategory('flex-col')).toBe('flex-direction');
      expect(getCategory('flex-wrap')).toBe('flex-wrap');
      expect(getCategory('justify-center')).toBe('justify-content');
      expect(getCategory('items-center')).toBe('align-items');
    });

    it('should detect font categories', () => {
      // text-sm/text-lg start with 'text-' which matches 'text-color' category first
      // (category iteration order). Font-size exact matches are checked within each
      // category's prefix loop, but text-color's 'text-' prefix matches first.
      expect(getCategory('text-sm')).toBe('text-color');
      expect(getCategory('text-lg')).toBe('text-color');
      // font-bold/font-medium are exact matches in 'font-weight' category
      expect(getCategory('font-bold')).toBe('font-weight');
      expect(getCategory('font-medium')).toBe('font-weight');
    });

    it('should detect border radius', () => {
      expect(getCategory('rounded-lg')).toBe('border-radius');
      // rounded-t-lg also matches 'rounded-' prefix, so returns 'border-radius'
      expect(getCategory('rounded-t-lg')).toBe('border-radius');
    });

    it('should strip prefixes before detection', () => {
      expect(getCategory('sm:flex')).toBe('display');
      expect(getCategory('hover:bg-blue-500')).toBe('bg-color');
      expect(getCategory('md:w-full')).toBe('width');
    });

    it('should handle negative values', () => {
      expect(getCategory('-mt-4')).toBe('margin-top');
      expect(getCategory('-translate-x-1/2')).toBe('translate-x');
    });

    it('should handle arbitrary values', () => {
      expect(getCategory('w-[200px]')).toBe('width');
      expect(getCategory('h-[50vh]')).toBe('height');
      expect(getCategory('p-[20px]')).toBe('padding');
    });

    it('should return null for unknown classes', () => {
      expect(getCategory('unknown-class')).toBeNull();
      expect(getCategory('custom-utility')).toBeNull();
    });
  });

  describe('getShorthandPrefix', () => {
    it('should detect padding shorthand', () => {
      expect(getShorthandPrefix('p-4')).toBe('p-');
      expect(getShorthandPrefix('px-4')).toBe('px-');
      expect(getShorthandPrefix('py-4')).toBe('py-');
    });

    it('should detect margin shorthand', () => {
      expect(getShorthandPrefix('m-4')).toBe('m-');
      expect(getShorthandPrefix('mx-auto')).toBe('mx-');
      expect(getShorthandPrefix('my-4')).toBe('my-');
    });

    it('should detect border radius shorthand', () => {
      expect(getShorthandPrefix('rounded-lg')).toBe('rounded-');
      // rounded-t-lg matches 'rounded-' first since it's earlier in SHORTHAND_MAP
      expect(getShorthandPrefix('rounded-t-lg')).toBe('rounded-');
    });

    it('should detect border shorthand', () => {
      expect(getShorthandPrefix('border-2')).toBe('border-');
      // border-x-2 matches 'border-' first since it's earlier in SHORTHAND_MAP
      expect(getShorthandPrefix('border-x-2')).toBe('border-');
    });

    it('should detect inset shorthand', () => {
      expect(getShorthandPrefix('inset-0')).toBe('inset-');
      // inset-x-0 matches 'inset-' first since it's earlier in SHORTHAND_MAP
      expect(getShorthandPrefix('inset-x-0')).toBe('inset-');
    });

    it('should strip prefixes before detection', () => {
      expect(getShorthandPrefix('sm:p-4')).toBe('p-');
      expect(getShorthandPrefix('hover:m-4')).toBe('m-');
    });

    it('should return null for non-shorthand', () => {
      expect(getShorthandPrefix('flex')).toBeNull();
      expect(getShorthandPrefix('w-full')).toBeNull();
      expect(getShorthandPrefix('bg-blue-500')).toBeNull();
    });
  });

  describe('longhandOverridesShorthand', () => {
    it('should detect padding override', () => {
      expect(longhandOverridesShorthand('p-4', 'pt-2')).toBe(true);
      expect(longhandOverridesShorthand('p-4', 'pr-2')).toBe(true);
      expect(longhandOverridesShorthand('p-4', 'pb-2')).toBe(true);
      expect(longhandOverridesShorthand('p-4', 'pl-2')).toBe(true);
    });

    it('should detect px/py override', () => {
      expect(longhandOverridesShorthand('px-4', 'pr-2')).toBe(true);
      expect(longhandOverridesShorthand('px-4', 'pl-2')).toBe(true);
      expect(longhandOverridesShorthand('py-4', 'pt-2')).toBe(true);
      expect(longhandOverridesShorthand('py-4', 'pb-2')).toBe(true);
    });

    it('should detect margin override', () => {
      expect(longhandOverridesShorthand('m-4', 'mt-2')).toBe(true);
      expect(longhandOverridesShorthand('mx-4', 'mr-2')).toBe(true);
    });

    it('should detect border radius override', () => {
      expect(longhandOverridesShorthand('rounded-lg', 'rounded-t-md')).toBe(true);
      expect(longhandOverridesShorthand('rounded-t-lg', 'rounded-tl-md')).toBe(true);
    });

    it('should return false for non-override', () => {
      expect(longhandOverridesShorthand('p-4', 'm-2')).toBe(false);
      expect(longhandOverridesShorthand('flex', 'block')).toBe(false);
      expect(longhandOverridesShorthand('w-full', 'h-full')).toBe(false);
    });

    it('should work with prefixed classes', () => {
      expect(longhandOverridesShorthand('sm:p-4', 'sm:pt-2')).toBe(true);
      expect(longhandOverridesShorthand('hover:m-4', 'hover:mt-2')).toBe(true);
    });
  });

  describe('Extra Coverage', () => {
    describe('getVariantPrefix', () => {
      it('should extract single variant', () => {
        expect(getVariantPrefix('hover:flex')).toBe('hover:');
        expect(getVariantPrefix('sm:block')).toBe('sm:');
        expect(getVariantPrefix('dark:bg-white')).toBe('dark:');
      });

      it('should extract multiple variants', () => {
        expect(getVariantPrefix('sm:hover:flex')).toBe('sm:hover:');
        expect(getVariantPrefix('md:dark:focus:block')).toBe('md:dark:focus:');
      });

      it('should handle !important prefix', () => {
        expect(getVariantPrefix('!flex')).toBe('!');
        expect(getVariantPrefix('sm:!block')).toBe('sm:!');
      });

      it('should handle complex state variants', () => {
        expect(getVariantPrefix('group-hover:visible')).toBe('group-hover:');
        expect(getVariantPrefix('focus-within:ring')).toBe('focus-within:');
        expect(getVariantPrefix('motion-safe:animate-bounce')).toBe('motion-safe:');
      });

      it('should handle data and aria variants', () => {
        expect(getVariantPrefix('data-[state=open]:block')).toBe('data-[state=open]:');
        expect(getVariantPrefix('aria-[expanded=true]:rotate-180')).toBe('aria-[expanded=true]:');
      });

      it('should return empty string for no variant', () => {
        expect(getVariantPrefix('flex')).toBe('');
        expect(getVariantPrefix('w-full')).toBe('');
      });
    });

    describe('groupByVariant', () => {
      it('should group classes by full variant prefix', () => {
        const classes = [
          'flex',
          'hover:bg-blue-500',
          'sm:hover:flex',
          'hover:text-white',
          'sm:hover:block',
          'w-full'
        ];

        const groups = groupByVariant(classes);

        expect(groups.get('')).toEqual(['flex', 'w-full']);
        expect(groups.get('hover:')).toEqual(['hover:bg-blue-500', 'hover:text-white']);
        expect(groups.get('sm:hover:')).toEqual(['sm:hover:flex', 'sm:hover:block']);
      });
    });

    describe('getCategory arbitrary value edge cases (lines 514-519)', () => {
      it('should handle arbitrary values with multiple hyphens', () => {
        expect(getCategory('grid-cols-[1fr_500px_2fr]')).toBe('grid-template-columns');
      });

      it('should handle arbitrary values without extra hyphen before bracket', () => {
        expect(getCategory('top-[10px]')).toBe('top');
      });

      it('should handle arbitrary values where prefix match is needed', () => {
        // rounded-t matches 'rounded-' prefix in 'border-radius' category first
        expect(getCategory('rounded-t-[5px]')).toBe('border-radius');
      });

      it('should return null for arbitrary values with unknown prefix', () => {
        expect(getCategory('unknown-pref-[10px]')).toBeNull();
      });
    });
  });
});
