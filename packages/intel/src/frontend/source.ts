/**
 * SourceFile sourcing for the frontend analyzers, Lane 4.
 *
 * §3.3 rule: every intel analyzer consumes the ONE shared compiler host; the
 * frontend analyzers rewire off the v1 per-call `ts.createSourceFile` onto it.
 * These helpers hand the host absolute paths (callers resolve `base_path` via
 * `core/fsx` first) and hand back parsed `ts.SourceFile`s.
 *
 *  - {@link getSourceFile}, one file (host parses with full JSX/TSX fidelity;
 *    the host's compiler options set `jsx: ReactJSX` + `allowJs`).
 *  - {@link getSourceFiles}, a whole set added to ONE program in a single host
 *    call, so `program.getSourceFile()` is deterministic and each file is parsed
 *    exactly once (the O(N) shape, not N re-programs).
 *
 * @module frontend/source
 */

import ts from 'typescript';
import { getCompilerHost, toTsPath } from '../host/index.js';

/** Extensions the frontend analyzers accept. */
export const FRONTEND_EXTENSIONS = ['.tsx', '.jsx', '.ts', '.js', '.mjs', '.cjs'] as const;

/**
 * Get one parsed SourceFile from the shared host.
 * @param absPath - an absolute path (resolve `base_path` via core/fsx first)
 * @returns the SourceFile, or undefined if the host could not load it
 */
export function getSourceFile(absPath: string): ts.SourceFile | undefined {
  return getCompilerHost().getSourceFile(absPath);
}

/**
 * Get a set of parsed SourceFiles from the shared host in ONE program.
 * @param absPaths - absolute paths (resolve via core/fsx first)
 * @returns a map keyed by the input absolute path
 */
export function getSourceFiles(absPaths: string[]): Map<string, ts.SourceFile> {
  const out = new Map<string, ts.SourceFile>();
  if (absPaths.length === 0) {return out;}
  const { program } = getCompilerHost().getServiceForFiles(absPaths);
  for (const abs of absPaths) {
    const sf = program.getSourceFile(toTsPath(abs));
    if (sf) {out.set(abs, sf);}
  }
  return out;
}
