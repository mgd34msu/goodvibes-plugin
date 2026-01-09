/**
 * TypeScript Language Service Manager
 *
 * Provides shared infrastructure for all LSP tools. Manages Language Service
 * instances per project, handles file caching, and provides position conversion
 * utilities.
 */

import * as fs from 'fs';
import * as path from 'path';
import ts from 'typescript';

import { PROJECT_ROOT } from '../../config.js';

// =============================================================================
// Types
// =============================================================================

export interface LanguageServiceResult {
  service: ts.LanguageService;
  program: ts.Program;
  configPath: string | null;
}

export interface LanguageServiceManager {
  getServiceForFile(filePath: string): Promise<LanguageServiceResult>;
  getPositionOffset(service: ts.LanguageService, fileName: string, line: number, column: number): number;
  getLineAndColumn(service: ts.LanguageService, fileName: string, offset: number): { line: number; column: number };
  cleanup(): void;
  shutdown(): void;
  startCleanupInterval(): void;
}

interface CachedService {
  service: ts.LanguageService;
  host: ts.LanguageServiceHost;
  configPath: string | null;
  compilerOptions: ts.CompilerOptions;
  files: Map<string, { version: number; content: string; snapshot: ts.IScriptSnapshot }>;
  lastAccessed: number;
}

// =============================================================================
// Constants
// =============================================================================

/** Cache TTL in milliseconds (5 minutes) */
const CACHE_TTL_MS = 5 * 60 * 1000;

/** Default compiler options when no tsconfig is found */
const DEFAULT_COMPILER_OPTIONS: ts.CompilerOptions = {
  allowJs: true,
  checkJs: true,
  target: ts.ScriptTarget.ESNext,
  module: ts.ModuleKind.ESNext,
  moduleResolution: ts.ModuleResolutionKind.Bundler,
  jsx: ts.JsxEmit.ReactJSX,
  esModuleInterop: true,
  skipLibCheck: true,
  strict: true,
  noEmit: true,
  resolveJsonModule: true,
  isolatedModules: true,
  allowSyntheticDefaultImports: true,
  forceConsistentCasingInFileNames: true,
};

// =============================================================================
// Implementation
// =============================================================================

class LanguageServiceManagerImpl implements LanguageServiceManager {
  private cache = new Map<string, CachedService>();
  private documentRegistry = ts.createDocumentRegistry();
  private cleanupInterval?: ReturnType<typeof setInterval>;

  /**
   * Get or create a Language Service for the given file.
   * The service is cached per tsconfig.json path.
   */
  async getServiceForFile(filePath: string): Promise<LanguageServiceResult> {
    const absolutePath = path.isAbsolute(filePath)
      ? filePath
      : path.resolve(PROJECT_ROOT, filePath);

    const normalizedPath = this.normalizePath(absolutePath);
    const configPath = this.findTsConfig(normalizedPath);
    const cacheKey = configPath ?? path.dirname(normalizedPath);

    // Check cache
    const cached = this.cache.get(cacheKey);
    if (cached) {
      cached.lastAccessed = Date.now();
      // Ensure the file is loaded in the service
      this.ensureFileLoaded(cached, normalizedPath);
      const program = cached.service.getProgram();
      if (!program) {
        throw new Error(`Failed to get program for ${normalizedPath}`);
      }
      return {
        service: cached.service,
        program,
        configPath: cached.configPath,
      };
    }

    // Create new service
    const newService = this.createLanguageService(cacheKey, configPath);
    this.cache.set(cacheKey, newService);

    // Ensure the file is loaded
    this.ensureFileLoaded(newService, normalizedPath);

    const program = newService.service.getProgram();
    if (!program) {
      throw new Error(`Failed to get program for ${normalizedPath}`);
    }

    return {
      service: newService.service,
      program,
      configPath: newService.configPath,
    };
  }

  /**
   * Convert line/column (1-based) to byte offset in file.
   */
  getPositionOffset(
    service: ts.LanguageService,
    fileName: string,
    line: number,
    column: number
  ): number {
    const program = service.getProgram();
    if (!program) {
      throw new Error(`No program available for ${fileName}`);
    }

    const sourceFile = program.getSourceFile(this.normalizePath(fileName));
    if (!sourceFile) {
      throw new Error(`Source file not found: ${fileName}`);
    }

    // Convert from 1-based to 0-based
    const zeroBasedLine = Math.max(0, line - 1);
    const zeroBasedColumn = Math.max(0, column - 1);

    return sourceFile.getPositionOfLineAndCharacter(zeroBasedLine, zeroBasedColumn);
  }

  /**
   * Convert byte offset to line/column (1-based).
   */
  getLineAndColumn(
    service: ts.LanguageService,
    fileName: string,
    offset: number
  ): { line: number; column: number } {
    const program = service.getProgram();
    if (!program) {
      throw new Error(`No program available for ${fileName}`);
    }

    const sourceFile = program.getSourceFile(this.normalizePath(fileName));
    if (!sourceFile) {
      throw new Error(`Source file not found: ${fileName}`);
    }

    const { line, character } = sourceFile.getLineAndCharacterOfPosition(offset);

    // Convert from 0-based to 1-based
    return {
      line: line + 1,
      column: character + 1,
    };
  }

  /**
   * Clean up cached services older than TTL.
   */
  cleanup(): void {
    const now = Date.now();
    const keysToDelete: string[] = [];

    for (const [key, cached] of this.cache.entries()) {
      if (now - cached.lastAccessed > CACHE_TTL_MS) {
        cached.service.dispose();
        keysToDelete.push(key);
      }
    }

    for (const key of keysToDelete) {
      this.cache.delete(key);
    }
  }

  /**
   * Shutdown the language service manager.
   * Clears the cleanup interval and disposes all cached services.
   */
  shutdown(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = undefined;
    }
    for (const [, cached] of this.cache.entries()) {
      cached.service.dispose();
    }
    this.cache.clear();
  }

  /**
   * Start the periodic cleanup interval.
   */
  startCleanupInterval(): void {
    if (!this.cleanupInterval) {
      this.cleanupInterval = setInterval(() => this.cleanup(), CACHE_TTL_MS / 2);
    }
  }

  /**
   * Normalize path for consistent cache keys.
   */
  private normalizePath(filePath: string): string {
    // Normalize slashes and resolve
    return path.normalize(filePath).replace(/\\/g, '/');
  }

  /**
   * Find tsconfig.json by walking up from the file's directory.
   */
  private findTsConfig(filePath: string): string | null {
    let dir = path.dirname(filePath);
    const root = path.parse(dir).root;

    while (dir !== root) {
      const tsconfigPath = path.join(dir, 'tsconfig.json');
      if (fs.existsSync(tsconfigPath)) {
        return this.normalizePath(tsconfigPath);
      }
      const parentDir = path.dirname(dir);
      if (parentDir === dir) break;
      dir = parentDir;
    }

    return null;
  }

  /**
   * Read and parse tsconfig.json, handling extends.
   */
  private readTsConfig(configPath: string): ts.CompilerOptions {
    const configDir = path.dirname(configPath);
    const result = ts.readConfigFile(configPath, ts.sys.readFile);

    if (result.error) {
      console.warn(`Error reading tsconfig at ${configPath}:`, result.error.messageText);
      return { ...DEFAULT_COMPILER_OPTIONS };
    }

    const parsed = ts.parseJsonConfigFileContent(
      result.config,
      ts.sys,
      configDir,
      undefined,
      configPath
    );

    if (parsed.errors.length > 0) {
      console.warn(`Errors parsing tsconfig at ${configPath}:`, parsed.errors);
    }

    // Merge with defaults for any missing options
    return {
      ...DEFAULT_COMPILER_OPTIONS,
      ...parsed.options,
    };
  }

  /**
   * Create a new Language Service with host.
   */
  private createLanguageService(cacheKey: string, configPath: string | null): CachedService {
    const compilerOptions = configPath
      ? this.readTsConfig(configPath)
      : { ...DEFAULT_COMPILER_OPTIONS };

    const files = new Map<string, { version: number; content: string; snapshot: ts.IScriptSnapshot }>();

    const host: ts.LanguageServiceHost = {
      getScriptFileNames: () => Array.from(files.keys()),
      getScriptVersion: (fileName) => {
        const normalized = this.normalizePath(fileName);
        const file = files.get(normalized);
        return file ? String(file.version) : '0';
      },
      getScriptSnapshot: (fileName) => {
        const normalized = this.normalizePath(fileName);

        // Check cache first
        const cached = files.get(normalized);
        if (cached) {
          return cached.snapshot;
        }

        // Try to read from disk
        try {
          const content = fs.readFileSync(fileName, 'utf-8');
          const snapshot = ts.ScriptSnapshot.fromString(content);
          files.set(normalized, { version: 1, content, snapshot });
          return snapshot;
        } catch {
          return undefined;
        }
      },
      getCurrentDirectory: () => {
        if (configPath) {
          return path.dirname(configPath);
        }
        return PROJECT_ROOT;
      },
      getCompilationSettings: () => compilerOptions,
      getDefaultLibFileName: (options) => ts.getDefaultLibFilePath(options),
      fileExists: ts.sys.fileExists,
      readFile: ts.sys.readFile,
      readDirectory: ts.sys.readDirectory,
      directoryExists: ts.sys.directoryExists,
      getDirectories: ts.sys.getDirectories,
      realpath: ts.sys.realpath,
    };

    const service = ts.createLanguageService(host, this.documentRegistry);

    return {
      service,
      host,
      configPath,
      compilerOptions,
      files,
      lastAccessed: Date.now(),
    };
  }

  /**
   * Ensure a file is loaded into the service and up to date.
   */
  private ensureFileLoaded(cached: CachedService, filePath: string): void {
    const normalized = this.normalizePath(filePath);

    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      const existing = cached.files.get(normalized);

      if (!existing || existing.content !== content) {
        const snapshot = ts.ScriptSnapshot.fromString(content);
        cached.files.set(normalized, {
          version: (existing?.version ?? 0) + 1,
          content,
          snapshot,
        });
      }
    } catch (err) {
      // File may not exist yet, that's OK for some use cases
      console.warn(`Could not read file ${filePath}:`, err);
    }
  }
}

// =============================================================================
// Singleton Export
// =============================================================================

/** Singleton instance of the Language Service Manager */
export const languageServiceManager = new LanguageServiceManagerImpl();

// Set up periodic cleanup using the instance method
if (typeof setInterval !== 'undefined') {
  languageServiceManager.startCleanupInterval();
}
