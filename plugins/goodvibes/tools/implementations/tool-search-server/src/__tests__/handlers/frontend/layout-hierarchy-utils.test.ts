/**
 * Unit tests for layout-hierarchy-utils
 *
 * Tests cover:
 * - parseWidthClass: fixed, fraction, arbitrary, and special width classes
 * - parseHeightClass: fixed, fraction, arbitrary, and special height classes
 * - parseTailwindClasses: comprehensive Tailwind class parsing
 * - Constants: TAILWIND_SPACING, TAILWIND_FRACTIONS
 */

import { describe, it, expect } from 'vitest';
import {
  parseWidthClass,
  parseHeightClass,
  parseTailwindClasses,
  TAILWIND_SPACING,
  TAILWIND_FRACTIONS,
} from '../../../handlers/frontend/layout-hierarchy-utils.js';

describe('layout-hierarchy-utils', () => {
  describe('TAILWIND_SPACING', () => {
    it('should have common spacing values', () => {
      expect(TAILWIND_SPACING['0']).toBe('0px');
      expect(TAILWIND_SPACING['px']).toBe('1px');
      expect(TAILWIND_SPACING['4']).toBe('1rem');
      expect(TAILWIND_SPACING['8']).toBe('2rem');
      expect(TAILWIND_SPACING['16']).toBe('4rem');
      expect(TAILWIND_SPACING['96']).toBe('24rem');
    });

    it('should have fractional spacing values', () => {
      expect(TAILWIND_SPACING['0.5']).toBe('0.125rem');
      expect(TAILWIND_SPACING['1.5']).toBe('0.375rem');
      expect(TAILWIND_SPACING['2.5']).toBe('0.625rem');
      expect(TAILWIND_SPACING['3.5']).toBe('0.875rem');
    });
  });

  describe('TAILWIND_FRACTIONS', () => {
    it('should have common fraction values', () => {
      expect(TAILWIND_FRACTIONS['1/2']).toBe('50%');
      expect(TAILWIND_FRACTIONS['1/3']).toBe('33.333333%');
      expect(TAILWIND_FRACTIONS['2/3']).toBe('66.666667%');
      expect(TAILWIND_FRACTIONS['1/4']).toBe('25%');
      expect(TAILWIND_FRACTIONS['3/4']).toBe('75%');
    });

    it('should have 12-column grid fractions', () => {
      expect(TAILWIND_FRACTIONS['1/12']).toBe('8.333333%');
      expect(TAILWIND_FRACTIONS['6/12']).toBe('50%');
      expect(TAILWIND_FRACTIONS['11/12']).toBe('91.666667%');
    });
  });

  describe('parseWidthClass', () => {
    describe('fixed widths from spacing scale', () => {
      it('should parse integer width classes', () => {
        expect(parseWidthClass('w-0')).toEqual({ strategy: 'fixed', value: '0px' });
        expect(parseWidthClass('w-4')).toEqual({ strategy: 'fixed', value: '1rem' });
        expect(parseWidthClass('w-16')).toEqual({ strategy: 'fixed', value: '4rem' });
        expect(parseWidthClass('w-96')).toEqual({ strategy: 'fixed', value: '24rem' });
      });

      it('should parse px width class', () => {
        expect(parseWidthClass('w-px')).toEqual({ strategy: 'fixed', value: '1px' });
      });

      it('should parse fractional spacing widths', () => {
        expect(parseWidthClass('w-0.5')).toEqual({ strategy: 'fixed', value: '0.125rem' });
        expect(parseWidthClass('w-1.5')).toEqual({ strategy: 'fixed', value: '0.375rem' });
        expect(parseWidthClass('w-2.5')).toEqual({ strategy: 'fixed', value: '0.625rem' });
      });

      it('should return undefined for invalid spacing values', () => {
        expect(parseWidthClass('w-999')).toBeUndefined();
        expect(parseWidthClass('w-abc')).toBeUndefined();
      });
    });

    describe('fraction widths', () => {
      it('should parse fraction width classes', () => {
        expect(parseWidthClass('w-1/2')).toEqual({ strategy: 'percentage', value: '50%' });
        expect(parseWidthClass('w-1/3')).toEqual({ strategy: 'percentage', value: '33.333333%' });
        expect(parseWidthClass('w-2/3')).toEqual({ strategy: 'percentage', value: '66.666667%' });
        expect(parseWidthClass('w-3/4')).toEqual({ strategy: 'percentage', value: '75%' });
      });

      it('should return undefined for invalid fractions', () => {
        expect(parseWidthClass('w-5/7')).toBeUndefined();
        expect(parseWidthClass('w-13/12')).toBeUndefined();
      });
    });

    describe('arbitrary values', () => {
      it('should parse arbitrary pixel values', () => {
        expect(parseWidthClass('w-[200px]')).toEqual({ strategy: 'fixed', value: '200px' });
        expect(parseWidthClass('w-[50rem]')).toEqual({ strategy: 'fixed', value: '50rem' });
      });

      it('should parse arbitrary percentage values', () => {
        expect(parseWidthClass('w-[50%]')).toEqual({ strategy: 'percentage', value: '50%' });
        expect(parseWidthClass('w-[75%]')).toEqual({ strategy: 'percentage', value: '75%' });
      });

      it('should parse arbitrary calc values', () => {
        expect(parseWidthClass('w-[calc(100%-2rem)]')).toEqual({
          strategy: 'fixed',
          value: 'calc(100%-2rem)',
        });
      });
    });

    describe('special width classes', () => {
      it('should parse w-auto', () => {
        expect(parseWidthClass('w-auto')).toEqual({ strategy: 'auto' });
      });

      it('should parse w-full', () => {
        expect(parseWidthClass('w-full')).toEqual({ strategy: 'percentage', value: '100%' });
      });

      it('should parse viewport width classes', () => {
        expect(parseWidthClass('w-screen')).toEqual({ strategy: 'fixed', value: '100vw' });
        expect(parseWidthClass('w-svw')).toEqual({ strategy: 'fixed', value: '100svw' });
        expect(parseWidthClass('w-lvw')).toEqual({ strategy: 'fixed', value: '100lvw' });
        expect(parseWidthClass('w-dvw')).toEqual({ strategy: 'fixed', value: '100dvw' });
      });

      it('should parse content-based width classes', () => {
        expect(parseWidthClass('w-min')).toEqual({ strategy: 'fit-content', value: 'min-content' });
        expect(parseWidthClass('w-max')).toEqual({ strategy: 'fit-content', value: 'max-content' });
        expect(parseWidthClass('w-fit')).toEqual({ strategy: 'fit-content', value: 'fit-content' });
      });
    });

    describe('unrecognized classes', () => {
      it('should return undefined for non-width classes', () => {
        expect(parseWidthClass('h-4')).toBeUndefined();
        expect(parseWidthClass('flex')).toBeUndefined();
        expect(parseWidthClass('bg-red-500')).toBeUndefined();
      });
    });
  });

  describe('parseHeightClass', () => {
    describe('fixed heights from spacing scale', () => {
      it('should parse integer height classes', () => {
        expect(parseHeightClass('h-0')).toEqual({ strategy: 'fixed', value: '0px' });
        expect(parseHeightClass('h-4')).toEqual({ strategy: 'fixed', value: '1rem' });
        expect(parseHeightClass('h-16')).toEqual({ strategy: 'fixed', value: '4rem' });
        expect(parseHeightClass('h-96')).toEqual({ strategy: 'fixed', value: '24rem' });
      });

      it('should parse px height class', () => {
        expect(parseHeightClass('h-px')).toEqual({ strategy: 'fixed', value: '1px' });
      });

      it('should parse fractional spacing heights', () => {
        expect(parseHeightClass('h-0.5')).toEqual({ strategy: 'fixed', value: '0.125rem' });
        expect(parseHeightClass('h-1.5')).toEqual({ strategy: 'fixed', value: '0.375rem' });
      });
    });

    describe('fraction heights', () => {
      it('should parse fraction height classes', () => {
        expect(parseHeightClass('h-1/2')).toEqual({ strategy: 'percentage', value: '50%' });
        expect(parseHeightClass('h-1/3')).toEqual({ strategy: 'percentage', value: '33.333333%' });
        expect(parseHeightClass('h-3/4')).toEqual({ strategy: 'percentage', value: '75%' });
      });
    });

    describe('arbitrary values', () => {
      it('should parse arbitrary pixel values', () => {
        expect(parseHeightClass('h-[300px]')).toEqual({ strategy: 'fixed', value: '300px' });
      });

      it('should parse arbitrary percentage values', () => {
        expect(parseHeightClass('h-[80%]')).toEqual({ strategy: 'percentage', value: '80%' });
      });
    });

    describe('special height classes', () => {
      it('should parse h-auto', () => {
        expect(parseHeightClass('h-auto')).toEqual({ strategy: 'auto' });
      });

      it('should parse h-full', () => {
        expect(parseHeightClass('h-full')).toEqual({ strategy: 'percentage', value: '100%' });
      });

      it('should parse viewport height classes', () => {
        expect(parseHeightClass('h-screen')).toEqual({ strategy: 'fixed', value: '100vh' });
        expect(parseHeightClass('h-svh')).toEqual({ strategy: 'fixed', value: '100svh' });
        expect(parseHeightClass('h-lvh')).toEqual({ strategy: 'fixed', value: '100lvh' });
        expect(parseHeightClass('h-dvh')).toEqual({ strategy: 'fixed', value: '100dvh' });
      });

      it('should parse content-based height classes', () => {
        expect(parseHeightClass('h-min')).toEqual({ strategy: 'fit-content', value: 'min-content' });
        expect(parseHeightClass('h-max')).toEqual({ strategy: 'fit-content', value: 'max-content' });
        expect(parseHeightClass('h-fit')).toEqual({ strategy: 'fit-content', value: 'fit-content' });
      });
    });
  });

  describe('parseTailwindClasses', () => {
    describe('width and height', () => {
      it('should parse width classes', () => {
        const result = parseTailwindClasses(['w-full']);
        expect(result.width).toEqual({ strategy: 'percentage', value: '100%' });
      });

      it('should parse height classes', () => {
        const result = parseTailwindClasses(['h-screen']);
        expect(result.height).toEqual({ strategy: 'fixed', value: '100vh' });
      });

      it('should use last value when multiple are specified', () => {
        const result = parseTailwindClasses(['w-4', 'w-8']);
        expect(result.width).toEqual({ strategy: 'fixed', value: '2rem' });
      });
    });

    describe('min/max width', () => {
      it('should parse min-w classes', () => {
        expect(parseTailwindClasses(['min-w-full']).minWidth).toBe('100%');
        expect(parseTailwindClasses(['min-w-min']).minWidth).toBe('min-content');
        expect(parseTailwindClasses(['min-w-max']).minWidth).toBe('max-content');
        expect(parseTailwindClasses(['min-w-fit']).minWidth).toBe('fit-content');
        expect(parseTailwindClasses(['min-w-0']).minWidth).toBe('0px');
      });

      it('should parse min-w arbitrary values', () => {
        expect(parseTailwindClasses(['min-w-[200px]']).minWidth).toBe('200px');
      });

      it('should parse min-w spacing values', () => {
        expect(parseTailwindClasses(['min-w-4']).minWidth).toBe('1rem');
      });

      it('should parse max-w named classes', () => {
        expect(parseTailwindClasses(['max-w-xs']).maxWidth).toBe('20rem');
        expect(parseTailwindClasses(['max-w-sm']).maxWidth).toBe('24rem');
        expect(parseTailwindClasses(['max-w-md']).maxWidth).toBe('28rem');
        expect(parseTailwindClasses(['max-w-lg']).maxWidth).toBe('32rem');
        expect(parseTailwindClasses(['max-w-xl']).maxWidth).toBe('36rem');
        expect(parseTailwindClasses(['max-w-2xl']).maxWidth).toBe('42rem');
        expect(parseTailwindClasses(['max-w-none']).maxWidth).toBe('none');
        expect(parseTailwindClasses(['max-w-prose']).maxWidth).toBe('65ch');
      });

      it('should parse max-w screen breakpoints', () => {
        expect(parseTailwindClasses(['max-w-screen-sm']).maxWidth).toBe('640px');
        expect(parseTailwindClasses(['max-w-screen-md']).maxWidth).toBe('768px');
        expect(parseTailwindClasses(['max-w-screen-lg']).maxWidth).toBe('1024px');
        expect(parseTailwindClasses(['max-w-screen-xl']).maxWidth).toBe('1280px');
        expect(parseTailwindClasses(['max-w-screen-2xl']).maxWidth).toBe('1536px');
      });

      it('should parse max-w arbitrary values', () => {
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
      });

      it('should parse max-h classes', () => {
        expect(parseTailwindClasses(['max-h-full']).maxHeight).toBe('100%');
        expect(parseTailwindClasses(['max-h-screen']).maxHeight).toBe('100vh');
        expect(parseTailwindClasses(['max-h-min']).maxHeight).toBe('min-content');
        expect(parseTailwindClasses(['max-h-max']).maxHeight).toBe('max-content');
        expect(parseTailwindClasses(['max-h-fit']).maxHeight).toBe('fit-content');
        expect(parseTailwindClasses(['max-h-none']).maxHeight).toBe('none');
      });

      it('should parse arbitrary height constraints', () => {
        expect(parseTailwindClasses(['min-h-[100px]']).minHeight).toBe('100px');
        expect(parseTailwindClasses(['max-h-[500px]']).maxHeight).toBe('500px');
      });

      it('should parse spacing values for height constraints', () => {
        expect(parseTailwindClasses(['min-h-4']).minHeight).toBe('1rem');
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

    describe('flex direction', () => {
      it('should parse flex direction classes', () => {
        expect(parseTailwindClasses(['flex-row']).flexDirection).toBe('row');
        expect(parseTailwindClasses(['flex-row-reverse']).flexDirection).toBe('row-reverse');
        expect(parseTailwindClasses(['flex-col']).flexDirection).toBe('column');
        expect(parseTailwindClasses(['flex-col-reverse']).flexDirection).toBe('column-reverse');
      });
    });

    describe('flex wrap', () => {
      it('should parse flex wrap classes', () => {
        expect(parseTailwindClasses(['flex-wrap']).flexWrap).toBe('wrap');
        expect(parseTailwindClasses(['flex-wrap-reverse']).flexWrap).toBe('wrap-reverse');
        expect(parseTailwindClasses(['flex-nowrap']).flexWrap).toBe('nowrap');
      });
    });

    describe('flex shorthand classes', () => {
      it('should parse flex-1', () => {
        const result = parseTailwindClasses(['flex-1']);
        expect(result.flexGrow).toBe(1);
        expect(result.flexShrink).toBe(1);
        expect(result.flexBasis).toBe('0%');
      });

      it('should parse flex-auto', () => {
        const result = parseTailwindClasses(['flex-auto']);
        expect(result.flexGrow).toBe(1);
        expect(result.flexShrink).toBe(1);
        expect(result.flexBasis).toBe('auto');
      });

      it('should parse flex-initial', () => {
        const result = parseTailwindClasses(['flex-initial']);
        expect(result.flexGrow).toBe(0);
        expect(result.flexShrink).toBe(1);
        expect(result.flexBasis).toBe('auto');
      });

      it('should parse flex-none', () => {
        const result = parseTailwindClasses(['flex-none']);
        expect(result.flexGrow).toBe(0);
        expect(result.flexShrink).toBe(0);
        expect(result.flexBasis).toBe('auto');
      });
    });

    describe('flex grow/shrink', () => {
      it('should parse grow classes', () => {
        expect(parseTailwindClasses(['grow']).flexGrow).toBe(1);
        expect(parseTailwindClasses(['flex-grow']).flexGrow).toBe(1);
        expect(parseTailwindClasses(['grow-0']).flexGrow).toBe(0);
        expect(parseTailwindClasses(['flex-grow-0']).flexGrow).toBe(0);
      });

      it('should parse shrink classes', () => {
        expect(parseTailwindClasses(['shrink']).flexShrink).toBe(1);
        expect(parseTailwindClasses(['flex-shrink']).flexShrink).toBe(1);
        expect(parseTailwindClasses(['shrink-0']).flexShrink).toBe(0);
        expect(parseTailwindClasses(['flex-shrink-0']).flexShrink).toBe(0);
      });
    });

    describe('flex basis', () => {
      it('should parse basis classes', () => {
        expect(parseTailwindClasses(['basis-auto']).flexBasis).toBe('auto');
        expect(parseTailwindClasses(['basis-full']).flexBasis).toBe('100%');
        expect(parseTailwindClasses(['basis-4']).flexBasis).toBe('1rem');
        expect(parseTailwindClasses(['basis-1/2']).flexBasis).toBe('50%');
        expect(parseTailwindClasses(['basis-[200px]']).flexBasis).toBe('200px');
      });
    });

    describe('align items', () => {
      it('should parse items classes', () => {
        expect(parseTailwindClasses(['items-start']).alignItems).toBe('flex-start');
        expect(parseTailwindClasses(['items-end']).alignItems).toBe('flex-end');
        expect(parseTailwindClasses(['items-center']).alignItems).toBe('center');
        expect(parseTailwindClasses(['items-baseline']).alignItems).toBe('baseline');
        expect(parseTailwindClasses(['items-stretch']).alignItems).toBe('stretch');
      });
    });

    describe('align self', () => {
      it('should parse self classes', () => {
        expect(parseTailwindClasses(['self-auto']).alignSelf).toBe('auto');
        expect(parseTailwindClasses(['self-start']).alignSelf).toBe('flex-start');
        expect(parseTailwindClasses(['self-end']).alignSelf).toBe('flex-end');
        expect(parseTailwindClasses(['self-center']).alignSelf).toBe('center');
        expect(parseTailwindClasses(['self-stretch']).alignSelf).toBe('stretch');
        expect(parseTailwindClasses(['self-baseline']).alignSelf).toBe('baseline');
      });
    });

    describe('justify content', () => {
      it('should parse justify classes', () => {
        expect(parseTailwindClasses(['justify-start']).justifyContent).toBe('flex-start');
        expect(parseTailwindClasses(['justify-end']).justifyContent).toBe('flex-end');
        expect(parseTailwindClasses(['justify-center']).justifyContent).toBe('center');
        expect(parseTailwindClasses(['justify-between']).justifyContent).toBe('space-between');
        expect(parseTailwindClasses(['justify-around']).justifyContent).toBe('space-around');
        expect(parseTailwindClasses(['justify-evenly']).justifyContent).toBe('space-evenly');
        expect(parseTailwindClasses(['justify-stretch']).justifyContent).toBe('stretch');
      });
    });

    describe('justify items', () => {
      it('should parse justify-items classes', () => {
        expect(parseTailwindClasses(['justify-items-start']).justifyItems).toBe('start');
        expect(parseTailwindClasses(['justify-items-end']).justifyItems).toBe('end');
        expect(parseTailwindClasses(['justify-items-center']).justifyItems).toBe('center');
        expect(parseTailwindClasses(['justify-items-stretch']).justifyItems).toBe('stretch');
      });
    });

    describe('gap', () => {
      it('should parse gap classes', () => {
        expect(parseTailwindClasses(['gap-4']).gap).toBe('1rem');
        expect(parseTailwindClasses(['gap-px']).gap).toBe('1px');
        expect(parseTailwindClasses(['gap-[20px]']).gap).toBe('20px');
      });
    });

    describe('grid templates', () => {
      it('should parse grid-cols classes', () => {
        expect(parseTailwindClasses(['grid-cols-1']).gridTemplateColumns).toBe('repeat(1, minmax(0, 1fr))');
        expect(parseTailwindClasses(['grid-cols-3']).gridTemplateColumns).toBe('repeat(3, minmax(0, 1fr))');
        expect(parseTailwindClasses(['grid-cols-12']).gridTemplateColumns).toBe('repeat(12, minmax(0, 1fr))');
        expect(parseTailwindClasses(['grid-cols-none']).gridTemplateColumns).toBe('none');
        expect(parseTailwindClasses(['grid-cols-[auto_1fr]']).gridTemplateColumns).toBe('auto_1fr');
      });

      it('should parse grid-rows classes', () => {
        expect(parseTailwindClasses(['grid-rows-1']).gridTemplateRows).toBe('repeat(1, minmax(0, 1fr))');
        expect(parseTailwindClasses(['grid-rows-3']).gridTemplateRows).toBe('repeat(3, minmax(0, 1fr))');
        expect(parseTailwindClasses(['grid-rows-none']).gridTemplateRows).toBe('none');
        expect(parseTailwindClasses(['grid-rows-[auto_1fr]']).gridTemplateRows).toBe('auto_1fr');
      });
    });

    describe('grid span', () => {
      it('should parse col-span classes', () => {
        expect(parseTailwindClasses(['col-span-1']).gridColumn).toBe('span 1 / span 1');
        expect(parseTailwindClasses(['col-span-6']).gridColumn).toBe('span 6 / span 6');
        expect(parseTailwindClasses(['col-span-full']).gridColumn).toBe('1 / -1');
      });

      it('should parse row-span classes', () => {
        expect(parseTailwindClasses(['row-span-1']).gridRow).toBe('span 1 / span 1');
        expect(parseTailwindClasses(['row-span-3']).gridRow).toBe('span 3 / span 3');
        expect(parseTailwindClasses(['row-span-full']).gridRow).toBe('1 / -1');
      });
    });

    describe('overflow', () => {
      it('should parse overflow classes', () => {
        expect(parseTailwindClasses(['overflow-auto']).overflow).toBe('auto');
        expect(parseTailwindClasses(['overflow-hidden']).overflow).toBe('hidden');
        expect(parseTailwindClasses(['overflow-clip']).overflow).toBe('clip');
        expect(parseTailwindClasses(['overflow-visible']).overflow).toBe('visible');
        expect(parseTailwindClasses(['overflow-scroll']).overflow).toBe('scroll');
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

    describe('complex class combinations', () => {
      it('should parse multiple classes correctly', () => {
        const result = parseTailwindClasses([
          'flex',
          'flex-col',
          'items-center',
          'justify-between',
          'gap-4',
          'w-full',
          'h-screen',
          'overflow-hidden',
          'relative',
        ]);

        expect(result.display).toBe('flex');
        expect(result.flexDirection).toBe('column');
        expect(result.alignItems).toBe('center');
        expect(result.justifyContent).toBe('space-between');
        expect(result.gap).toBe('1rem');
        expect(result.width).toEqual({ strategy: 'percentage', value: '100%' });
        expect(result.height).toEqual({ strategy: 'fixed', value: '100vh' });
        expect(result.overflow).toBe('hidden');
        expect(result.position).toBe('relative');
      });

      it('should return empty object for empty input', () => {
        const result = parseTailwindClasses([]);
        expect(Object.keys(result).length).toBe(0);
      });

      it('should ignore unrecognized classes', () => {
        const result = parseTailwindClasses(['unknown-class', 'flex', 'another-unknown']);
        expect(result.display).toBe('flex');
      });

      it('should parse special variants (lines 214, 223, 289, 323, 340, 356, 451, 518)', () => {
        const result = parseTailwindClasses([
          'min-w-0',
          'min-w-[10px]',
          'min-h-[20px]',
          'max-h-[30px]',
          'max-h-4',
          'inline-block',
          'gap-[5px]',
          'grid-rows-[1fr_auto]'
        ]);
        expect(result.minWidth).toBe('10px');
        // Re-parse individually to be sure
        expect(parseTailwindClasses(['min-w-0']).minWidth).toBe('0px');
        expect(parseTailwindClasses(['min-w-[10px]']).minWidth).toBe('10px');
        expect(parseTailwindClasses(['min-h-[20px]']).minHeight).toBe('20px');
        expect(parseTailwindClasses(['max-h-[30px]']).maxHeight).toBe('30px');
        expect(parseTailwindClasses(['max-h-4']).maxHeight).toBe('1rem');
        expect(parseTailwindClasses(['inline-block']).display).toBe('inline-block');
        expect(parseTailwindClasses(['gap-[5px]']).gap).toBe('5px');
        expect(parseTailwindClasses(['grid-rows-[1fr_auto]']).gridTemplateRows).toBe('1fr_auto');
      });
    });
  });
});
