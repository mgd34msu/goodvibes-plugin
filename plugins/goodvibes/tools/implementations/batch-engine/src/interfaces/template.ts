/**
 * Template Resolution interfaces for Batch Engine
 * @see SPEC-v2 Section 6.3
 */

import type { OperationResult } from './result.js';

export type TemplateString = string;

export interface TemplateContext {
  results: Record<string, OperationResult>;
  session: { id: string; git: { branch: string; commit: string; }; [key: string]: unknown; };
  now: string;
  [key: string]: unknown;
}

export type TemplateHelper = 'json' | 'join' | 'first' | 'last' | 'filter' | 'map' | 'slice' | 'count' | 'keys' | 'values';

export interface TemplateHelperConfig {
  json: (value: unknown) => string;
  join: (arr: unknown[], separator: string) => string;
  first: (arr: unknown[]) => unknown;
  last: (arr: unknown[]) => unknown;
  filter: (arr: unknown[], key: string, value: unknown) => unknown[];
  map: (arr: unknown[], key: string) => unknown[];
  slice: (arr: unknown[], start: number, end?: number) => unknown[];
  count: (arr: unknown[]) => number;
  keys: (obj: Record<string, unknown>) => string[];
  values: (obj: Record<string, unknown>) => unknown[];
}

export const DEFAULT_HELPERS: TemplateHelperConfig = {
  json: (value) => JSON.stringify(value, null, 2),
  join: (arr, separator) => arr.map(String).join(separator),
  first: (arr) => arr[0],
  last: (arr) => arr[arr.length - 1],
  filter: (arr, key, value) => arr.filter((item: any) => item[key] === value),
  map: (arr, key) => arr.map((item: any) => item[key]),
  slice: (arr, start, end) => arr.slice(start, end),
  count: (arr) => arr.length,
  keys: (obj) => Object.keys(obj),
  values: (obj) => Object.values(obj)
};

export interface TemplateResolver {
  resolve(template: TemplateString, context: TemplateContext): unknown;
  resolveString(template: TemplateString, context: TemplateContext): string;
  hasTemplates(value: string): boolean;
  extractTemplateRefs(template: TemplateString): string[];
}

export interface TemplateResolverOptions { helpers?: Partial<TemplateHelperConfig>; strict?: boolean; defaultValue?: unknown; }
export interface TemplateParseResult { raw: string; segments: TemplateSegment[]; }
export type TemplateSegment = { type: 'text'; value: string } | { type: 'reference'; path: string; helper?: TemplateHelper; args?: unknown[] };
