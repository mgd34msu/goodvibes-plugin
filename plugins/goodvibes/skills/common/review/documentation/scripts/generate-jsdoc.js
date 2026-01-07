#!/usr/bin/env node
/**
 * @module documentation/generate-jsdoc
 * @description Generates JSDoc stub comments for undocumented functions.
 * Parses function signatures and creates template documentation.
 */

const fs = require('fs');

/**
 * Parse function signature
 * @param {string} signature - Function signature line
 * @returns {object|null} Parsed function info
 */
function parseFunctionSignature(signature) {
  // Match various function patterns
  const patterns = [
    // export function name(params): return
    /export\s+(async\s+)?function\s+(\w+)\s*\(([^)]*)\)\s*(?::\s*([^{]+))?/,
    // export const name = (params): return =>
    /export\s+const\s+(\w+)\s*=\s*(async\s+)?\(([^)]*)\)\s*(?::\s*([^=]+))?\s*=>/,
    // export const name = function(params)
    /export\s+const\s+(\w+)\s*=\s*(async\s+)?function\s*\(([^)]*)\)/,
  ];

  for (const pattern of patterns) {
    const match = signature.match(pattern);
    if (match) {
      // Normalize match groups
      let name, isAsync, params, returnType;

      if (pattern.source.startsWith('export\\s+(async')) {
        isAsync = !!match[1];
        name = match[2];
        params = match[3];
        returnType = match[4];
      } else {
        name = match[1];
        isAsync = !!match[2];
        params = match[3];
        returnType = match[4];
      }

      return {
        name,
        isAsync,
        params: parseParams(params || ''),
        returnType: cleanReturnType(returnType),
      };
    }
  }

  return null;
}

/**
 * Parse parameter string into array
 * @param {string} paramsStr - Parameters string
 * @returns {Array<object>} Parsed parameters
 */
function parseParams(paramsStr) {
  if (!paramsStr.trim()) return [];

  const params = [];
  let depth = 0;
  let current = '';

  // Handle nested generics and object types
  for (const char of paramsStr) {
    if (char === '<' || char === '{' || char === '(') depth++;
    if (char === '>' || char === '}' || char === ')') depth--;

    if (char === ',' && depth === 0) {
      params.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }

  if (current.trim()) {
    params.push(current.trim());
  }

  return params.map(p => {
    const [nameWithOpt, type] = p.split(':').map(s => s.trim());
    const isOptional = nameWithOpt.endsWith('?');
    const name = nameWithOpt.replace('?', '').trim();

    return {
      name,
      type: type || 'unknown',
      isOptional,
    };
  });
}

/**
 * Clean return type string
 * @param {string} returnType - Raw return type
 * @returns {string} Cleaned return type
 */
function cleanReturnType(returnType) {
  if (!returnType) return 'void';
  return returnType.trim().replace(/^\s*:\s*/, '').replace(/\s*[{=].*$/, '');
}

/**
 * Generate JSDoc comment for function
 * @param {object} funcInfo - Parsed function info
 * @returns {string} Generated JSDoc
 */
function generateJsDoc(funcInfo) {
  const lines = ['/**'];

  // Description placeholder
  lines.push(` * ${generateDescription(funcInfo.name)}`);

  // Parameters
  for (const param of funcInfo.params) {
    const optionalTag = param.isOptional ? ' (optional)' : '';
    lines.push(` * @param ${param.name} - TODO: describe${optionalTag}`);
  }

  // Return type
  if (funcInfo.returnType && funcInfo.returnType !== 'void' && funcInfo.returnType !== 'Promise<void>') {
    lines.push(` * @returns TODO: describe return value`);
  }

  lines.push(' */');

  return lines.join('\n');
}

/**
 * Generate description from function name
 * @param {string} name - Function name
 * @returns {string} Generated description
 */
function generateDescription(name) {
  // Convert camelCase to words
  const words = name
    .replace(/([A-Z])/g, ' $1')
    .toLowerCase()
    .trim()
    .split(' ');

  // Capitalize first word
  words[0] = words[0].charAt(0).toUpperCase() + words[0].slice(1);

  // Add verb forms
  const verbs = {
    get: 'Gets',
    set: 'Sets',
    create: 'Creates',
    update: 'Updates',
    delete: 'Deletes',
    remove: 'Removes',
    add: 'Adds',
    fetch: 'Fetches',
    load: 'Loads',
    save: 'Saves',
    parse: 'Parses',
    format: 'Formats',
    validate: 'Validates',
    check: 'Checks',
    find: 'Finds',
    search: 'Searches',
    filter: 'Filters',
    sort: 'Sorts',
    map: 'Maps',
    reduce: 'Reduces',
    transform: 'Transforms',
    convert: 'Converts',
    calculate: 'Calculates',
    compute: 'Computes',
    process: 'Processes',
    handle: 'Handles',
    init: 'Initializes',
    initialize: 'Initializes',
    start: 'Starts',
    stop: 'Stops',
    enable: 'Enables',
    disable: 'Disables',
    register: 'Registers',
    unregister: 'Unregisters',
    subscribe: 'Subscribes',
    unsubscribe: 'Unsubscribes',
    is: 'Checks if',
    has: 'Checks if has',
    can: 'Checks if can',
    should: 'Checks if should',
  };

  if (verbs[words[0].toLowerCase()]) {
    words[0] = verbs[words[0].toLowerCase()];
  }

  return words.join(' ') + '.';
}

/**
 * Process a file and generate JSDoc stubs
 * @param {string} filePath - Path to file
 */
function processFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.split('\n');
  const suggestions = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Check for exported function without JSDoc
    if (line.includes('export') && (line.includes('function') || line.includes('=>') || line.includes('= ('))) {
      // Look back for JSDoc
      let hasJsDoc = false;
      for (let j = i - 1; j >= Math.max(0, i - 5); j--) {
        const prevLine = lines[j].trim();
        if (prevLine.endsWith('*/')) {
          hasJsDoc = true;
          break;
        }
        if (prevLine && !prevLine.startsWith('*') && !prevLine.startsWith('//') && prevLine !== '') {
          break;
        }
      }

      if (!hasJsDoc) {
        const funcInfo = parseFunctionSignature(line);
        if (funcInfo) {
          suggestions.push({
            line: i + 1,
            function: funcInfo.name,
            jsdoc: generateJsDoc(funcInfo),
          });
        }
      }
    }
  }

  return suggestions;
}

/**
 * Main entry point
 */
function main() {
  const filePath = process.argv[2];

  if (!filePath) {
    console.error('Usage: generate-jsdoc.js <file.ts>');
    process.exit(1);
  }

  if (!fs.existsSync(filePath)) {
    console.error(`Error: File not found: ${filePath}`);
    process.exit(1);
  }

  const suggestions = processFile(filePath);

  if (suggestions.length === 0) {
    console.log('All exported functions are documented.');
    return;
  }

  console.log(`Found ${suggestions.length} undocumented functions:\n`);

  suggestions.forEach((s, i) => {
    console.log(`--- ${i + 1}. ${s.function} (line ${s.line}) ---`);
    console.log(s.jsdoc);
    console.log('');
  });
}

main();
