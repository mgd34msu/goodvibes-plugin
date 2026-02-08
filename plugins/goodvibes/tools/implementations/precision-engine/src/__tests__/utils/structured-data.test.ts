/**
 * Unit tests for structured data extraction.
 */
import { describe, it, expect } from 'vitest';
import { extractStructuredData } from '../../utils/fetch/structured-data.js';

describe('extractStructuredData', () => {
  it('should extract JSON-LD blocks', () => {
    const html = `
      <html>
        <head>
          <script type="application/ld+json">
          {
            "@context": "https://schema.org",
            "@type": "Article",
            "headline": "Test Article"
          }
          </script>
          <script type="application/ld+json">
          {
            "@type": "BreadcrumbList",
            "itemListElement": []
          }
          </script>
        </head>
      </html>
    `;

    const result = extractStructuredData(html);

    expect(result.jsonLd).toHaveLength(2);
    expect(result.jsonLd[0]).toMatchObject({
      '@context': 'https://schema.org',
      '@type': 'Article',
      headline: 'Test Article',
    });
    expect(result.jsonLd[1]).toMatchObject({
      '@type': 'BreadcrumbList',
      itemListElement: [],
    });
  });

  it('should skip malformed JSON-LD blocks', () => {
    const html = `
      <html>
        <head>
          <script type="application/ld+json">{ "valid": "json" }</script>
          <script type="application/ld+json">{broken json}</script>
          <script type="application/ld+json">{ "also": "valid" }</script>
        </head>
      </html>
    `;

    const result = extractStructuredData(html);

    // Should only have the 2 valid blocks, skipping the malformed one
    expect(result.jsonLd).toHaveLength(2);
  });

  it('should extract OpenGraph meta tags', () => {
    const html = `
      <meta property="og:title" content="Test Title" />
      <meta property="og:description" content="Test Description" />
      <meta property="og:url" content="https://example.com" />
    `;

    const result = extractStructuredData(html);

    expect(result.openGraph).toEqual({
      title: 'Test Title',
      description: 'Test Description',
      url: 'https://example.com',
    });
  });

  it('should handle OpenGraph tags with name attribute', () => {
    const html = `
      <meta name="og:title" content="Alt Title" />
    `;

    const result = extractStructuredData(html);

    expect(result.openGraph.title).toBe('Alt Title');
  });

  it('should handle reversed attribute order in OpenGraph tags', () => {
    const html = `
      <meta content="Reversed Title" property="og:title" />
      <meta content="Reversed Description" property="og:description" />
    `;

    const result = extractStructuredData(html);

    expect(result.openGraph.title).toBe('Reversed Title');
    expect(result.openGraph.description).toBe('Reversed Description');
  });

  it('should extract Twitter Card meta tags', () => {
    const html = `
      <meta name="twitter:card" content="summary" />
      <meta name="twitter:site" content="@testsite" />
      <meta name="twitter:creator" content="@testcreator" />
    `;

    const result = extractStructuredData(html);

    expect(result.twitterCard).toEqual({
      card: 'summary',
      site: '@testsite',
      creator: '@testcreator',
    });
  });

  it('should handle reversed attribute order in Twitter tags', () => {
    const html = `
      <meta content="summary_large_image" name="twitter:card" />
    `;

    const result = extractStructuredData(html);

    expect(result.twitterCard.card).toBe('summary_large_image');
  });

  it('should extract standard meta tags', () => {
    const html = `
      <meta name="description" content="Page description" />
      <meta name="author" content="Test Author" />
      <meta name="keywords" content="test, meta, tags" />
      <meta name="robots" content="index, follow" />
      <meta name="viewport" content="width=device-width" />
      <meta name="generator" content="Test Generator" />
    `;

    const result = extractStructuredData(html);

    expect(result.meta).toEqual({
      description: 'Page description',
      author: 'Test Author',
      keywords: 'test, meta, tags',
      robots: 'index, follow',
      viewport: 'width=device-width',
      generator: 'Test Generator',
    });
  });

  it('should handle reversed attribute order in standard meta tags', () => {
    const html = `
      <meta content="Reversed description" name="description" />
    `;

    const result = extractStructuredData(html);

    expect(result.meta.description).toBe('Reversed description');
  });

  it('should handle single and double quotes', () => {
    const html = `
      <meta property='og:title' content='Single Quotes' />
      <meta name="twitter:card" content="Double Quotes" />
    `;

    const result = extractStructuredData(html);

    expect(result.openGraph.title).toBe('Single Quotes');
    expect(result.twitterCard.card).toBe('Double Quotes');
  });

  it('should handle self-closing and non-self-closing tags', () => {
    const html = `
      <meta property="og:title" content="Self Closing" />
      <meta property="og:description" content="Non Self Closing">
    `;

    const result = extractStructuredData(html);

    expect(result.openGraph.title).toBe('Self Closing');
    expect(result.openGraph.description).toBe('Non Self Closing');
  });

  it('should handle empty content attributes', () => {
    const html = `
      <meta property="og:title" content="" />
      <meta name="description" content="" />
    `;

    const result = extractStructuredData(html);

    expect(result.openGraph.title).toBe('');
    expect(result.meta.description).toBe('');
  });

  it('should return empty results for HTML without structured data', () => {
    const html = '<html><body><p>No metadata here</p></body></html>';

    const result = extractStructuredData(html);

    expect(result.jsonLd).toEqual([]);
    expect(result.openGraph).toEqual({});
    expect(result.twitterCard).toEqual({});
    expect(result.meta).toEqual({});
  });

  it('should handle complex real-world HTML', () => {
    const html = `
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <meta name="description" content="A comprehensive test page">
        <meta name="keywords" content="test, html, structured data">
        <meta property="og:title" content="Real World Example">
        <meta property="og:type" content="website">
        <meta property="og:url" content="https://example.com/page">
        <meta property="og:image" content="https://example.com/image.jpg">
        <meta name="twitter:card" content="summary_large_image">
        <meta name="twitter:site" content="@example">
        <script type="application/ld+json">
        {
          "@context": "https://schema.org",
          "@type": "WebPage",
          "name": "Example Page",
          "url": "https://example.com/page"
        }
        </script>
        <title>Example Page</title>
      </head>
      <body>
        <h1>Content</h1>
      </body>
      </html>
    `;

    const result = extractStructuredData(html);

    expect(result.jsonLd).toHaveLength(1);
    expect(result.jsonLd[0]).toMatchObject({
      '@type': 'WebPage',
      name: 'Example Page',
    });

    expect(result.openGraph).toMatchObject({
      title: 'Real World Example',
      type: 'website',
      url: 'https://example.com/page',
      image: 'https://example.com/image.jpg',
    });

    expect(result.twitterCard).toMatchObject({
      card: 'summary_large_image',
      site: '@example',
    });

    expect(result.meta).toMatchObject({
      description: 'A comprehensive test page',
      keywords: 'test, html, structured data',
      viewport: 'width=device-width, initial-scale=1.0',
    });
  });
});
