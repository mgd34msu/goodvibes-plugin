/**
 * Unit tests for react component tree handler
 *
 * Tests cover:
 * - React component detection (function, arrow, class)
 * - Props extraction from various patterns
 * - Component relationship tracking (used_by, uses)
 * - Tree building with depth limits
 * - Root component detection
 * - JSX parsing
 * - File discovery
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

// Mock modules before imports
vi.mock('fs');

import { handleGetReactComponentTree, GetReactComponentTreeArgs, getComponentName } from '../../../handlers/framework/react.js';
import ts from 'typescript';

describe('handleGetReactComponentTree', () => {
  const originalCwd = process.cwd;

  beforeEach(() => {
    vi.clearAllMocks();
    process.cwd = vi.fn(() => '/mock/project/root');
  });

  afterEach(() => {
    vi.resetAllMocks();
    process.cwd = originalCwd;
  });

  describe('file handling', () => {
    it('should analyze specific file when provided', async () => {
      const content = `
import React from 'react';

export function MyComponent() {
  return <div>Hello</div>;
}
`;

      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(content);
      vi.mocked(fs.readdirSync).mockReturnValue([]);

      const args: GetReactComponentTreeArgs = {
        file: 'src/components/MyComponent.tsx',
      };

      const result = await handleGetReactComponentTree(args);
      const data = JSON.parse(result.content[0].text);

      expect(result.isError).toBeUndefined();
      expect(data.components).toBeDefined();
      expect(data.count).toBeGreaterThan(0);
    });

    it('should return error when file not found', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);

      const args: GetReactComponentTreeArgs = {
        file: 'nonexistent.tsx',
      };

      const result = await handleGetReactComponentTree(args);
      const data = JSON.parse(result.content[0].text);

      expect(result.isError).toBe(true);
      expect(data.error).toContain('not found');
    });

    it('should handle absolute file path', async () => {
      const content = `
import React from 'react';

export function AbsoluteComponent() {
  return <div>Absolute</div>;
}
`;

      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(content);

      const args: GetReactComponentTreeArgs = {
        file: '/absolute/path/to/Component.tsx',
      };

      const result = await handleGetReactComponentTree(args);
      const data = JSON.parse(result.content[0].text);

      expect(result.isError).toBeUndefined();
      expect(data.components.some((c: { name: string }) => c.name === 'AbsoluteComponent')).toBe(true);
    });

    it('should scan directory when no specific file provided', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readdirSync).mockReturnValue([
        { name: 'App.tsx', isDirectory: () => false, isFile: () => true },
        { name: 'Button.tsx', isDirectory: () => false, isFile: () => true },
      ] as unknown as fs.Dirent[]);
      vi.mocked(fs.readFileSync).mockReturnValue(`
        export function Component() { return <div />; }
      `);

      const args: GetReactComponentTreeArgs = {
        path: 'src',
      };

      const result = await handleGetReactComponentTree(args);
      const data = JSON.parse(result.content[0].text);

      expect(result.isError).toBeUndefined();
      expect(data.components).toBeDefined();
    });

    it('should skip non-React files', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readdirSync).mockReturnValue([
        { name: 'utils.ts', isDirectory: () => false, isFile: () => true },
        { name: 'styles.css', isDirectory: () => false, isFile: () => true },
        { name: 'Component.tsx', isDirectory: () => false, isFile: () => true },
      ] as unknown as fs.Dirent[]);
      vi.mocked(fs.readFileSync).mockReturnValue(`
        export function Component() { return <div />; }
      `);

      const args: GetReactComponentTreeArgs = {
        path: 'src',
      };

      const result = await handleGetReactComponentTree(args);

      expect(result.isError).toBeUndefined();
    });
  });

  describe('component detection', () => {
    it('should detect function declaration components', async () => {
      const content = `
import React from 'react';

export function Header() {
  return <header>Header</header>;
}

export function Footer() {
  return <footer>Footer</footer>;
}
`;

      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(content);

      const args: GetReactComponentTreeArgs = {
        file: 'src/Layout.tsx',
      };

      const result = await handleGetReactComponentTree(args);
      const data = JSON.parse(result.content[0].text);

      expect(data.components.some((c: { name: string }) => c.name === 'Header')).toBe(true);
      expect(data.components.some((c: { name: string }) => c.name === 'Footer')).toBe(true);
    });

    it('should detect arrow function components', async () => {
      const content = `
import React from 'react';

export const Card = () => {
  return <div className="card">Card</div>;
};

export const Button = () => <button>Click</button>;
`;

      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(content);

      const args: GetReactComponentTreeArgs = {
        file: 'src/Card.tsx',
      };

      const result = await handleGetReactComponentTree(args);
      const data = JSON.parse(result.content[0].text);

      expect(data.components.some((c: { name: string }) => c.name === 'Card')).toBe(true);
      expect(data.components.some((c: { name: string }) => c.name === 'Button')).toBe(true);
    });

    it('should detect class components', async () => {
      const content = `
import React, { Component } from 'react';

export class OldComponent extends Component {
  render() {
    return <div>Old Style</div>;
  }
}

export class PureOldComponent extends React.PureComponent {
  render() {
    return <div>Pure</div>;
  }
}
`;

      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(content);

      const args: GetReactComponentTreeArgs = {
        file: 'src/OldComponent.tsx',
      };

      const result = await handleGetReactComponentTree(args);
      const data = JSON.parse(result.content[0].text);

      expect(data.components.some((c: { name: string }) => c.name === 'OldComponent')).toBe(true);
      expect(data.components.some((c: { name: string }) => c.name === 'PureOldComponent')).toBe(true);
    });

    it('should ignore non-component functions', async () => {
      const content = `
import React from 'react';

// Helper function - not a component
export function formatDate(date: Date) {
  return date.toISOString();
}

// lowercase - not a component
export function helper() {
  return <div />;
}

// Actual component
export function MyComponent() {
  return <div>{formatDate(new Date())}</div>;
}
`;

      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(content);

      const args: GetReactComponentTreeArgs = {
        file: 'src/Mixed.tsx',
      };

      const result = await handleGetReactComponentTree(args);
      const data = JSON.parse(result.content[0].text);

      // formatDate and helper should not be detected as components
      expect(data.components.some((c: { name: string }) => c.name === 'formatDate')).toBe(false);
      expect(data.components.some((c: { name: string }) => c.name === 'MyComponent')).toBe(true);
    });
  });

  describe('props extraction', () => {
    it('should extract props from destructured parameters', async () => {
      const content = `
import React from 'react';

export function Button({ onClick, label, disabled }) {
  return <button onClick={onClick} disabled={disabled}>{label}</button>;
}
`;

      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(content);

      const args: GetReactComponentTreeArgs = {
        file: 'src/Button.tsx',
      };

      const result = await handleGetReactComponentTree(args);
      const data = JSON.parse(result.content[0].text);

      const button = data.components.find((c: { name: string }) => c.name === 'Button');
      expect(button.props).toContain('onClick');
      expect(button.props).toContain('label');
      expect(button.props).toContain('disabled');
    });

    it('should extract props from type literal parameters', async () => {
      const content = `
import React from 'react';

export function Card(props: { title: string; content: string; footer?: React.ReactNode }) {
  return (
    <div>
      <h2>{props.title}</h2>
      <p>{props.content}</p>
      {props.footer}
    </div>
  );
}
`;

      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(content);

      const args: GetReactComponentTreeArgs = {
        file: 'src/Card.tsx',
      };

      const result = await handleGetReactComponentTree(args);
      const data = JSON.parse(result.content[0].text);

      const card = data.components.find((c: { name: string }) => c.name === 'Card');
      expect(card.props).toContain('title');
      expect(card.props).toContain('content');
      expect(card.props).toContain('footer');
    });

    it('should extract props from interface reference', async () => {
      const content = `
import React from 'react';

interface UserCardProps {
  name: string;
  email: string;
  avatar?: string;
}

export function UserCard(props: UserCardProps) {
  return <div>{props.name}</div>;
}
`;

      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(content);

      const args: GetReactComponentTreeArgs = {
        file: 'src/UserCard.tsx',
      };

      const result = await handleGetReactComponentTree(args);
      const data = JSON.parse(result.content[0].text);

      const userCard = data.components.find((c: { name: string }) => c.name === 'UserCard');
      expect(userCard.props).toContain('name');
      expect(userCard.props).toContain('email');
    });

    it('should extract props from class component this.props', async () => {
      const content = `
import React, { Component } from 'react';

export class ClassComponent extends Component {
  render() {
    return (
      <div>
        {this.props.title}
        {this.props.children}
      </div>
    );
  }
}
`;

      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(content);

      const args: GetReactComponentTreeArgs = {
        file: 'src/ClassComponent.tsx',
      };

      const result = await handleGetReactComponentTree(args);
      const data = JSON.parse(result.content[0].text);

      const comp = data.components.find((c: { name: string }) => c.name === 'ClassComponent');
      expect(comp.props).toContain('title');
      expect(comp.props).toContain('children');
    });
  });

  describe('component relationships', () => {
    it('should track component usage (uses)', async () => {
      const content = `
import React from 'react';
import { Header } from './Header';
import { Footer } from './Footer';

export function Layout({ children }) {
  return (
    <div>
      <Header />
      <main>{children}</main>
      <Footer />
    </div>
  );
}
`;

      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(content);

      const args: GetReactComponentTreeArgs = {
        file: 'src/Layout.tsx',
      };

      const result = await handleGetReactComponentTree(args);
      const data = JSON.parse(result.content[0].text);

      const layout = data.components.find((c: { name: string }) => c.name === 'Layout');
      expect(layout.uses).toContain('Header');
      expect(layout.uses).toContain('Footer');
    });

    it('should not track HTML elements as component usage', async () => {
      const content = `
import React from 'react';

export function Simple() {
  return (
    <div>
      <span>Text</span>
      <button>Click</button>
    </div>
  );
}
`;

      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(content);

      const args: GetReactComponentTreeArgs = {
        file: 'src/Simple.tsx',
      };

      const result = await handleGetReactComponentTree(args);
      const data = JSON.parse(result.content[0].text);

      const simple = data.components.find((c: { name: string }) => c.name === 'Simple');
      expect(simple.uses).not.toContain('div');
      expect(simple.uses).not.toContain('span');
      expect(simple.uses).not.toContain('button');
    });

    it('should build used_by relationships', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readdirSync).mockReturnValue([
        { name: 'Parent.tsx', isDirectory: () => false, isFile: () => true },
        { name: 'Child.tsx', isDirectory: () => false, isFile: () => true },
      ] as unknown as fs.Dirent[]);
      vi.mocked(fs.readFileSync).mockImplementation((filePath) => {
        const p = String(filePath);
        if (p.includes('Parent.tsx')) {
          return `
            import React from 'react';
            import { Child } from './Child';
            export function Parent() { return <Child />; }
          `;
        }
        if (p.includes('Child.tsx')) {
          return `
            import React from 'react';
            export function Child() { return <div>Child</div>; }
          `;
        }
        return '';
      });

      const args: GetReactComponentTreeArgs = {
        path: 'src',
      };

      const result = await handleGetReactComponentTree(args);
      const data = JSON.parse(result.content[0].text);

      const child = data.components.find((c: { name: string }) => c.name === 'Child');
      expect(child.used_by).toContain('Parent');
    });
  });

  describe('tree building', () => {
    it('should build component tree from root', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readdirSync).mockReturnValue([
        { name: 'App.tsx', isDirectory: () => false, isFile: () => true },
      ] as unknown as fs.Dirent[]);
      vi.mocked(fs.readFileSync).mockReturnValue(`
        import React from 'react';
        import { Header } from './Header';
        export function App() {
          return <div><Header /></div>;
        }
      `);

      const args: GetReactComponentTreeArgs = {
        path: 'src',
        root_component: 'App',
      };

      const result = await handleGetReactComponentTree(args);
      const data = JSON.parse(result.content[0].text);

      expect(data.tree).toBeDefined();
      expect(data.tree.name).toBe('App');
    });

    it('should respect depth limit', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readdirSync).mockReturnValue([
        { name: 'App.tsx', isDirectory: () => false, isFile: () => true },
      ] as unknown as fs.Dirent[]);
      vi.mocked(fs.readFileSync).mockReturnValue(`
        import React from 'react';
        export function App() { return <div />; }
      `);

      const args: GetReactComponentTreeArgs = {
        path: 'src',
        depth: 2,
      };

      const result = await handleGetReactComponentTree(args);
      const data = JSON.parse(result.content[0].text);

      expect(result.isError).toBeUndefined();
    });

    it('should auto-detect root component', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readdirSync).mockReturnValue([
        { name: 'App.tsx', isDirectory: () => false, isFile: () => true },
        { name: 'Button.tsx', isDirectory: () => false, isFile: () => true },
      ] as unknown as fs.Dirent[]);
      vi.mocked(fs.readFileSync).mockImplementation((filePath) => {
        const p = String(filePath);
        if (p.includes('App.tsx')) {
          return `
            import React from 'react';
            import { Button } from './Button';
            export function App() { return <Button />; }
          `;
        }
        return `
          import React from 'react';
          export function Button() { return <button />; }
        `;
      });

      const args: GetReactComponentTreeArgs = {
        path: 'src',
      };

      const result = await handleGetReactComponentTree(args);
      const data = JSON.parse(result.content[0].text);

      // App should be auto-detected as root (common name, or no parents)
      expect(data.tree?.name).toBe('App');
    });
  });

  describe('response format', () => {
    it('should return tree and component list', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readdirSync).mockReturnValue([
        { name: 'App.tsx', isDirectory: () => false, isFile: () => true },
      ] as unknown as fs.Dirent[]);
      vi.mocked(fs.readFileSync).mockReturnValue(`
        import React from 'react';
        export function App() { return <div />; }
      `);

      const args: GetReactComponentTreeArgs = {
        path: 'src',
      };

      const result = await handleGetReactComponentTree(args);
      const data = JSON.parse(result.content[0].text);

      expect(data).toHaveProperty('tree');
      expect(data).toHaveProperty('components');
      expect(data).toHaveProperty('count');
    });

    it('should include file and line information', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(`
import React from 'react';

export function MyComponent() {
  return <div>Hello</div>;
}
`);

      const args: GetReactComponentTreeArgs = {
        file: 'src/MyComponent.tsx',
      };

      const result = await handleGetReactComponentTree(args);
      const data = JSON.parse(result.content[0].text);

      const comp = data.components[0];
      expect(comp).toHaveProperty('file');
      expect(comp).toHaveProperty('line');
      expect(comp.line).toBeGreaterThan(0);
    });
  });

  describe('error handling', () => {
    it('should return empty result for directory with no components', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readdirSync).mockReturnValue([]);

      const args: GetReactComponentTreeArgs = {
        path: 'src',
      };

      const result = await handleGetReactComponentTree(args);
      const data = JSON.parse(result.content[0].text);

      expect(result.isError).toBeUndefined();
      expect(data.count).toBe(0);
      expect(data.message).toContain('No React component files found');
    });

    it('should handle parse errors gracefully', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(`
        // Invalid JSX
        export function Broken() {
          return <div><span>
        }
      `);

      const args: GetReactComponentTreeArgs = {
        file: 'src/Broken.tsx',
      };

      const result = await handleGetReactComponentTree(args);

      // Should not crash, may return empty or partial results
      expect(result.content[0].text).toBeDefined();
    });

    it('should handle non-existent file in analyzeFile', async () => {
      // Line 350: Test when fs.existsSync returns false for file in analyzeFile
      vi.mocked(fs.existsSync).mockImplementation((p) => {
        const pathStr = String(p);
        // Return true for directory but false for specific file
        if (pathStr.includes('src') && !pathStr.endsWith('.tsx')) {
          return true;
        }
        return false;
      });
      vi.mocked(fs.readdirSync).mockReturnValue([
        { name: 'Missing.tsx', isDirectory: () => false, isFile: () => true },
      ] as unknown as fs.Dirent[]);

      const args: GetReactComponentTreeArgs = {
        path: 'src',
      };

      const result = await handleGetReactComponentTree(args);
      const data = JSON.parse(result.content[0].text);

      // Should return empty components since file doesn't exist
      expect(data.components).toHaveLength(0);
    });

    it('should handle exceptions in handler with error response', async () => {
      // Lines 535-536: Test catch block error handling
      vi.mocked(fs.existsSync).mockImplementation(() => {
        throw new Error('Unexpected filesystem error');
      });

      const args: GetReactComponentTreeArgs = {
        file: 'src/Component.tsx',
      };

      const result = await handleGetReactComponentTree(args);
      const data = JSON.parse(result.content[0].text);

      expect(result.isError).toBe(true);
      expect(data.error).toContain('Unexpected filesystem error');
    });
  });

  describe('getComponentName edge cases', () => {
    it('should return null for unrecognized node types', async () => {
      // Line 166: Test null return from getComponentName
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(`
import React from 'react';

// Expression statement that won't match any component pattern
const result = (function() { return <div />; })();
`);

      const args: GetReactComponentTreeArgs = {
        file: 'src/Edge.tsx',
      };

      const result = await handleGetReactComponentTree(args);
      const data = JSON.parse(result.content[0].text);

      // The IIFE isn't detected as a component
      expect(data.components.some((c: { name: string }) => c.name === 'result')).toBe(false);
    });

    it('should return null when getComponentName is called with unsupported node type', () => {
      // Line 166: Direct test of getComponentName with an ImportDeclaration node
      const code = `import React from 'react';`;
      const sourceFile = ts.createSourceFile(
        'test.tsx',
        code,
        ts.ScriptTarget.Latest,
        true,
        ts.ScriptKind.TSX
      );

      // Get the ImportDeclaration node (first child)
      const importNode = sourceFile.statements[0];
      expect(ts.isImportDeclaration(importNode)).toBe(true);

      // Call getComponentName directly with an ImportDeclaration - should return null
      const result = getComponentName(importNode, sourceFile);
      expect(result).toBeNull();
    });

    it('should return null when getComponentName is called with ExpressionStatement', () => {
      // Line 166: Direct test of getComponentName with an ExpressionStatement node
      const code = `console.log('hello');`;
      const sourceFile = ts.createSourceFile(
        'test.tsx',
        code,
        ts.ScriptTarget.Latest,
        true,
        ts.ScriptKind.TSX
      );

      // Get the ExpressionStatement node
      const exprNode = sourceFile.statements[0];
      expect(ts.isExpressionStatement(exprNode)).toBe(true);

      // Call getComponentName directly - should return null
      const result = getComponentName(exprNode, sourceFile);
      expect(result).toBeNull();
    });
  });

  describe('type alias props extraction', () => {
    it('should extract props from type alias', async () => {
      // Lines 255-258: Test type alias props extraction
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(`
import React from 'react';

type CardProps = {
  title: string;
  description: string;
  onClick?: () => void;
};

export function Card(props: CardProps) {
  return <div onClick={props.onClick}>{props.title}</div>;
}
`);

      const args: GetReactComponentTreeArgs = {
        file: 'src/Card.tsx',
      };

      const result = await handleGetReactComponentTree(args);
      const data = JSON.parse(result.content[0].text);

      const card = data.components.find((c: { name: string }) => c.name === 'Card');
      expect(card).toBeDefined();
      expect(card.props).toContain('title');
      expect(card.props).toContain('description');
      expect(card.props).toContain('onClick');
    });
  });

  describe('directory walking - skip patterns', () => {
    it('should skip build, dist, coverage directories', async () => {
      // Lines 321-324: Test directory skipping
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readdirSync).mockImplementation((dir) => {
        const d = String(dir);
        if (d.endsWith('src')) {
          return [
            { name: 'dist', isDirectory: () => true, isFile: () => false },
            { name: 'build', isDirectory: () => true, isFile: () => false },
            { name: 'coverage', isDirectory: () => true, isFile: () => false },
            { name: '.next', isDirectory: () => true, isFile: () => false },
            { name: 'components', isDirectory: () => true, isFile: () => false },
          ] as unknown as fs.Dirent[];
        }
        if (d.includes('components')) {
          return [
            { name: 'Button.tsx', isDirectory: () => false, isFile: () => true },
          ] as unknown as fs.Dirent[];
        }
        return [];
      });
      vi.mocked(fs.readFileSync).mockReturnValue(`
        import React from 'react';
        export function Button() { return <button />; }
      `);

      const args: GetReactComponentTreeArgs = {
        path: 'src',
      };

      const result = await handleGetReactComponentTree(args);
      const data = JSON.parse(result.content[0].text);

      // Should only find Button from components directory, not from skipped directories
      expect(data.components.length).toBe(1);
      expect(data.components[0].name).toBe('Button');
    });
  });

  describe('findRootComponent edge cases', () => {
    it('should fallback to first component when no root candidates', async () => {
      // Line 460: Test fallback to first component
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readdirSync).mockReturnValue([
        { name: 'widgets.tsx', isDirectory: () => false, isFile: () => true },
      ] as unknown as fs.Dirent[]);
      // No App, Main, Root, etc. - all components have parents
      vi.mocked(fs.readFileSync).mockReturnValue(`
import React from 'react';

export function WidgetA() {
  return <WidgetB />;
}

export function WidgetB() {
  return <WidgetA />;
}
`);

      const args: GetReactComponentTreeArgs = {
        path: 'src',
      };

      const result = await handleGetReactComponentTree(args);
      const data = JSON.parse(result.content[0].text);

      // Both components have parents (circular reference), so fallback to first
      expect(data.tree?.name).toBeDefined();
    });

    it('should detect Main as root component', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readdirSync).mockReturnValue([
        { name: 'Main.tsx', isDirectory: () => false, isFile: () => true },
      ] as unknown as fs.Dirent[]);
      vi.mocked(fs.readFileSync).mockReturnValue(`
import React from 'react';
export function Main() { return <div />; }
`);

      const args: GetReactComponentTreeArgs = {
        path: 'src',
      };

      const result = await handleGetReactComponentTree(args);
      const data = JSON.parse(result.content[0].text);

      expect(data.tree?.name).toBe('Main');
    });

    it('should detect Root as root component', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readdirSync).mockReturnValue([
        { name: 'Root.tsx', isDirectory: () => false, isFile: () => true },
      ] as unknown as fs.Dirent[]);
      vi.mocked(fs.readFileSync).mockReturnValue(`
import React from 'react';
export function Root() { return <div />; }
`);

      const args: GetReactComponentTreeArgs = {
        path: 'src',
      };

      const result = await handleGetReactComponentTree(args);
      const data = JSON.parse(result.content[0].text);

      expect(data.tree?.name).toBe('Root');
    });

    it('should detect Layout as root component', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readdirSync).mockReturnValue([
        { name: 'Layout.tsx', isDirectory: () => false, isFile: () => true },
      ] as unknown as fs.Dirent[]);
      vi.mocked(fs.readFileSync).mockReturnValue(`
import React from 'react';
export function Layout() { return <div />; }
`);

      const args: GetReactComponentTreeArgs = {
        path: 'src',
      };

      const result = await handleGetReactComponentTree(args);
      const data = JSON.parse(result.content[0].text);

      expect(data.tree?.name).toBe('Layout');
    });
  });

  describe('tree building - circular reference handling', () => {
    it('should prevent infinite loops with circular component references', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readdirSync).mockReturnValue([
        { name: 'Circular.tsx', isDirectory: () => false, isFile: () => true },
      ] as unknown as fs.Dirent[]);
      vi.mocked(fs.readFileSync).mockReturnValue(`
import React from 'react';

export function ComponentA() {
  return <ComponentB />;
}

export function ComponentB() {
  return <ComponentC />;
}

export function ComponentC() {
  return <ComponentA />;
}
`);

      const args: GetReactComponentTreeArgs = {
        path: 'src',
        root_component: 'ComponentA',
        depth: 10,
      };

      const result = await handleGetReactComponentTree(args);
      const data = JSON.parse(result.content[0].text);

      // Should not crash and should have finite tree
      expect(data.tree).toBeDefined();
      expect(data.tree.name).toBe('ComponentA');
    });

    it('should respect depth limit of 0', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readdirSync).mockReturnValue([
        { name: 'App.tsx', isDirectory: () => false, isFile: () => true },
      ] as unknown as fs.Dirent[]);
      vi.mocked(fs.readFileSync).mockReturnValue(`
import React from 'react';
export function App() { return <Child />; }
export function Child() { return <div />; }
`);

      const args: GetReactComponentTreeArgs = {
        path: 'src',
        depth: 0,
      };

      const result = await handleGetReactComponentTree(args);
      const data = JSON.parse(result.content[0].text);

      // With depth 0, tree should be null
      expect(data.tree).toBeNull();
    });
  });

  describe('JSX fragment handling', () => {
    it('should detect components that return JSX fragments', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(`
import React from 'react';

export function FragmentComponent() {
  return (
    <>
      <div>First</div>
      <div>Second</div>
    </>
  );
}
`);

      const args: GetReactComponentTreeArgs = {
        file: 'src/Fragment.tsx',
      };

      const result = await handleGetReactComponentTree(args);
      const data = JSON.parse(result.content[0].text);

      expect(data.components.some((c: { name: string }) => c.name === 'FragmentComponent')).toBe(true);
    });

    it('should detect components that return only a JSX fragment with text', async () => {
      // Line 136: Test fragment-only return to cover isJsxFragment branch
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(`
import React from 'react';

export function TextOnlyFragment() {
  return <>Just text, no elements</>;
}
`);

      const args: GetReactComponentTreeArgs = {
        file: 'src/TextFragment.tsx',
      };

      const result = await handleGetReactComponentTree(args);
      const data = JSON.parse(result.content[0].text);

      expect(data.components.some((c: { name: string }) => c.name === 'TextOnlyFragment')).toBe(true);
    });
  });

  describe('function expression components', () => {
    it('should detect function expression components', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(`
import React from 'react';

export const FunctionExpr = function() {
  return <div>Function expression</div>;
};
`);

      const args: GetReactComponentTreeArgs = {
        file: 'src/FunctionExpr.tsx',
      };

      const result = await handleGetReactComponentTree(args);
      const data = JSON.parse(result.content[0].text);

      expect(data.components.some((c: { name: string }) => c.name === 'FunctionExpr')).toBe(true);
    });
  });

  describe('namespace component usage', () => {
    it('should extract component name from namespace prefix', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(`
import React from 'react';

export function Container() {
  return (
    <div>
      <React.Fragment>
        <span>Content</span>
      </React.Fragment>
    </div>
  );
}
`);

      const args: GetReactComponentTreeArgs = {
        file: 'src/Container.tsx',
      };

      const result = await handleGetReactComponentTree(args);
      const data = JSON.parse(result.content[0].text);

      const container = data.components.find((c: { name: string }) => c.name === 'Container');
      // React.Fragment should be extracted as Fragment
      expect(container.uses).toContain('Fragment');
    });
  });
});
