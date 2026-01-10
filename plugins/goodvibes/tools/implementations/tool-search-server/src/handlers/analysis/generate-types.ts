/**
 * Generate TypeScript types from JSON data
 *
 * Supports multiple data sources:
 * - URL: Fetch JSON from a URL (with optional multi-sample for optional field detection)
 * - File: Read JSON from a local file
 * - Inline: Use provided JSON data directly
 *
 * Features:
 * - Infers TypeScript types from JSON structure
 * - Detects optional/nullable fields across multiple samples
 * - Generates clean, readable TypeScript interfaces
 * - Extracts nested objects into separate named interfaces
 * - Supports JSDoc examples in generated code
 */

import * as fs from 'fs';
import * as path from 'path';

import { ToolResponse } from '../../types.js';
import { PROJECT_ROOT } from '../../config.js';

/**
 * Arguments for generate_types handler
 */
export interface GenerateTypesArgs {
  source: 'url' | 'file' | 'inline';
  url?: string;
  file_path?: string;
  data?: unknown;
  samples?: number;
  type_name?: string;
  export_types?: boolean;
  include_examples?: boolean;
}

/**
 * Result of type generation
 */
export interface GenerateTypesResult {
  success: boolean;
  types: string;
  type_names: string[];
  root_type: string;
  nullable_fields: string[];
  union_fields: Array<{
    field: string;
    types: string[];
  }>;
  samples_analyzed: number;
  source_info: string;
}

/**
 * Internal type information structure
 */
interface TypeInfo {
  type: 'string' | 'number' | 'boolean' | 'null' | 'undefined' | 'array' | 'object' | 'union' | 'unknown';
  nullable: boolean;
  optional: boolean;
  arrayItemType?: TypeInfo;
  properties?: Record<string, TypeInfo>;
  unionTypes?: TypeInfo[];
  exampleValue?: unknown;
}

/**
 * Handle generate_types tool call
 */
export async function handleGenerateTypes(args: GenerateTypesArgs): Promise<ToolResponse> {
  try {
    // Validate arguments
    if (args.source === 'url' && !args.url) {
      return errorResponse('URL is required when source is "url"');
    }
    if (args.source === 'file' && !args.file_path) {
      return errorResponse('file_path is required when source is "file"');
    }
    if (args.source === 'inline' && args.data === undefined) {
      return errorResponse('data is required when source is "inline"');
    }

    // Fetch data samples
    const samples = await fetchData(args);
    if (samples.length === 0) {
      return errorResponse('No data samples could be retrieved');
    }

    // Infer types from samples
    const typeInfos = samples.map(sample => inferType(sample));
    const mergedType = mergeTypes(typeInfos);

    // Generate TypeScript code
    const typeName = args.type_name || 'GeneratedType';
    const exportTypes = args.export_types !== false;
    const includeExamples = args.include_examples === true;

    const generatedTypes: string[] = [];
    const typeNames: string[] = [];
    const nullableFields: string[] = [];
    const unionFields: Array<{ field: string; types: string[] }> = [];

    // Generate types, extracting nested objects
    generateTypeScript(
      mergedType,
      typeName,
      exportTypes,
      includeExamples,
      generatedTypes,
      typeNames,
      nullableFields,
      unionFields,
      ''
    );

    // Build source info
    let sourceInfo = '';
    if (args.source === 'url') {
      sourceInfo = `URL: ${args.url}`;
    } else if (args.source === 'file') {
      sourceInfo = `File: ${args.file_path}`;
    } else {
      sourceInfo = 'Inline data';
    }

    const result: GenerateTypesResult = {
      success: true,
      types: generatedTypes.join('\n\n'),
      type_names: typeNames,
      root_type: typeName,
      nullable_fields: nullableFields,
      union_fields: unionFields,
      samples_analyzed: samples.length,
      source_info: sourceInfo,
    };

    return {
      content: [{
        type: 'text',
        text: JSON.stringify(result, null, 2),
      }],
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return errorResponse(message);
  }
}

/**
 * Fetch data from the specified source
 */
async function fetchData(args: GenerateTypesArgs): Promise<unknown[]> {
  if (args.source === 'inline') {
    return [args.data];
  }

  if (args.source === 'file') {
    const filePath = path.resolve(PROJECT_ROOT, args.file_path!);
    if (!fs.existsSync(filePath)) {
      throw new Error(`File not found: ${filePath}`);
    }
    const content = fs.readFileSync(filePath, 'utf-8');
    try {
      return [JSON.parse(content)];
    } catch {
      throw new Error(`Invalid JSON in file: ${filePath}`);
    }
  }

  if (args.source === 'url') {
    const samples: unknown[] = [];
    const sampleCount = Math.min(Math.max(args.samples || 1, 1), 10); // Limit to 1-10 samples

    for (let i = 0; i < sampleCount; i++) {
      try {
        const response = await fetch(args.url!);
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        const data = await response.json();
        samples.push(data);
      } catch (error) {
        // If this is the first request and it fails, throw
        if (i === 0) {
          throw error;
        }
        // Otherwise continue with what we have
        break;
      }
    }

    return samples;
  }

  throw new Error(`Unknown source type: ${args.source}`);
}

/**
 * Infer TypeInfo from a JavaScript value
 */
function inferType(value: unknown): TypeInfo {
  if (value === null) {
    return { type: 'null', nullable: true, optional: false };
  }

  if (value === undefined) {
    return { type: 'undefined', nullable: false, optional: true };
  }

  if (Array.isArray(value)) {
    if (value.length === 0) {
      return {
        type: 'array',
        nullable: false,
        optional: false,
        arrayItemType: { type: 'unknown', nullable: false, optional: false },
      };
    }
    const itemTypes = value.map(item => inferType(item));
    const mergedItemType = mergeTypes(itemTypes);
    return {
      type: 'array',
      nullable: false,
      optional: false,
      arrayItemType: mergedItemType,
      exampleValue: value.slice(0, 2), // Keep first 2 items as example
    };
  }

  if (typeof value === 'object') {
    const properties: Record<string, TypeInfo> = {};
    for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
      properties[key] = inferType(val);
    }
    return {
      type: 'object',
      nullable: false,
      optional: false,
      properties,
      exampleValue: value,
    };
  }

  const jsType = typeof value;
  if (jsType === 'string' || jsType === 'number' || jsType === 'boolean') {
    return {
      type: jsType,
      nullable: false,
      optional: false,
      exampleValue: value,
    };
  }

  return { type: 'unknown', nullable: false, optional: false };
}

/**
 * Merge multiple TypeInfo objects into one
 * Used for combining types from multiple samples or array items
 */
function mergeTypes(types: TypeInfo[]): TypeInfo {
  if (types.length === 0) {
    return { type: 'unknown', nullable: false, optional: false };
  }

  if (types.length === 1) {
    return types[0];
  }

  // Filter out undefined types and track optionality
  const definedTypes = types.filter(t => t.type !== 'undefined');
  const hasOptional = types.some(t => t.type === 'undefined' || t.optional);

  // Check if any is null
  const hasNull = types.some(t => t.type === 'null' || t.nullable);

  // Filter out null types for further analysis
  const nonNullTypes = definedTypes.filter(t => t.type !== 'null');

  if (nonNullTypes.length === 0) {
    return { type: 'null', nullable: true, optional: hasOptional };
  }

  // Get unique type kinds (excluding null)
  const typeKinds = new Set(nonNullTypes.map(t => t.type));

  // If all same type, merge
  if (typeKinds.size === 1) {
    const kind = nonNullTypes[0].type;

    if (kind === 'object') {
      // Merge object properties
      const allProperties = new Map<string, TypeInfo[]>();
      const propertiesPresence = new Map<string, number>();

      for (const t of nonNullTypes) {
        if (t.properties) {
          for (const [key, propType] of Object.entries(t.properties)) {
            if (!allProperties.has(key)) {
              allProperties.set(key, []);
              propertiesPresence.set(key, 0);
            }
            allProperties.get(key)!.push(propType);
            propertiesPresence.set(key, propertiesPresence.get(key)! + 1);
          }
        }
      }

      const mergedProperties: Record<string, TypeInfo> = {};
      for (const [key, propTypes] of allProperties) {
        const merged = mergeTypes(propTypes);
        // Mark as optional if not present in all samples
        const isOptional = propertiesPresence.get(key)! < nonNullTypes.length;
        mergedProperties[key] = {
          ...merged,
          optional: merged.optional || isOptional,
        };
      }

      return {
        type: 'object',
        nullable: hasNull,
        optional: hasOptional,
        properties: mergedProperties,
      };
    }

    if (kind === 'array') {
      // Merge array item types
      const itemTypes = nonNullTypes
        .filter(t => t.arrayItemType)
        .map(t => t.arrayItemType!);
      const mergedItemType = mergeTypes(itemTypes);

      return {
        type: 'array',
        nullable: hasNull,
        optional: hasOptional,
        arrayItemType: mergedItemType,
      };
    }

    // Primitive type
    return {
      type: kind,
      nullable: hasNull,
      optional: hasOptional,
      exampleValue: nonNullTypes[0].exampleValue,
    };
  }

  // Different types - create union
  const uniqueTypes: TypeInfo[] = [];
  const seenTypes = new Set<string>();

  for (const t of nonNullTypes) {
    const key = getTypeKey(t);
    if (!seenTypes.has(key)) {
      seenTypes.add(key);
      uniqueTypes.push(t);
    }
  }

  return {
    type: 'union',
    nullable: hasNull,
    optional: hasOptional,
    unionTypes: uniqueTypes,
  };
}

/**
 * Get a unique key for a type (for deduplication)
 */
function getTypeKey(type: TypeInfo): string {
  if (type.type === 'object' && type.properties) {
    const propKeys = Object.keys(type.properties).sort().join(',');
    return `object{${propKeys}}`;
  }
  if (type.type === 'array' && type.arrayItemType) {
    return `array[${getTypeKey(type.arrayItemType)}]`;
  }
  return type.type;
}

/**
 * Generate TypeScript code from TypeInfo
 */
function generateTypeScript(
  info: TypeInfo,
  name: string,
  exported: boolean,
  includeExamples: boolean,
  generatedTypes: string[],
  typeNames: string[],
  nullableFields: string[],
  unionFields: Array<{ field: string; types: string[] }>,
  parentPath: string
): void {
  const prefix = exported ? 'export ' : '';

  if (info.type === 'object' && info.properties) {
    const fields: string[] = [];

    for (const [key, propInfo] of Object.entries(info.properties)) {
      const fieldPath = parentPath ? `${parentPath}.${key}` : key;
      const optional = propInfo.optional ? '?' : '';
      const nullable = propInfo.nullable && !propInfo.optional;

      // Track nullable fields
      if (propInfo.nullable) {
        nullableFields.push(fieldPath);
      }

      // Check if we need to generate a separate interface for nested object
      if (propInfo.type === 'object' && propInfo.properties && Object.keys(propInfo.properties).length > 0) {
        const nestedName = toPascalCase(name) + toPascalCase(key);
        generateTypeScript(
          propInfo,
          nestedName,
          exported,
          includeExamples,
          generatedTypes,
          typeNames,
          nullableFields,
          unionFields,
          fieldPath
        );
        const tsType = nullable ? `${nestedName} | null` : nestedName;
        fields.push(`  ${key}${optional}: ${tsType};`);
      } else if (propInfo.type === 'array' && propInfo.arrayItemType?.type === 'object' && propInfo.arrayItemType.properties) {
        // Array of objects - generate separate interface for item type
        const itemName = toPascalCase(name) + toPascalCase(key) + 'Item';
        generateTypeScript(
          propInfo.arrayItemType,
          itemName,
          exported,
          includeExamples,
          generatedTypes,
          typeNames,
          nullableFields,
          unionFields,
          `${fieldPath}[]`
        );
        const tsType = nullable ? `${itemName}[] | null` : `${itemName}[]`;
        fields.push(`  ${key}${optional}: ${tsType};`);
      } else if (propInfo.type === 'union' && propInfo.unionTypes) {
        // Track union fields
        const unionTypeStrings = propInfo.unionTypes.map(t => typeInfoToTS(t));
        unionFields.push({ field: fieldPath, types: unionTypeStrings });

        let tsType = unionTypeStrings.join(' | ');
        if (nullable) {
          tsType = `${tsType} | null`;
        }
        fields.push(`  ${key}${optional}: ${tsType};`);
      } else {
        let tsType = typeInfoToTS(propInfo);
        if (nullable && !tsType.includes('null')) {
          tsType = `${tsType} | null`;
        }
        fields.push(`  ${key}${optional}: ${tsType};`);
      }
    }

    // Build JSDoc if examples enabled
    let jsdoc = '';
    if (includeExamples && info.exampleValue) {
      const exampleStr = JSON.stringify(info.exampleValue, null, 2)
        .split('\n')
        .map(line => ` * ${line}`)
        .join('\n');
      jsdoc = `/**\n * @example\n${exampleStr}\n */\n`;
    }

    const interfaceCode = `${jsdoc}${prefix}interface ${name} {\n${fields.join('\n')}\n}`;
    generatedTypes.push(interfaceCode);
    typeNames.push(name);
  } else {
    // For non-object types, generate a type alias
    const tsType = typeInfoToTS(info);
    const typeCode = `${prefix}type ${name} = ${tsType};`;
    generatedTypes.push(typeCode);
    typeNames.push(name);
  }
}

/**
 * Convert TypeInfo to TypeScript type string
 */
function typeInfoToTS(info: TypeInfo): string {
  switch (info.type) {
    case 'string':
      return 'string';
    case 'number':
      return 'number';
    case 'boolean':
      return 'boolean';
    case 'null':
      return 'null';
    case 'undefined':
      return 'undefined';
    case 'unknown':
      return 'unknown';
    case 'array':
      if (info.arrayItemType) {
        const itemType = typeInfoToTS(info.arrayItemType);
        // Wrap complex types in parentheses
        if (itemType.includes('|') || itemType.includes('&')) {
          return `(${itemType})[]`;
        }
        return `${itemType}[]`;
      }
      return 'unknown[]';
    case 'object':
      if (info.properties && Object.keys(info.properties).length > 0) {
        return generateInlineObject(info.properties);
      }
      return 'Record<string, unknown>';
    case 'union':
      if (info.unionTypes && info.unionTypes.length > 0) {
        return info.unionTypes.map(t => typeInfoToTS(t)).join(' | ');
      }
      return 'unknown';
    default:
      return 'unknown';
  }
}

/**
 * Generate inline object type (for simple nested objects)
 */
function generateInlineObject(properties: Record<string, TypeInfo>): string {
  const fields = Object.entries(properties).map(([key, propInfo]) => {
    const optional = propInfo.optional ? '?' : '';
    let tsType = typeInfoToTS(propInfo);
    if (propInfo.nullable && !tsType.includes('null')) {
      tsType = `${tsType} | null`;
    }
    return `${key}${optional}: ${tsType}`;
  });
  return `{ ${fields.join('; ')} }`;
}

/**
 * Convert string to PascalCase
 */
function toPascalCase(str: string): string {
  return str
    .replace(/[_-](.)/g, (_, c) => c.toUpperCase())
    .replace(/^./, c => c.toUpperCase())
    .replace(/[^a-zA-Z0-9]/g, '');
}

/**
 * Create an error response
 */
function errorResponse(message: string): ToolResponse {
  return {
    content: [{
      type: 'text',
      text: JSON.stringify({
        success: false,
        types: '',
        type_names: [],
        root_type: '',
        nullable_fields: [],
        union_fields: [],
        samples_analyzed: 0,
        source_info: '',
        error: message,
      }, null, 2),
    }],
    isError: true,
  };
}
