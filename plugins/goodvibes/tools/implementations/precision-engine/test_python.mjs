import * as Parser from 'web-tree-sitter';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function test() {
  await Parser.default.init();
  const parser = new Parser.default();
  
  // Load Python language
  const wasmPath = path.join(__dirname, 'dist', 'tree-sitter-python.wasm');
  const Python = await Parser.default.Language.load(wasmPath);
  parser.setLanguage(Python);
  
  // Parse Python code
  const code = `def greet(name: str) -> str:
    return f"Hello, {name}!"

class Calculator:
    def add(self, a: int, b: int) -> int:
        return a + b
`;
  
  const tree = parser.parse(code);
  console.log('Root node type:', tree.rootNode.type);
  console.log('Root node child count:', tree.rootNode.childCount);
  
  // Inspect children
  for (let i = 0; i < tree.rootNode.childCount; i++) {
    const child = tree.rootNode.child(i);
    console.log(`Child ${i}:`, child ? child.type : 'null', 'null check:', child === null, 'typeof:', typeof child);
    
    if (child && child.type === 'function_definition') {
      console.log('  Function name node:', child.childForFieldName('name'));
      console.log('  Child count:', child.childCount);
      for (let j = 0; j < child.childCount; j++) {
        const subChild = child.child(j);
        console.log(`    Sub-child ${j}:`, subChild ? subChild.type : 'null', 'null check:', subChild === null);
      }
    }
  }
}

test().catch(console.error);
