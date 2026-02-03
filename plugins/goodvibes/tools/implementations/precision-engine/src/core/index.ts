/**
 * Core modules for precision-engine.
 *
 * This barrel file exports all core functionality including:
 * - Language detection and grammar loading
 * - Tree-sitter parsing and AST operations
 * - Ripgrep search wrapper
 * - ast-grep code search
 *
 * @module core
 */

export * from './languages.js';
// Other exports will be added as modules are created:
export * from './tree-sitter.js';
export * from './ripgrep.js';
export * from './ast-grep.js';
