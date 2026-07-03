/**
 * Exported-symbol type extraction over the shared host.
 *
 * Ported from project-engine `core/code-intel/type-extraction.ts`, rewired onto
 * {@link CompilerHost} (no global singleton). Used by api_spec (lane 3) to snapshot
 * a file's exported signatures; the temp-file helpers support analyzing content
 * at a git ref without touching the working tree.
 */

import * as node_fs from 'node:fs/promises';
import * as path from 'node:path';

import { logger } from '@goodvibes/core/logging';
import { toTsPath } from './paths.js';
import type { CompilerHost } from './compiler-host.js';

/** Type information for one exported symbol. */
export interface SymbolInfo {
  name: string;
  kind: string;
  signature: string;
  line: number;
  exported: boolean;
}

/** Type information for all exported symbols in a file. */
export interface FileTypeInfo {
  file: string;
  symbols: SymbolInfo[];
}

/**
 * Extract exported symbols and their signatures from a file on disk.
 * @param host - the shared compiler host
 * @param absoluteFilePath - absolute path of the file
 * @param displayPath - path to report in the result (defaults to the absolute path)
 */
export function extractTypeInfo(
  host: CompilerHost,
  absoluteFilePath: string,
  displayPath: string = absoluteFilePath,
): FileTypeInfo {
  const symbols: SymbolInfo[] = [];
  try {
    const { service, program } = host.getServiceForFile(absoluteFilePath);
    const normalized = toTsPath(absoluteFilePath);
    const sourceFile = program.getSourceFile(normalized);
    if (!sourceFile) {return { file: displayPath, symbols };}

    const navTree = service.getNavigationTree(normalized);
    for (const item of navTree?.childItems ?? []) {
      if (item.text.startsWith('<') || item.text.startsWith('_')) {continue;}
      const spans = item.spans;
      if (!spans || spans.length === 0) {continue;}

      const pos = spans[0].start;
      const { line } = sourceFile.getLineAndCharacterOfPosition(pos);
      const quickInfo = service.getQuickInfoAtPosition(normalized, pos);
      const signature = quickInfo?.displayParts?.map((p) => p.text).join('') ?? '';
      const exported =
        signature.includes('export ') || item.kindModifiers?.includes('export') || false;

      symbols.push({ name: item.text, kind: item.kind, signature, line: line + 1, exported });
    }
  } catch (error) {
    logger.warn(`Failed to extract type info from ${displayPath}`, String(error));
  }
  return { file: displayPath, symbols };
}

/**
 * Build a unique temp directory + file path under `root`.
 * @param root - directory to place the temp dir under
 * @param basename - filename inside the temp dir
 */
export function makeTempPath(root: string, basename: string): { dir: string; file: string } {
  const dir = path.join(root, `.goodvibes-temp-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  return { dir, file: path.join(dir, basename) };
}

/**
 * Run `fn` with a temp file present, cleaning up the file and its dir after.
 * @param tempPath - absolute temp file path
 * @param content - content to write
 * @param fn - work to run with the temp path
 */
export async function withTempFile<T>(
  tempPath: string,
  content: string,
  fn: (filePath: string) => Promise<T> | T,
): Promise<T> {
  const dir = path.dirname(tempPath);
  await node_fs.mkdir(dir, { recursive: true });
  await node_fs.writeFile(tempPath, content, 'utf-8');
  try {
    return await fn(tempPath);
  } finally {
    await node_fs.unlink(tempPath).catch(() => undefined);
    await node_fs.rm(dir, { recursive: true }).catch(() => undefined);
  }
}

/**
 * Extract type info from raw content by staging it as a temp file.
 * @param host - the shared compiler host
 * @param originalPath - path to report in the result
 * @param content - the file content to analyze
 * @param projectRoot - root the temp dir is placed under
 */
export async function extractTypeInfoFromContent(
  host: CompilerHost,
  originalPath: string,
  content: string,
  projectRoot: string,
): Promise<FileTypeInfo> {
  const { file: tempFile } = makeTempPath(projectRoot, path.basename(originalPath));
  return withTempFile(tempFile, content, (filePath) => extractTypeInfo(host, filePath, originalPath));
}
