/**
 * Class Parser for Responsive Breakpoints
 *
 * Parses className strings and organizes classes by breakpoint.
 *
 * @module handlers/frontend/responsive-breakpoints/class-parser
 */

import type { BreakpointClasses, PropertyChange } from './types.js';
import { BREAKPOINTS, Breakpoint, CLASS_TO_PROPERTY, CLASS_PREFIX_TO_PROPERTY } from './constants.js';

/**
 * Parse a className string into individual classes
 */
export function parseClassName(className: string): string[] {
  // Handle template literals and concatenation - extract string parts
  // Remove template literal syntax
  const cleaned = className
    .replace(/\$\{[^}]+\}/g, ' ') // Remove template expressions
    .replace(/`/g, '') // Remove backticks
    .replace(/\s+/g, ' ') // Normalize whitespace
    .trim();

  return cleaned.split(' ').filter((c) => c.length > 0);
}

/**
 * Parse classes into breakpoint-organized structure
 */
export function parseBreakpointClasses(classes: string[]): BreakpointClasses {
  const result: BreakpointClasses = { base: [] };

  for (const cls of classes) {
    // Match breakpoint prefix: sm:, md:, lg:, xl:, 2xl:
    const match = cls.match(/^(sm|md|lg|xl|2xl):(.+)$/);
    if (match) {
      const [, breakpoint, utility] = match;
      const bp = breakpoint as Breakpoint;
      if (!result[bp]) result[bp] = [];
      result[bp]!.push(utility);
    } else {
      // No breakpoint prefix = base (mobile-first)
      result.base.push(cls);
    }
  }

  return result;
}

/**
 * Get the CSS property from a Tailwind class
 */
export function getPropertyFromClass(cls: string): string | null {
  // Check exact matches first
  if (CLASS_TO_PROPERTY[cls]) {
    return CLASS_TO_PROPERTY[cls];
  }

  // Check prefix patterns
  for (const [pattern, property] of CLASS_PREFIX_TO_PROPERTY) {
    if (pattern.test(cls)) {
      return property;
    }
  }

  return null;
}

/**
 * Track property changes across breakpoints
 */
export function trackPropertyChanges(breakpointClasses: BreakpointClasses): PropertyChange[] {
  const properties = new Map<string, PropertyChange>();

  // Process base classes first
  for (const cls of breakpointClasses.base) {
    const property = getPropertyFromClass(cls);
    if (!property) continue;

    if (!properties.has(property)) {
      properties.set(property, {
        property,
        base_value: cls,
        transitions: [],
      });
    } else {
      // Multiple base classes for same property - use last one
      properties.get(property)!.base_value = cls;
    }
  }

  // Process breakpoint classes
  for (const bp of BREAKPOINTS) {
    const classes = breakpointClasses[bp];
    if (!classes) continue;

    for (const cls of classes) {
      const property = getPropertyFromClass(cls);
      if (!property) continue;

      if (!properties.has(property)) {
        // Property only defined at breakpoint, not base
        properties.set(property, {
          property,
          base_value: '',
          transitions: [{ breakpoint: bp, value: cls }],
        });
      } else {
        properties.get(property)!.transitions.push({ breakpoint: bp, value: cls });
      }
    }
  }

  return [...properties.values()].filter(
    (p) => p.base_value !== '' || p.transitions.length > 0
  );
}
