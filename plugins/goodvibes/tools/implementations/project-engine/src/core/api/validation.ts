/**
 * Schema validation for the api domain.
 *
 * Validates runtime values against OpenAPI/JSON schema definitions.
 *
 * @module core/api/validation
 */

import type { SchemaObject, OpenApiSpecForValidation } from './types.js';

/**
 * Resolve a $ref string to a SchemaObject from the spec.
 *
 * Handles #/components/schemas/, #/components/parameters/,
 * #/components/requestBodies/, and #/components/responses/ paths.
 *
 * @param ref - The $ref string (e.g., '#/components/schemas/User')
 * @param spec - The full OpenAPI spec
 * @returns The resolved SchemaObject, or null if not found
 */
function resolveRef(ref: string, spec: OpenApiSpecForValidation): SchemaObject | null {
  if (ref.startsWith('#/components/schemas/')) {
    const name = ref.replace('#/components/schemas/', '');
    return spec.components?.schemas?.[name] ?? null;
  }
  if (ref.startsWith('#/components/parameters/')) {
    const name = ref.replace('#/components/parameters/', '');
    const param = (spec.components as Record<string, unknown> | undefined)
      ?.parameters as Record<string, SchemaObject> | undefined;
    return param?.[name] ?? null;
  }
  if (ref.startsWith('#/components/requestBodies/')) {
    const name = ref.replace('#/components/requestBodies/', '');
    const bodies = (spec.components as Record<string, unknown> | undefined)
      ?.requestBodies as Record<string, SchemaObject> | undefined;
    return bodies?.[name] ?? null;
  }
  if (ref.startsWith('#/components/responses/')) {
    const name = ref.replace('#/components/responses/', '');
    const responses = (spec.components as Record<string, unknown> | undefined)
      ?.responses as Record<string, SchemaObject> | undefined;
    return responses?.[name] ?? null;
  }
  return null;
}

/**
 * Schema validation issue.
 */
export interface SchemaIssue {
  path: string;
  message: string;
  expected: string;
  actual: string;
}

/**
 * Validate a value against a JSON Schema, resolving $ref references from the spec.
 *
 * Performs type checking, enum validation, pattern matching, number range validation,
 * object property validation, and array item validation.
 *
 * @param value - The runtime value to validate
 * @param schema - The schema to validate against
 * @param spec - The full OpenAPI spec for resolving $ref references
 * @param jsonPath - The current JSON path for error reporting (default: '$')
 * @returns Array of validation issues (empty if valid)
 *
 * @example
 * ```typescript
 * const issues = validateSchema({ name: 'Alice' }, { type: 'object', properties: { name: { type: 'string' } } }, spec);
 * // []
 * ```
 */
export function validateSchema(
  value: unknown,
  schema: SchemaObject,
  spec: OpenApiSpecForValidation,
  jsonPath: string = '$'
): SchemaIssue[] {
  const issues: SchemaIssue[] = [];

  // Resolve $ref if present
  let resolvedSchema = schema;
  if (resolvedSchema.$ref) {
    const resolved = resolveRef(resolvedSchema.$ref as string, spec);
    if (resolved) {
      resolvedSchema = resolved;
    } else {
      issues.push({
        path: jsonPath,
        message: 'Referenced schema not found',
        expected: resolvedSchema.$ref as string,
        actual: 'undefined',
      });
      return issues;
    }
  }
  schema = resolvedSchema;

  // Type validation
  const actualType = Array.isArray(value) ? 'array' : value === null ? 'null' : typeof value;

  if (schema.type && actualType !== schema.type) {
    // Special case: number can be integer or number; integer requires whole number
    if (!(
      (schema.type === 'number' && actualType === 'number') ||
      (schema.type === 'integer' && actualType === 'number' && Number.isInteger(value))
    )) {
      issues.push({
        path: jsonPath,
        message: 'Type mismatch',
        expected: schema.type,
        actual: actualType,
      });
      return issues; // Don't check further if type is wrong
    }
  }

  // Enum validation
  if (schema.enum && !schema.enum.includes(value)) {
    issues.push({
      path: jsonPath,
      message: 'Value not in enum',
      expected: JSON.stringify(schema.enum),
      actual: JSON.stringify(value),
    });
  }

  // Pattern validation (for strings)
  if (schema.pattern && typeof value === 'string') {
    const regex = new RegExp(schema.pattern as string);
    if (!regex.test(value)) {
      issues.push({
        path: jsonPath,
        message: 'Pattern mismatch',
        expected: schema.pattern as string,
        actual: value,
      });
    }
  }

  // Number range validation
  if (typeof value === 'number') {
    if (schema.minimum !== undefined && value < schema.minimum) {
      issues.push({
        path: jsonPath,
        message: 'Value below minimum',
        expected: `>= ${schema.minimum}`,
        actual: String(value),
      });
    }
    if (schema.maximum !== undefined && value > schema.maximum) {
      issues.push({
        path: jsonPath,
        message: 'Value above maximum',
        expected: `<= ${schema.maximum}`,
        actual: String(value),
      });
    }
  }

  // Object validation
  if (schema.type === 'object' && typeof value === 'object' && value !== null && !Array.isArray(value)) {
    const obj = value as Record<string, unknown>;

    // Check required properties
    if (schema.required) {
      for (const requiredProp of schema.required) {
        if (!(requiredProp in obj)) {
          issues.push({
            path: `${jsonPath}.${requiredProp}`,
            message: 'Required property missing',
            expected: requiredProp,
            actual: 'undefined',
          });
        }
      }
    }

    // Validate properties
    if (schema.properties) {
      for (const [propName, propSchema] of Object.entries(schema.properties)) {
        if (propName in obj) {
          issues.push(...validateSchema(obj[propName], propSchema, spec, `${jsonPath}.${propName}`));
        }
      }
    }
  }

  // Array validation
  if (schema.type === 'array' && Array.isArray(value)) {
    if (schema.items) {
      value.forEach((item, index) => {
        issues.push(...validateSchema(item, schema.items!, spec, `${jsonPath}[${index}]`));
      });
    }
  }

  return issues;
}
