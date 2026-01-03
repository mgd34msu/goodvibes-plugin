/**
 * Server context - shared state for all handlers
 */

import Fuse from 'fuse.js';
import { Registry, RegistryEntry } from './types.js';

export interface ServerContext {
  skillsIndex: Fuse<RegistryEntry> | null;
  agentsIndex: Fuse<RegistryEntry> | null;
  toolsIndex: Fuse<RegistryEntry> | null;
  skillsRegistry: Registry | null;
}

export function createContext(): ServerContext {
  return {
    skillsIndex: null,
    agentsIndex: null,
    toolsIndex: null,
    skillsRegistry: null,
  };
}
