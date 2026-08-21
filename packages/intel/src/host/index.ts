/**
 * `packages/intel/src/host`, the intel compiler host public interface.
 *
 * ONE TypeScript LanguageService/Program per tsconfig scope (§3.3, R4), shared
 * by every intel analyzer. Lanes 2 (code_surface, code_safe_delete), 3 (api_*,
 * db_schema usage) and 4 (frontend analyzers) all consume THIS surface, it is
 * stable once lane 2's tests pass. Do not reach past it into the internal
 * modules; add capabilities by extending this barrel.
 *
 * Contract for callers:
 *  - Resolve `base_path` → an ABSOLUTE path via `@goodvibes/core/fsx` BEFORE
 *    calling the host. The host does no `base_path` handling and no path
 *    rewriting beyond slash-normalization for TypeScript's own key space.
 *  - Acquire a program with {@link CompilerHost.getServiceForFile} (single file)
 *    or {@link CompilerHost.getServiceForFiles} (whole directory, every path is
 *    added to one program so `program.getSourceFile()` is deterministic).
 *  - Share one host via {@link getCompilerHost}; the alpha server holds a single
 *    instance. No background timers run (field issue 9); call
 *    {@link disposeCompilerHost} on shutdown if you want eager teardown.
 *
 * @module host
 */

// The host itself (the single Program wrapper).
export { CompilerHost, getCompilerHost, disposeCompilerHost } from './compiler-host.js';

// Shared types.
export type {
  HostServiceResult,
  CachedService,
  PositionArgs,
  ReferenceLocation,
  SafeDeleteResult,
  PublicApiExport,
  InternalApiExport,
  ExportInfo,
} from './types.js';

// Constants (compiler options, discovery knobs).
export {
  TS_ANALYSIS_OPTIONS,
  TEST_PATTERNS,
  ENTRY_POINT_NAMES,
  MAX_PREVIEW_LENGTH,
  SOURCE_EXTENSIONS,
  SKIP_DIRECTORIES,
  MAX_CACHED_SERVICES,
} from './constants.js';

// Path helpers (slash-normalization for TS + source discovery).
export {
  toTsPath,
  makeRelativePath,
  resolveFilePath,
  isSourceFile,
  isTestFile,
  findSourceFiles,
} from './paths.js';

// Position conversion.
export { toOffset, toLineColumn } from './position.js';

// AST helpers.
export { isDefinitionRef, getExportKind, getJsDoc, getTypeString } from './ast-utils.js';

// Line preview.
export { getLinePreview, getPreviewFromSourceFile } from './preview.js';

// tsconfig discovery/parsing + lib-dir resolution.
export {
  findTsConfig,
  findTsConfigSync,
  readTsConfig,
  readTsConfigSync,
  parseTsConfigSync,
  findTypescriptLibDir,
} from './tsconfig.js';

// Export collection (surface).
export {
  findExportsInFile,
  collectPublicExports,
  collectAllExports,
} from './exports.js';
export type { ExportWithOrigin } from './exports.js';

// Entry-point detection.
export { detectEntryPoints } from './entry-points.js';

// Semantic reference finding (safe_delete + usage analysis), never regex.
export {
  countReferences,
  isSameLine,
  isInSameDeclaration,
  findReferencingFiles,
} from './references.js';

// Diagnostics.
export { getDiagnosticsForFiles, diagnosticToError, diagnosticKey } from './diagnostics.js';
export type { DiagnosticError } from './diagnostics.js';

// Type extraction (api_spec).
export {
  extractTypeInfo,
  extractTypeInfoFromContent,
  makeTempPath,
  withTempFile,
} from './type-extraction.js';
export type { SymbolInfo, FileTypeInfo } from './type-extraction.js';

// Virtual filesystem (opt-in hypothetical-edit analysis; separate LS).
export { VirtualFileSystem, applyEdit, createVirtualLanguageService } from './virtual-fs.js';
export type { ProposedEdit } from './virtual-fs.js';

// Argument validation (envelope-decoupled).
export { validatePositionArgs, isValidLine, isValidColumn } from './validation.js';
export type { ValidatedPosition, PositionValidation } from './validation.js';
