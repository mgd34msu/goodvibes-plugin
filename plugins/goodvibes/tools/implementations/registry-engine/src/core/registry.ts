/**
 * Registry loading for registry-engine core layer (L1).
 * Responsible for reading and parsing YAML registry files from disk.
 */

import * as yaml from 'js-yaml';
import * as fsPromises from 'node:fs/promises';
import * as path from 'node:path';

import { PLUGIN_ROOT } from '../shared/config.js';
import { fileExists } from '../shared/utils.js';
import { logger } from '../shared/logger.js';
import type { Registry } from './types.js';

/**
 * Load a registry from a YAML file relative to PLUGIN_ROOT.
 *
 * @param registryPath - Path relative to PLUGIN_ROOT (e.g. "registries/skills.yaml")
 * @returns Parsed Registry object, or null if file not found or parse error
 */
export async function loadRegistry(registryPath: string): Promise<Registry | null> {
  try {
    const fullPath = path.join(PLUGIN_ROOT, registryPath);
    if (!(await fileExists(fullPath))) {
      logger.error(`Registry not found: ${fullPath}`);
      return null;
    }
    const content = await fsPromises.readFile(fullPath, 'utf-8');
    return yaml.load(content) as Registry;
  } catch (error: unknown) {
    logger.error(`Error loading registry ${registryPath}`, error);
    return null;
  }
}
