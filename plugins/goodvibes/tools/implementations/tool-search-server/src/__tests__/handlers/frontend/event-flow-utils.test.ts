/**
 * Unit tests for event-flow-utils
 *
 * Tests cover:
 * - EVENT_PROPS: React event prop mapping
 * - BUBBLING_EVENTS: bubbling event set
 * - INTERACTIVE_ELEMENTS: interactive element set
 * - NON_INTERACTIVE_ELEMENTS: non-interactive element set
 * - normalizeFilePath: path normalization
 */

import { describe, it, expect } from 'vitest';
import {
  EVENT_PROPS,
  BUBBLING_EVENTS,
  INTERACTIVE_ELEMENTS,
  NON_INTERACTIVE_ELEMENTS,
  normalizeFilePath,
} from '../../../handlers/frontend/event-flow-utils.js';

describe('event-flow-utils', () => {
  describe('EVENT_PROPS', () => {
    describe('mouse events', () => {
      it('should map mouse event props', () => {
        expect(EVENT_PROPS['onClick']).toBe('click');
        expect(EVENT_PROPS['onDoubleClick']).toBe('dblclick');
        expect(EVENT_PROPS['onMouseDown']).toBe('mousedown');
        expect(EVENT_PROPS['onMouseUp']).toBe('mouseup');
        expect(EVENT_PROPS['onMouseEnter']).toBe('mouseenter');
        expect(EVENT_PROPS['onMouseLeave']).toBe('mouseleave');
        expect(EVENT_PROPS['onMouseMove']).toBe('mousemove');
        expect(EVENT_PROPS['onMouseOver']).toBe('mouseover');
        expect(EVENT_PROPS['onMouseOut']).toBe('mouseout');
        expect(EVENT_PROPS['onContextMenu']).toBe('contextmenu');
      });
    });

    describe('form events', () => {
      it('should map form event props', () => {
        expect(EVENT_PROPS['onChange']).toBe('change');
        expect(EVENT_PROPS['onInput']).toBe('input');
        expect(EVENT_PROPS['onSubmit']).toBe('submit');
        expect(EVENT_PROPS['onReset']).toBe('reset');
        expect(EVENT_PROPS['onFocus']).toBe('focus');
        expect(EVENT_PROPS['onBlur']).toBe('blur');
      });
    });

    describe('keyboard events', () => {
      it('should map keyboard event props', () => {
        expect(EVENT_PROPS['onKeyDown']).toBe('keydown');
        expect(EVENT_PROPS['onKeyUp']).toBe('keyup');
        expect(EVENT_PROPS['onKeyPress']).toBe('keypress');
      });
    });

    describe('touch events', () => {
      it('should map touch event props', () => {
        expect(EVENT_PROPS['onTouchStart']).toBe('touchstart');
        expect(EVENT_PROPS['onTouchEnd']).toBe('touchend');
        expect(EVENT_PROPS['onTouchMove']).toBe('touchmove');
        expect(EVENT_PROPS['onTouchCancel']).toBe('touchcancel');
      });
    });

    describe('drag events', () => {
      it('should map drag event props', () => {
        expect(EVENT_PROPS['onDrag']).toBe('drag');
        expect(EVENT_PROPS['onDragStart']).toBe('dragstart');
        expect(EVENT_PROPS['onDragEnd']).toBe('dragend');
        expect(EVENT_PROPS['onDragEnter']).toBe('dragenter');
        expect(EVENT_PROPS['onDragLeave']).toBe('dragleave');
        expect(EVENT_PROPS['onDragOver']).toBe('dragover');
        expect(EVENT_PROPS['onDrop']).toBe('drop');
      });
    });

    describe('scroll/wheel events', () => {
      it('should map scroll event props', () => {
        expect(EVENT_PROPS['onScroll']).toBe('scroll');
        expect(EVENT_PROPS['onWheel']).toBe('wheel');
      });
    });

    describe('pointer events', () => {
      it('should map pointer event props', () => {
        expect(EVENT_PROPS['onPointerDown']).toBe('pointerdown');
        expect(EVENT_PROPS['onPointerUp']).toBe('pointerup');
        expect(EVENT_PROPS['onPointerMove']).toBe('pointermove');
        expect(EVENT_PROPS['onPointerEnter']).toBe('pointerenter');
        expect(EVENT_PROPS['onPointerLeave']).toBe('pointerleave');
        expect(EVENT_PROPS['onPointerCancel']).toBe('pointercancel');
      });
    });

    describe('clipboard events', () => {
      it('should map clipboard event props', () => {
        expect(EVENT_PROPS['onCopy']).toBe('copy');
        expect(EVENT_PROPS['onCut']).toBe('cut');
        expect(EVENT_PROPS['onPaste']).toBe('paste');
      });
    });

    describe('animation events', () => {
      it('should map animation event props', () => {
        expect(EVENT_PROPS['onAnimationStart']).toBe('animationstart');
        expect(EVENT_PROPS['onAnimationEnd']).toBe('animationend');
        expect(EVENT_PROPS['onAnimationIteration']).toBe('animationiteration');
      });
    });

    describe('transition events', () => {
      it('should map transition event props', () => {
        expect(EVENT_PROPS['onTransitionEnd']).toBe('transitionend');
      });
    });
  });

  describe('BUBBLING_EVENTS', () => {
    it('should include common bubbling events', () => {
      expect(BUBBLING_EVENTS.has('click')).toBe(true);
      expect(BUBBLING_EVENTS.has('dblclick')).toBe(true);
      expect(BUBBLING_EVENTS.has('mousedown')).toBe(true);
      expect(BUBBLING_EVENTS.has('mouseup')).toBe(true);
      expect(BUBBLING_EVENTS.has('keydown')).toBe(true);
      expect(BUBBLING_EVENTS.has('keyup')).toBe(true);
      expect(BUBBLING_EVENTS.has('change')).toBe(true);
      expect(BUBBLING_EVENTS.has('input')).toBe(true);
      expect(BUBBLING_EVENTS.has('submit')).toBe(true);
    });

    it('should include drag events', () => {
      expect(BUBBLING_EVENTS.has('drag')).toBe(true);
      expect(BUBBLING_EVENTS.has('dragstart')).toBe(true);
      expect(BUBBLING_EVENTS.has('drop')).toBe(true);
    });

    it('should include pointer events', () => {
      expect(BUBBLING_EVENTS.has('pointerdown')).toBe(true);
      expect(BUBBLING_EVENTS.has('pointerup')).toBe(true);
      expect(BUBBLING_EVENTS.has('pointermove')).toBe(true);
    });

    it('should include clipboard events', () => {
      expect(BUBBLING_EVENTS.has('copy')).toBe(true);
      expect(BUBBLING_EVENTS.has('cut')).toBe(true);
      expect(BUBBLING_EVENTS.has('paste')).toBe(true);
    });

    it('should not include non-bubbling events', () => {
      // mouseenter and mouseleave don't bubble
      expect(BUBBLING_EVENTS.has('mouseenter')).toBe(false);
      expect(BUBBLING_EVENTS.has('mouseleave')).toBe(false);
      // focus and blur don't bubble
      expect(BUBBLING_EVENTS.has('focus')).toBe(false);
      expect(BUBBLING_EVENTS.has('blur')).toBe(false);
    });
  });

  describe('INTERACTIVE_ELEMENTS', () => {
    it('should include button', () => {
      expect(INTERACTIVE_ELEMENTS.has('button')).toBe(true);
    });

    it('should include anchor', () => {
      expect(INTERACTIVE_ELEMENTS.has('a')).toBe(true);
    });

    it('should include form elements', () => {
      expect(INTERACTIVE_ELEMENTS.has('input')).toBe(true);
      expect(INTERACTIVE_ELEMENTS.has('select')).toBe(true);
      expect(INTERACTIVE_ELEMENTS.has('textarea')).toBe(true);
    });

    it('should include details/summary', () => {
      expect(INTERACTIVE_ELEMENTS.has('summary')).toBe(true);
    });

    it('should not include non-interactive elements', () => {
      expect(INTERACTIVE_ELEMENTS.has('div')).toBe(false);
      expect(INTERACTIVE_ELEMENTS.has('span')).toBe(false);
      expect(INTERACTIVE_ELEMENTS.has('p')).toBe(false);
    });
  });

  describe('NON_INTERACTIVE_ELEMENTS', () => {
    it('should include common non-interactive elements', () => {
      expect(NON_INTERACTIVE_ELEMENTS.has('div')).toBe(true);
      expect(NON_INTERACTIVE_ELEMENTS.has('span')).toBe(true);
      expect(NON_INTERACTIVE_ELEMENTS.has('p')).toBe(true);
      expect(NON_INTERACTIVE_ELEMENTS.has('section')).toBe(true);
      expect(NON_INTERACTIVE_ELEMENTS.has('article')).toBe(true);
      expect(NON_INTERACTIVE_ELEMENTS.has('aside')).toBe(true);
      expect(NON_INTERACTIVE_ELEMENTS.has('header')).toBe(true);
      expect(NON_INTERACTIVE_ELEMENTS.has('footer')).toBe(true);
      expect(NON_INTERACTIVE_ELEMENTS.has('main')).toBe(true);
      expect(NON_INTERACTIVE_ELEMENTS.has('nav')).toBe(true);
    });

    it('should include list elements', () => {
      expect(NON_INTERACTIVE_ELEMENTS.has('li')).toBe(true);
      expect(NON_INTERACTIVE_ELEMENTS.has('ul')).toBe(true);
      expect(NON_INTERACTIVE_ELEMENTS.has('ol')).toBe(true);
    });

    it('should include table elements', () => {
      expect(NON_INTERACTIVE_ELEMENTS.has('table')).toBe(true);
      expect(NON_INTERACTIVE_ELEMENTS.has('tr')).toBe(true);
      expect(NON_INTERACTIVE_ELEMENTS.has('td')).toBe(true);
      expect(NON_INTERACTIVE_ELEMENTS.has('th')).toBe(true);
    });

    it('should include img', () => {
      expect(NON_INTERACTIVE_ELEMENTS.has('img')).toBe(true);
    });

    it('should not include interactive elements', () => {
      expect(NON_INTERACTIVE_ELEMENTS.has('button')).toBe(false);
      expect(NON_INTERACTIVE_ELEMENTS.has('a')).toBe(false);
      expect(NON_INTERACTIVE_ELEMENTS.has('input')).toBe(false);
    });
  });

  describe('normalizeFilePath', () => {
    it('should convert backslashes to forward slashes', () => {
      expect(normalizeFilePath('C:\\Users\\test\\file.tsx')).toBe('C:/Users/test/file.tsx');
      expect(normalizeFilePath('src\\components\\Button.tsx')).toBe('src/components/Button.tsx');
    });

    it('should leave forward slashes unchanged', () => {
      expect(normalizeFilePath('src/components/Button.tsx')).toBe('src/components/Button.tsx');
      expect(normalizeFilePath('/home/user/project/file.tsx')).toBe('/home/user/project/file.tsx');
    });

    it('should handle mixed slashes', () => {
      expect(normalizeFilePath('src\\components/nested\\Button.tsx')).toBe('src/components/nested/Button.tsx');
    });

    it('should handle empty string', () => {
      expect(normalizeFilePath('')).toBe('');
    });

    it('should handle paths without slashes', () => {
      expect(normalizeFilePath('file.tsx')).toBe('file.tsx');
    });
  });
});
