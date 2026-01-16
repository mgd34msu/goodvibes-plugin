/**
 * Unit tests for trace-component-state handler entry point
 *
 * Tests the main handler with mocked filesystem to ensure 100% coverage
 * of the handler logic including error handling and edge cases.
 *
 * @module __tests__/handlers/frontend/trace-component-state-handler
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import ts from 'typescript';

import { handleTraceComponentState } from '../../../handlers/frontend/trace-component-state.js';

// Mock fs module
vi.mock('fs', async () => {
  const actual = await vi.importActual<typeof fs>('fs');
  return {
    ...actual,
    existsSync: vi.fn(),
    readFileSync: vi.fn(),
  };
});

describe('handleTraceComponentState', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(process, 'cwd').mockReturnValue('/project');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('input validation', () => {
    it('should return error when file argument is missing', async () => {
      const response = await handleTraceComponentState({} as any);

      expect(response.isError).toBe(true);
      const parsed = JSON.parse(response.content[0].text);
      expect(parsed.error).toBe('file argument is required');
    });

    it('should return error when file argument is empty string', async () => {
      const response = await handleTraceComponentState({ file: '' });

      expect(response.isError).toBe(true);
    });

    it('should return error when file does not exist', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);

      const response = await handleTraceComponentState({ file: 'nonexistent.tsx' });

      expect(response.isError).toBe(true);
      const parsed = JSON.parse(response.content[0].text);
      expect(parsed.error).toContain('File not found');
    });

    it('should return error for unsupported file extension', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);

      const response = await handleTraceComponentState({ file: 'styles.css' });

      expect(response.isError).toBe(true);
      const parsed = JSON.parse(response.content[0].text);
      expect(parsed.error).toContain('Unsupported file type');
    });

    it('should accept .tsx files', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue('function App() { return <div />; }');

      const response = await handleTraceComponentState({ file: 'App.tsx' });

      expect(response.isError).toBeUndefined();
    });

    it('should accept .jsx files', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue('function App() { return <div />; }');

      const response = await handleTraceComponentState({ file: 'App.jsx' });

      expect(response.isError).toBeUndefined();
    });

    it('should accept .ts files', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue('function App() { return <div />; }');

      const response = await handleTraceComponentState({ file: 'App.ts' });

      expect(response.isError).toBeUndefined();
    });

    it('should accept .js files', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue('function App() { return <div />; }');

      const response = await handleTraceComponentState({ file: 'App.js' });

      expect(response.isError).toBeUndefined();
    });

    it('should handle absolute file paths', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue('function App() { return <div />; }');

      const response = await handleTraceComponentState({ file: '/absolute/path/App.tsx' });

      expect(response.isError).toBeUndefined();
    });
  });

  describe('no component found', () => {
    it('should return message when no React component found', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue('const x = 1;');

      const response = await handleTraceComponentState({ file: 'utils.tsx' });

      expect(response.isError).toBeUndefined();
      const parsed = JSON.parse(response.content[0].text);
      expect(parsed.message).toBe('No React components found in file');
    });
  });

  describe('state detection', () => {
    it('should detect useState hooks', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(`
        function MyComponent() {
          const [count, setCount] = useState(0);
          return <div>{count}</div>;
        }
      `);

      const response = await handleTraceComponentState({ file: 'App.tsx' });

      const parsed = JSON.parse(response.content[0].text);
      expect(parsed.local_state.some((s: any) => s.name === 'count')).toBe(true);
      expect(parsed.local_state.some((s: any) => s.hook === 'useState')).toBe(true);
    });

    it('should detect useState with generic type', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(`
        function MyComponent() {
          const [user, setUser] = useState<User | null>(null);
          return <div />;
        }
      `);

      const response = await handleTraceComponentState({ file: 'App.tsx' });

      const parsed = JSON.parse(response.content[0].text);
      expect(parsed.local_state.some((s: any) => s.name === 'user')).toBe(true);
    });

    it('should detect useReducer hooks', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(`
        function MyComponent() {
          const [state, dispatch] = useReducer(reducer, initialState);
          return <div>{state.value}</div>;
        }
      `);

      const response = await handleTraceComponentState({ file: 'App.tsx' });

      const parsed = JSON.parse(response.content[0].text);
      expect(parsed.local_state.some((s: any) => s.hook === 'useReducer')).toBe(true);
    });

    it('should detect useRef hooks', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(`
        function MyComponent() {
          const inputRef = useRef<HTMLInputElement>(null);
          return <input ref={inputRef} />;
        }
      `);

      const response = await handleTraceComponentState({ file: 'App.tsx' });

      const parsed = JSON.parse(response.content[0].text);
      expect(parsed.local_state.some((s: any) => s.hook === 'useRef')).toBe(true);
    });
  });

  describe('props detection', () => {
    it('should detect destructured props', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(`
        function MyComponent({ name, onClick }) {
          return <div onClick={onClick}>{name}</div>;
        }
      `);

      const response = await handleTraceComponentState({ file: 'App.tsx' });

      const parsed = JSON.parse(response.content[0].text);
      expect(parsed.props.received.some((p: any) => p.name === 'name')).toBe(true);
      expect(parsed.props.received.some((p: any) => p.name === 'onClick')).toBe(true);
    });

    it('should detect required vs optional props', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(`
        function MyComponent({ name, value = 'default' }) {
          return <div>{name}: {value}</div>;
        }
      `);

      const response = await handleTraceComponentState({ file: 'App.tsx' });

      const parsed = JSON.parse(response.content[0].text);
      const nameProp = parsed.props.received.find((p: any) => p.name === 'name');
      const valueProp = parsed.props.received.find((p: any) => p.name === 'value');
      expect(nameProp?.required).toBe(true);
      expect(valueProp?.required).toBe(false);
    });

    it('should detect props passed to children', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(`
        function MyComponent({ value }) {
          return <ChildComponent data={value} />;
        }
      `);

      const response = await handleTraceComponentState({ file: 'App.tsx' });

      const parsed = JSON.parse(response.content[0].text);
      expect(parsed.props.passed_down.length).toBeGreaterThan(0);
    });
  });

  describe('context detection', () => {
    it('should detect useContext calls', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(`
        function MyComponent() {
          const theme = useContext(ThemeContext);
          return <div style={{ color: theme.color }} />;
        }
      `);

      const response = await handleTraceComponentState({ file: 'App.tsx' });

      const parsed = JSON.parse(response.content[0].text);
      expect(parsed.context.consumed.some((c: any) => c.context_name === 'ThemeContext')).toBe(true);
    });

    it('should detect context providers', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(`
        function MyComponent() {
          const value = { theme: 'dark' };
          return (
            <ThemeContext.Provider value={value}>
              <Child />
            </ThemeContext.Provider>
          );
        }
      `);

      const response = await handleTraceComponentState({ file: 'App.tsx' });

      const parsed = JSON.parse(response.content[0].text);
      expect(parsed.context.provided.some((c: any) => c.context_name === 'ThemeContext')).toBe(true);
    });

    it('should detect custom hooks', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(`
        function MyComponent() {
          const auth = useAuth();
          return <div>{auth.user}</div>;
        }
      `);

      const response = await handleTraceComponentState({ file: 'App.tsx' });

      const parsed = JSON.parse(response.content[0].text);
      expect(parsed.context.consumed.some((c: any) => c.hook === 'useAuth')).toBe(true);
    });
  });

  describe('effect detection', () => {
    it('should detect useEffect hooks', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(`
        function MyComponent() {
          useEffect(() => {
            document.title = 'Hello';
          }, []);
          return <div />;
        }
      `);

      const response = await handleTraceComponentState({ file: 'App.tsx' });

      const parsed = JSON.parse(response.content[0].text);
      expect(parsed.effects.some((e: any) => e.type === 'useEffect')).toBe(true);
    });

    it('should detect effect cleanup functions', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(`
        function MyComponent() {
          useEffect(() => {
            const sub = subscribe();
            return () => sub.unsubscribe();
          }, []);
          return <div />;
        }
      `);

      const response = await handleTraceComponentState({ file: 'App.tsx' });

      const parsed = JSON.parse(response.content[0].text);
      const effect = parsed.effects.find((e: any) => e.type === 'useEffect');
      expect(effect?.has_cleanup).toBe(true);
    });

    it('should detect useMemo hooks', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(`
        function MyComponent({ items }) {
          const sorted = useMemo(() => items.sort(), [items]);
          return <div>{sorted.length}</div>;
        }
      `);

      const response = await handleTraceComponentState({ file: 'App.tsx' });

      const parsed = JSON.parse(response.content[0].text);
      expect(parsed.effects.some((e: any) => e.type === 'useMemo')).toBe(true);
    });

    it('should detect useCallback hooks', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(`
        function MyComponent() {
          const handleClick = useCallback(() => {}, []);
          return <button onClick={handleClick} />;
        }
      `);

      const response = await handleTraceComponentState({ file: 'App.tsx' });

      const parsed = JSON.parse(response.content[0].text);
      expect(parsed.effects.some((e: any) => e.type === 'useCallback')).toBe(true);
    });

    it('should detect useLayoutEffect hooks', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(`
        function MyComponent() {
          useLayoutEffect(() => {
            // measure DOM
          }, []);
          return <div />;
        }
      `);

      const response = await handleTraceComponentState({ file: 'App.tsx' });

      const parsed = JSON.parse(response.content[0].text);
      expect(parsed.effects.some((e: any) => e.type === 'useLayoutEffect')).toBe(true);
    });
  });

  describe('issue detection', () => {
    it('should detect prop drilling', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(`
        function MyComponent({ value }) {
          return <Child value={value} />;
        }
      `);

      const response = await handleTraceComponentState({ file: 'App.tsx' });

      const parsed = JSON.parse(response.content[0].text);
      expect(parsed.issues.some((i: any) => i.type === 'prop_drilling')).toBe(true);
    });

    it('should detect callback instability', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(`
        function MyComponent() {
          return <Child onClick={() => console.log('clicked')} />;
        }
      `);

      const response = await handleTraceComponentState({ file: 'App.tsx' });

      const parsed = JSON.parse(response.content[0].text);
      expect(parsed.issues.some((i: any) => i.type === 'callback_instability')).toBe(true);
    });

    it('should detect missing memoization', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(`
        function MyComponent() {
          const data = { value: 1 };
          return <Child config={data} />;
        }
      `);

      const response = await handleTraceComponentState({ file: 'App.tsx' });

      const parsed = JSON.parse(response.content[0].text);
      expect(parsed.issues.some((i: any) => i.type === 'missing_memo')).toBe(true);
    });

    it('should detect state initialization in render', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(`
        function MyComponent() {
          const [data, setData] = useState(expensiveCompute());
          return <div />;
        }
      `);

      const response = await handleTraceComponentState({ file: 'App.tsx' });

      const parsed = JSON.parse(response.content[0].text);
      expect(parsed.issues.some((i: any) => i.type === 'state_in_render')).toBe(true);
    });
  });

  describe('component types', () => {
    it('should analyze function declaration components', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(`
        function MyComponent() {
          const [count, setCount] = useState(0);
          return <div>{count}</div>;
        }
      `);

      const response = await handleTraceComponentState({ file: 'App.tsx' });

      const parsed = JSON.parse(response.content[0].text);
      expect(parsed.component).toBe('MyComponent');
    });

    it('should analyze arrow function components', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(`
        const MyComponent = () => {
          const [count, setCount] = useState(0);
          return <div>{count}</div>;
        };
      `);

      const response = await handleTraceComponentState({ file: 'App.tsx' });

      const parsed = JSON.parse(response.content[0].text);
      expect(parsed.component).toBe('MyComponent');
    });

    it('should analyze memoized components', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(`
        const MyComponent = React.memo(() => {
          const [count, setCount] = useState(0);
          return <div>{count}</div>;
        });
      `);

      const response = await handleTraceComponentState({ file: 'App.tsx' });

      const parsed = JSON.parse(response.content[0].text);
      expect(parsed.component).toBe('MyComponent');
    });

    it('should analyze forwardRef components', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(`
        const MyComponent = React.forwardRef((props, ref) => {
          return <div ref={ref}>{props.children}</div>;
        });
      `);

      const response = await handleTraceComponentState({ file: 'App.tsx' });

      expect(response.isError).toBeUndefined();
    });
  });

  describe('component filtering', () => {
    it('should filter by component name when specified', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(`
        function App() {
          return <div />;
        }
        function Button() {
          const [pressed, setPressed] = useState(false);
          return <button />;
        }
      `);

      const response = await handleTraceComponentState({
        file: 'App.tsx',
        component: 'Button',
      });

      const parsed = JSON.parse(response.content[0].text);
      expect(parsed.component).toBe('Button');
    });
  });

  describe('error handling', () => {
    it('should handle parsing errors gracefully', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockImplementation(() => {
        throw new Error('Read error');
      });

      const response = await handleTraceComponentState({ file: 'App.tsx' });

      expect(response.isError).toBe(true);
      const parsed = JSON.parse(response.content[0].text);
      expect(parsed.error).toBe('Read error');
    });

    it('should handle unknown errors gracefully', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockImplementation(() => {
        throw 'Unknown error';
      });

      const response = await handleTraceComponentState({ file: 'App.tsx' });

      expect(response.isError).toBe(true);
      const parsed = JSON.parse(response.content[0].text);
      expect(parsed.error).toBe('Unknown error during analysis');
    });
  });

  describe('output format', () => {
    it('should return relative file path in response', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(`
        function App() {
          return <div />;
        }
      `);

      const response = await handleTraceComponentState({ file: 'src/components/App.tsx' });

      const parsed = JSON.parse(response.content[0].text);
      expect(parsed.file).toBe('src/components/App.tsx');
    });

    it('should include all analysis sections in response', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(`
        function MyComponent({ value }) {
          const [count, setCount] = useState(0);
          const theme = useContext(ThemeContext);
          useEffect(() => {}, []);
          return <div>{count}</div>;
        }
      `);

      const response = await handleTraceComponentState({ file: 'App.tsx' });

      const parsed = JSON.parse(response.content[0].text);
      expect(parsed.local_state).toBeDefined();
      expect(parsed.props).toBeDefined();
      expect(parsed.context).toBeDefined();
      expect(parsed.effects).toBeDefined();
      expect(parsed.issues).toBeDefined();
    });
  });
});
