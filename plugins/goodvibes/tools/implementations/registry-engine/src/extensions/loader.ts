/**
 * RegistryIndexCache — lazy-loading index cache for registry-engine.
 *
 * Manages lazy loading and caching of Fuse.js search indexes for skills,
 * agents, and tools registries with promise deduplication to prevent
 * concurrent loads.
 *
 * @module extensions/loader
 */

import Fuse from 'fuse.js';
import { Registry, RegistryEntry, RegistryContext } from '../core/types.js';
import { loadRegistry } from '../core/registry.js';
import { buildIndex } from '../core/search.js';
import { logger } from '../shared/logger.js';

/**
 * Lazy-loading cache for the three Fuse.js registry indexes.
 * Renamed from LazyRegistryLoader — the class caches indexes, not loads registries.
 */
export class RegistryIndexCache {
  private _skillsIndex: Fuse<RegistryEntry> | null = null;
  private _agentsIndex: Fuse<RegistryEntry> | null = null;
  private _toolsIndex: Fuse<RegistryEntry> | null = null;
  private _skillsRegistry: Registry | null = null;

  private _skillsLoading: Promise<void> | null = null;
  private _agentsLoading: Promise<void> | null = null;
  private _toolsLoading: Promise<void> | null = null;

  private _skillsLoaded = false;
  private _agentsLoaded = false;
  private _toolsLoaded = false;

  /**
   * Get skills index, loading it lazily if not already loaded.
   */
  async getSkillsIndex(): Promise<Fuse<RegistryEntry> | null> {
    if (!this._skillsLoaded) {
      if (!this._skillsLoading) {
        this._skillsLoading = this.loadSkills();
      }
      await this._skillsLoading;
    }
    return this._skillsIndex;
  }

  /**
   * Get skills registry, loading it lazily if not already loaded.
   */
  async getSkillsRegistry(): Promise<Registry | null> {
    if (!this._skillsLoaded) {
      if (!this._skillsLoading) {
        this._skillsLoading = this.loadSkills();
      }
      await this._skillsLoading;
    }
    return this._skillsRegistry;
  }

  /**
   * Get agents index, loading it lazily if not already loaded.
   */
  async getAgentsIndex(): Promise<Fuse<RegistryEntry> | null> {
    if (!this._agentsLoaded) {
      if (!this._agentsLoading) {
        this._agentsLoading = this.loadAgents();
      }
      await this._agentsLoading;
    }
    return this._agentsIndex;
  }

  /**
   * Get tools index, loading it lazily if not already loaded.
   */
  async getToolsIndex(): Promise<Fuse<RegistryEntry> | null> {
    if (!this._toolsLoaded) {
      if (!this._toolsLoading) {
        this._toolsLoading = this.loadTools();
      }
      await this._toolsLoading;
    }
    return this._toolsIndex;
  }

  /**
   * Warm all registry indexes in parallel.
   * Call this to eagerly load the cache instead of waiting for lazy initialization.
   * Renamed from preloadAll() — 'warm' is the standard cache warming term.
   */
  async warmAll(): Promise<void> {
    await Promise.all([
      this.getSkillsIndex(),
      this.getAgentsIndex(),
      this.getToolsIndex(),
    ]);
  }

  /**
   * Get the registry context with all indexes loaded.
   * Renamed from getHandlerContext() — returns RegistryContext, not handler-specific.
   */
  async getContext(): Promise<RegistryContext> {
    await Promise.all([
      this.getSkillsIndex(),
      this.getAgentsIndex(),
      this.getToolsIndex(),
    ]);

    return {
      skillsIndex: this._skillsIndex,
      agentsIndex: this._agentsIndex,
      toolsIndex: this._toolsIndex,
      skillsRegistry: this._skillsRegistry,
    };
  }

  private async loadSkills(): Promise<void> {
    logger.info('Loading skills registry lazily');
    this._skillsRegistry = await loadRegistry('skills/_registry.yaml');
    this._skillsIndex = buildIndex(this._skillsRegistry);
    this._skillsLoaded = true;
    logger.info('Skills index loaded', {
      entries: this._skillsRegistry?.search_index?.length || 0,
    });
  }

  private async loadAgents(): Promise<void> {
    logger.info('Loading agents registry lazily');
    const agentsRegistry = await loadRegistry('agents/_registry.yaml');
    this._agentsIndex = buildIndex(agentsRegistry);
    this._agentsLoaded = true;
    logger.info('Agents index loaded', {
      entries: agentsRegistry?.search_index?.length || 0,
    });
  }

  private async loadTools(): Promise<void> {
    logger.info('Loading tools registry lazily');
    const toolsRegistry = await loadRegistry('tools/_registry.yaml');
    this._toolsIndex = buildIndex(toolsRegistry);
    this._toolsLoaded = true;
    logger.info('Tools index loaded', {
      entries: toolsRegistry?.search_index?.length || 0,
    });
  }
}
