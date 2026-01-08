/**
 * Type definitions for folder structure analysis.
 */

/** Recognized architecture patterns for project organization. */
export type ArchitecturePattern =
  | 'next-app-router'
  | 'next-pages-router'
  | 'feature-based'
  | 'layer-based'
  | 'domain-driven'
  | 'atomic-design'
  | 'component-based'
  | 'flat'
  | 'unknown';

/** Flags indicating presence of common special directories. */
export interface SpecialDirectories {
  hasComponents: boolean;
  hasPages: boolean;
  hasApp: boolean;
  hasApi: boolean;
  hasLib: boolean;
  hasUtils: boolean;
  hasHooks: boolean;
  hasServices: boolean;
  hasTypes: boolean;
  hasTests: boolean;
}

/** Folder structure analysis results. */
export interface FolderStructure {
  pattern: ArchitecturePattern;
  confidence: 'high' | 'medium' | 'low';
  topLevelDirs: string[];
  srcDir: string | null;
  specialDirs: SpecialDirectories;
  depth: number;
}

/** Human-readable names for architecture patterns. */
export const PATTERN_NAMES: Record<ArchitecturePattern, string> = {
  'next-app-router': 'Next.js App Router',
  'next-pages-router': 'Next.js Pages Router',
  'feature-based': 'Feature-based / Module-based',
  'layer-based': 'Layer-based (MVC-like)',
  'domain-driven': 'Domain-Driven Design',
  'atomic-design': 'Atomic Design',
  'component-based': 'Component-based',
  flat: 'Flat structure',
  unknown: 'Unknown',
};
