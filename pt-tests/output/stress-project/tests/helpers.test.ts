/**
 * Helper functions tests
 */

import { describe, it, expect } from 'vitest';
import {
  formatDate,
  parseDate,
  deepClone,
  range,
  chunk,
  unique,
  groupBy,
} from '../src/utils/helpers.js';

describe('Helpers', () => {
  describe('formatDate', () => {
    it('should format Date object', () => {
      const date = new Date('2024-01-01T00:00:00.000Z');
      const formatted = formatDate(date);
      expect(formatted).toBe('2024-01-01T00:00:00.000Z');
    });

    it('should format date string', () => {
      const formatted = formatDate('2024-01-01');
      expect(formatted).toMatch(/2024-01-01/);
    });

    it('should throw on invalid date', () => {
      expect(() => formatDate('invalid')).toThrow('Invalid date');
    });
  });

  describe('parseDate', () => {
    it('should parse date string', () => {
      const date = parseDate('2024-01-01');
      expect(date).toBeInstanceOf(Date);
      expect(date.getFullYear()).toBe(2024);
    });

    it('should parse timestamp', () => {
      const timestamp = 1704067200000; // 2024-01-01
      const date = parseDate(timestamp);
      expect(date).toBeInstanceOf(Date);
    });

    it('should throw on invalid date', () => {
      expect(() => parseDate('invalid')).toThrow('Invalid date format');
    });
  });

  describe('deepClone', () => {
    it('should clone primitives', () => {
      expect(deepClone(42)).toBe(42);
      expect(deepClone('hello')).toBe('hello');
      expect(deepClone(true)).toBe(true);
      expect(deepClone(null)).toBe(null);
    });

    it('should clone arrays', () => {
      const arr = [1, 2, [3, 4]];
      const cloned = deepClone(arr);
      expect(cloned).toEqual(arr);
      expect(cloned).not.toBe(arr);
      expect(cloned[2]).not.toBe(arr[2]);
    });

    it('should clone objects', () => {
      const obj = { a: 1, b: { c: 2 } };
      const cloned = deepClone(obj);
      expect(cloned).toEqual(obj);
      expect(cloned).not.toBe(obj);
      expect(cloned.b).not.toBe(obj.b);
    });

    it('should clone Date objects', () => {
      const date = new Date();
      const cloned = deepClone(date);
      expect(cloned).toEqual(date);
      expect(cloned).not.toBe(date);
    });
  });

  describe('range', () => {
    it('should generate range', () => {
      expect(range(0, 5)).toEqual([0, 1, 2, 3, 4]);
      expect(range(1, 6)).toEqual([1, 2, 3, 4, 5]);
    });

    it('should support step', () => {
      expect(range(0, 10, 2)).toEqual([0, 2, 4, 6, 8]);
    });
  });

  describe('chunk', () => {
    it('should chunk array', () => {
      expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
      expect(chunk([1, 2, 3, 4], 2)).toEqual([[1, 2], [3, 4]]);
    });

    it('should handle empty array', () => {
      expect(chunk([], 2)).toEqual([]);
    });
  });

  describe('unique', () => {
    it('should remove duplicates', () => {
      expect(unique([1, 2, 2, 3, 3, 3])).toEqual([1, 2, 3]);
      expect(unique(['a', 'b', 'a'])).toEqual(['a', 'b']);
    });
  });

  describe('groupBy', () => {
    it('should group by key function', () => {
      const items = [
        { type: 'fruit', name: 'apple' },
        { type: 'fruit', name: 'banana' },
        { type: 'vegetable', name: 'carrot' },
      ];

      const grouped = groupBy(items, item => item.type);
      expect(grouped.fruit).toHaveLength(2);
      expect(grouped.vegetable).toHaveLength(1);
    });
  });
});
