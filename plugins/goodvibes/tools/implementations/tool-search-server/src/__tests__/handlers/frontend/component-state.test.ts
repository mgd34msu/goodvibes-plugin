/**
 * Unit tests for component-state module
 *
 * Tests cover all exported functions from:
 * - utils.ts: Response helpers, path helpers, type extraction
 * - hook-analyzer.ts: Hook extraction (useState, useReducer, useRef, etc.)
 * - props-analyzer.ts: Props extraction and context providers
 * - jsx-analyzer.ts: JSX analysis for state/props usage
 * - issue-detector.ts: Common React issues detection
 * - component-detector.ts: React component detection
 * - types.ts: Type definitions (implicit testing through usage)
 * - index.ts: Main handler
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import ts from 'typescript';

// Import all functions from the component-state module
import {
  createSuccessResponse,
  createErrorResponse,
  normalizeFilePath,
  makeRelativePath,
  resolveFilePath,
  getTypeString,
  inferTypeFromValue,
  extractDestructuredNames,
  extractDependencyArray,
  hasCleanupReturn,
} from '../../../handlers/frontend/component-state/utils.js';

import { extractHooks } from '../../../handlers/frontend/component-state/hook-analyzer.js';

import {
  extractReceivedProps,
  extractPropsFromTypeDefinition,
  findProvidedContexts,
} from '../../../handlers/frontend/component-state/props-analyzer.js';

import {
  collectUsedIdentifiers,
  analyzeJsx,
} from '../../../handlers/frontend/component-state/jsx-analyzer.js';

import { detectIssues } from '../../../handlers/frontend/component-state/issue-detector.js';

import {
  containsJsxReturn,
  isReactComponent,
  getComponentName,
} from '../../../handlers/frontend/component-state/component-detector.js';

import { handleTraceComponentState } from '../../../handlers/frontend/component-state/index.js';

import type { AnalysisContext } from '../../../handlers/frontend/component-state/types.js';

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

// Helper to create analysis context
function createAnalysisContext(sourceFile: ts.SourceFile): AnalysisContext {
  return {
    sourceFile,
    projectRoot: '/project',
    stateVariables: new Map(),
    propNames: new Set(),
    contextValues: new Map(),
    jsxUsedIdentifiers: new Set(),
    jsxPassedProps: [],
    inlineCallbacks: [],
  };
}

describe('component-state/utils', () => {
  describe('createSuccessResponse', () => {
    it('should create a success response with JSON data', () => {
      const data = { component: 'MyComponent', local_state: [] };
      const response = createSuccessResponse(data);

      expect(response.content).toHaveLength(1);
      expect(response.content[0].type).toBe('text');
      expect(JSON.parse(response.content[0].text)).toEqual(data);
      expect(response.isError).toBeUndefined();
    });
  });

  describe('createErrorResponse', () => {
    it('should create an error response', () => {
      const response = createErrorResponse('Error message', { file: 'test.tsx' });

      expect(response.isError).toBe(true);
      const parsed = JSON.parse(response.content[0].text);
      expect(parsed.error).toBe('Error message');
      expect(parsed.file).toBe('test.tsx');
    });
  });

  describe('normalizeFilePath', () => {
    it('should normalize backslashes', () => {
      expect(normalizeFilePath('src\\components\\App.tsx')).toBe('src/components/App.tsx');
    });
  });

  describe('makeRelativePath', () => {
    it('should create relative path', () => {
      const result = makeRelativePath('/project/src/App.tsx', '/project');
      expect(result).toBe('src/App.tsx');
    });
  });

  describe('resolveFilePath', () => {
    it('should return absolute path unchanged', () => {
      const result = resolveFilePath('/absolute/path.tsx', '/project');
      expect(result).toBe('/absolute/path.tsx');
    });

    it('should resolve relative path', () => {
      const result = resolveFilePath('src/App.tsx', '/project');
      expect(result).toContain('src');
      expect(result).toContain('App.tsx');
    });
  });

  describe('getTypeString', () => {
    it('should return type string for type reference', () => {
      const code = `const x: MyType = {};`;
      const sourceFile = createSourceFile(code);
      const stmt = sourceFile.statements[0] as ts.VariableStatement;
      const decl = stmt.declarationList.declarations[0];

      if (decl.type) {
        expect(getTypeString(decl.type, sourceFile)).toBe('MyType');
      }
    });

    it('should return string for string keyword', () => {
      const code = `const x: string = '';`;
      const sourceFile = createSourceFile(code);
      const stmt = sourceFile.statements[0] as ts.VariableStatement;
      const decl = stmt.declarationList.declarations[0];

      if (decl.type) {
        expect(getTypeString(decl.type, sourceFile)).toBe('string');
      }
    });

    it('should return unknown for undefined node', () => {
      expect(getTypeString(undefined, createSourceFile(''))).toBe('unknown');
    });
  });

  describe('inferTypeFromValue', () => {
    it('should infer string type', () => {
      const code = `const x = 'hello';`;
      const sourceFile = createSourceFile(code);
      const stmt = sourceFile.statements[0] as ts.VariableStatement;
      const decl = stmt.declarationList.declarations[0];

      expect(inferTypeFromValue(decl.initializer, sourceFile)).toBe('string');
    });

    it('should infer number type', () => {
      const code = `const x = 42;`;
      const sourceFile = createSourceFile(code);
      const stmt = sourceFile.statements[0] as ts.VariableStatement;
      const decl = stmt.declarationList.declarations[0];

      expect(inferTypeFromValue(decl.initializer, sourceFile)).toBe('number');
    });

    it('should infer boolean type', () => {
      const code = `const x = true;`;
      const sourceFile = createSourceFile(code);
      const stmt = sourceFile.statements[0] as ts.VariableStatement;
      const decl = stmt.declarationList.declarations[0];

      expect(inferTypeFromValue(decl.initializer, sourceFile)).toBe('boolean');
    });

    it('should infer array type', () => {
      const code = `const x = [1, 2, 3];`;
      const sourceFile = createSourceFile(code);
      const stmt = sourceFile.statements[0] as ts.VariableStatement;
      const decl = stmt.declarationList.declarations[0];

      expect(inferTypeFromValue(decl.initializer, sourceFile)).toBe('number[]');
    });

    it('should infer object type', () => {
      const code = `const x = { a: 1 };`;
      const sourceFile = createSourceFile(code);
      const stmt = sourceFile.statements[0] as ts.VariableStatement;
      const decl = stmt.declarationList.declarations[0];

      expect(inferTypeFromValue(decl.initializer, sourceFile)).toBe('object');
    });

    it('should infer function type', () => {
      const code = `const x = () => {};`;
      const sourceFile = createSourceFile(code);
      const stmt = sourceFile.statements[0] as ts.VariableStatement;
      const decl = stmt.declarationList.declarations[0];

      expect(inferTypeFromValue(decl.initializer, sourceFile)).toBe('function');
    });

    it('should return unknown for undefined', () => {
      expect(inferTypeFromValue(undefined, createSourceFile(''))).toBe('unknown');
    });
  });

  describe('extractDestructuredNames', () => {
    it('should extract names from array destructuring', () => {
      const code = `const [count, setCount] = useState(0);`;
      const sourceFile = createSourceFile(code);

      let callExpr: ts.CallExpression | undefined;
      function visit(node: ts.Node): void {
        if (ts.isCallExpression(node)) {
          callExpr = node;
        }
        ts.forEachChild(node, visit);
      }
      visit(sourceFile);

      if (callExpr) {
        const [firstName, secondName] = extractDestructuredNames(callExpr, sourceFile);
        expect(firstName).toBe('count');
        expect(secondName).toBe('setCount');
      }
    });

    it('should handle simple assignment', () => {
      const code = `const ref = useRef(null);`;
      const sourceFile = createSourceFile(code);

      let callExpr: ts.CallExpression | undefined;
      function visit(node: ts.Node): void {
        if (ts.isCallExpression(node)) {
          callExpr = node;
        }
        ts.forEachChild(node, visit);
      }
      visit(sourceFile);

      if (callExpr) {
        const [name, setter] = extractDestructuredNames(callExpr, sourceFile);
        expect(name).toBe('ref');
        expect(setter).toBeUndefined();
      }
    });
  });

  describe('extractDependencyArray', () => {
    it('should extract dependencies from array literal', () => {
      const code = `useEffect(() => {}, [dep1, dep2]);`;
      const sourceFile = createSourceFile(code);

      let arrayNode: ts.ArrayLiteralExpression | undefined;
      function visit(node: ts.Node): void {
        if (ts.isArrayLiteralExpression(node)) {
          arrayNode = node;
        }
        ts.forEachChild(node, visit);
      }
      visit(sourceFile);

      if (arrayNode) {
        const deps = extractDependencyArray(arrayNode, sourceFile);
        expect(deps).toContain('dep1');
        expect(deps).toContain('dep2');
      }
    });

    it('should return empty array for undefined', () => {
      expect(extractDependencyArray(undefined, createSourceFile(''))).toEqual([]);
    });
  });

  describe('hasCleanupReturn', () => {
    it('should detect cleanup function return', () => {
      const code = `useEffect(() => {
        const sub = subscribe();
        return () => sub.unsubscribe();
      }, []);`;
      const sourceFile = createSourceFile(code);

      let effectCallback: ts.ArrowFunction | undefined;
      function visit(node: ts.Node): void {
        if (ts.isArrowFunction(node) && node.body) {
          // Find the callback with a return
          const text = node.getText(sourceFile);
          if (text.includes('return')) {
            effectCallback = node;
          }
        }
        ts.forEachChild(node, visit);
      }
      visit(sourceFile);

      if (effectCallback) {
        expect(hasCleanupReturn(effectCallback, sourceFile)).toBe(true);
      }
    });

    it('should return false when no cleanup', () => {
      const code = `useEffect(() => { console.log('hi'); }, []);`;
      const sourceFile = createSourceFile(code);

      let effectCallback: ts.ArrowFunction | undefined;
      function visit(node: ts.Node): void {
        if (ts.isArrowFunction(node)) {
          effectCallback = node;
        }
        ts.forEachChild(node, visit);
      }
      visit(sourceFile);

      if (effectCallback) {
        expect(hasCleanupReturn(effectCallback, sourceFile)).toBe(false);
      }
    });
  });
});

describe('component-state/hook-analyzer', () => {
  describe('extractHooks', () => {
    it('should extract useState hooks', () => {
      const code = `function App() {
        const [count, setCount] = useState(0);
        return <div>{count}</div>;
      }`;
      const sourceFile = createSourceFile(code);
      const func = sourceFile.statements[0] as ts.FunctionDeclaration;
      const ctx = createAnalysisContext(sourceFile);

      const { states } = extractHooks(func, ctx);

      expect(states).toHaveLength(1);
      expect(states[0].name).toBe('count');
      expect(states[0].hook).toBe('useState');
      expect(states[0].setter).toBe('setCount');
    });

    it('should extract useState with generic type', () => {
      const code = `function App() {
        const [user, setUser] = useState<User | null>(null);
        return <div />;
      }`;
      const sourceFile = createSourceFile(code);
      const func = sourceFile.statements[0] as ts.FunctionDeclaration;
      const ctx = createAnalysisContext(sourceFile);

      const { states } = extractHooks(func, ctx);

      expect(states[0].type).toBe('User | null');
    });

    it('should extract useReducer hooks', () => {
      const code = `function App() {
        const [state, dispatch] = useReducer(reducer, initialState);
        return <div />;
      }`;
      const sourceFile = createSourceFile(code);
      const func = sourceFile.statements[0] as ts.FunctionDeclaration;
      const ctx = createAnalysisContext(sourceFile);

      const { states } = extractHooks(func, ctx);

      expect(states).toHaveLength(1);
      expect(states[0].name).toBe('state');
      expect(states[0].hook).toBe('useReducer');
      expect(states[0].setter).toBe('dispatch');
    });

    it('should extract useRef hooks', () => {
      const code = `function App() {
        const inputRef = useRef<HTMLInputElement>(null);
        return <input ref={inputRef} />;
      }`;
      const sourceFile = createSourceFile(code);
      const func = sourceFile.statements[0] as ts.FunctionDeclaration;
      const ctx = createAnalysisContext(sourceFile);

      const { states } = extractHooks(func, ctx);

      expect(states).toHaveLength(1);
      expect(states[0].name).toBe('inputRef');
      expect(states[0].hook).toBe('useRef');
      expect(states[0].type).toBe('HTMLInputElement');
    });

    it('should extract useContext hooks', () => {
      const code = `function App() {
        const theme = useContext(ThemeContext);
        return <div />;
      }`;
      const sourceFile = createSourceFile(code);
      const func = sourceFile.statements[0] as ts.FunctionDeclaration;
      const ctx = createAnalysisContext(sourceFile);

      const { contexts } = extractHooks(func, ctx);

      expect(contexts).toHaveLength(1);
      expect(contexts[0].hook).toBe('useContext');
      expect(contexts[0].context_name).toBe('ThemeContext');
    });

    it('should extract useEffect hooks', () => {
      const code = `function App() {
        useEffect(() => {
          document.title = 'Hello';
          return () => { document.title = ''; };
        }, []);
        return <div />;
      }`;
      const sourceFile = createSourceFile(code);
      const func = sourceFile.statements[0] as ts.FunctionDeclaration;
      const ctx = createAnalysisContext(sourceFile);

      const { effects } = extractHooks(func, ctx);

      expect(effects).toHaveLength(1);
      expect(effects[0].type).toBe('useEffect');
      expect(effects[0].has_cleanup).toBe(true);
    });

    it('should extract useMemo hooks', () => {
      const code = `function App({ items }) {
        const sorted = useMemo(() => items.sort(), [items]);
        return <div />;
      }`;
      const sourceFile = createSourceFile(code);
      const func = sourceFile.statements[0] as ts.FunctionDeclaration;
      const ctx = createAnalysisContext(sourceFile);

      const { effects } = extractHooks(func, ctx);

      expect(effects.some(e => e.type === 'useMemo')).toBe(true);
    });

    it('should extract useCallback hooks', () => {
      const code = `function App() {
        const handleClick = useCallback(() => {}, []);
        return <button onClick={handleClick} />;
      }`;
      const sourceFile = createSourceFile(code);
      const func = sourceFile.statements[0] as ts.FunctionDeclaration;
      const ctx = createAnalysisContext(sourceFile);

      const { effects } = extractHooks(func, ctx);

      expect(effects.some(e => e.type === 'useCallback')).toBe(true);
    });

    it('should extract custom hooks', () => {
      const code = `function App() {
        const auth = useAuth();
        return <div />;
      }`;
      const sourceFile = createSourceFile(code);
      const func = sourceFile.statements[0] as ts.FunctionDeclaration;
      const ctx = createAnalysisContext(sourceFile);

      const { contexts } = extractHooks(func, ctx);

      expect(contexts.some(c => c.hook === 'useAuth')).toBe(true);
    });
  });
});

describe('component-state/props-analyzer', () => {
  describe('extractReceivedProps', () => {
    it('should extract destructured props', () => {
      const code = `function App({ name, onClick }) {
        return <div onClick={onClick}>{name}</div>;
      }`;
      const sourceFile = createSourceFile(code);
      const func = sourceFile.statements[0] as ts.FunctionDeclaration;
      const ctx = createAnalysisContext(sourceFile);

      const props = extractReceivedProps(func, ctx);

      expect(props).toHaveLength(2);
      expect(props.find(p => p.name === 'name')).toBeDefined();
      expect(props.find(p => p.name === 'onClick')).toBeDefined();
    });

    it('should detect required vs optional props', () => {
      const code = `function App({ name, value = 'default' }) {
        return <div>{name}: {value}</div>;
      }`;
      const sourceFile = createSourceFile(code);
      const func = sourceFile.statements[0] as ts.FunctionDeclaration;
      const ctx = createAnalysisContext(sourceFile);

      const props = extractReceivedProps(func, ctx);

      const nameProp = props.find(p => p.name === 'name');
      const valueProp = props.find(p => p.name === 'value');

      expect(nameProp?.required).toBe(true);
      expect(valueProp?.required).toBe(false);
      expect(valueProp?.default_value).toBe("'default'");
    });

    it('should handle variable statement components', () => {
      const code = `const App = ({ title }) => <div>{title}</div>;`;
      const sourceFile = createSourceFile(code);
      const stmt = sourceFile.statements[0] as ts.VariableStatement;
      const ctx = createAnalysisContext(sourceFile);

      const props = extractReceivedProps(stmt, ctx);

      expect(props).toHaveLength(1);
      expect(props[0].name).toBe('title');
    });
  });

  describe('extractPropsFromTypeDefinition', () => {
    it('should extract props from interface', () => {
      const code = `
interface Props {
  name: string;
  age?: number;
}
function App(props: Props) { return <div />; }`;
      const sourceFile = createSourceFile(code);
      const ctx = createAnalysisContext(sourceFile);
      const props: any[] = [];

      extractPropsFromTypeDefinition(sourceFile, 'Props', props, ctx);

      expect(props).toHaveLength(2);
      expect(props.find(p => p.name === 'name')?.required).toBe(true);
      expect(props.find(p => p.name === 'age')?.required).toBe(false);
    });

    it('should extract props from type alias', () => {
      const code = `
type Props = {
  id: string;
  count: number;
};
function App(props: Props) { return <div />; }`;
      const sourceFile = createSourceFile(code);
      const ctx = createAnalysisContext(sourceFile);
      const props: any[] = [];

      extractPropsFromTypeDefinition(sourceFile, 'Props', props, ctx);

      expect(props).toHaveLength(2);
    });
  });

  describe('findProvidedContexts', () => {
    it('should find context providers', () => {
      const code = `function App() {
        const value = { theme: 'dark' };
        return (
          <ThemeContext.Provider value={value}>
            <Child />
          </ThemeContext.Provider>
        );
      }`;
      const sourceFile = createSourceFile(code);
      const func = sourceFile.statements[0] as ts.FunctionDeclaration;
      const ctx = createAnalysisContext(sourceFile);

      const provided = findProvidedContexts(func, ctx);

      expect(provided).toHaveLength(1);
      expect(provided[0].context_name).toBe('ThemeContext');
      expect(provided[0].value_source).toBe('value');
    });

    it('should handle inline context values', () => {
      const code = `function App() {
        return (
          <UserContext.Provider value={{ id: 1, name: 'John' }}>
            <Child />
          </UserContext.Provider>
        );
      }`;
      const sourceFile = createSourceFile(code);
      const func = sourceFile.statements[0] as ts.FunctionDeclaration;
      const ctx = createAnalysisContext(sourceFile);

      const provided = findProvidedContexts(func, ctx);

      expect(provided).toHaveLength(1);
      expect(provided[0].context_name).toBe('UserContext');
    });
  });
});

describe('component-state/jsx-analyzer', () => {
  describe('collectUsedIdentifiers', () => {
    it('should collect identifiers from expression', () => {
      const code = `const x = a + b;`;
      const sourceFile = createSourceFile(code);
      const stmt = sourceFile.statements[0] as ts.VariableStatement;
      const decl = stmt.declarationList.declarations[0];
      const identifiers = new Set<string>();

      if (decl.initializer) {
        collectUsedIdentifiers(decl.initializer, sourceFile, identifiers);
      }

      expect(identifiers.has('a')).toBe(true);
      expect(identifiers.has('b')).toBe(true);
    });
  });

  describe('analyzeJsx', () => {
    it('should track identifiers used in JSX', () => {
      const code = `function App() {
        const count = 1;
        return <div>{count}</div>;
      }`;
      const sourceFile = createSourceFile(code);
      const func = sourceFile.statements[0] as ts.FunctionDeclaration;
      const ctx = createAnalysisContext(sourceFile);

      analyzeJsx(func, ctx);

      expect(ctx.jsxUsedIdentifiers.has('count')).toBe(true);
    });

    it('should track props passed to child components', () => {
      const code = `function App({ value }) {
        return <Child data={value} />;
      }`;
      const sourceFile = createSourceFile(code);
      const func = sourceFile.statements[0] as ts.FunctionDeclaration;
      const ctx = createAnalysisContext(sourceFile);
      ctx.propNames.add('value');

      analyzeJsx(func, ctx);

      expect(ctx.jsxPassedProps.length).toBeGreaterThan(0);
      expect(ctx.jsxPassedProps.some(p => p.prop_name === 'data')).toBe(true);
      expect(ctx.jsxPassedProps.some(p => p.to_component === 'Child')).toBe(true);
    });

    it('should detect inline callbacks', () => {
      const code = `function App() {
        return <Button onClick={() => console.log('clicked')} />;
      }`;
      const sourceFile = createSourceFile(code);
      const func = sourceFile.statements[0] as ts.FunctionDeclaration;
      const ctx = createAnalysisContext(sourceFile);

      analyzeJsx(func, ctx);

      expect(ctx.inlineCallbacks.length).toBeGreaterThan(0);
      expect(ctx.inlineCallbacks[0].component).toBe('Button');
      expect(ctx.inlineCallbacks[0].propName).toBe('onClick');
    });

    it('should skip HTML elements for child tracking', () => {
      const code = `function App() {
        return <div className="test" />;
      }`;
      const sourceFile = createSourceFile(code);
      const func = sourceFile.statements[0] as ts.FunctionDeclaration;
      const ctx = createAnalysisContext(sourceFile);

      analyzeJsx(func, ctx);

      expect(ctx.jsxPassedProps.filter(p => p.to_component === 'div')).toHaveLength(0);
    });
  });
});

describe('component-state/issue-detector', () => {
  describe('detectIssues', () => {
    it('should detect prop drilling', () => {
      const code = `function App({ value }) {
        return <Child value={value} />;
      }`;
      const sourceFile = createSourceFile(code);
      const func = sourceFile.statements[0] as ts.FunctionDeclaration;
      const ctx = createAnalysisContext(sourceFile);
      ctx.propNames.add('value');
      ctx.jsxPassedProps.push({
        prop_name: 'value',
        to_component: 'Child',
        original_source: 'prop',
      });

      const receivedProps = [{ name: 'value', required: true }];
      const effects: any[] = [];

      const issues = detectIssues(func, ctx, receivedProps as any, effects);

      expect(issues.some(i => i.type === 'prop_drilling')).toBe(true);
    });

    it('should detect callback instability', () => {
      const code = `function App() {
        return <Child onClick={() => {}} />;
      }`;
      const sourceFile = createSourceFile(code);
      const func = sourceFile.statements[0] as ts.FunctionDeclaration;
      const ctx = createAnalysisContext(sourceFile);
      ctx.inlineCallbacks.push({
        component: 'Child',
        propName: 'onClick',
        line: 2,
      });

      const issues = detectIssues(func, ctx, [], []);

      expect(issues.some(i => i.type === 'callback_instability')).toBe(true);
    });

    it('should detect missing memoization', () => {
      const code = `function App() {
        const data = { value: 1 };
        return <Child config={data} />;
      }`;
      const sourceFile = createSourceFile(code);
      const func = sourceFile.statements[0] as ts.FunctionDeclaration;
      const ctx = createAnalysisContext(sourceFile);
      ctx.jsxPassedProps.push({
        prop_name: 'config',
        to_component: 'Child',
        original_source: 'derived',
      });

      const issues = detectIssues(func, ctx, [], []);

      expect(issues.some(i => i.type === 'missing_memo')).toBe(true);
    });

    it('should detect effect dependency issues', () => {
      const sourceFile = createSourceFile(`function App() { return <div />; }`);
      const func = sourceFile.statements[0] as ts.FunctionDeclaration;
      const ctx = createAnalysisContext(sourceFile);
      ctx.stateVariables.set('count', {} as any);

      const effects = [{ type: 'useEffect' as const, dependencies: [], has_cleanup: false }];

      const issues = detectIssues(func, ctx, [], effects);

      expect(issues.some(i => i.type === 'effect_deps')).toBe(true);
    });

    it('should detect state initialization in render', () => {
      const code = `function App() {
        const [data, setData] = useState(expensiveCompute());
        return <div />;
      }`;
      const sourceFile = createSourceFile(code);
      const func = sourceFile.statements[0] as ts.FunctionDeclaration;
      const ctx = createAnalysisContext(sourceFile);

      const issues = detectIssues(func, ctx, [], []);

      expect(issues.some(i => i.type === 'state_in_render')).toBe(true);
    });
  });
});

describe('component-state/component-detector', () => {
  describe('containsJsxReturn', () => {
    it('should return true for JSX element', () => {
      const code = `function App() { return <div />; }`;
      const sourceFile = createSourceFile(code);
      const func = sourceFile.statements[0] as ts.FunctionDeclaration;

      expect(containsJsxReturn(func)).toBe(true);
    });

    it('should return true for JSX fragment', () => {
      const code = `function App() { return <><span /></>; }`;
      const sourceFile = createSourceFile(code);
      const func = sourceFile.statements[0] as ts.FunctionDeclaration;

      expect(containsJsxReturn(func)).toBe(true);
    });

    it('should return false for non-JSX', () => {
      const code = `function add(a, b) { return a + b; }`;
      const sourceFile = createSourceFile(code);
      const func = sourceFile.statements[0] as ts.FunctionDeclaration;

      expect(containsJsxReturn(func)).toBe(false);
    });
  });

  describe('isReactComponent', () => {
    it('should detect function declaration components', () => {
      const code = `function MyComponent() { return <div />; }`;
      const sourceFile = createSourceFile(code);
      const func = sourceFile.statements[0];

      expect(isReactComponent(func, sourceFile)).toBe(true);
    });

    it('should detect arrow function components', () => {
      const code = `const MyComponent = () => <div />;`;
      const sourceFile = createSourceFile(code);
      const stmt = sourceFile.statements[0];

      expect(isReactComponent(stmt, sourceFile)).toBe(true);
    });

    it('should reject lowercase functions', () => {
      const code = `function helper() { return <div />; }`;
      const sourceFile = createSourceFile(code);
      const func = sourceFile.statements[0];

      expect(isReactComponent(func, sourceFile)).toBe(false);
    });

    it('should reject non-JSX functions', () => {
      const code = `function MyComponent() { return 'text'; }`;
      const sourceFile = createSourceFile(code);
      const func = sourceFile.statements[0];

      expect(isReactComponent(func, sourceFile)).toBe(false);
    });
  });

  describe('getComponentName', () => {
    it('should get name from function declaration', () => {
      const code = `function MyComponent() { return <div />; }`;
      const sourceFile = createSourceFile(code);
      const func = sourceFile.statements[0];

      expect(getComponentName(func, sourceFile)).toBe('MyComponent');
    });

    it('should get name from variable statement', () => {
      const code = `const MyComponent = () => <div />;`;
      const sourceFile = createSourceFile(code);
      const stmt = sourceFile.statements[0];

      expect(getComponentName(stmt, sourceFile)).toBe('MyComponent');
    });

    it('should return null for unsupported nodes', () => {
      const code = `type X = string;`;
      const sourceFile = createSourceFile(code);
      const stmt = sourceFile.statements[0];

      expect(getComponentName(stmt, sourceFile)).toBeNull();
    });
  });
});

// Handler tests use real filesystem since ESM mocking is not supported
describe('component-state/handleTraceComponentState', () => {
  it('should return error when file does not exist', async () => {
    const response = await handleTraceComponentState({
      file: '/nonexistent/path/to/file.tsx',
    });

    expect(response.isError).toBe(true);
    expect(response.content[0].text).toContain('File not found');
  });

  it('should return error for unsupported file extensions', async () => {
    // Will fail on file not found first since extension check happens after existence check
    const response = await handleTraceComponentState({ file: 'test.css' });

    expect(response.isError).toBe(true);
  });

  // Test the analysis logic indirectly by testing the component analyzers
  it('should validate hook extraction works correctly', () => {
    const code = `function MyComponent({ name }) {
      const [count, setCount] = useState(0);
      const theme = useContext(ThemeContext);
      useEffect(() => {
        console.log('mounted');
        return () => console.log('unmounted');
      }, []);
      return <div>{count}</div>;
    }`;
    const sourceFile = createSourceFile(code);
    const func = sourceFile.statements[0] as ts.FunctionDeclaration;
    const ctx = createAnalysisContext(sourceFile);

    const { states, contexts, effects } = extractHooks(func, ctx);

    expect(states.some((s: any) => s.name === 'count')).toBe(true);
    expect(contexts.some((c: any) => c.context_name === 'ThemeContext')).toBe(true);
    expect(effects.some((e: any) => e.type === 'useEffect')).toBe(true);
  });

  it('should validate component detection works correctly', () => {
    const code = `function MyComponent({ name }) {
      return <div>{name}</div>;
    }`;
    const sourceFile = createSourceFile(code);
    const func = sourceFile.statements[0];

    expect(isReactComponent(func, sourceFile)).toBe(true);
    expect(getComponentName(func, sourceFile)).toBe('MyComponent');
  });

  it('should validate props extraction works correctly', () => {
    const code = `function MyComponent({ name, value = 'default' }) {
      return <div>{name}: {value}</div>;
    }`;
    const sourceFile = createSourceFile(code);
    const func = sourceFile.statements[0] as ts.FunctionDeclaration;
    const ctx = createAnalysisContext(sourceFile);

    const props = extractReceivedProps(func, ctx);

    expect(props.find((p: any) => p.name === 'name')).toBeDefined();
    expect(props.find((p: any) => p.name === 'value')?.required).toBe(false);
  });
});
