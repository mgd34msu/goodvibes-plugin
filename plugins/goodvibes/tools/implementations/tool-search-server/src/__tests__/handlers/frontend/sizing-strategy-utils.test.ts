/**
 * Unit tests for sizing-strategy-utils
 *
 * Tests cover:
 * - parseWidthClass: width strategy detection
 * - parseHeightClass: height strategy detection
 * - parseTailwindClasses: comprehensive class parsing
 * - createElementIdentifier: identifier generation
 * - Constants: TAILWIND_SPACING, TAILWIND_FRACTIONS, MAX_WIDTH_VALUES
 */

import { describe, it, expect } from 'vitest';
import {
  parseWidthClass,
  parseHeightClass,
  parseTailwindClasses,
  createElementIdentifier,
  TAILWIND_SPACING,
  TAILWIND_FRACTIONS,
  MAX_WIDTH_VALUES,
} from '../../../handlers/frontend/sizing-strategy-utils.js';

describe('sizing-strategy-utils', () => {
  describe('constants', () => {
    it('should have TAILWIND_SPACING values', () => {
      expect(TAILWIND_SPACING['0']).toBe('0px');
      expect(TAILWIND_SPACING['4']).toBe('1rem');
      expect(TAILWIND_SPACING['96']).toBe('24rem');
    });

    it('should have TAILWIND_FRACTIONS values', () => {
      expect(TAILWIND_FRACTIONS['1/2']).toBe('50%');
      expect(TAILWIND_FRACTIONS['1/3']).toBe('33.333333%');
      expect(TAILWIND_FRACTIONS['3/4']).toBe('75%');
    });

    it('should have MAX_WIDTH_VALUES values', () => {
      expect(MAX_WIDTH_VALUES['xs']).toBe('20rem');
      expect(MAX_WIDTH_VALUES['prose']).toBe('65ch');
      expect(MAX_WIDTH_VALUES['screen-lg']).toBe('1024px');
    });
  });

  describe('parseWidthClass', () => {
    describe('fixed widths', () => {
      it('should parse spacing scale widths', () => {
        expect(parseWidthClass('w-0')).toEqual({ strategy: 'fixed', value: '0px' });
        expect(parseWidthClass('w-4')).toEqual({ strategy: 'fixed', value: '1rem' });
        expect(parseWidthClass('w-px')).toEqual({ strategy: 'fixed', value: '1px' });
        expect(parseWidthClass('w-0.5')).toEqual({ strategy: 'fixed', value: '0.125rem' });
      });

      it('should return undefined for invalid spacing values', () => {
        expect(parseWidthClass('w-999')).toBeUndefined();
      });
    });

    describe('percentage widths', () => {
      it('should parse fraction widths', () => {
        expect(parseWidthClass('w-1/2')).toEqual({ strategy: 'percentage', value: '50%' });
        expect(parseWidthClass('w-1/3')).toEqual({ strategy: 'percentage', value: '33.333333%' });
        expect(parseWidthClass('w-3/4')).toEqual({ strategy: 'percentage', value: '75%' });
      });

      it('should return undefined for invalid fractions', () => {
        expect(parseWidthClass('w-5/7')).toBeUndefined();
      });
    });

    describe('arbitrary values', () => {
      it('should parse fixed arbitrary values', () => {
        expect(parseWidthClass('w-[200px]')).toEqual({ strategy: 'fixed', value: '200px' });
        expect(parseWidthClass('w-[50rem]')).toEqual({ strategy: 'fixed', value: '50rem' });
      });

      it('should parse percentage arbitrary values', () => {
        expect(parseWidthClass('w-[50%]')).toEqual({ strategy: 'percentage', value: '50%' });
      });

      it('should parse viewport arbitrary values', () => {
        expect(parseWidthClass('w-[50vw]')).toEqual({ strategy: 'viewport', value: '50vw' });
        expect(parseWidthClass('w-[100dvw]')).toEqual({ strategy: 'viewport', value: '100dvw' });
        expect(parseWidthClass('w-[100svw]')).toEqual({ strategy: 'viewport', value: '100svw' });
        expect(parseWidthClass('w-[100lvw]')).toEqual({ strategy: 'viewport', value: '100lvw' });
      });
    });

    describe('special width classes', () => {
      it('should parse auto', () => {
        expect(parseWidthClass('w-auto')).toEqual({ strategy: 'auto', value: 'auto' });
      });

      it('should parse full', () => {
        expect(parseWidthClass('w-full')).toEqual({ strategy: 'percentage', value: '100%' });
      });

      it('should parse viewport widths', () => {
        expect(parseWidthClass('w-screen')).toEqual({ strategy: 'viewport', value: '100vw' });
        expect(parseWidthClass('w-svw')).toEqual({ strategy: 'viewport', value: '100svw' });
        expect(parseWidthClass('w-lvw')).toEqual({ strategy: 'viewport', value: '100lvw' });
        expect(parseWidthClass('w-dvw')).toEqual({ strategy: 'viewport', value: '100dvw' });
      });

      it('should parse content-based widths', () => {
        expect(parseWidthClass('w-min')).toEqual({ strategy: 'content-based', value: 'min-content' });
        expect(parseWidthClass('w-max')).toEqual({ strategy: 'content-based', value: 'max-content' });
        expect(parseWidthClass('w-fit')).toEqual({ strategy: 'content-based', value: 'fit-content' });
      });
    });
  });

  describe('parseHeightClass', () => {
    describe('fixed heights', () => {
      it('should parse spacing scale heights', () => {
        expect(parseHeightClass('h-0')).toEqual({ strategy: 'fixed', value: '0px' });
        expect(parseHeightClass('h-4')).toEqual({ strategy: 'fixed', value: '1rem' });
        expect(parseHeightClass('h-px')).toEqual({ strategy: 'fixed', value: '1px' });
      });
    });

    describe('percentage heights', () => {
      it('should parse fraction heights', () => {
        expect(parseHeightClass('h-1/2')).toEqual({ strategy: 'percentage', value: '50%' });
        expect(parseHeightClass('h-3/4')).toEqual({ strategy: 'percentage', value: '75%' });
      });
    });

    describe('arbitrary values', () => {
      it('should parse fixed arbitrary values', () => {
        expect(parseHeightClass('h-[300px]')).toEqual({ strategy: 'fixed', value: '300px' });
      });

      it('should parse percentage arbitrary values', () => {
        expect(parseHeightClass('h-[80%]')).toEqual({ strategy: 'percentage', value: '80%' });
      });

      it('should parse viewport arbitrary values', () => {
        expect(parseHeightClass('h-[50vh]')).toEqual({ strategy: 'viewport', value: '50vh' });
        expect(parseHeightClass('h-[100dvh]')).toEqual({ strategy: 'viewport', value: '100dvh' });
        expect(parseHeightClass('h-[100svh]')).toEqual({ strategy: 'viewport', value: '100svh' });
        expect(parseHeightClass('h-[100lvh]')).toEqual({ strategy: 'viewport', value: '100lvh' });
      });
    });

    describe('special height classes', () => {
      it('should parse auto', () => {
        expect(parseHeightClass('h-auto')).toEqual({ strategy: 'auto', value: 'auto' });
      });

      it('should parse full', () => {
        expect(parseHeightClass('h-full')).toEqual({ strategy: 'percentage', value: '100%' });
      });

      it('should parse viewport heights', () => {
        expect(parseHeightClass('h-screen')).toEqual({ strategy: 'viewport', value: '100vh' });
        expect(parseHeightClass('h-svh')).toEqual({ strategy: 'viewport', value: '100svh' });
        expect(parseHeightClass('h-lvh')).toEqual({ strategy: 'viewport', value: '100lvh' });
        expect(parseHeightClass('h-dvh')).toEqual({ strategy: 'viewport', value: '100dvh' });
      });

      it('should parse content-based heights', () => {
        expect(parseHeightClass('h-min')).toEqual({ strategy: 'content-based', value: 'min-content' });
        expect(parseHeightClass('h-max')).toEqual({ strategy: 'content-based', value: 'max-content' });
        expect(parseHeightClass('h-fit')).toEqual({ strategy: 'content-based', value: 'fit-content' });
      });
    });
  });

  describe('parseTailwindClasses', () => {
    it('should have default values', () => {
      const result = parseTailwindClasses([]);
      expect(result.display).toBe('block');
      expect(result.position).toBe('static');
      expect(result.overflowX).toBe('visible');
      expect(result.overflowY).toBe('visible');
    });

    describe('width parsing', () => {
      it('should parse width with classes array', () => {
        const result = parseTailwindClasses(['w-full']);
        expect(result.width).toEqual({
          strategy: 'percentage',
          value: '100%',
          classes: ['w-full'],
        });
      });

      it('should accumulate width classes', () => {
        const result = parseTailwindClasses(['w-4', 'w-8']);
        expect(result.width?.classes).toContain('w-8');
      });
    });

    describe('height parsing', () => {
      it('should parse height with classes array', () => {
        const result = parseTailwindClasses(['h-screen']);
        expect(result.height).toEqual({
          strategy: 'viewport',
          value: '100vh',
          classes: ['h-screen'],
        });
      });
    });

    describe('min/max width', () => {
      it('should parse min-w classes', () => {
        expect(parseTailwindClasses(['min-w-full']).minWidth).toBe('100%');
        expect(parseTailwindClasses(['min-w-min']).minWidth).toBe('min-content');
        expect(parseTailwindClasses(['min-w-max']).minWidth).toBe('max-content');
        expect(parseTailwindClasses(['min-w-fit']).minWidth).toBe('fit-content');
        expect(parseTailwindClasses(['min-w-0']).minWidth).toBe('0px');
        expect(parseTailwindClasses(['min-w-[200px]']).minWidth).toBe('200px');
        expect(parseTailwindClasses(['min-w-4']).minWidth).toBe('1rem');
      });

      it('should parse max-w classes', () => {
        expect(parseTailwindClasses(['max-w-xs']).maxWidth).toBe('20rem');
        expect(parseTailwindClasses(['max-w-prose']).maxWidth).toBe('65ch');
        expect(parseTailwindClasses(['max-w-[500px]']).maxWidth).toBe('500px');
      });
    });

    describe('min/max height', () => {
      it('should parse min-h classes', () => {
        expect(parseTailwindClasses(['min-h-full']).minHeight).toBe('100%');
        expect(parseTailwindClasses(['min-h-screen']).minHeight).toBe('100vh');
        expect(parseTailwindClasses(['min-h-min']).minHeight).toBe('min-content');
        expect(parseTailwindClasses(['min-h-max']).minHeight).toBe('max-content');
        expect(parseTailwindClasses(['min-h-fit']).minHeight).toBe('fit-content');
        expect(parseTailwindClasses(['min-h-0']).minHeight).toBe('0px');
        expect(parseTailwindClasses(['min-h-[100px]']).minHeight).toBe('100px');
        expect(parseTailwindClasses(['min-h-4']).minHeight).toBe('1rem');
      });

      it('should parse max-h classes', () => {
        expect(parseTailwindClasses(['max-h-full']).maxHeight).toBe('100%');
        expect(parseTailwindClasses(['max-h-screen']).maxHeight).toBe('100vh');
        expect(parseTailwindClasses(['max-h-min']).maxHeight).toBe('min-content');
        expect(parseTailwindClasses(['max-h-max']).maxHeight).toBe('max-content');
        expect(parseTailwindClasses(['max-h-fit']).maxHeight).toBe('fit-content');
        expect(parseTailwindClasses(['max-h-none']).maxHeight).toBe('none');
        expect(parseTailwindClasses(['max-h-[500px]']).maxHeight).toBe('500px');
        expect(parseTailwindClasses(['max-h-8']).maxHeight).toBe('2rem');
      });
    });

    describe('display', () => {
      it('should parse display classes', () => {
        expect(parseTailwindClasses(['block']).display).toBe('block');
        expect(parseTailwindClasses(['inline-block']).display).toBe('inline-block');
        expect(parseTailwindClasses(['inline']).display).toBe('inline');
        expect(parseTailwindClasses(['flex']).display).toBe('flex');
        expect(parseTailwindClasses(['inline-flex']).display).toBe('inline-flex');
        expect(parseTailwindClasses(['grid']).display).toBe('grid');
        expect(parseTailwindClasses(['inline-grid']).display).toBe('inline-grid');
        expect(parseTailwindClasses(['contents']).display).toBe('contents');
        expect(parseTailwindClasses(['hidden']).display).toBe('none');
      });
    });

    describe('flex properties', () => {
      it('should parse flex direction', () => {
        expect(parseTailwindClasses(['flex-row']).flexDirection).toBe('row');
        expect(parseTailwindClasses(['flex-row-reverse']).flexDirection).toBe('row-reverse');
        expect(parseTailwindClasses(['flex-col']).flexDirection).toBe('column');
        expect(parseTailwindClasses(['flex-col-reverse']).flexDirection).toBe('column-reverse');
      });

      it('should parse flex shorthand classes', () => {
        let result = parseTailwindClasses(['flex-1']);
        expect(result.flexGrow).toBe(1);
        expect(result.flexShrink).toBe(1);
        expect(result.flexBasis).toBe('0%');

        result = parseTailwindClasses(['flex-auto']);
        expect(result.flexGrow).toBe(1);
        expect(result.flexShrink).toBe(1);
        expect(result.flexBasis).toBe('auto');

        result = parseTailwindClasses(['flex-initial']);
        expect(result.flexGrow).toBe(0);
        expect(result.flexShrink).toBe(1);
        expect(result.flexBasis).toBe('auto');

        result = parseTailwindClasses(['flex-none']);
        expect(result.flexGrow).toBe(0);
        expect(result.flexShrink).toBe(0);
        expect(result.flexBasis).toBe('auto');
      });

      it('should parse grow/shrink classes', () => {
        expect(parseTailwindClasses(['grow']).flexGrow).toBe(1);
        expect(parseTailwindClasses(['flex-grow']).flexGrow).toBe(1);
        expect(parseTailwindClasses(['grow-0']).flexGrow).toBe(0);
        expect(parseTailwindClasses(['flex-grow-0']).flexGrow).toBe(0);

        expect(parseTailwindClasses(['shrink']).flexShrink).toBe(1);
        expect(parseTailwindClasses(['flex-shrink']).flexShrink).toBe(1);
        expect(parseTailwindClasses(['shrink-0']).flexShrink).toBe(0);
        expect(parseTailwindClasses(['flex-shrink-0']).flexShrink).toBe(0);
      });

      it('should parse basis classes', () => {
        expect(parseTailwindClasses(['basis-auto']).flexBasis).toBe('auto');
        expect(parseTailwindClasses(['basis-full']).flexBasis).toBe('100%');
        expect(parseTailwindClasses(['basis-4']).flexBasis).toBe('1rem');
        expect(parseTailwindClasses(['basis-1/2']).flexBasis).toBe('50%');
        expect(parseTailwindClasses(['basis-[200px]']).flexBasis).toBe('200px');
      });
    });

    describe('grid properties', () => {
      it('should parse grid column span', () => {
        expect(parseTailwindClasses(['col-span-1']).gridColumn).toBe('span 1 / span 1');
        expect(parseTailwindClasses(['col-span-6']).gridColumn).toBe('span 6 / span 6');
        expect(parseTailwindClasses(['col-span-full']).gridColumn).toBe('1 / -1');
      });

      it('should parse grid row span', () => {
        expect(parseTailwindClasses(['row-span-1']).gridRow).toBe('span 1 / span 1');
        expect(parseTailwindClasses(['row-span-3']).gridRow).toBe('span 3 / span 3');
        expect(parseTailwindClasses(['row-span-full']).gridRow).toBe('1 / -1');
      });

      it('should parse col-start/col-end', () => {
        expect(parseTailwindClasses(['col-start-1']).gridColumn).toBe('1');
        expect(parseTailwindClasses(['col-start-auto']).gridColumn).toBe('auto');
        expect(parseTailwindClasses(['col-end-3']).gridColumn).toBe('auto / 3');
      });

      it('should parse grid-cols', () => {
        expect(parseTailwindClasses(['grid-cols-1']).gridTemplateColumns).toBe('repeat(1, minmax(0, 1fr))');
        expect(parseTailwindClasses(['grid-cols-12']).gridTemplateColumns).toBe('repeat(12, minmax(0, 1fr))');
        expect(parseTailwindClasses(['grid-cols-none']).gridTemplateColumns).toBe('none');
        expect(parseTailwindClasses(['grid-cols-[auto_1fr]']).gridTemplateColumns).toBe('auto_1fr');
      });

      it('should parse grid-rows', () => {
        expect(parseTailwindClasses(['grid-rows-1']).gridTemplateRows).toBe('repeat(1, minmax(0, 1fr))');
        expect(parseTailwindClasses(['grid-rows-6']).gridTemplateRows).toBe('repeat(6, minmax(0, 1fr))');
        expect(parseTailwindClasses(['grid-rows-none']).gridTemplateRows).toBe('none');
        expect(parseTailwindClasses(['grid-rows-[auto_1fr]']).gridTemplateRows).toBe('auto_1fr');
      });
    });

    describe('overflow', () => {
      it('should parse overflow classes', () => {
        const result = parseTailwindClasses(['overflow-hidden']);
        expect(result.overflowX).toBe('hidden');
        expect(result.overflowY).toBe('hidden');
      });

      it('should parse overflow-x classes', () => {
        expect(parseTailwindClasses(['overflow-x-auto']).overflowX).toBe('auto');
        expect(parseTailwindClasses(['overflow-x-hidden']).overflowX).toBe('hidden');
        expect(parseTailwindClasses(['overflow-x-clip']).overflowX).toBe('clip');
        expect(parseTailwindClasses(['overflow-x-visible']).overflowX).toBe('visible');
        expect(parseTailwindClasses(['overflow-x-scroll']).overflowX).toBe('scroll');
      });

      it('should parse overflow-y classes', () => {
        expect(parseTailwindClasses(['overflow-y-auto']).overflowY).toBe('auto');
        expect(parseTailwindClasses(['overflow-y-hidden']).overflowY).toBe('hidden');
        expect(parseTailwindClasses(['overflow-y-clip']).overflowY).toBe('clip');
        expect(parseTailwindClasses(['overflow-y-visible']).overflowY).toBe('visible');
        expect(parseTailwindClasses(['overflow-y-scroll']).overflowY).toBe('scroll');
      });
    });

    describe('position', () => {
      it('should parse position classes', () => {
        expect(parseTailwindClasses(['static']).position).toBe('static');
        expect(parseTailwindClasses(['fixed']).position).toBe('fixed');
        expect(parseTailwindClasses(['absolute']).position).toBe('absolute');
        expect(parseTailwindClasses(['relative']).position).toBe('relative');
        expect(parseTailwindClasses(['sticky']).position).toBe('sticky');
      });
    });
  });

  describe('createElementIdentifier', () => {
    it('should use id if present', () => {
      expect(createElementIdentifier('div', ['flex'], 'main')).toBe('div#main');
    });

    it('should use layout classes if no id', () => {
      expect(createElementIdentifier('div', ['flex', 'w-full', 'h-screen', 'bg-white'], undefined)).toBe(
        'div.flex.w-full.h-screen'
      );
    });

    it('should use first few classes if no layout classes', () => {
      expect(createElementIdentifier('div', ['bg-white', 'text-black'], undefined)).toBe(
        'div.bg-white.text-black'
      );
    });

    it('should return tag name only if no classes', () => {
      expect(createElementIdentifier('span', [], undefined)).toBe('span');
    });

    it('should identify grid classes', () => {
      expect(createElementIdentifier('div', ['grid', 'bg-white'], undefined)).toBe('div.grid');
    });

    it('should identify overflow classes', () => {
      expect(createElementIdentifier('div', ['overflow-hidden', 'bg-white'], undefined)).toBe(
        'div.overflow-hidden'
      );
    });
  });
});
