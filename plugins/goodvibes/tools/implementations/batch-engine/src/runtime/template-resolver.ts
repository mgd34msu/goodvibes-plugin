/**
 * Template Resolution implementation for Batch Engine
 * @see SPEC-v2 Section 6.3
 */

import type {
  TemplateString,
  TemplateContext,
  TemplateResolver,
  TemplateResolverOptions,
  TemplateParseResult,
  TemplateSegment,
  TemplateHelper,
  TemplateHelperConfig,
  DEFAULT_HELPERS,
} from '../interfaces/template.js';

/**
 * Parse template string into segments
 */
function parseTemplate(template: TemplateString): TemplateParseResult {
  const segments: TemplateSegment[] = [];
  const templateRegex = /\{\{([^}]+)\}\}/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = templateRegex.exec(template)) !== null) {
    // Add text before the template
    if (match.index > lastIndex) {
      segments.push({
        type: 'text',
        value: template.slice(lastIndex, match.index),
      });
    }

    // Parse the template reference
    const refContent = match[1]?.trim() ?? '';
    const parts = refContent.split(/\s+/);
    const [helperOrPath, ...args] = parts;

    // Check if it's a helper function
    const knownHelpers: TemplateHelper[] = ['json', 'join', 'first', 'last', 'filter', 'map', 'slice', 'count', 'keys', 'values'];
    if (knownHelpers.includes(helperOrPath as TemplateHelper)) {
      segments.push({
        type: 'reference',
        path: args[0] ?? '',
        helper: helperOrPath as TemplateHelper,
        args: args.slice(1),
      });
    } else {
      segments.push({
        type: 'reference',
        path: refContent,
      });
    }

    lastIndex = templateRegex.lastIndex;
  }

  // Add remaining text
  if (lastIndex < template.length) {
    segments.push({
      type: 'text',
      value: template.slice(lastIndex),
    });
  }

  return {
    raw: template,
    segments,
  };
}

/**
 * Resolve a path in the context object
 */
function resolvePath(path: string, context: TemplateContext): unknown {
  const parts = path.split('.');
  let current: any = context;

  for (const part of parts) {
    if (current == null) {
      return undefined;
    }

    // Handle array indexing
    const arrayMatch = part.match(/^(.+)\[(\d+)\]$/);
    if (arrayMatch) {
      const [, prop, index] = arrayMatch;
      if (prop) {
        current = current[prop];
        if (Array.isArray(current) && index) {
          current = current[parseInt(index, 10)];
        } else {
          return undefined;
        }
      }
    } else {
      current = current[part];
    }
  }

  return current;
}

/**
 * Apply a helper function to a value
 */
function applyHelper(
  helper: TemplateHelper,
  value: unknown,
  args: unknown[],
  helpers: TemplateHelperConfig
): unknown {
  const helperFn = helpers[helper];
  if (!helperFn) {
    throw new Error(`Unknown helper: ${helper}`);
  }

  switch (helper) {
    case 'json':
      return (helperFn as (value: unknown) => string)(value);
    case 'join':
      if (!Array.isArray(value)) {
        throw new Error(`Helper 'join' requires an array, got ${typeof value}`);
      }
      return (helperFn as (arr: unknown[], sep: string) => string)(value, (args[0] as string) || ',');
    case 'first':
    case 'last':
      if (!Array.isArray(value)) {
        throw new Error(`Helper '${helper}' requires an array, got ${typeof value}`);
      }
      return (helperFn as (arr: unknown[]) => unknown)(value);
    case 'count':
      if (!Array.isArray(value)) {
        throw new Error(`Helper 'count' requires an array, got ${typeof value}`);
      }
      return (helperFn as (arr: unknown[]) => number)(value);
    case 'slice':
      if (!Array.isArray(value)) {
        throw new Error(`Helper 'slice' requires an array, got ${typeof value}`);
      }
      return (helperFn as (arr: unknown[], start: number, end?: number) => unknown[])(
        value,
        parseInt(args[0] as string, 10),
        args[1] ? parseInt(args[1] as string, 10) : undefined
      );
    case 'filter':
      if (!Array.isArray(value)) {
        throw new Error(`Helper 'filter' requires an array, got ${typeof value}`);
      }
      return (helperFn as (arr: unknown[], key: string, value: unknown) => unknown[])(
        value,
        args[0] as string,
        args[1]
      );
    case 'map':
      if (!Array.isArray(value)) {
        throw new Error(`Helper 'map' requires an array, got ${typeof value}`);
      }
      return (helperFn as (arr: unknown[], key: string) => unknown[])(value, args[0] as string);
    case 'keys':
    case 'values':
      if (typeof value !== 'object' || value === null || Array.isArray(value)) {
        throw new Error(`Helper '${helper}' requires an object, got ${typeof value}`);
      }
      return (helperFn as (obj: Record<string, unknown>) => unknown)(value as Record<string, unknown>);
    default:
      return value;
  }
}

/**
 * TemplateResolver implementation
 */
export class TemplateResolverImpl implements TemplateResolver {
  private helpers: TemplateHelperConfig;
  private strict: boolean;
  private defaultValue: unknown;

  constructor(options: TemplateResolverOptions = {}) {
    // Import DEFAULT_HELPERS from template.ts
    const defaultHelpers: TemplateHelperConfig = {
      json: (value) => JSON.stringify(value, null, 2),
      join: (arr, separator) => arr.map(String).join(separator),
      first: (arr) => arr[0],
      last: (arr) => arr[arr.length - 1],
      filter: (arr, key, value) => arr.filter((item: any) => item[key] === value),
      map: (arr, key) => arr.map((item: any) => item[key]),
      slice: (arr, start, end) => arr.slice(start, end),
      count: (arr) => arr.length,
      keys: (obj) => Object.keys(obj),
      values: (obj) => Object.values(obj),
    };

    this.helpers = { ...defaultHelpers, ...options.helpers };
    this.strict = options.strict ?? true;
    this.defaultValue = options.defaultValue;
  }

  resolve(template: TemplateString, context: TemplateContext): unknown {
    const parsed = parseTemplate(template);

    // If the template is a single reference, return the resolved value directly
    if (parsed.segments.length === 1 && parsed.segments[0]?.type === 'reference') {
      const segment = parsed.segments[0];
      if (segment.type !== 'reference') {
        return this.resolveString(template, context);
      }

      let value = resolvePath(segment.path, context);

      if (value === undefined) {
        if (this.strict) {
          throw new Error(`Template reference not found: ${segment.path}`);
        }
        value = this.defaultValue;
      }

      if (segment.helper) {
        return applyHelper(segment.helper, value, segment.args || [], this.helpers);
      }

      return value;
    }

    // Otherwise, resolve to a string
    return this.resolveString(template, context);
  }

  resolveString(template: TemplateString, context: TemplateContext): string {
    const parsed = parseTemplate(template);
    const parts: string[] = [];

    for (const segment of parsed.segments) {
      if (segment.type === 'text') {
        parts.push(segment.value);
      } else {
        let value = resolvePath(segment.path, context);

        if (value === undefined) {
          if (this.strict) {
            throw new Error(`Template reference not found: ${segment.path}`);
          }
          value = this.defaultValue ?? '';
        }

        if (segment.helper) {
          value = applyHelper(segment.helper, value, segment.args || [], this.helpers);
        }

        parts.push(String(value));
      }
    }

    return parts.join('');
  }

  hasTemplates(value: string): boolean {
    return /\{\{[^}]+\}\}/.test(value);
  }

  extractTemplateRefs(template: TemplateString): string[] {
    const parsed = parseTemplate(template);
    const refs: string[] = [];

    for (const segment of parsed.segments) {
      if (segment.type === 'reference') {
        refs.push(segment.path);
      }
    }

    return refs;
  }
}

/**
 * Create a new TemplateResolver instance
 */
export function createTemplateResolver(options?: TemplateResolverOptions): TemplateResolver {
  return new TemplateResolverImpl(options);
}

/**
 * Singleton template resolver instance
 */
let globalTemplateResolver: TemplateResolver | null = null;

/**
 * Get the global TemplateResolver instance
 */
export function getTemplateResolver(options?: TemplateResolverOptions): TemplateResolver {
  if (!globalTemplateResolver) {
    globalTemplateResolver = createTemplateResolver(options);
  }
  return globalTemplateResolver;
}

/**
 * Reset the global TemplateResolver (useful for testing)
 */
export function resetGlobalTemplateResolver(): void {
  globalTemplateResolver = null;
}

/**
 * Convenience function to resolve a template
 */
export function resolveTemplate(template: TemplateString, context: TemplateContext): unknown {
  return getTemplateResolver().resolve(template, context);
}

/**
 * Convenience function to check if a string has templates
 */
export function hasTemplates(value: string): boolean {
  return getTemplateResolver().hasTemplates(value);
}

/**
 * Convenience function to extract template references
 */
export function extractTemplateRefs(template: TemplateString): string[] {
  return getTemplateResolver().extractTemplateRefs(template);
}

/**
 * Recursively resolve templates in an object
 */
export function resolveTemplatesInObject<T extends Record<string, any>>(
  obj: T,
  context: TemplateContext
): T {
  const result: any = Array.isArray(obj) ? [] : {};

  for (const key in obj) {
    const value = obj[key];

    if (typeof value === 'string' && hasTemplates(value)) {
      // Check if it's a pure template (single reference)
      const refs = extractTemplateRefs(value);
      if (refs.length === 1 && value === `{{${refs[0]}}}`) {
        // Resolve to actual value type
        result[key] = resolveTemplate(value, context);
      } else {
        // Resolve to string
        result[key] = getTemplateResolver().resolveString(value, context);
      }
    } else if (typeof value === 'object' && value !== null) {
      // Recursively resolve nested objects
      result[key] = resolveTemplatesInObject(value, context);
    } else {
      result[key] = value;
    }
  }

  return result;
}
