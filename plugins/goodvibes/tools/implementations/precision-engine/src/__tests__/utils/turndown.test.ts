/**
 * Tests for HTML-to-Markdown conversion using Turndown.
 */

import { describe, it, expect } from 'vitest';
import { htmlToMarkdown } from '../../utils/fetch/turndown.js';

describe('htmlToMarkdown', () => {
  it('should convert basic HTML to markdown', () => {
    const html = '<h1>Hello</h1><p>World</p>';
    const markdown = htmlToMarkdown(html);
    expect(markdown).toBe('# Hello\n\nWorld');
  });

  it('should convert headers', () => {
    const html = '<h1>H1</h1><h2>H2</h2><h3>H3</h3><h4>H4</h4><h5>H5</h5><h6>H6</h6>';
    const markdown = htmlToMarkdown(html);
    expect(markdown).toContain('# H1');
    expect(markdown).toContain('## H2');
    expect(markdown).toContain('### H3');
    expect(markdown).toContain('#### H4');
    expect(markdown).toContain('##### H5');
    expect(markdown).toContain('###### H6');
  });

  it('should convert bold and italic', () => {
    const html = '<strong>Bold</strong> and <em>Italic</em>';
    const markdown = htmlToMarkdown(html);
    expect(markdown).toContain('**Bold**');
    expect(markdown).toContain('_Italic_');
  });

  it('should convert links', () => {
    const html = '<a href="https://example.com">Example</a>';
    const markdown = htmlToMarkdown(html);
    expect(markdown).toBe('[Example](https://example.com)');
  });

  it('should convert images', () => {
    const html = '<img src="image.jpg" alt="Description">';
    const markdown = htmlToMarkdown(html);
    expect(markdown).toBe('![Description](image.jpg)');
  });

  it('should convert unordered lists', () => {
    const html = '<ul><li>Item 1</li><li>Item 2</li></ul>';
    const markdown = htmlToMarkdown(html);
    // Turndown adds spaces after the bullet
    expect(markdown).toContain('-   Item 1');
    expect(markdown).toContain('-   Item 2');
  });

  it('should convert code blocks', () => {
    const html = '<pre><code>const x = 1;</code></pre>';
    const markdown = htmlToMarkdown(html);
    expect(markdown).toContain('```');
    expect(markdown).toContain('const x = 1;');
  });

  it('should convert inline code', () => {
    const html = '<code>inline code</code>';
    const markdown = htmlToMarkdown(html);
    expect(markdown).toBe('`inline code`');
  });

  it('should handle GFM tables', () => {
    const html = `
      <table>
        <thead>
          <tr><th>Name</th><th>Age</th></tr>
        </thead>
        <tbody>
          <tr><td>Alice</td><td>30</td></tr>
          <tr><td>Bob</td><td>25</td></tr>
        </tbody>
      </table>
    `;
    const markdown = htmlToMarkdown(html);
    expect(markdown).toContain('Name');
    expect(markdown).toContain('Age');
    expect(markdown).toContain('Alice');
    expect(markdown).toContain('Bob');
    // Tables should have pipe separators
    expect(markdown).toContain('|');
  });

  it('should handle GFM strikethrough', () => {
    const html = '<del>Strikethrough</del>';
    const markdown = htmlToMarkdown(html);
    // GFM plugin converts <del> to single ~
    expect(markdown).toBe('~Strikethrough~');
  });

  it('should handle checkboxes in lists', () => {
    const html = `
      <ul>
        <li><input type="checkbox" checked disabled> Task 1</li>
        <li><input type="checkbox" disabled> Task 2</li>
      </ul>
    `;
    const markdown = htmlToMarkdown(html);
    // Should convert to list items without crashing
    // Note: GFM task lists require specific HTML structure that's rarely in wild HTML
    expect(markdown).toBeTruthy();
    expect(markdown).toContain('Task 1');
    expect(markdown).toContain('Task 2');
  });

  it('should return empty string for empty input', () => {
    expect(htmlToMarkdown('')).toBe('');
    expect(htmlToMarkdown('   ')).toBe('');
  });

  it('should return empty string for null/undefined', () => {
    expect(htmlToMarkdown(null as any)).toBe('');
    expect(htmlToMarkdown(undefined as any)).toBe('');
  });

  it('should handle custom options', () => {
    const html = '<strong>Bold</strong>';
    const markdown = htmlToMarkdown(html, {
      strongDelimiter: '__',
    });
    expect(markdown).toBe('__Bold__');
  });

  it('should handle malformed HTML gracefully', () => {
    const html = '<p>Unclosed paragraph';
    const markdown = htmlToMarkdown(html);
    // Should not throw, should return some reasonable output
    expect(markdown).toBeTruthy();
    expect(typeof markdown).toBe('string');
  });

  it('should use atx heading style by default', () => {
    const html = '<h1>Heading</h1>';
    const markdown = htmlToMarkdown(html);
    expect(markdown).toBe('# Heading');
  });

  it('should use setext heading style when specified', () => {
    const html = '<h1>Heading</h1>';
    const markdown = htmlToMarkdown(html, {
      headingStyle: 'setext',
    });
    // Setext uses underlines for H1 and H2
    expect(markdown).toContain('Heading');
    expect(markdown).toContain('=');
  });
});
