/**
 * File type detection for contextual intelligence.
 */

export interface FileTypeInfo {
  category: string;     // e.g., 'test', 'config', 'component', 'hook', 'api', 'style', 'schema', 'utility', 'migration', 'type', 'unknown'
  framework?: string;   // e.g., 'react', 'vue', 'express', 'prisma', 'vitest'
  patterns: string[];   // matched pattern names for debugging
}

interface DetectionPattern {
  name: string;
  category: string;
  framework?: string;
  test: (path: string) => boolean;
}

const patterns: DetectionPattern[] = [
  // Test files
  { name: 'vitest', category: 'test', framework: 'vitest', test: (p) => /\.(test|spec)\.(ts|tsx|js|jsx)$/.test(p) },
  { name: 'test-dir', category: 'test', test: (p) => /__tests__\/|tests?\//.test(p) },

  // Config files
  { name: 'config-file', category: 'config', test: (p) => /\.(config|rc)\.(ts|js|json)$/.test(p) },
  { name: 'tsconfig', category: 'config', framework: 'typescript', test: (p) => /tsconfig.*\.json$/.test(p) },
  { name: 'package-json', category: 'config', test: (p) => /package\.json$/.test(p) },
  { name: 'eslintrc', category: 'config', test: (p) => /\.eslintrc/.test(p) },
  { name: 'vite-config', category: 'config', framework: 'vite', test: (p) => /vite\.config/.test(p) },

  // Components
  { name: 'react-component', category: 'component', framework: 'react', test: (p) => /\.tsx$/.test(p) && /components?\//.test(p) },
  { name: 'vue-component', category: 'component', framework: 'vue', test: (p) => /\.vue$/.test(p) },

  // Hooks
  { name: 'react-hook', category: 'hook', framework: 'react', test: (p) => /\/use[A-Z][^/]*\.(ts|tsx)$/.test(p) || /hooks?\/.*\.(ts|tsx)$/.test(p) },

  // API/Routes
  { name: 'api-route', category: 'api', test: (p) => /\/(api|routes?|handlers?|controllers?)\//.test(p) },

  // Styles
  { name: 'stylesheet', category: 'style', test: (p) => /\.(css|scss|sass|less)$/.test(p) },
  { name: 'styled', category: 'style', test: (p) => /\.styled\.(ts|tsx|js|jsx)$/.test(p) },

  // Schema
  { name: 'schema-file', category: 'schema', test: (p) => /schema.*\.(ts|js)$/.test(p) || /\.schema\.(ts|js)$/.test(p) || /schemas?\//.test(p) },
  { name: 'prisma', category: 'schema', framework: 'prisma', test: (p) => /\.prisma$/.test(p) },

  // Migrations
  { name: 'migration', category: 'migration', test: (p) => /migrations?\//.test(p) || /\.migration\./.test(p) },

  // Types
  { name: 'types-file', category: 'type', framework: 'typescript', test: (p) => /types?\.(ts|d\.ts)$/.test(p) || /\.types\.(ts|d\.ts)$/.test(p) || /\.d\.ts$/.test(p) || /\/interfaces?\//.test(p) },

  // Utilities
  { name: 'utils', category: 'utility', test: (p) => /\/(utils?|helpers?|lib)\//.test(p) },
];

/**
 * Detect file type from path using pattern matching.
 * @param filePath - The file path to analyze
 * @returns File type information including category, framework, and matched patterns
 */
export function detectFileType(filePath: string): FileTypeInfo {
  const matched: DetectionPattern[] = [];

  for (const pattern of patterns) {
    if (pattern.test(filePath)) {
      matched.push(pattern);
    }
  }

  if (matched.length === 0) {
    return {
      category: 'unknown',
      patterns: [],
    };
  }

  // Use first match as primary category
  const primary = matched[0];

  return {
    category: primary.category,
    framework: primary.framework,
    patterns: matched.map((p) => p.name),
  };
}
