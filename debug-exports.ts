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

console.log('=== Analyzing exports ===\n');

ts.forEachChild(sourceFile, (node) => {
  console.log(`Node kind: ${ts.SyntaxKind[node.kind]}`);

  if (ts.isExportDeclaration(node)) {
    console.log('  -> This is an ExportDeclaration');
    console.log('  -> exportClause:', node.exportClause);
    const exportClause = node.exportClause;
    if (exportClause && ts.isNamedExports(exportClause)) {
      console.log('  -> Named exports found:');
      for (const element of exportClause.elements) {
        console.log('     -', element.name.text);
      }
    }
  }

  if (ts.isExportAssignment(node)) {
    console.log('  -> This is an ExportAssignment (export default)');
    console.log('  -> expression kind:', ts.SyntaxKind[node.expression.kind]);
    if (ts.isIdentifier(node.expression)) {
      console.log('  -> Identifier:', node.expression.text);
    }
  }

  console.log('');
});
