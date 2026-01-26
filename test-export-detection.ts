// Test file for export detection

// 1. Direct export
export function directExport() {
  return 'direct';
}

// 2. Named re-export
function namedExport() {
  return 'named';
}

export { namedExport };

// 3. Default export
function defaultExport() {
  return 'default';
}

export default defaultExport;

// 4. Not exported
function notExported() {
  return 'hidden';
}

// 5. Export class directly
export class DirectClass {
  method() {}
}

// 6. Class exported via re-export
class ReExportClass {
  method() {}
}

export { ReExportClass };
