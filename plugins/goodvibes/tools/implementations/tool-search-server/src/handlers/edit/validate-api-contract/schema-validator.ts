/**
 * JSON Schema validation for API responses
 *
 * Validates data against JSON Schema with support for OpenAPI-specific
 * features like $ref resolution, nullable types, and oneOf/anyOf/allOf.
 *
 * @module handlers/edit/validate-api-contract/schema-validator
 */

import type { JSONSchema, OpenAPISpec, Violation } from './types.js';

/**
 * Resolve a $ref reference in the OpenAPI spec
 *
 * Handles local refs like "#/components/schemas/User"
 *
 * @param spec - The full OpenAPI specification
 * @param ref - The $ref string to resolve
 * @returns The resolved schema or undefined if not found
 */
export function resolveRef(spec: OpenAPISpec, ref: string): JSONSchema | undefined {
  // Handle local refs like "#/components/schemas/User"
  if (!ref.startsWith('#/')) {
    return undefined;
  }

  const parts = ref.slice(2).split('/');
  let current: unknown = spec;

  for (const part of parts) {
    if (current && typeof current === 'object') {
      current = (current as Record<string, unknown>)[part];
    } else {
      return undefined;
    }
  }

  return current as JSONSchema | undefined;
}

/**
 * Get JSON type name for a value
 *
 * Note: null values are handled by validateSchema before this is called,
 * so this function never receives null
 *
 * @param value - The value to get the type of
 * @returns JSON type name (string, number, boolean, object, array)
 */
export function getJsonType(value: NonNullable<unknown>): string {
  if (Array.isArray(value)) return 'array';
  return typeof value;
}

/**
 * Validate data against a JSON schema
 *
 * Performs comprehensive validation including:
 * - Type checking
 * - Required property validation
 * - String/number constraint validation
 * - Array item validation
 * - oneOf/anyOf/allOf composition
 * - $ref resolution
 * - nullable handling
 *
 * @param data - The data to validate
 * @param schema - The JSON schema to validate against
 * @param jsonPath - Current JSON path for error reporting
 * @param spec - The full OpenAPI spec (for $ref resolution)
 * @returns Array of violations found
 */
export function validateSchema(
  data: unknown,
  schema: JSONSchema,
  jsonPath: string,
  spec: OpenAPISpec
): Violation[] {
  const violations: Violation[] = [];

  // Handle $ref
  if (schema.$ref) {
    const resolved = resolveRef(spec, schema.$ref);
    if (!resolved) {
      violations.push({
        path: jsonPath,
        rule: '$ref',
        expected: schema.$ref,
        actual: 'unresolved',
        message: `Unable to resolve reference: ${schema.$ref}`,
      });
      return violations;
    }
    return validateSchema(data, resolved, jsonPath, spec);
  }

  // Handle nullable
  if (data === null) {
    if (schema.nullable) {
      return violations;
    }
    // In OpenAPI 3.0, nullable is explicit; in earlier versions, null might be unexpected
    if (schema.type && schema.type !== 'null') {
      violations.push({
        path: jsonPath,
        rule: 'nullable',
        expected: 'non-null',
        actual: 'null',
        message: `Expected non-null value at ${jsonPath}`,
      });
    }
    return violations;
  }

  // Handle oneOf/anyOf/allOf
  if (schema.oneOf) {
    const matches = schema.oneOf.filter(
      (s) => validateSchema(data, s, jsonPath, spec).length === 0
    );
    if (matches.length !== 1) {
      violations.push({
        path: jsonPath,
        rule: 'oneOf',
        expected: 'exactly one match',
        actual: `${matches.length} matches`,
        message: `Value at ${jsonPath} should match exactly one of the oneOf schemas`,
      });
    }
    return violations;
  }

  if (schema.anyOf) {
    const matches = schema.anyOf.filter(
      (s) => validateSchema(data, s, jsonPath, spec).length === 0
    );
    if (matches.length === 0) {
      violations.push({
        path: jsonPath,
        rule: 'anyOf',
        expected: 'at least one match',
        actual: '0 matches',
        message: `Value at ${jsonPath} should match at least one of the anyOf schemas`,
      });
    }
    return violations;
  }

  if (schema.allOf) {
    for (const subSchema of schema.allOf) {
      violations.push(...validateSchema(data, subSchema, jsonPath, spec));
    }
    return violations;
  }

  // Check type
  if (schema.type) {
    const actualType = getJsonType(data);
    if (schema.type === 'integer') {
      if (actualType !== 'number' || !Number.isInteger(data)) {
        violations.push({
          path: jsonPath,
          rule: 'type',
          expected: 'integer',
          actual: actualType,
          message: `Expected integer at ${jsonPath}, got ${actualType}`,
        });
        return violations;
      }
    } else if (actualType !== schema.type) {
      violations.push({
        path: jsonPath,
        rule: 'type',
        expected: schema.type,
        actual: actualType,
        message: `Expected ${schema.type} at ${jsonPath}, got ${actualType}`,
      });
      return violations;
    }
  }

  // Check const (exact value match)
  // Use 'in' operator to properly handle const values that could be undefined
  if ('const' in schema && data !== schema.const) {
    violations.push({
      path: jsonPath,
      rule: 'const',
      expected: String(schema.const),
      actual: String(data),
      message: `Value at ${jsonPath} must be: ${schema.const}`,
    });
    return violations;
  }

  // Check enum
  if (schema.enum && !schema.enum.includes(data)) {
    violations.push({
      path: jsonPath,
      rule: 'enum',
      expected: schema.enum.map(String).join(' | '),
      actual: String(data),
      message: `Value at ${jsonPath} must be one of: ${schema.enum.join(', ')}`,
    });
  }

  // String validations
  if (typeof data === 'string') {
    if (schema.minLength !== undefined && data.length < schema.minLength) {
      violations.push({
        path: jsonPath,
        rule: 'minLength',
        expected: `>= ${schema.minLength}`,
        actual: String(data.length),
        message: `String at ${jsonPath} is too short (min: ${schema.minLength})`,
      });
    }
    if (schema.maxLength !== undefined && data.length > schema.maxLength) {
      violations.push({
        path: jsonPath,
        rule: 'maxLength',
        expected: `<= ${schema.maxLength}`,
        actual: String(data.length),
        message: `String at ${jsonPath} is too long (max: ${schema.maxLength})`,
      });
    }
    if (schema.pattern) {
      const regex = new RegExp(schema.pattern);
      if (!regex.test(data)) {
        violations.push({
          path: jsonPath,
          rule: 'pattern',
          expected: schema.pattern,
          actual: data,
          message: `String at ${jsonPath} does not match pattern: ${schema.pattern}`,
        });
      }
    }
  }

  // Number validations
  if (typeof data === 'number') {
    if (schema.minimum !== undefined && data < schema.minimum) {
      violations.push({
        path: jsonPath,
        rule: 'minimum',
        expected: `>= ${schema.minimum}`,
        actual: String(data),
        message: `Number at ${jsonPath} is below minimum (${schema.minimum})`,
      });
    }
    if (schema.maximum !== undefined && data > schema.maximum) {
      violations.push({
        path: jsonPath,
        rule: 'maximum',
        expected: `<= ${schema.maximum}`,
        actual: String(data),
        message: `Number at ${jsonPath} is above maximum (${schema.maximum})`,
      });
    }
  }

  // Object validations
  if (typeof data === 'object' && data !== null && !Array.isArray(data)) {
    const objData = data as Record<string, unknown>;

    // Check required properties
    if (schema.required) {
      for (const prop of schema.required) {
        if (!(prop in objData)) {
          violations.push({
            path: `${jsonPath}.${prop}`,
            rule: 'required',
            expected: 'present',
            actual: 'missing',
            message: `Required property "${prop}" is missing at ${jsonPath}`,
          });
        }
      }
    }

    // Validate properties
    if (schema.properties) {
      for (const [key, propSchema] of Object.entries(schema.properties)) {
        if (key in objData) {
          violations.push(
            ...validateSchema(objData[key], propSchema, `${jsonPath}.${key}`, spec)
          );
        }
      }
    }

    // Check additionalProperties if set to false
    if (schema.additionalProperties === false && schema.properties) {
      const allowedKeys = new Set(Object.keys(schema.properties));
      for (const key of Object.keys(objData)) {
        if (!allowedKeys.has(key)) {
          violations.push({
            path: `${jsonPath}.${key}`,
            rule: 'additionalProperties',
            expected: 'not present',
            actual: 'present',
            message: `Unexpected property "${key}" at ${jsonPath}`,
          });
        }
      }
    }
  }

  // Array validations
  if (Array.isArray(data)) {
    if (schema.items) {
      data.forEach((item, index) => {
        violations.push(
          ...validateSchema(item, schema.items!, `${jsonPath}[${index}]`, spec)
        );
      });
    }
  }

  return violations;
}
