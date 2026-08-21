/**
 * Shared types for the compiler host and the intel analyzers that ride it.
 *
 * Ported from project-engine `core/code-intel/types.ts`, trimmed to the shapes
 * the v2 surface actually uses (the breaking-changes / semantic-diff / dead-code
 * tool argument types did not port, those tools retire with the v1 tree).
 */

import type ts from 'typescript';

/** Result of acquiring a LanguageService/Program for one or more files. */
export interface HostServiceResult {
  /** The TypeScript language service. */
  service: ts.LanguageService;
  /** The compiled program (source of the type checker and source files). */
  program: ts.Program;
  /** Path to the tsconfig.json in use, or null when none was found. */
  configPath: string | null;
}

/** Internal cached LanguageService entry (one per tsconfig scope). */
export interface CachedService {
  /** The wrapped language service. */
  service: ts.LanguageService;
  /** The language service host backing it. */
  host: ts.LanguageServiceHost;
  /** tsconfig path, or null. */
  configPath: string | null;
  /** Compiler options in effect. */
  compilerOptions: ts.CompilerOptions;
  /** In-memory content cache (TS-normalized path → version/content/snapshot). */
  files: Map<string, { version: number; content: string; snapshot: ts.IScriptSnapshot }>;
  /**
   * Program root file names (TS-normalized): the tsconfig file set plus any
   * explicitly-loaded files. Reference searches only cover files in this set.
   */
  roots: Set<string>;
  /** Last access timestamp (for count-bounded LRU eviction). */
  lastAccessed: number;
}

/** Standard 1-based position arguments for position-addressed tools. */
export interface PositionArgs {
  /** File path (relative to base_path or absolute). */
  file: string;
  /** 1-based line. */
  line: number;
  /** 1-based column. */
  column: number;
}

/** A single reference location with a code preview. */
export interface ReferenceLocation {
  /** File path relative to the analysis root. */
  file: string;
  /** Absolute resolved path (issue 1 fix #3, echoed for every file). */
  resolved_path: string;
  /** 1-based line. */
  line: number;
  /** 1-based column. */
  column: number;
  /** Preview of the referencing line. */
  preview: string;
}

/** Result of the safe-delete reference check. */
export interface SafeDeleteResult {
  /** True when no external usages block deletion. */
  safe: boolean;
  /** Blocking references in other files. */
  external_references: ReferenceLocation[];
  /** Self-references (same file as the definition) that do not block deletion. */
  self_references: ReferenceLocation[];
  /** Human-readable explanation. */
  reason: string;
  /** The analyzed symbol name, when resolvable. */
  symbol?: string;
}

/** A public API export with full metadata. */
export interface PublicApiExport {
  /** Exported symbol name. */
  name: string;
  /** Kind (function, class, interface, type, variable, …). */
  kind: string;
  /** TypeScript type signature. */
  type: string;
  /** File relative to the analysis root. */
  file: string;
  /** Absolute resolved path (issue 1 fix #3). */
  resolved_path: string;
  /** 1-based line of the declaration. */
  line: number;
  /** JSDoc text, or null. */
  jsdoc: string | null;
}

/** An internal (non-public) export, same as public without jsdoc. */
export interface InternalApiExport {
  name: string;
  kind: string;
  type: string;
  file: string;
  resolved_path: string;
  line: number;
}

/** Internal export representation used during AST traversal. */
export interface ExportInfo {
  name: string;
  kind: string;
  file: string;
  line: number;
  column: number;
  exportedFrom: string | null;
}
