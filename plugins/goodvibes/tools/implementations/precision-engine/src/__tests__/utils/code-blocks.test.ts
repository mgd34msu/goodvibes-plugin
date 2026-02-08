import { describe, it, expect } from 'vitest';
import { extractCodeBlocks } from '../../utils/fetch/code-blocks.js';

describe('extractCodeBlocks', () => {
  it('should extract basic code block with language', () => {
    const html = '<pre><code class="language-typescript">const x = 1;</code></pre>';
    const blocks = extractCodeBlocks(html);
    
    expect(blocks).toHaveLength(1);
    expect(blocks[0].language).toBe('typescript');
    expect(blocks[0].code).toBe('const x = 1;');
  });

  it('should decode HTML entities', () => {
    const html = '<pre><code class="language-javascript">if (x &lt; y &amp;&amp; y &gt; z) {}</code></pre>';
    const blocks = extractCodeBlocks(html);
    
    expect(blocks).toHaveLength(1);
    expect(blocks[0].code).toBe('if (x < y && y > z) {}');
  });

  it('should extract context from preceding heading', () => {
    const html = '<h2>Example Code</h2><pre><code class="language-python">print("hello")</code></pre>';
    const blocks = extractCodeBlocks(html);
    
    expect(blocks).toHaveLength(1);
    expect(blocks[0].context).toBe('Example Code');
    expect(blocks[0].language).toBe('python');
  });

  it('should handle bare pre tags without code wrapper', () => {
    const html = '<pre class="language-bash">npm install</pre>';
    const blocks = extractCodeBlocks(html);
    
    expect(blocks).toHaveLength(1);
    expect(blocks[0].language).toBe('bash');
    expect(blocks[0].code).toBe('npm install');
  });

  it('should skip empty code blocks', () => {
    const html = '<pre><code class="language-js">  \n  \n  </code></pre>';
    const blocks = extractCodeBlocks(html);
    
    expect(blocks).toHaveLength(0);
  });

  it('should preserve indentation', () => {
    const html = '<pre><code class="language-js">function foo() {\n  return 42;\n}</code></pre>';
    const blocks = extractCodeBlocks(html);
    
    expect(blocks).toHaveLength(1);
    expect(blocks[0].code).toBe('function foo() {\n  return 42;\n}');
  });

  it('should strip HTML tags inside code blocks', () => {
    const html = '<pre><code class="language-js"><span class="keyword">const</span> x = <span class="number">1</span>;</code></pre>';
    const blocks = extractCodeBlocks(html);
    
    expect(blocks).toHaveLength(1);
    expect(blocks[0].code).toBe('const x = 1;');
  });

  it('should handle multiple code blocks', () => {
    const html = `
      <h2>Example 1</h2>
      <pre><code class="language-typescript">const a = 1;</code></pre>
      <h2>Example 2</h2>
      <pre><code class="language-javascript">const b = 2;</code></pre>
    `;
    const blocks = extractCodeBlocks(html);
    
    expect(blocks).toHaveLength(2);
    expect(blocks[0].language).toBe('typescript');
    expect(blocks[0].context).toBe('Example 1');
    expect(blocks[1].language).toBe('javascript');
    expect(blocks[1].context).toBe('Example 2');
  });

  it('should detect various language class patterns', () => {
    const testCases = [
      { html: '<pre><code class="language-rust">let x = 5;</code></pre>', expected: 'rust' },
      { html: '<pre><code class="lang-go">var x int</code></pre>', expected: 'go' },
      { html: '<pre><code class="highlight-java">int x = 5;</code></pre>', expected: 'java' },
      { html: '<pre><code class="brush: csharp">var x = 5;</code></pre>', expected: 'csharp' },
      { html: '<pre><code class="python">x = 5</code></pre>', expected: 'python' },
    ];
    
    for (const { html, expected } of testCases) {
      const blocks = extractCodeBlocks(html);
      expect(blocks).toHaveLength(1);
      expect(blocks[0].language).toBe(expected);
    }
  });

  it('should default to text for unknown language', () => {
    const html = '<pre><code>plain text</code></pre>';
    const blocks = extractCodeBlocks(html);
    
    expect(blocks).toHaveLength(1);
    expect(blocks[0].language).toBe('text');
  });

  it('should trim trailing whitespace from lines', () => {
    const html = '<pre><code class="language-js">const x = 1;   \nconst y = 2;  </code></pre>';
    const blocks = extractCodeBlocks(html);
    
    expect(blocks).toHaveLength(1);
    expect(blocks[0].code).toBe('const x = 1;\nconst y = 2;');
  });

  it('should handle numeric HTML entities', () => {
    const html = '<pre><code>&#60;div&#62;&#39;test&#39;&#60;/div&#62;</code></pre>';
    const blocks = extractCodeBlocks(html);
    
    expect(blocks).toHaveLength(1);
    expect(blocks[0].code).toBe("<div>'test'</div>");
  });

  it('should handle hex HTML entities', () => {
    const html = '<pre><code>&#x27;single&#x27; &#x60;backtick&#x60;</code></pre>';
    const blocks = extractCodeBlocks(html);
    
    expect(blocks).toHaveLength(1);
    expect(blocks[0].code).toBe("'single' `backtick`");
  });

  it('should not include context when no heading precedes', () => {
    const html = '<p>Some text</p><pre><code class="language-js">const x = 1;</code></pre>';
    const blocks = extractCodeBlocks(html);
    
    expect(blocks).toHaveLength(1);
    expect(blocks[0].context).toBeUndefined();
  });

  it('should handle GitHub-style divs with highlights', () => {
    const html = '<div class="highlight"><pre><code class="language-ruby">puts "hello"</code></pre></div>';
    const blocks = extractCodeBlocks(html);
    
    expect(blocks).toHaveLength(1);
    expect(blocks[0].language).toBe('ruby');
    expect(blocks[0].code).toBe('puts "hello"');
  });
});
