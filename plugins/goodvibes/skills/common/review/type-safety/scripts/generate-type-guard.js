#!/usr/bin/env node
/**
 * @module type-safety/generate-type-guard
 * @description Generates type guard functions from TypeScript interfaces.
 * Parses interface definitions and creates runtime validation functions.
 */

const fs = require('fs');
const path = require('path');

/**
 * Parse a simple TypeScript interface definition
 * @param {string} content - File content
 * @param {string} interfaceName - Name of interface to parse
 * @returns {object|null} Parsed interface or null if not found
 */
function parseInterface(content, interfaceName) {
  // Match interface definition
  const interfaceRegex = new RegExp(
    `interface\\s+${interfaceName}\\s*\\{([^}]+)\\}`,
    's'
  );
  const match = content.match(interfaceRegex);

  if (!match) {
    return null;
  }

  const body = match[1];
  const properties = [];

  // Parse properties
  const propRegex = /(\w+)(\?)?\s*:\s*([^;]+);/g;
  let propMatch;

  while ((propMatch = propRegex.exec(body)) !== null) {
    properties.push({
      name: propMatch[1],
      optional: propMatch[2] === '?',
      type: propMatch[3].trim(),
    });
  }

  return {
    name: interfaceName,
    properties,
  };
}

/**
 * Generate type check expression for a TypeScript type
 * @param {string} varPath - Variable path (e.g., "obj.name")
 * @param {string} type - TypeScript type
 * @returns {string} JavaScript check expression
 */
function generateTypeCheck(varPath, type) {
  // Handle primitive types
  const primitiveMap = {
    string: `typeof ${varPath} === 'string'`,
    number: `typeof ${varPath} === 'number'`,
    boolean: `typeof ${varPath} === 'boolean'`,
    null: `${varPath} === null`,
    undefined: `${varPath} === undefined`,
  };

  if (primitiveMap[type]) {
    return primitiveMap[type];
  }

  // Handle arrays
  if (type.endsWith('[]')) {
    const elementType = type.slice(0, -2);
    if (primitiveMap[elementType]) {
      return `Array.isArray(${varPath}) && ${varPath}.every(item => ${primitiveMap[elementType].replace(varPath, 'item')})`;
    }
    return `Array.isArray(${varPath})`;
  }

  // Handle union types (simple)
  if (type.includes('|')) {
    const types = type.split('|').map(t => t.trim());
    const checks = types.map(t => {
      if (t.startsWith("'") || t.startsWith('"')) {
        // String literal
        return `${varPath} === ${t}`;
      }
      return generateTypeCheck(varPath, t);
    });
    return `(${checks.join(' || ')})`;
  }

  // Default: reference type (assume it has its own guard)
  return `is${type}(${varPath})`;
}

/**
 * Generate type guard function from parsed interface
 * @param {object} iface - Parsed interface
 * @returns {string} Type guard function code
 */
function generateTypeGuard(iface) {
  const guardName = `is${iface.name}`;
  const checks = [];

  // Basic object check
  checks.push(`typeof value === 'object'`);
  checks.push(`value !== null`);

  // Property checks
  for (const prop of iface.properties) {
    if (!prop.optional) {
      checks.push(`'${prop.name}' in value`);
    }

    const varPath = `(value as ${iface.name}).${prop.name}`;

    if (prop.optional) {
      checks.push(
        `(${varPath} === undefined || ${generateTypeCheck(varPath, prop.type)})`
      );
    } else {
      checks.push(generateTypeCheck(varPath, prop.type));
    }
  }

  const code = `/**
 * Type guard for ${iface.name}
 * @param value - Value to check
 * @returns True if value is ${iface.name}
 */
function ${guardName}(value: unknown): value is ${iface.name} {
  return (
    ${checks.join(' &&\n    ')}
  );
}`;

  return code;
}

/**
 * Main entry point
 */
function main() {
  const args = process.argv.slice(2);
  let interfaceName = '';
  let filePath = '';

  // Parse arguments
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--interface' || args[i] === '-i') {
      interfaceName = args[++i];
    } else if (args[i] === '--file' || args[i] === '-f') {
      filePath = args[++i];
    }
  }

  if (!interfaceName || !filePath) {
    console.error('Usage: generate-type-guard.js --interface <name> --file <path>');
    console.error('');
    console.error('Options:');
    console.error('  --interface, -i  Name of interface to generate guard for');
    console.error('  --file, -f       Path to TypeScript file containing interface');
    process.exit(1);
  }

  if (!fs.existsSync(filePath)) {
    console.error(`Error: File not found: ${filePath}`);
    process.exit(1);
  }

  const content = fs.readFileSync(filePath, 'utf-8');
  const iface = parseInterface(content, interfaceName);

  if (!iface) {
    console.error(`Error: Interface '${interfaceName}' not found in ${filePath}`);
    process.exit(1);
  }

  const guard = generateTypeGuard(iface);
  console.log(guard);
}

main();
