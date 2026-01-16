
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

import { handleAnalyzeLayoutHierarchy } from '../../../handlers/frontend/analyze-layout-hierarchy.js';

describe('handleAnalyzeLayoutHierarchy', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'layout-hierarchy-test-'));
    vi.clearAllMocks();
  });

  afterEach(() => {
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  it('handles Vue files and extracts template (lines 138-141)', async () => {
    const vueFile = path.join(tempDir, 'Component.vue');
    const content = `
<template>
  <div class="flex p-4">
    <span class="w-full">Content</span>
  </div>
</template>
<script>
export default {}
</script>
    `;
    fs.writeFileSync(vueFile, content);

    const result = await handleAnalyzeLayoutHierarchy({ file: vueFile });
    const data = JSON.parse(result.content[0].text);

    if (result.isError) {
      throw new Error(`Tool returned error: ${data.error}`);
    }

    expect(data.root_element).toContain('div');
    expect(data.layout_tree.display).toBe('flex');
  });

  it('handles Svelte files and converts class to className (line 148)', async () => {
    const svelteFile = path.join(tempDir, 'Component.svelte');
    const content = `
<div class="grid grid-cols-2">
  <p>Svelte content</p>
</div>
    `;
    fs.writeFileSync(svelteFile, content);

    const result = await handleAnalyzeLayoutHierarchy({ file: svelteFile });
    const data = JSON.parse(result.content[0].text);

    if (result.isError) {
      throw new Error(`Tool returned error: ${data.error}`);
    }

    expect(data.root_element).toContain('div');
    expect(data.layout_tree.display).toBe('grid');
  });

  it('returns error when no JSX element is found (line 171)', async () => {
    const tsFile = path.join(tempDir, 'empty.ts');
    const content = 'const x = 1;';
    fs.writeFileSync(tsFile, content);

    const result = await handleAnalyzeLayoutHierarchy({ file: tsFile });
    const data = JSON.parse(result.content[0].text);

    expect(result.isError).toBe(true);
    expect(data.error).toContain('No JSX element found');
  });

  it('returns error when element matching selector is not found (lines 180-186)', async () => {
    const jsxFile = path.join(tempDir, 'App.jsx');
    const content = `
export function App() {
  return <div className="root"><span>Test</span></div>;
}
    `;
    fs.writeFileSync(jsxFile, content);

    const result = await handleAnalyzeLayoutHierarchy({ 
      file: jsxFile,
      selector: '.non-existent' 
    });
    const data = JSON.parse(result.content[0].text);

    expect(result.isError).toBe(true);
    expect(data.error).toContain('No element matching selector ".non-existent" found');
  });

  it('returns error for unsupported file types', async () => {
    const txtFile = path.join(tempDir, 'test.txt');
    fs.writeFileSync(txtFile, 'content');

    const result = await handleAnalyzeLayoutHierarchy({ file: txtFile });
    const data = JSON.parse(result.content[0].text);

    expect(result.isError).toBe(true);
    expect(data.error).toContain('Unsupported file type');
  });

  it('returns error for non-existent file', async () => {
    const result = await handleAnalyzeLayoutHierarchy({ file: 'missing.tsx' });
    const data = JSON.parse(result.content[0].text);

    expect(result.isError).toBe(true);
    expect(data.error).toContain('File not found');
  });
});
