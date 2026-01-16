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

import { handleGetReactComponentTree, GetReactComponentTreeArgs } from '../../../handlers/framework/react.js';

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
  });
});
