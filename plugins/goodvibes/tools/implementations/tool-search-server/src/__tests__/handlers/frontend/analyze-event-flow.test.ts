/**
 * Unit tests for analyze-event-flow handler
 *
 * Tests cover the main handler entry point and ensure 100% coverage.
 * Sub-modules (event-flow-utils, event-flow-analyzers, event-flow-core)
 * are tested through integration with the handler.
 *
 * @module __tests__/handlers/frontend/analyze-event-flow
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import ts from 'typescript';

import { handleAnalyzeEventFlow } from '../../../handlers/frontend/analyze-event-flow.js';

// Mock fs module
vi.mock('fs', async () => {
  const actual = await vi.importActual<typeof fs>('fs');
  return {
    ...actual,
    existsSync: vi.fn(),
    readFileSync: vi.fn(),
  };
});

// Helper to create source file for testing
function createSourceFile(code: string, filename = 'test.tsx'): ts.SourceFile {
  return ts.createSourceFile(
    filename,
    code,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX
  );
}

describe('handleAnalyzeEventFlow', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(process, 'cwd').mockReturnValue('/project');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('input validation', () => {
    it('should return error when file argument is missing', async () => {
      const response = await handleAnalyzeEventFlow({} as any);

      expect(response.isError).toBe(true);
      const parsed = JSON.parse(response.content[0].text);
      expect(parsed.error).toBe('file argument is required');
    });

    it('should return error when file argument is empty string', async () => {
      const response = await handleAnalyzeEventFlow({ file: '' });

      expect(response.isError).toBe(true);
      const parsed = JSON.parse(response.content[0].text);
      expect(parsed.error).toBe('file argument is required');
    });

    it('should return error when file does not exist', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);

      const response = await handleAnalyzeEventFlow({ file: 'nonexistent.tsx' });

      expect(response.isError).toBe(true);
      const parsed = JSON.parse(response.content[0].text);
      expect(parsed.error).toContain('File not found');
      expect(parsed.provided_path).toBe('nonexistent.tsx');
    });

    it('should return error for unsupported file extension', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);

      const response = await handleAnalyzeEventFlow({ file: 'styles.css' });

      expect(response.isError).toBe(true);
      const parsed = JSON.parse(response.content[0].text);
      expect(parsed.error).toContain('must be a component file');
      expect(parsed.provided_extension).toBe('.css');
    });

    it('should accept .tsx files', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue('function App() { return <div />; }');

      const response = await handleAnalyzeEventFlow({ file: 'App.tsx' });

      expect(response.isError).toBeUndefined();
    });

    it('should accept .jsx files', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue('function App() { return <div />; }');

      const response = await handleAnalyzeEventFlow({ file: 'App.jsx' });

      expect(response.isError).toBeUndefined();
    });

    it('should accept .ts files', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue('function App() { return <div />; }');

      const response = await handleAnalyzeEventFlow({ file: 'App.ts' });

      expect(response.isError).toBeUndefined();
    });

    it('should accept .js files', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue('function App() { return <div />; }');

      const response = await handleAnalyzeEventFlow({ file: 'App.js' });

      expect(response.isError).toBeUndefined();
    });

    it('should accept .vue files', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue('<template><div /></template>');

      const response = await handleAnalyzeEventFlow({ file: 'App.vue' });

      expect(response.isError).toBeUndefined();
    });

    it('should accept .svelte files', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue('<div></div>');

      const response = await handleAnalyzeEventFlow({ file: 'App.svelte' });

      expect(response.isError).toBeUndefined();
    });

    it('should handle absolute file paths', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue('function App() { return <div />; }');

      const response = await handleAnalyzeEventFlow({ file: '/absolute/path/App.tsx' });

      expect(response.isError).toBeUndefined();
    });
  });

  describe('no component found', () => {
    it('should return success with message when no React component found', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue('const x = 1;');

      const response = await handleAnalyzeEventFlow({ file: 'utils.tsx' });

      expect(response.isError).toBeUndefined();
      const parsed = JSON.parse(response.content[0].text);
      expect(parsed.message).toBe('No React component found in file');
      expect(parsed.handlers).toEqual([]);
      expect(parsed.event_flows).toEqual({});
      expect(parsed.issues).toEqual([]);
      expect(parsed.delegation_patterns).toEqual([]);
    });
  });

  describe('no event handlers found', () => {
    it('should return success with empty handlers when component has no event handlers', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(`
        function App() {
          return <div className="container">Hello</div>;
        }
      `);

      const response = await handleAnalyzeEventFlow({ file: 'App.tsx' });

      expect(response.isError).toBeUndefined();
      const parsed = JSON.parse(response.content[0].text);
      expect(parsed.handlers).toEqual([]);
      expect(parsed.summary).toContain('No event handlers found');
    });

    it('should include event filter in message when specified', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(`
        function App() {
          return <div onChange={() => {}}>Hello</div>;
        }
      `);

      const response = await handleAnalyzeEventFlow({ file: 'App.tsx', event: 'click' });

      expect(response.isError).toBeUndefined();
      const parsed = JSON.parse(response.content[0].text);
      expect(parsed.summary).toContain('click');
    });
  });

  describe('event handler detection', () => {
    it('should detect onClick handlers', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(`
        function App() {
          return <button onClick={() => console.log('clicked')}>Click me</button>;
        }
      `);

      const response = await handleAnalyzeEventFlow({ file: 'App.tsx' });

      expect(response.isError).toBeUndefined();
      const parsed = JSON.parse(response.content[0].text);
      expect(parsed.handlers.length).toBeGreaterThan(0);
      expect(parsed.handlers[0].event).toBe('click');
    });

    it('should detect onChange handlers', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(`
        function App() {
          return <input onChange={(e) => console.log(e.target.value)} />;
        }
      `);

      const response = await handleAnalyzeEventFlow({ file: 'App.tsx' });

      const parsed = JSON.parse(response.content[0].text);
      expect(parsed.handlers.some((h: any) => h.event === 'change')).toBe(true);
    });

    it('should detect onSubmit handlers', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(`
        function App() {
          return <form onSubmit={(e) => e.preventDefault()}>Submit</form>;
        }
      `);

      const response = await handleAnalyzeEventFlow({ file: 'App.tsx' });

      const parsed = JSON.parse(response.content[0].text);
      expect(parsed.handlers.some((h: any) => h.event === 'submit')).toBe(true);
    });

    it('should detect onKeyDown handlers', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(`
        function App() {
          return <input onKeyDown={(e) => console.log(e.key)} />;
        }
      `);

      const response = await handleAnalyzeEventFlow({ file: 'App.tsx' });

      const parsed = JSON.parse(response.content[0].text);
      expect(parsed.handlers.some((h: any) => h.event === 'keydown')).toBe(true);
    });

    it('should detect multiple event handlers on same element', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(`
        function App() {
          return <button onClick={() => {}} onMouseEnter={() => {}}>Hover</button>;
        }
      `);

      const response = await handleAnalyzeEventFlow({ file: 'App.tsx' });

      const parsed = JSON.parse(response.content[0].text);
      expect(parsed.handlers.length).toBeGreaterThanOrEqual(2);
    });

    it('should filter handlers by event type when specified', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(`
        function App() {
          return (
            <div>
              <button onClick={() => {}}>Click</button>
              <input onChange={() => {}} />
            </div>
          );
        }
      `);

      const response = await handleAnalyzeEventFlow({ file: 'App.tsx', event: 'click' });

      const parsed = JSON.parse(response.content[0].text);
      expect(parsed.handlers.every((h: any) => h.event === 'click')).toBe(true);
    });
  });

  describe('stopPropagation detection', () => {
    it('should detect stopPropagation in inline handler', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(`
        function App() {
          return <button onClick={(e) => { e.stopPropagation(); }}>Click</button>;
        }
      `);

      const response = await handleAnalyzeEventFlow({ file: 'App.tsx' });

      const parsed = JSON.parse(response.content[0].text);
      expect(parsed.handlers[0].stops_propagation).toBe(true);
    });

    it('should detect stopPropagation in referenced handler', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(`
        function App() {
          const handleClick = (e) => {
            e.stopPropagation();
            console.log('clicked');
          };
          return <button onClick={handleClick}>Click</button>;
        }
      `);

      const response = await handleAnalyzeEventFlow({ file: 'App.tsx' });

      const parsed = JSON.parse(response.content[0].text);
      expect(parsed.handlers[0].stops_propagation).toBe(true);
    });
  });

  describe('preventDefault detection', () => {
    it('should detect preventDefault in inline handler', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(`
        function App() {
          return <form onSubmit={(e) => { e.preventDefault(); }}>Submit</form>;
        }
      `);

      const response = await handleAnalyzeEventFlow({ file: 'App.tsx' });

      const parsed = JSON.parse(response.content[0].text);
      expect(parsed.handlers[0].prevents_default).toBe(true);
    });

    it('should detect preventDefault in function declaration handler', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(`
        function App() {
          function handleSubmit(e) {
            e.preventDefault();
            console.log('submitted');
          }
          return <form onSubmit={handleSubmit}>Submit</form>;
        }
      `);

      const response = await handleAnalyzeEventFlow({ file: 'App.tsx' });

      const parsed = JSON.parse(response.content[0].text);
      expect(parsed.handlers[0].prevents_default).toBe(true);
    });
  });

  describe('issue detection', () => {
    it('should detect nested clickable elements', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(`
        function App() {
          return (
            <div onClick={() => console.log('outer')}>
              <button onClick={() => console.log('inner')}>Click</button>
            </div>
          );
        }
      `);

      const response = await handleAnalyzeEventFlow({ file: 'App.tsx' });

      const parsed = JSON.parse(response.content[0].text);
      expect(parsed.issues.some((i: any) => i.issue === 'nested_clickable_elements')).toBe(true);
    });

    it('should detect missing keyboard alternative', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(`
        function App() {
          return <div onClick={() => console.log('clicked')}>Click me</div>;
        }
      `);

      const response = await handleAnalyzeEventFlow({ file: 'App.tsx' });

      const parsed = JSON.parse(response.content[0].text);
      expect(parsed.issues.some((i: any) => i.issue === 'missing_keyboard_alternative')).toBe(true);
    });

    it('should detect form submit without preventDefault', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(`
        function App() {
          return <form onSubmit={() => console.log('submitted')}>Submit</form>;
        }
      `);

      const response = await handleAnalyzeEventFlow({ file: 'App.tsx' });

      const parsed = JSON.parse(response.content[0].text);
      expect(parsed.issues.some((i: any) => i.issue === 'form_submit_no_prevent_default')).toBe(true);
    });

    it('should not flag button click handlers as missing keyboard support', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(`
        function App() {
          return <button onClick={() => console.log('clicked')}>Click</button>;
        }
      `);

      const response = await handleAnalyzeEventFlow({ file: 'App.tsx' });

      const parsed = JSON.parse(response.content[0].text);
      expect(parsed.issues.some((i: any) => i.issue === 'missing_keyboard_alternative')).toBe(false);
    });
  });

  describe('event flow building', () => {
    it('should build event flows for bubbling events', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(`
        function App() {
          return (
            <div onClick={() => console.log('parent')}>
              <button onClick={(e) => { e.stopPropagation(); console.log('child'); }}>Click</button>
            </div>
          );
        }
      `);

      const response = await handleAnalyzeEventFlow({ file: 'App.tsx' });

      const parsed = JSON.parse(response.content[0].text);
      expect(Object.keys(parsed.event_flows).length).toBeGreaterThan(0);
    });
  });

  describe('delegation pattern detection', () => {
    it('should detect event delegation with e.target.closest', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(`
        function App() {
          const handleClick = (e) => {
            const button = e.target.closest('button');
            if (button) {
              console.log('button clicked');
            }
          };
          return <div onClick={handleClick}><button>Click</button></div>;
        }
      `);

      const response = await handleAnalyzeEventFlow({ file: 'App.tsx' });

      const parsed = JSON.parse(response.content[0].text);
      expect(parsed.delegation_patterns.length).toBeGreaterThan(0);
      expect(parsed.delegation_patterns[0].delegates_for).toContain('button');
    });

    it('should detect event delegation with e.target.matches', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(`
        function App() {
          const handleClick = (e) => {
            if (e.target.matches('.item')) {
              console.log('item clicked');
            }
          };
          return <ul onClick={handleClick}><li className="item">Item</li></ul>;
        }
      `);

      const response = await handleAnalyzeEventFlow({ file: 'App.tsx' });

      const parsed = JSON.parse(response.content[0].text);
      expect(parsed.delegation_patterns.length).toBeGreaterThan(0);
    });

    it('should detect event delegation with e.target.tagName check', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(`
        function App() {
          const handleClick = (e) => {
            if (e.target.tagName === 'BUTTON') {
              console.log('button clicked');
            }
          };
          return <div onClick={handleClick}><button>Click</button></div>;
        }
      `);

      const response = await handleAnalyzeEventFlow({ file: 'App.tsx' });

      const parsed = JSON.parse(response.content[0].text);
      expect(parsed.delegation_patterns.length).toBeGreaterThan(0);
    });

    it('should detect event delegation with e.target.dataset', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(`
        function App() {
          const handleClick = (e) => {
            const action = e.target.dataset.action;
            if (action) {
              console.log('action:', action);
            }
          };
          return <div onClick={handleClick}><button data-action="delete">Delete</button></div>;
        }
      `);

      const response = await handleAnalyzeEventFlow({ file: 'App.tsx' });

      const parsed = JSON.parse(response.content[0].text);
      expect(parsed.delegation_patterns.length).toBeGreaterThan(0);
    });
  });

  describe('summary generation', () => {
    it('should include handler count in summary', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(`
        function App() {
          return (
            <div>
              <button onClick={() => {}}>1</button>
              <button onClick={() => {}}>2</button>
            </div>
          );
        }
      `);

      const response = await handleAnalyzeEventFlow({ file: 'App.tsx' });

      const parsed = JSON.parse(response.content[0].text);
      expect(parsed.summary).toContain('event handler');
    });

    it('should mention stopPropagation usage in summary', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(`
        function App() {
          return <button onClick={(e) => e.stopPropagation()}>Click</button>;
        }
      `);

      const response = await handleAnalyzeEventFlow({ file: 'App.tsx' });

      const parsed = JSON.parse(response.content[0].text);
      expect(parsed.summary).toContain('stopPropagation');
    });

    it('should mention preventDefault usage in summary', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(`
        function App() {
          return <form onSubmit={(e) => e.preventDefault()}>Submit</form>;
        }
      `);

      const response = await handleAnalyzeEventFlow({ file: 'App.tsx' });

      const parsed = JSON.parse(response.content[0].text);
      expect(parsed.summary).toContain('preventDefault');
    });
  });

  describe('component types', () => {
    it('should analyze function declaration components', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(`
        function MyComponent() {
          return <button onClick={() => {}}>Click</button>;
        }
      `);

      const response = await handleAnalyzeEventFlow({ file: 'App.tsx' });

      const parsed = JSON.parse(response.content[0].text);
      expect(parsed.handlers.length).toBeGreaterThan(0);
    });

    it('should analyze arrow function components', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(`
        const MyComponent = () => {
          return <button onClick={() => {}}>Click</button>;
        };
      `);

      const response = await handleAnalyzeEventFlow({ file: 'App.tsx' });

      const parsed = JSON.parse(response.content[0].text);
      expect(parsed.handlers.length).toBeGreaterThan(0);
    });

    it('should analyze memoized components', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(`
        const MyComponent = React.memo(() => {
          return <button onClick={() => {}}>Click</button>;
        });
      `);

      const response = await handleAnalyzeEventFlow({ file: 'App.tsx' });

      const parsed = JSON.parse(response.content[0].text);
      expect(parsed.handlers.length).toBeGreaterThan(0);
    });

    it('should analyze memo (without React prefix) components', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(`
        const MyComponent = memo(() => {
          return <button onClick={() => {}}>Click</button>;
        });
      `);

      const response = await handleAnalyzeEventFlow({ file: 'App.tsx' });

      const parsed = JSON.parse(response.content[0].text);
      expect(parsed.handlers.length).toBeGreaterThan(0);
    });
  });

  describe('error handling', () => {
    it('should handle parsing errors gracefully', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockImplementation(() => {
        throw new Error('Read error');
      });

      const response = await handleAnalyzeEventFlow({ file: 'App.tsx' });

      expect(response.isError).toBe(true);
      const parsed = JSON.parse(response.content[0].text);
      expect(parsed.error).toBe('Read error');
      expect(parsed.file).toBe('App.tsx');
    });

    it('should handle unknown errors gracefully', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockImplementation(() => {
        throw 'Unknown error';
      });

      const response = await handleAnalyzeEventFlow({ file: 'App.tsx' });

      expect(response.isError).toBe(true);
      const parsed = JSON.parse(response.content[0].text);
      expect(parsed.error).toBe('Unknown error during analysis');
    });
  });

  describe('relative path output', () => {
    it('should return relative file path in response', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(`
        function App() {
          return <button onClick={() => {}}>Click</button>;
        }
      `);

      const response = await handleAnalyzeEventFlow({ file: 'src/components/App.tsx' });

      const parsed = JSON.parse(response.content[0].text);
      expect(parsed.file).toBe('src/components/App.tsx');
    });
  });
});
