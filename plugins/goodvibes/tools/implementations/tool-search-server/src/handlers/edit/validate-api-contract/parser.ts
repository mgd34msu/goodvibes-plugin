/**
 * OpenAPI specification parsing utilities
 *
 * Handles parsing of OpenAPI specs in JSON and YAML formats,
 * with dynamic YAML loader support.
 *
 * @module handlers/edit/validate-api-contract/parser
 */

import * as path from 'path';
import type { OpenAPISpec } from './types.js';

/**
 * Try to dynamically import js-yaml for YAML parsing
 */
export async function tryLoadYaml(): Promise<{ load: (content: string) => unknown } | null> {
  try {
    const yaml = await import('js-yaml');
    return yaml;
  } catch {
    return null;
  }
}

/**
 * Parse OpenAPI spec from file content
 *
 * Supports JSON and YAML formats. For YAML files, requires js-yaml
 * to be installed. Will attempt to parse as JSON first, then YAML
 * if the file extension is not recognized.
 *
 * @param content - Raw file content
 * @param filePath - Path to the spec file (used for extension detection)
 * @returns Parsed OpenAPI specification
 * @throws Error if parsing fails or YAML support is missing
 */
export async function parseOpenAPISpec(content: string, filePath: string): Promise<OpenAPISpec> {
  const ext = path.extname(filePath).toLowerCase();

  if (ext === '.json') {
    return JSON.parse(content) as OpenAPISpec;
  }

  if (ext === '.yaml' || ext === '.yml') {
    const yaml = await tryLoadYaml();
    if (!yaml) {
      throw new Error(
        'YAML parsing requires js-yaml. Install it with: npm install js-yaml\n' +
        'Alternatively, convert your spec to JSON format.'
      );
    }
    return yaml.load(content) as OpenAPISpec;
  }

  // Try JSON first, then YAML
  try {
    return JSON.parse(content) as OpenAPISpec;
  } catch {
    const yaml = await tryLoadYaml();
    if (yaml) {
      return yaml.load(content) as OpenAPISpec;
    }
    throw new Error(
      `Unable to parse spec file. Extension "${ext}" not recognized and content is not valid JSON.`
    );
  }
}
