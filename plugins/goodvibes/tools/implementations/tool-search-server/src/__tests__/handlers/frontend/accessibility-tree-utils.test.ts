/**
 * Unit tests for accessibility-tree-utils
 *
 * Tests cover:
 * - SEMANTIC_ROLES: HTML element to ARIA role mapping
 * - INPUT_TYPE_ROLES: Input type to role mapping
 * - NATIVELY_FOCUSABLE: Focusable element set
 * - ARIA_PATTERNS: ARIA pattern definitions
 * - EXPECTED_KEYBOARD_INTERACTIONS: Keyboard interaction expectations
 * - getRole: role determination logic
 * - isFocusable: focusability detection
 * - getTabIndex: tab index calculation
 * - isHidden: hidden element detection
 */

import { describe, it, expect } from 'vitest';
import {
  SEMANTIC_ROLES,
  INPUT_TYPE_ROLES,
  NATIVELY_FOCUSABLE,
  ARIA_PATTERNS,
  EXPECTED_KEYBOARD_INTERACTIONS,
  getRole,
  isFocusable,
  getTabIndex,
  isHidden,
} from '../../../handlers/frontend/accessibility-tree-utils.js';

describe('accessibility-tree-utils', () => {
  describe('SEMANTIC_ROLES', () => {
    it('should have interactive element roles', () => {
      expect(SEMANTIC_ROLES['button']).toBe('button');
      expect(SEMANTIC_ROLES['a']).toBe('link');
      expect(SEMANTIC_ROLES['input']).toBe('textbox');
      expect(SEMANTIC_ROLES['select']).toBe('listbox');
      expect(SEMANTIC_ROLES['textarea']).toBe('textbox');
    });

    it('should have structural element roles', () => {
      expect(SEMANTIC_ROLES['nav']).toBe('navigation');
      expect(SEMANTIC_ROLES['header']).toBe('banner');
      expect(SEMANTIC_ROLES['footer']).toBe('contentinfo');
      expect(SEMANTIC_ROLES['main']).toBe('main');
      expect(SEMANTIC_ROLES['aside']).toBe('complementary');
      expect(SEMANTIC_ROLES['article']).toBe('article');
      expect(SEMANTIC_ROLES['section']).toBe('region');
    });

    it('should have list element roles', () => {
      expect(SEMANTIC_ROLES['ul']).toBe('list');
      expect(SEMANTIC_ROLES['ol']).toBe('list');
      expect(SEMANTIC_ROLES['li']).toBe('listitem');
    });

    it('should have table element roles', () => {
      expect(SEMANTIC_ROLES['table']).toBe('table');
      expect(SEMANTIC_ROLES['tr']).toBe('row');
      expect(SEMANTIC_ROLES['th']).toBe('columnheader');
      expect(SEMANTIC_ROLES['td']).toBe('cell');
    });

    it('should have heading element roles', () => {
      expect(SEMANTIC_ROLES['h1']).toBe('heading');
      expect(SEMANTIC_ROLES['h2']).toBe('heading');
      expect(SEMANTIC_ROLES['h3']).toBe('heading');
      expect(SEMANTIC_ROLES['h4']).toBe('heading');
      expect(SEMANTIC_ROLES['h5']).toBe('heading');
      expect(SEMANTIC_ROLES['h6']).toBe('heading');
    });

    it('should have form element roles', () => {
      expect(SEMANTIC_ROLES['form']).toBe('form');
      expect(SEMANTIC_ROLES['fieldset']).toBe('group');
      expect(SEMANTIC_ROLES['label']).toBe('label');
      expect(SEMANTIC_ROLES['progress']).toBe('progressbar');
    });

    it('should have media element roles', () => {
      expect(SEMANTIC_ROLES['img']).toBe('img');
      expect(SEMANTIC_ROLES['video']).toBe('video');
      expect(SEMANTIC_ROLES['audio']).toBe('audio');
    });
  });

  describe('INPUT_TYPE_ROLES', () => {
    it('should map text input types', () => {
      expect(INPUT_TYPE_ROLES['text']).toBe('textbox');
      expect(INPUT_TYPE_ROLES['password']).toBe('textbox');
      expect(INPUT_TYPE_ROLES['email']).toBe('textbox');
      expect(INPUT_TYPE_ROLES['tel']).toBe('textbox');
      expect(INPUT_TYPE_ROLES['url']).toBe('textbox');
    });

    it('should map button input types', () => {
      expect(INPUT_TYPE_ROLES['button']).toBe('button');
      expect(INPUT_TYPE_ROLES['submit']).toBe('button');
      expect(INPUT_TYPE_ROLES['reset']).toBe('button');
      expect(INPUT_TYPE_ROLES['image']).toBe('button');
    });

    it('should map checkbox and radio', () => {
      expect(INPUT_TYPE_ROLES['checkbox']).toBe('checkbox');
      expect(INPUT_TYPE_ROLES['radio']).toBe('radio');
    });

    it('should map range inputs', () => {
      expect(INPUT_TYPE_ROLES['number']).toBe('spinbutton');
      expect(INPUT_TYPE_ROLES['range']).toBe('slider');
    });

    it('should map search input', () => {
      expect(INPUT_TYPE_ROLES['search']).toBe('searchbox');
    });
  });

  describe('NATIVELY_FOCUSABLE', () => {
    it('should include common focusable elements', () => {
      expect(NATIVELY_FOCUSABLE.has('a')).toBe(true);
      expect(NATIVELY_FOCUSABLE.has('button')).toBe(true);
      expect(NATIVELY_FOCUSABLE.has('input')).toBe(true);
      expect(NATIVELY_FOCUSABLE.has('select')).toBe(true);
      expect(NATIVELY_FOCUSABLE.has('textarea')).toBe(true);
      expect(NATIVELY_FOCUSABLE.has('details')).toBe(true);
      expect(NATIVELY_FOCUSABLE.has('summary')).toBe(true);
    });

    it('should not include non-focusable elements', () => {
      expect(NATIVELY_FOCUSABLE.has('div')).toBe(false);
      expect(NATIVELY_FOCUSABLE.has('span')).toBe(false);
      expect(NATIVELY_FOCUSABLE.has('p')).toBe(false);
    });
  });

  describe('ARIA_PATTERNS', () => {
    it('should have dialog pattern', () => {
      const pattern = ARIA_PATTERNS['dialog'];
      expect(pattern.required).toContain('aria-labelledby');
      expect(pattern.required).toContain('aria-label');
      expect(pattern.optional).toContain('aria-describedby');
    });

    it('should have combobox pattern', () => {
      const pattern = ARIA_PATTERNS['combobox'];
      expect(pattern.required).toContain('aria-expanded');
      expect(pattern.required).toContain('aria-controls');
      expect(pattern.optional).toContain('aria-autocomplete');
    });

    it('should have listbox pattern with children role', () => {
      const pattern = ARIA_PATTERNS['listbox'];
      expect(pattern.children_role).toBe('option');
    });

    it('should have tablist pattern', () => {
      const pattern = ARIA_PATTERNS['tablist'];
      expect(pattern.children_role).toBe('tab');
    });

    it('should have slider pattern', () => {
      const pattern = ARIA_PATTERNS['slider'];
      expect(pattern.required).toContain('aria-valuenow');
      expect(pattern.required).toContain('aria-valuemin');
      expect(pattern.required).toContain('aria-valuemax');
    });

    it('should have switch pattern', () => {
      const pattern = ARIA_PATTERNS['switch'];
      expect(pattern.required).toContain('aria-checked');
    });
  });

  describe('EXPECTED_KEYBOARD_INTERACTIONS', () => {
    it('should have button interactions', () => {
      expect(EXPECTED_KEYBOARD_INTERACTIONS['button']).toContain('Enter');
      expect(EXPECTED_KEYBOARD_INTERACTIONS['button']).toContain('Space');
    });

    it('should have link interactions', () => {
      expect(EXPECTED_KEYBOARD_INTERACTIONS['link']).toContain('Enter');
    });

    it('should have slider interactions', () => {
      expect(EXPECTED_KEYBOARD_INTERACTIONS['slider']).toContain('ArrowUp');
      expect(EXPECTED_KEYBOARD_INTERACTIONS['slider']).toContain('ArrowDown');
      expect(EXPECTED_KEYBOARD_INTERACTIONS['slider']).toContain('Home');
      expect(EXPECTED_KEYBOARD_INTERACTIONS['slider']).toContain('End');
    });

    it('should have combobox interactions', () => {
      expect(EXPECTED_KEYBOARD_INTERACTIONS['combobox']).toContain('ArrowDown');
      expect(EXPECTED_KEYBOARD_INTERACTIONS['combobox']).toContain('Escape');
    });

    it('should have tablist interactions', () => {
      expect(EXPECTED_KEYBOARD_INTERACTIONS['tablist']).toContain('ArrowLeft');
      expect(EXPECTED_KEYBOARD_INTERACTIONS['tablist']).toContain('ArrowRight');
    });

    it('should have dialog interactions', () => {
      expect(EXPECTED_KEYBOARD_INTERACTIONS['dialog']).toContain('Escape');
      expect(EXPECTED_KEYBOARD_INTERACTIONS['dialog']).toContain('Tab');
    });
  });

  describe('getRole', () => {
    it('should return explicit role when set', () => {
      const attrs = new Map([['role', 'menu']]);
      expect(getRole('div', attrs)).toBe('menu');
    });

    it('should return semantic role for HTML elements', () => {
      expect(getRole('button', new Map())).toBe('button');
      expect(getRole('nav', new Map())).toBe('navigation');
      expect(getRole('main', new Map())).toBe('main');
      expect(getRole('h1', new Map())).toBe('heading');
    });

    it('should handle input types', () => {
      expect(getRole('input', new Map())).toBe('textbox');
      expect(getRole('input', new Map([['type', 'checkbox']]))).toBe('checkbox');
      expect(getRole('input', new Map([['type', 'radio']]))).toBe('radio');
      expect(getRole('input', new Map([['type', 'range']]))).toBe('slider');
      expect(getRole('input', new Map([['type', 'button']]))).toBe('button');
      expect(getRole('input', new Map([['type', 'search']]))).toBe('searchbox');
    });

    it('should return generic for anchor without href', () => {
      expect(getRole('a', new Map())).toBe('generic');
      expect(getRole('a', new Map([['href', '/page']]))).toBe('link');
    });

    it('should return generic for unknown elements', () => {
      expect(getRole('div', new Map())).toBe('generic');
      expect(getRole('span', new Map())).toBe('generic');
      expect(getRole('custom-element', new Map())).toBe('generic');
    });
  });

  describe('isFocusable', () => {
    it('should return true for natively focusable elements', () => {
      expect(isFocusable('button', new Map())).toBe(true);
      expect(isFocusable('input', new Map())).toBe(true);
      expect(isFocusable('select', new Map())).toBe(true);
      expect(isFocusable('textarea', new Map())).toBe(true);
    });

    it('should return false for disabled elements', () => {
      expect(isFocusable('button', new Map([['disabled', 'true']]))).toBe(false);
      expect(isFocusable('input', new Map([['disabled', 'true']]))).toBe(false);
    });

    it('should return false for tabindex -1', () => {
      expect(isFocusable('button', new Map([['tabindex', '-1']]))).toBe(false);
      expect(isFocusable('div', new Map([['tabindex', '-1']]))).toBe(false);
    });

    it('should return true for tabindex >= 0', () => {
      expect(isFocusable('div', new Map([['tabindex', '0']]))).toBe(true);
      expect(isFocusable('span', new Map([['tabindex', '1']]))).toBe(true);
    });

    it('should handle tabIndex attribute (React style)', () => {
      expect(isFocusable('div', new Map([['tabIndex', '0']]))).toBe(true);
      expect(isFocusable('div', new Map([['tabIndex', '-1']]))).toBe(false);
    });

    it('should return false for anchor without href', () => {
      expect(isFocusable('a', new Map())).toBe(false);
      expect(isFocusable('a', new Map([['href', '/page']]))).toBe(true);
    });

    it('should return true for contenteditable', () => {
      expect(isFocusable('div', new Map([['contenteditable', 'true']]))).toBe(true);
      expect(isFocusable('div', new Map([['contenteditable', 'false']]))).toBe(false);
    });

    it('should return false for non-focusable elements by default', () => {
      expect(isFocusable('div', new Map())).toBe(false);
      expect(isFocusable('span', new Map())).toBe(false);
      expect(isFocusable('p', new Map())).toBe(false);
    });
  });

  describe('getTabIndex', () => {
    it('should return explicit tabindex', () => {
      expect(getTabIndex('div', new Map([['tabindex', '0']]))).toBe(0);
      expect(getTabIndex('div', new Map([['tabindex', '1']]))).toBe(1);
      expect(getTabIndex('div', new Map([['tabindex', '-1']]))).toBe(-1);
    });

    it('should handle tabIndex attribute (React style)', () => {
      expect(getTabIndex('div', new Map([['tabIndex', '0']]))).toBe(0);
      expect(getTabIndex('div', new Map([['tabIndex', '5']]))).toBe(5);
    });

    it('should return 0 for natively focusable elements', () => {
      expect(getTabIndex('button', new Map())).toBe(0);
      expect(getTabIndex('input', new Map())).toBe(0);
      expect(getTabIndex('select', new Map())).toBe(0);
      expect(getTabIndex('textarea', new Map())).toBe(0);
    });

    it('should return 0 for anchor with href', () => {
      expect(getTabIndex('a', new Map([['href', '/page']]))).toBe(0);
    });

    it('should return -1 for anchor without href', () => {
      expect(getTabIndex('a', new Map())).toBe(-1);
    });

    it('should return -1 for non-focusable elements', () => {
      expect(getTabIndex('div', new Map())).toBe(-1);
      expect(getTabIndex('span', new Map())).toBe(-1);
    });
  });

  describe('isHidden', () => {
    it('should detect aria-hidden', () => {
      expect(isHidden(new Map([['aria-hidden', 'true']]))).toBe(true);
      expect(isHidden(new Map([['aria-hidden', 'false']]))).toBe(false);
    });

    it('should detect hidden attribute', () => {
      expect(isHidden(new Map([['hidden', 'true']]))).toBe(true);
      expect(isHidden(new Map([['hidden', '']]))).toBe(true);
    });

    it('should detect hidden className patterns', () => {
      expect(isHidden(new Map([['className', 'hidden']]))).toBe(true);
      expect(isHidden(new Map([['className', 'invisible']]))).toBe(true);
      expect(isHidden(new Map([['className', 'sr-only']]))).toBe(true);
      expect(isHidden(new Map([['className', 'visually-hidden']]))).toBe(true);
    });

    it('should detect hidden class patterns (lowercase)', () => {
      expect(isHidden(new Map([['class', 'hidden']]))).toBe(true);
      expect(isHidden(new Map([['class', 'invisible']]))).toBe(true);
    });

    it('should detect partial matches in className', () => {
      expect(isHidden(new Map([['className', 'flex hidden items-center']]))).toBe(true);
      expect(isHidden(new Map([['className', 'sr-only focus:not-sr-only']]))).toBe(true);
    });

    it('should return false for visible elements', () => {
      expect(isHidden(new Map())).toBe(false);
      expect(isHidden(new Map([['className', 'flex items-center']]))).toBe(false);
      expect(isHidden(new Map([['aria-hidden', 'false']]))).toBe(false);
    });
  });
});
