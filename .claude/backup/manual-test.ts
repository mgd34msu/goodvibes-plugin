import * as ts from 'typescript';
import * as fs from 'fs';

const code = fs.readFileSync('test-export-detection.ts', 'utf-8');
const sourceFile = ts.createSourceFile(
  'test-export-detection.ts',
  code,
  ts.ScriptTarget.Latest,
  true,
  ts.ScriptKind.TS
);

// Copy the implementation
function collectExportedNames(sourceFile: ts.SourceFile): Set<string> {
  const exportedNames = new Set<string>();

  ts.forEachChild(sourceFile, (node) => {
    if (ts.isExportDeclaration(node)) {
      const exportClause = node.exportClause;
      if (exportClause && ts.isNamedExports(exportClause)) {
        for (const element of exportClause.elements) {
          exportedNames.add(element.name.text);
        }
      }
    }

    if (ts.isExportAssignment(node)) {
      if (ts.isIdentifier(node.expression)) {
        exportedNames.add(node.expression.text);
      }
    }
  });

  return exportedNames;
}

const exported = collectExportedNames(sourceFile);
console.log('Exported names:', Array.from(exported));
console.log('Count:', exported.size);
