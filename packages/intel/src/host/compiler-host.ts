/**
 * The one intel compiler host, a single wrapped TypeScript LanguageService /
 * Program per tsconfig scope, shared by every intel analyzer (§3.3, R4).
 *
 * Ported and rebuilt from project-engine `core/code-intel/language-service.ts`.
 * v2 changes:
 *  - No global `getProjectRoot()`: callers resolve `base_path` → absolute via
 *    `core/fsx` and hand the host absolute paths. The host does no path rewriting
 *    beyond slash-normalization for TS's own key space (`toTsPath`).
 *  - No background `setInterval` cleanup (field issue 9, a timer that keeps the
 *    event loop alive is exactly the orphaned-server bug). The cache is bounded
 *    by COUNT with least-recently-accessed eviction, and `dispose()` tears it
 *    all down on shutdown.
 *  - `getServiceForFiles([...])` adds every requested file to the program's root
 *    set, so `program.getSourceFile()` is deterministic for whole-directory
 *    analysis (code_surface) instead of depending on import reachability.
 *  - Robust default-lib resolution for the bundled runtime (see tsconfig.ts).
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import ts from 'typescript';

import { logger } from '@goodvibes/core/logging';
import { toTsPath } from './paths.js';
import { TS_ANALYSIS_OPTIONS, MAX_CACHED_SERVICES } from './constants.js';
import { findTsConfigSync, parseTsConfigSync, findTypescriptLibDir } from './tsconfig.js';
import type { CachedService, HostServiceResult } from './types.js';

/**
 * Owns a bounded set of TypeScript LanguageService instances (one per tsconfig
 * scope) behind a shared document registry. Construct one and share it; the
 * module also exposes a process-wide singleton via {@link getCompilerHost}.
 */
export class CompilerHost {
  private readonly cache = new Map<string, CachedService>();
  private readonly documentRegistry = ts.createDocumentRegistry();

  /**
   * Get a LanguageService/Program that has `absoluteFilePath` loaded as a root.
   * @param absoluteFilePath - an absolute path (resolve via core/fsx first)
   */
  getServiceForFile(absoluteFilePath: string): HostServiceResult {
    return this.getServiceForFiles([absoluteFilePath]);
  }

  /**
   * Get a single LanguageService/Program with every given file loaded as a root
   * of one program, so `program.getSourceFile()` resolves each deterministically.
   * The tsconfig scope is discovered from the FIRST file; all files are assumed
   * to belong to it (the analyzers call this per analyzed directory/package).
   * @param absoluteFilePaths - absolute paths (non-empty)
   */
  getServiceForFiles(absoluteFilePaths: string[]): HostServiceResult {
    if (absoluteFilePaths.length === 0) {
      throw new Error('getServiceForFiles requires at least one file');
    }

    const first = toTsPath(absoluteFilePaths[0]);
    const configPath = findTsConfigSync(first);
    const cacheKey = configPath ?? path.dirname(first);

    let entry = this.cache.get(cacheKey);
    if (!entry) {
      entry = this.createLanguageService(cacheKey, configPath);
      this.cache.set(cacheKey, entry);
      this.evictIfNeeded();
    }
    entry.lastAccessed = Date.now();

    for (const filePath of absoluteFilePaths) {
      this.ensureFileLoaded(entry, toTsPath(filePath));
    }

    const program = entry.service.getProgram();
    if (!program) {
      throw new Error(`Failed to build a TypeScript program for ${first}`);
    }
    return { service: entry.service, program, configPath: entry.configPath };
  }

  /**
   * Get a loaded source file for an absolute path, or undefined. Convenience
   * over `getServiceForFile(p).program.getSourceFile(...)`.
   * @param absoluteFilePath - absolute path
   */
  getSourceFile(absoluteFilePath: string): ts.SourceFile | undefined {
    const normalized = toTsPath(absoluteFilePath);
    const { program } = this.getServiceForFiles([absoluteFilePath]);
    return program.getSourceFile(normalized);
  }

  /** Dispose every cached service. Call on server shutdown / test cleanup. */
  dispose(): void {
    for (const [, cached] of this.cache) {
      try {
        cached.service.dispose();
      } catch {
        // best-effort teardown
      }
    }
    this.cache.clear();
  }

  /** Evict the least-recently-accessed service while over the count bound. */
  private evictIfNeeded(): void {
    while (this.cache.size > MAX_CACHED_SERVICES) {
      let oldestKey: string | undefined;
      let oldest = Infinity;
      for (const [key, cached] of this.cache) {
        if (cached.lastAccessed < oldest) {
          oldest = cached.lastAccessed;
          oldestKey = key;
        }
      }
      if (oldestKey === undefined) {break;}
      const victim = this.cache.get(oldestKey);
      try {
        victim?.service.dispose();
      } catch {
        // best-effort
      }
      this.cache.delete(oldestKey);
    }
  }

  /** Build a new LanguageService for a tsconfig scope. */
  private createLanguageService(cacheKey: string, configPath: string | null): CachedService {
    // Parse the tsconfig for BOTH options and the project file set. The file set
    // seeds the program roots so cross-file reference searches (safe_delete) see
    // sibling files that never import the target.
    const parsed = configPath ? parseTsConfigSync(configPath) : null;
    const compilerOptions = parsed ? parsed.options : { ...TS_ANALYSIS_OPTIONS };
    const currentDirectory = configPath ? path.dirname(configPath) : cacheKey;
    // Resolve the target project's TypeScript lib dir once (bundled-runtime fix).
    const tsLibDir = findTypescriptLibDir(currentDirectory);

    const files = new Map<
      string,
      { version: number; content: string; snapshot: ts.IScriptSnapshot }
    >();
    const roots = new Set<string>((parsed?.fileNames ?? []).map(toTsPath));

    const host: ts.LanguageServiceHost = {
      getScriptFileNames: () => Array.from(new Set([...roots, ...files.keys()])),
      getScriptVersion: (fileName) => {
        const file = files.get(toTsPath(fileName));
        return file ? String(file.version) : '0';
      },
      getScriptSnapshot: (fileName) => {
        const normalized = toTsPath(fileName);
        const cached = files.get(normalized);
        if (cached) {return cached.snapshot;}
        // Fall back to disk so TS can pull in imports / lib / node_modules types.
        try {
          const content = fs.readFileSync(fileName, 'utf-8');
          const snapshot = ts.ScriptSnapshot.fromString(content);
          files.set(normalized, { version: 1, content, snapshot });
          return snapshot;
        } catch {
          return undefined;
        }
      },
      getCurrentDirectory: () => currentDirectory,
      getCompilationSettings: () => compilerOptions,
      getDefaultLibFileName: (options) => {
        const libFileName = ts.getDefaultLibFileName(options);
        return tsLibDir ? path.join(tsLibDir, libFileName) : ts.getDefaultLibFilePath(options);
      },
      fileExists: ts.sys.fileExists,
      readFile: ts.sys.readFile,
      readDirectory: ts.sys.readDirectory,
      directoryExists: ts.sys.directoryExists,
      getDirectories: ts.sys.getDirectories,
      realpath: ts.sys.realpath,
    };

    const service = ts.createLanguageService(host, this.documentRegistry);
    return {
      service: this.wrapService(service),
      host,
      configPath,
      compilerOptions,
      files,
      roots,
      lastAccessed: Date.now(),
    };
  }

  /**
   * Wrap the service so a diagnostic call for a not-yet-loaded file returns []
   * instead of throwing "Could not find source file".
   */
  private wrapService(service: ts.LanguageService): ts.LanguageService {
    return new Proxy(service, {
      get: (target, prop, receiver) => {
        const value = Reflect.get(target, prop, receiver);
        if (
          typeof value === 'function' &&
          (prop === 'getSemanticDiagnostics' ||
            prop === 'getSyntacticDiagnostics' ||
            prop === 'getSuggestionDiagnostics')
        ) {
          return (fileName: string) => {
            try {
              return value.call(target, fileName);
            } catch (error) {
              if (error instanceof Error && error.message.includes('Could not find source file')) {
                return [];
              }
              throw error;
            }
          };
        }
        return value;
      },
    });
  }

  /** Load (or refresh) a file into a service's root set. Synchronous by design. */
  private ensureFileLoaded(cached: CachedService, tsNormalizedPath: string): void {
    // An explicitly-requested file is always a program root (covers no-tsconfig
    // scopes and files outside the tsconfig include set).
    cached.roots.add(tsNormalizedPath);
    try {
      const content = fs.readFileSync(tsNormalizedPath, 'utf-8');
      const existing = cached.files.get(tsNormalizedPath);
      if (!existing || existing.content !== content) {
        cached.files.set(tsNormalizedPath, {
          version: (existing?.version ?? 0) + 1,
          content,
          snapshot: ts.ScriptSnapshot.fromString(content),
        });
      }
    } catch (err) {
      logger.warn(`Compiler host could not read file ${tsNormalizedPath}`, String(err));
    }
  }
}

/** Process-wide shared host (created lazily). */
let sharedHost: CompilerHost | null = null;

/** Get the shared compiler host, creating it on first use. */
export function getCompilerHost(): CompilerHost {
  return (sharedHost ??= new CompilerHost());
}

/** Dispose and drop the shared host (test isolation / shutdown). */
export function disposeCompilerHost(): void {
  sharedHost?.dispose();
  sharedHost = null;
}
