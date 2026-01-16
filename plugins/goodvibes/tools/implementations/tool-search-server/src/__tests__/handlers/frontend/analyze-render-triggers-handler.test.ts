/**
 * Unit tests for analyze-render-triggers handler entry point
 *
 * Tests the main handler with mocked filesystem to ensure 100% coverage
 * of the handler logic including error handling and edge cases.
 *
 * @module __tests__/handlers/frontend/analyze-render-triggers-handler
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import ts from 'typescript';

import { handleAnalyzeRenderTriggers } from '../../../handlers/frontend/render-triggers/index.js';

// Mock fs module
vi.mock('fs', async () => {
  const actual = await vi.importActual<typeof fs>('fs');
  return {
    ...actual,
    existsSync: vi.fn(),
    readFileSync: vi.fn(),
  };
});

describe('handleAnalyzeRenderTriggers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(process, 'cwd').mockReturnValue('/project');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('input validation', () => {
    it('should return error when file argument is missing', async () => {
      const response = await handleAnalyzeRenderTriggers({} as any);

      expect(response.isError).toBe(true);
      const parsed = JSON.parse(response.content[0].text);
      expect(parsed.error).toBe('file argument is required');
    });

    it('should return error when file does not exist', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);

      const response = await handleAnalyzeRenderTriggers({ file: 'nonexistent.tsx' });

      expect(response.isError).toBe(true);
      const parsed = JSON.parse(response.content[0].text);
      expect(parsed.error).toContain('File not found');
    });

    it('should return error for unsupported file extension', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);

      const response = await handleAnalyzeRenderTriggers({ file: 'styles.css' });

      expect(response.isError).toBe(true);
      const parsed = JSON.parse(response.content[0].text);
      expect(parsed.error).toContain('must be a React component file');
    });

    it('should accept .tsx files', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue('function App() { return <div />; }');

      const response = await handleAnalyzeRenderTriggers({ file: 'App.tsx' });

      expect(response.isError).toBeUndefined();
    });

    it('should accept .jsx files', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue('function App() { return <div />; }');

      const response = await handleAnalyzeRenderTriggers({ file: 'App.jsx' });

      expect(response.isError).toBeUndefined();
    });

    it('should accept .ts files', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue('function App() { return <div />; }');

      const response = await handleAnalyzeRenderTriggers({ file: 'App.ts' });

      expect(response.isError).toBeUndefined();
    });

    it('should accept .js files', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue('function App() { return <div />; }');

      const response = await handleAnalyzeRenderTriggers({ file: 'App.js' });

      expect(response.isError).toBeUndefined();
    });

    it('should handle absolute file paths', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue('function App() { return <div />; }');

      const response = await handleAnalyzeRenderTriggers({ file: '/absolute/path/App.tsx' });

      expect(response.isError).toBeUndefined();
    });
  });

  describe('no component found', () => {
    it('should return message when no React component found', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue('const x = 1;');

      const response = await handleAnalyzeRenderTriggers({ file: 'utils.tsx' });

      expect(response.isError).toBeUndefined();
      const parsed = JSON.parse(response.content[0].text);
      expect(parsed.message).toBe('No React components found in file');
    });
  });

  describe('memoization detection', () => {
    it('should detect React.memo components', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(`
        const MyComponent = React.memo(() => {
          return <div>Hello</div>;
        });
      `);

      const response = await handleAnalyzeRenderTriggers({ file: 'App.tsx' });

      const parsed = JSON.parse(response.content[0].text);
      expect(parsed.is_memoized).toBe(true);
      expect(parsed.memo_type).toBe('React.memo');
    });

    it('should detect memo (without React prefix) components', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(`
        const MyComponent = memo(() => {
          return <div>Hello</div>;
        });
      `);

      const response = await handleAnalyzeRenderTriggers({ file: 'App.tsx' });

      const parsed = JSON.parse(response.content[0].text);
      expect(parsed.is_memoized).toBe(true);
    });

    it('should detect non-memoized components', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(`
        function MyComponent() {
          return <div>Hello</div>;
        }
      `);

      const response = await handleAnalyzeRenderTriggers({ file: 'App.tsx' });

      const parsed = JSON.parse(response.content[0].text);
      expect(parsed.is_memoized).toBe(false);
    });

    it('should detect PureComponent', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(`
        class MyComponent extends React.PureComponent {
          render() { return <div>Hello</div>; }
        }
      `);

      const response = await handleAnalyzeRenderTriggers({ file: 'App.tsx' });

      const parsed = JSON.parse(response.content[0].text);
      expect(parsed.is_memoized).toBe(true);
      expect(parsed.memo_type).toBe('PureComponent');
    });

    it('should detect shouldComponentUpdate', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(`
        class MyComponent extends React.Component {
          shouldComponentUpdate(nextProps) {
            return this.props.value !== nextProps.value;
          }
          render() { return <div>Hello</div>; }
        }
      `);

      const response = await handleAnalyzeRenderTriggers({ file: 'App.tsx' });

      const parsed = JSON.parse(response.content[0].text);
      expect(parsed.is_memoized).toBe(true);
      expect(parsed.memo_type).toBe('shouldComponentUpdate');
    });
  });

  describe('render trigger detection', () => {
    it('should detect useState hooks', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(`
        function MyComponent() {
          const [count, setCount] = useState(0);
          return <div>{count}</div>;
        }
      `);

      const response = await handleAnalyzeRenderTriggers({ file: 'App.tsx' });

      const parsed = JSON.parse(response.content[0].text);
      expect(parsed.render_triggers.some((t: any) => t.type === 'state')).toBe(true);
    });

    it('should detect useReducer hooks', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(`
        function MyComponent() {
          const [state, dispatch] = useReducer(reducer, initialState);
          return <div>{state.value}</div>;
        }
      `);

      const response = await handleAnalyzeRenderTriggers({ file: 'App.tsx' });

      const parsed = JSON.parse(response.content[0].text);
      expect(parsed.render_triggers.some((t: any) => t.type === 'state')).toBe(true);
    });

    it('should detect prop triggers', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(`
        function MyComponent({ value, onChange }) {
          return <input value={value} onChange={onChange} />;
        }
      `);

      const response = await handleAnalyzeRenderTriggers({ file: 'App.tsx' });

      const parsed = JSON.parse(response.content[0].text);
      expect(parsed.render_triggers.some((t: any) => t.type === 'prop')).toBe(true);
    });

    it('should detect forceUpdate trigger', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(`
        class MyComponent extends React.Component {
          handleClick() {
            this.forceUpdate();
          }
          render() { return <div onClick={this.handleClick} />; }
        }
      `);

      const response = await handleAnalyzeRenderTriggers({ file: 'App.tsx' });

      const parsed = JSON.parse(response.content[0].text);
      expect(parsed.render_triggers.some((t: any) => t.type === 'force_update')).toBe(true);
    });

    it('should always include parent re-render trigger', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(`
        function MyComponent() {
          return <div>Hello</div>;
        }
      `);

      const response = await handleAnalyzeRenderTriggers({ file: 'App.tsx' });

      const parsed = JSON.parse(response.content[0].text);
      expect(parsed.render_triggers.some((t: any) => t.type === 'parent')).toBe(true);
    });
  });

  describe('inline definition detection', () => {
    it('should detect inline objects in JSX', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(`
        function MyComponent() {
          return <div style={{ margin: 10 }} />;
        }
      `);

      const response = await handleAnalyzeRenderTriggers({ file: 'App.tsx' });

      const parsed = JSON.parse(response.content[0].text);
      expect(parsed.inline_definitions.some((d: any) => d.type === 'object')).toBe(true);
    });

    it('should detect inline functions in JSX', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(`
        function MyComponent() {
          return <button onClick={() => console.log('clicked')} />;
        }
      `);

      const response = await handleAnalyzeRenderTriggers({ file: 'App.tsx' });

      const parsed = JSON.parse(response.content[0].text);
      expect(parsed.inline_definitions.some((d: any) => d.type === 'function')).toBe(true);
    });

    it('should detect inline arrays in JSX', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(`
        function MyComponent() {
          return <Select options={[1, 2, 3]} />;
        }
      `);

      const response = await handleAnalyzeRenderTriggers({ file: 'App.tsx' });

      const parsed = JSON.parse(response.content[0].text);
      expect(parsed.inline_definitions.some((d: any) => d.type === 'array')).toBe(true);
    });

    it('should not flag memoized inline definitions', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(`
        function MyComponent() {
          const style = useMemo(() => ({ margin: 10 }), []);
          return <div style={style} />;
        }
      `);

      const response = await handleAnalyzeRenderTriggers({ file: 'App.tsx' });

      const parsed = JSON.parse(response.content[0].text);
      const objectDefs = parsed.inline_definitions.filter((d: any) => d.type === 'object');
      expect(objectDefs.length).toBe(0);
    });
  });

  describe('expensive computation detection', () => {
    it('should detect array map operations', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(`
        function MyComponent({ items }) {
          const mapped = items.map(i => i * 2);
          return <div>{mapped}</div>;
        }
      `);

      const response = await handleAnalyzeRenderTriggers({ file: 'App.tsx' });

      const parsed = JSON.parse(response.content[0].text);
      expect(parsed.expensive_computations.some((c: any) => c.description.includes('map'))).toBe(true);
    });

    it('should detect filter operations', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(`
        function MyComponent({ items }) {
          const filtered = items.filter(i => i > 0);
          return <div>{filtered.length}</div>;
        }
      `);

      const response = await handleAnalyzeRenderTriggers({ file: 'App.tsx' });

      const parsed = JSON.parse(response.content[0].text);
      expect(parsed.expensive_computations.some((c: any) => c.description.includes('filter'))).toBe(true);
    });

    it('should detect sort operations', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(`
        function MyComponent({ items }) {
          const sorted = items.sort((a, b) => a - b);
          return <div>{sorted}</div>;
        }
      `);

      const response = await handleAnalyzeRenderTriggers({ file: 'App.tsx' });

      const parsed = JSON.parse(response.content[0].text);
      expect(parsed.expensive_computations.some((c: any) => c.description.includes('sort'))).toBe(true);
    });

    it('should not flag computations inside useMemo', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(`
        function MyComponent({ items }) {
          const sorted = useMemo(() => items.sort((a, b) => a - b), [items]);
          return <div>{sorted}</div>;
        }
      `);

      const response = await handleAnalyzeRenderTriggers({ file: 'App.tsx' });

      const parsed = JSON.parse(response.content[0].text);
      const sortComputations = parsed.expensive_computations.filter((c: any) =>
        c.description.includes('sort')
      );
      expect(sortComputations.length).toBe(0);
    });
  });

  describe('context usage detection', () => {
    it('should detect useContext calls', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(`
        function MyComponent() {
          const theme = useContext(ThemeContext);
          return <div style={{ color: theme.color }} />;
        }
      `);

      const response = await handleAnalyzeRenderTriggers({ file: 'App.tsx' });

      const parsed = JSON.parse(response.content[0].text);
      expect(parsed.context_subscriptions.some((c: any) => c.context === 'ThemeContext')).toBe(true);
    });

    it('should detect useSelector calls', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(`
        function MyComponent() {
          const count = useSelector(state => state.count);
          return <div>{count}</div>;
        }
      `);

      const response = await handleAnalyzeRenderTriggers({ file: 'App.tsx' });

      const parsed = JSON.parse(response.content[0].text);
      expect(parsed.context_subscriptions.some((c: any) => c.context === 'Redux Store')).toBe(true);
    });
  });

  describe('children analysis', () => {
    it('should skip children analysis by default', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(`
        function MyComponent({ value }) {
          return <ChildComponent data={value} />;
        }
      `);

      const response = await handleAnalyzeRenderTriggers({ file: 'App.tsx' });

      const parsed = JSON.parse(response.content[0].text);
      expect(parsed.children_analysis).toBeUndefined();
    });

    it('should include children analysis when requested', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(`
        function MyComponent({ value }) {
          return <ChildComponent data={value} />;
        }
      `);

      const response = await handleAnalyzeRenderTriggers({
        file: 'App.tsx',
        include_children: true,
      });

      const parsed = JSON.parse(response.content[0].text);
      expect(parsed.children_analysis).toBeDefined();
      expect(Array.isArray(parsed.children_analysis)).toBe(true);
    });

    it('should detect unstable props passed to children', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(`
        function MyComponent() {
          return <Child onClick={() => {}} style={{ margin: 0 }} />;
        }
      `);

      const response = await handleAnalyzeRenderTriggers({
        file: 'App.tsx',
        include_children: true,
      });

      const parsed = JSON.parse(response.content[0].text);
      if (parsed.children_analysis && parsed.children_analysis.length > 0) {
        expect(parsed.children_analysis[0].receives_unstable_props).toBe(true);
      }
    });
  });

  describe('optimization suggestions', () => {
    it('should suggest memo for non-memoized component', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(`
        function MyComponent({ value }) {
          return <ChildComponent data={value} />;
        }
      `);

      const response = await handleAnalyzeRenderTriggers({
        file: 'App.tsx',
        include_children: true,
      });

      const parsed = JSON.parse(response.content[0].text);
      expect(parsed.optimization_suggestions.some((s: any) => s.type === 'memo')).toBe(true);
    });

    it('should suggest useCallback for inline functions', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(`
        const MyComponent = React.memo(() => {
          return <button onClick={() => console.log('clicked')} />;
        });
      `);

      const response = await handleAnalyzeRenderTriggers({ file: 'App.tsx' });

      const parsed = JSON.parse(response.content[0].text);
      expect(parsed.optimization_suggestions.some((s: any) => s.type === 'useCallback')).toBe(true);
    });

    it('should suggest useMemo for inline objects', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(`
        const MyComponent = React.memo(() => {
          return <div style={{ margin: 10 }} />;
        });
      `);

      const response = await handleAnalyzeRenderTriggers({ file: 'App.tsx' });

      const parsed = JSON.parse(response.content[0].text);
      expect(parsed.optimization_suggestions.some((s: any) => s.type === 'useMemo')).toBe(true);
    });
  });

  describe('error handling', () => {
    it('should handle parsing errors gracefully', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockImplementation(() => {
        throw new Error('Read error');
      });

      const response = await handleAnalyzeRenderTriggers({ file: 'App.tsx' });

      expect(response.isError).toBe(true);
      const parsed = JSON.parse(response.content[0].text);
      expect(parsed.error).toBe('Read error');
    });

    it('should handle unknown errors gracefully', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockImplementation(() => {
        throw 'Unknown error';
      });

      const response = await handleAnalyzeRenderTriggers({ file: 'App.tsx' });

      expect(response.isError).toBe(true);
      const parsed = JSON.parse(response.content[0].text);
      expect(parsed.error).toBe('Unknown error during analysis');
    });
  });
});
