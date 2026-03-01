/**
 * TypeScript Language Service Manager
 *
 * Manages Language Service instances per project, handles file caching,
 * and provides position conversion utilities.
 *
 * @module core/code-intel/language-service
 */

import * as fs from 'node:fs';
import * as fsPromises from 'node:fs/promises';
import * as path from 'node:path';
import ts from 'typescript';

import { getProjectRoot } from '../../shared/config.js';
import { logWarn } from '../../shared/logger.js';
import { normalizePath } from '../../shared/utils.js';
import { CACHE_TTL_MS, TS_ANALYSIS_OPTIONS } from './constants.js';
import { readTsConfigSync } from './tsconfig.js';
import type { CachedService, LanguageServiceManager, LanguageServiceResult } from './types.js';

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
    let absolutePath: string;
    if (path.isAbsolute(filePath)) {
      absolutePath = filePath;
    } else {
      const currentProjectRoot = getProjectRoot();
      const projectRoot = await this.findProjectRoot(currentProjectRoot) || currentProjectRoot;
      absolutePath = path.resolve(projectRoot, filePath);
    }

    const normalizedFilePath = normalizePath(absolutePath);
    const configPath = this.findTsConfigSync(normalizedFilePath);
    const cacheKey = configPath ?? path.dirname(normalizedFilePath);

    // Check cache
    const cached = this.cache.get(cacheKey);
    if (cached) {
      cached.lastAccessed = Date.now();
      this.ensureFileLoaded(cached, normalizedFilePath);
      const program = cached.service.getProgram();
      if (!program) {
        throw new Error(`Failed to get program for ${normalizedFilePath}`);
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

    this.ensureFileLoaded(newService, normalizedFilePath);

    const program = newService.service.getProgram();
    if (!program) {
      throw new Error(`Failed to get program for ${normalizedFilePath}`);
    }

    return {
      service: newService.service,
      program,
      configPath: newService.configPath,
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
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
    this.cleanupInterval = setInterval(() => this.cleanup(), CACHE_TTL_MS / 2);
  }

  /**
   * Get the configured cache TTL in milliseconds.
   */
  getCacheTTL(): number {
    return CACHE_TTL_MS;
  }

  /**
   * Find project root by looking for .goodvibes, .git, or package.json
   */
  private async findProjectRoot(startPath: string): Promise<string | null> {
    let dir = startPath;
    const root = path.parse(dir).root;

    while (dir !== root) {
      const checks = await Promise.all([
        fsPromises.access(path.join(dir, '.goodvibes')).then(() => true).catch(() => false),
        fsPromises.access(path.join(dir, '.git')).then(() => true).catch(() => false),
        fsPromises.access(path.join(dir, 'package.json')).then(() => true).catch(() => false),
      ]);
      if (checks.some(Boolean)) {
        return dir;
      }
      const parentDir = path.dirname(dir);
      if (parentDir === dir) break;
      dir = parentDir;
    }

    return null;
  }

  /**
   * Find tsconfig.json by walking up from the file's directory.
   * Synchronous because it runs in service creation (not async context).
   */
  private findTsConfigSync(filePath: string): string | null {
    let dir = path.dirname(filePath);
    const root = path.parse(dir).root;

    while (dir !== root) {
      const tsconfigPath = path.join(dir, 'tsconfig.json');
      if (fs.existsSync(tsconfigPath)) {
        return normalizePath(tsconfigPath);
      }
      const parentDir = path.dirname(dir);
      if (parentDir === dir) break;
      dir = parentDir;
    }

    return null;
  }

  /**
   * Create a new Language Service with host.
   */
  private createLanguageService(cacheKey: string, configPath: string | null): CachedService {
    const compilerOptions = configPath
      ? readTsConfigSync(configPath)
      : { ...TS_ANALYSIS_OPTIONS };

    const files = new Map<string, { version: number; content: string; snapshot: ts.IScriptSnapshot }>();

    const host: ts.LanguageServiceHost = {
      getScriptFileNames: () => Array.from(files.keys()),
      getScriptVersion: (fileName) => {
        const normalized = normalizePath(fileName);
        const file = files.get(normalized);
        return file ? String(file.version) : '0';
      },
      getScriptSnapshot: (fileName) => {
        const normalized = normalizePath(fileName);

        const cached = files.get(normalized);
        if (cached) {
          return cached.snapshot;
        }

        // Fall back to disk (TS Language Service host must be synchronous)
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
        return getProjectRoot();
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
    const wrappedService = this.createServiceProxy(service);

    return {
      service: wrappedService,
      host,
      configPath,
      compilerOptions,
      files,
      lastAccessed: Date.now(),
    };
  }

  /**
   * Create a proxy wrapper that handles non-existent files gracefully
   * by returning empty arrays for diagnostic methods.
   */
  private createServiceProxy(service: ts.LanguageService): ts.LanguageService {
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
              if (
                error instanceof Error &&
                error.message.includes('Could not find source file')
              ) {
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

  /**
   * Ensure a file is loaded into the service and up to date.
   * Must remain synchronous — TS Language Service host is synchronous.
   */
  private ensureFileLoaded(cached: CachedService, filePath: string): void {
    const normalized = normalizePath(filePath);

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
      logWarn(`Could not read file ${filePath}`, err);
    }
  }
}

// =============================================================================
// Singleton Export
// =============================================================================

/** Singleton instance of the Language Service Manager */
export const languageServiceManager = new LanguageServiceManagerImpl();

/**
 * Initialize the language service manager by starting the cleanup interval.
 * Call this once at application startup to enable automatic cache eviction.
 */
export function initLanguageServiceManager(): void {
  languageServiceManager.startCleanupInterval();
}
