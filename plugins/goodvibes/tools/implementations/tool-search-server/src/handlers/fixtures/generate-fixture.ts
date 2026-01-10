/**
 * Generate Fixture Handler
 *
 * Generates test fixtures from Prisma/TypeScript schemas with smart data generation.
 * Supports optional @faker-js/faker integration for realistic data.
 *
 * Features:
 * - Auto-detect Prisma schema location
 * - Parse model fields, types, and relations
 * - Generate fixtures with overrides
 * - Multiple output formats (JSON, TypeScript, Prisma seed)
 * - Scenario-based data generation (empty, minimal, realistic, edge_cases)
 *
 * @module handlers/fixtures/generate-fixture
 */

import * as path from 'path';
import * as fs from 'fs';

import { PROJECT_ROOT } from '../../config.js';
import {
  createSuccessResponse,
  createErrorResponse,
  resolveFilePath,
  type ToolResponse,
} from '../lsp/utils.js';

// =============================================================================
// Types
// =============================================================================

/**
 * Arguments for the generate_fixture tool.
 */
export interface GenerateFixtureArgs {
  /** Prisma model name or TypeScript type name */
  model: string;
  /** Path to schema file (default: auto-detect prisma/schema.prisma) */
  schema_path?: string;
  /** Number of fixtures to generate (default: 1) */
  count?: number;
  /** Specific values to use as overrides */
  overrides?: Record<string, unknown>;
  /** Include related models in fixtures */
  with_relations?: string[];
  /** Data style: empty, minimal, realistic, edge_cases */
  scenario?: 'empty' | 'minimal' | 'realistic' | 'edge_cases';
  /** Output format: json, typescript, prisma_seed */
  output_format?: 'json' | 'typescript' | 'prisma_seed';
}

/**
 * Result of the generate_fixture tool.
 */
export interface GenerateFixtureResult {
  success: boolean;
  model: string;
  count: number;
  fixtures: unknown[];
  code?: string;
  related_fixtures?: Record<string, unknown[]>;
  warnings: string[];
}

/**
 * Parsed Prisma model field.
 */
interface PrismaField {
  name: string;
  type: string;
  isOptional: boolean;
  isArray: boolean;
  isRelation: boolean;
  isId: boolean;
  isUnique: boolean;
  hasDefault: boolean;
  defaultValue?: string;
  relationTarget?: string;
}

/**
 * Parsed Prisma model.
 */
interface PrismaModel {
  name: string;
  fields: PrismaField[];
}

/**
 * Faker module type (optional dependency).
 */
interface FakerModule {
  faker: {
    string: { uuid: () => string; alphanumeric: (len: number) => string };
    internet: { email: () => string; url: () => string; userName: () => string; password: () => string };
    person: { firstName: () => string; lastName: () => string; fullName: () => string };
    phone: { number: () => string };
    location: { streetAddress: () => string; city: () => string; country: () => string; zipCode: () => string };
    lorem: { paragraph: () => string; sentence: () => string; words: (count: number) => string; text: () => string };
    image: { avatar: () => string; url: () => string };
    commerce: { price: () => string };
    number: { int: (opts?: { min?: number; max?: number }) => number; float: (opts?: { min?: number; max?: number; fractionDigits?: number }) => number };
    date: { past: () => Date; future: () => Date; recent: () => Date };
    datatype: { boolean: () => boolean };
    company: { name: () => string };
    finance: { amount: () => string };
    helpers: { arrayElement: <T>(arr: T[]) => T };
  };
}

// =============================================================================
// Schema Detection
// =============================================================================

/**
 * Common paths where Prisma schema might be located.
 */
const PRISMA_SCHEMA_PATHS = [
  'prisma/schema.prisma',
  'schema.prisma',
  'src/prisma/schema.prisma',
  'db/schema.prisma',
];

/**
 * Find Prisma schema file in the project.
 */
async function findPrismaSchema(projectRoot: string): Promise<string | null> {
  for (const schemaPath of PRISMA_SCHEMA_PATHS) {
    const fullPath = path.join(projectRoot, schemaPath);
    try {
      await fs.promises.access(fullPath, fs.constants.R_OK);
      return fullPath;
    } catch {
      // Continue to next path
    }
  }
  return null;
}

// =============================================================================
// Prisma Schema Parsing
// =============================================================================

/** Prisma scalar types */
const PRISMA_SCALARS = new Set([
  'String',
  'Int',
  'Float',
  'Boolean',
  'DateTime',
  'Json',
  'Bytes',
  'BigInt',
  'Decimal',
]);

/**
 * Parse a Prisma schema file and extract models.
 */
function parsePrismaSchemaContent(content: string): Map<string, PrismaModel> {
  const models = new Map<string, PrismaModel>();
  const modelRegex = /model\s+(\w+)\s*\{([^}]+)\}/g;

  let match;
  while ((match = modelRegex.exec(content)) !== null) {
    const modelName = match[1];
    const modelBody = match[2];
    const fields: PrismaField[] = [];

    for (const line of modelBody.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('//') || trimmed.startsWith('@@')) {
        continue;
      }

      // Parse field: name Type? []? @attributes
      const fieldMatch = /^(\w+)\s+(\w+)(\?)?(\[\])?(.*)$/.exec(trimmed);
      if (fieldMatch) {
        const [, fieldName, fieldType, nullable, isArray, attributes] = fieldMatch;

        const isRelation = !PRISMA_SCALARS.has(fieldType);

        fields.push({
          name: fieldName,
          type: fieldType,
          isOptional: nullable === '?',
          isArray: isArray === '[]',
          isRelation,
          isId: attributes.includes('@id'),
          isUnique: attributes.includes('@unique'),
          hasDefault: attributes.includes('@default'),
          defaultValue: extractDefaultValue(attributes),
          relationTarget: isRelation ? fieldType : undefined,
        });
      }
    }

    models.set(modelName, { name: modelName, fields });
  }

  return models;
}

/**
 * Extract default value from Prisma field attributes.
 */
function extractDefaultValue(attributes: string): string | undefined {
  const match = /@default\(([^)]+)\)/.exec(attributes);
  if (match) {
    return match[1];
  }
  return undefined;
}

// =============================================================================
// Faker Integration (Optional)
// =============================================================================

/** Cached faker module */
let fakerModule: FakerModule | null = null;
let fakerLoaded = false;

/**
 * Try to load @faker-js/faker dynamically.
 */
async function loadFaker(): Promise<FakerModule | null> {
  if (fakerLoaded) {
    return fakerModule;
  }

  fakerLoaded = true;

  try {
    // @ts-expect-error - @faker-js/faker is an optional dependency
    const module = await import('@faker-js/faker');
    fakerModule = module as unknown as FakerModule;
    return fakerModule;
  } catch {
    // @faker-js/faker not installed, use fallback
    return null;
  }
}

// =============================================================================
// Value Generation
// =============================================================================

/** Counter for generating unique IDs */
let idCounter = 0;

/**
 * Generate a unique ID.
 */
function generateUniqueId(): string {
  idCounter++;
  return `fixture_${idCounter}_${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Reset the ID counter (for testing).
 */
export function resetIdCounter(): void {
  idCounter = 0;
}

/**
 * Generate a value for a field based on its name and type.
 * Uses faker if available, otherwise falls back to simple values.
 */
async function generateValue(
  fieldName: string,
  fieldType: string,
  scenario: string,
  faker: FakerModule | null
): Promise<unknown> {
  const name = fieldName.toLowerCase();

  // Handle edge cases scenario
  if (scenario === 'edge_cases') {
    return generateEdgeCaseValue(fieldType, name);
  }

  // Handle empty scenario - return minimal valid values
  if (scenario === 'empty') {
    return generateEmptyValue(fieldType);
  }

  // Use faker if available for realistic data
  if (faker && (scenario === 'realistic' || scenario === 'minimal')) {
    return generateFakerValue(fieldName, fieldType, faker);
  }

  // Fallback to simple generated values
  return generateSimpleValue(fieldName, fieldType);
}

/**
 * Generate an edge case value for testing boundaries.
 */
function generateEdgeCaseValue(fieldType: string, fieldName: string): unknown {
  switch (fieldType) {
    case 'String':
      // Rotate through edge case strings
      const edgeCases = [
        '', // Empty string
        ' ', // Whitespace
        'a'.repeat(255), // Long string
        '<script>alert("xss")</script>', // XSS attempt
        "O'Brien", // Special chars
        'Test\nNewline', // Newline
        '\u0000\u0001\u0002', // Control chars
        '           ', // Trimming test
      ];
      return edgeCases[Math.floor(Math.random() * edgeCases.length)];

    case 'Int':
      const intEdgeCases = [0, -1, 1, Number.MAX_SAFE_INTEGER, Number.MIN_SAFE_INTEGER, -0];
      return intEdgeCases[Math.floor(Math.random() * intEdgeCases.length)];

    case 'Float':
    case 'Decimal':
      const floatEdgeCases = [0.0, -0.0, 0.1, -0.1, 0.123456789, Number.MAX_VALUE, Number.MIN_VALUE];
      return floatEdgeCases[Math.floor(Math.random() * floatEdgeCases.length)];

    case 'Boolean':
      return Math.random() > 0.5;

    case 'DateTime':
      const dateEdgeCases = [
        new Date(0).toISOString(), // Unix epoch
        new Date('1970-01-01').toISOString(),
        new Date('2099-12-31T23:59:59.999Z').toISOString(), // Far future
        new Date().toISOString(), // Now
      ];
      return dateEdgeCases[Math.floor(Math.random() * dateEdgeCases.length)];

    case 'Json':
      const jsonEdgeCases = [
        {},
        [],
        null,
        { deeply: { nested: { object: { value: true } } } },
        Array(100).fill({ item: true }),
      ];
      return jsonEdgeCases[Math.floor(Math.random() * jsonEdgeCases.length)];

    case 'BigInt':
      return '9007199254740991'; // MAX_SAFE_INTEGER as string

    case 'Bytes':
      return Buffer.from('edge_case_bytes').toString('base64');

    default:
      return null;
  }
}

/**
 * Generate an empty/minimal value.
 */
function generateEmptyValue(fieldType: string): unknown {
  switch (fieldType) {
    case 'String':
      return '';
    case 'Int':
    case 'BigInt':
      return 0;
    case 'Float':
    case 'Decimal':
      return 0.0;
    case 'Boolean':
      return false;
    case 'DateTime':
      return new Date().toISOString();
    case 'Json':
      return {};
    case 'Bytes':
      return '';
    default:
      return null;
  }
}

/**
 * Generate a value using faker for realistic data.
 */
function generateFakerValue(
  fieldName: string,
  fieldType: string,
  fakerMod: FakerModule
): unknown {
  const faker = fakerMod.faker;
  const name = fieldName.toLowerCase();

  // Smart field name detection for realistic values
  if (fieldType === 'String') {
    // Email fields
    if (name.includes('email')) return faker.internet.email();

    // Name fields
    if (name.includes('firstname') || name === 'first_name') return faker.person.firstName();
    if (name.includes('lastname') || name === 'last_name') return faker.person.lastName();
    if (name.includes('name') && !name.includes('user')) return faker.person.fullName();
    if (name.includes('username') || name === 'user_name') return faker.internet.userName();

    // Contact fields
    if (name.includes('phone') || name.includes('mobile') || name.includes('tel')) {
      return faker.phone.number();
    }

    // Address fields
    if (name.includes('address') || name.includes('street')) return faker.location.streetAddress();
    if (name.includes('city')) return faker.location.city();
    if (name.includes('country')) return faker.location.country();
    if (name.includes('zip') || name.includes('postal')) return faker.location.zipCode();

    // URL fields
    if (name.includes('url') || name.includes('website') || name.includes('link')) {
      return faker.internet.url();
    }
    if (name.includes('avatar') || name.includes('image') || name.includes('photo')) {
      return faker.image.avatar();
    }

    // Text content
    if (name.includes('description') || name.includes('bio') || name.includes('about')) {
      return faker.lorem.paragraph();
    }
    if (name.includes('title') || name.includes('headline') || name.includes('subject')) {
      return faker.lorem.sentence();
    }
    if (name.includes('content') || name.includes('body') || name.includes('text')) {
      return faker.lorem.text();
    }

    // Identifiers
    if (name.includes('id') || name.includes('uuid') || name.includes('guid')) {
      return faker.string.uuid();
    }
    if (name.includes('slug') || name.includes('code') || name.includes('key')) {
      return faker.string.alphanumeric(12);
    }

    // Auth fields
    if (name.includes('password') || name.includes('secret') || name.includes('token')) {
      return faker.internet.password();
    }

    // Business fields
    if (name.includes('company') || name.includes('organization')) {
      return faker.company.name();
    }

    // Default string
    return faker.lorem.words(3);
  }

  // Numeric fields
  if (fieldType === 'Int') {
    if (name.includes('age')) return faker.number.int({ min: 18, max: 100 });
    if (name.includes('count') || name.includes('quantity')) return faker.number.int({ min: 0, max: 100 });
    if (name.includes('year')) return faker.number.int({ min: 1900, max: 2030 });
    if (name.includes('order') || name.includes('position') || name.includes('rank')) {
      return faker.number.int({ min: 1, max: 1000 });
    }
    return faker.number.int({ min: 1, max: 10000 });
  }

  if (fieldType === 'Float' || fieldType === 'Decimal') {
    if (name.includes('price') || name.includes('cost') || name.includes('amount')) {
      return parseFloat(faker.commerce.price());
    }
    if (name.includes('rating') || name.includes('score')) {
      return faker.number.float({ min: 0, max: 5, fractionDigits: 1 });
    }
    if (name.includes('percent') || name.includes('rate')) {
      return faker.number.float({ min: 0, max: 100, fractionDigits: 2 });
    }
    return faker.number.float({ min: 0, max: 1000, fractionDigits: 2 });
  }

  if (fieldType === 'Boolean') {
    // Common boolean field patterns
    if (name.includes('active') || name.includes('enabled') || name.includes('verified')) {
      return true;
    }
    if (name.includes('deleted') || name.includes('archived') || name.includes('blocked')) {
      return false;
    }
    return faker.datatype.boolean();
  }

  if (fieldType === 'DateTime') {
    if (name.includes('created') || name.includes('registered')) return faker.date.past().toISOString();
    if (name.includes('updated') || name.includes('modified')) return faker.date.recent().toISOString();
    if (name.includes('expired') || name.includes('deadline') || name.includes('due')) {
      return faker.date.future().toISOString();
    }
    if (name.includes('birth') || name.includes('dob')) {
      return faker.date.past().toISOString();
    }
    return faker.date.recent().toISOString();
  }

  if (fieldType === 'Json') {
    return { generated: true, timestamp: new Date().toISOString() };
  }

  if (fieldType === 'BigInt') {
    return faker.number.int({ min: 1, max: 1000000 }).toString();
  }

  if (fieldType === 'Bytes') {
    return Buffer.from(faker.string.alphanumeric(32)).toString('base64');
  }

  return null;
}

/**
 * Generate a simple value without faker.
 */
function generateSimpleValue(fieldName: string, fieldType: string): unknown {
  const id = generateUniqueId();

  switch (fieldType) {
    case 'String':
      return `${fieldName}_${id}`;

    case 'Int':
      return Math.floor(Math.random() * 1000) + 1;

    case 'Float':
    case 'Decimal':
      return Math.round(Math.random() * 10000) / 100;

    case 'Boolean':
      return Math.random() > 0.5;

    case 'DateTime':
      return new Date().toISOString();

    case 'Json':
      return { id, fieldName };

    case 'BigInt':
      return Math.floor(Math.random() * 1000000).toString();

    case 'Bytes':
      return Buffer.from(id).toString('base64');

    default:
      return null;
  }
}

// =============================================================================
// Fixture Generation
// =============================================================================

/**
 * Generate fixtures for a model.
 */
async function generateFixtures(
  model: PrismaModel,
  count: number,
  scenario: string,
  overrides: Record<string, unknown>,
  faker: FakerModule | null
): Promise<unknown[]> {
  const fixtures: unknown[] = [];

  for (let i = 0; i < count; i++) {
    const fixture: Record<string, unknown> = {};

    for (const field of model.fields) {
      // Skip relation fields (handled separately if with_relations is specified)
      if (field.isRelation) {
        continue;
      }

      // Check for override value
      if (overrides && field.name in overrides) {
        fixture[field.name] = overrides[field.name];
        continue;
      }

      // Handle optional fields based on scenario
      if (field.isOptional) {
        if (scenario === 'empty' || scenario === 'minimal') {
          continue; // Skip optional fields in minimal scenarios
        }
      }

      // Handle fields with defaults
      if (field.hasDefault && scenario !== 'realistic' && scenario !== 'edge_cases') {
        // Let the database handle defaults
        if (field.defaultValue === 'autoincrement()' || field.defaultValue === 'cuid()' || field.defaultValue === 'uuid()') {
          continue;
        }
        // Use parsed default value for simple defaults
        if (field.defaultValue === 'true') {
          fixture[field.name] = true;
          continue;
        }
        if (field.defaultValue === 'false') {
          fixture[field.name] = false;
          continue;
        }
        if (field.defaultValue === 'now()') {
          fixture[field.name] = new Date().toISOString();
          continue;
        }
      }

      // Skip auto-generated ID fields in non-realistic scenarios
      if (field.isId && field.hasDefault && scenario !== 'realistic' && scenario !== 'edge_cases') {
        continue;
      }

      // Generate value
      fixture[field.name] = await generateValue(field.name, field.type, scenario, faker);
    }

    fixtures.push(fixture);
  }

  return fixtures;
}

/**
 * Generate related fixtures for specified relations.
 */
async function generateRelatedFixtures(
  model: PrismaModel,
  allModels: Map<string, PrismaModel>,
  relations: string[],
  count: number,
  scenario: string,
  faker: FakerModule | null
): Promise<Record<string, unknown[]>> {
  const relatedFixtures: Record<string, unknown[]> = {};

  for (const relationName of relations) {
    // Find the relation field
    const relationField = model.fields.find(
      (f) => f.name === relationName || f.relationTarget === relationName
    );

    if (!relationField || !relationField.relationTarget) {
      continue;
    }

    // Find the related model
    const relatedModel = allModels.get(relationField.relationTarget);
    if (!relatedModel) {
      continue;
    }

    // Generate fixtures for related model
    const fixtures = await generateFixtures(relatedModel, count, scenario, {}, faker);
    relatedFixtures[relationField.relationTarget] = fixtures;
  }

  return relatedFixtures;
}

// =============================================================================
// Output Formatting
// =============================================================================

/**
 * Format fixtures as TypeScript code.
 */
function formatAsTypeScript(model: string, fixtures: unknown[]): string {
  const typeName = model;
  const varName = model.charAt(0).toLowerCase() + model.slice(1) + 'Fixtures';

  const lines = [
    `// Generated fixtures for ${model}`,
    `// Generated at: ${new Date().toISOString()}`,
    '',
    `export const ${varName}: ${typeName}[] = ${JSON.stringify(fixtures, null, 2)};`,
  ];

  return lines.join('\n');
}

/**
 * Format fixtures as Prisma seed script.
 */
function formatAsPrismaSeed(model: string, fixtures: unknown[]): string {
  const lines = [
    `// Prisma seed script for ${model}`,
    `// Generated at: ${new Date().toISOString()}`,
    '',
    `import { PrismaClient } from '@prisma/client';`,
    '',
    `const prisma = new PrismaClient();`,
    '',
    `async function seed${model}() {`,
    `  const fixtures = ${JSON.stringify(fixtures, null, 2)};`,
    '',
    `  for (const data of fixtures) {`,
    `    await prisma.${model.charAt(0).toLowerCase() + model.slice(1)}.create({`,
    `      data,`,
    `    });`,
    `  }`,
    '',
    `  console.log(\`Created \${fixtures.length} ${model} fixtures\`);`,
    `}`,
    '',
    `seed${model}()`,
    `  .catch((e) => {`,
    `    console.error(e);`,
    `    process.exit(1);`,
    `  })`,
    `  .finally(async () => {`,
    `    await prisma.$disconnect();`,
    `  });`,
  ];

  return lines.join('\n');
}

// =============================================================================
// Handler
// =============================================================================

/**
 * Handle the generate_fixture MCP tool call.
 *
 * Generates test fixtures from Prisma schemas with smart data generation.
 *
 * @param args - The generate_fixture tool arguments
 * @returns MCP tool response with generated fixtures
 */
export async function handleGenerateFixture(args: GenerateFixtureArgs): Promise<ToolResponse> {
  const warnings: string[] = [];

  try {
    // Validate required arguments
    if (!args.model) {
      return createErrorResponse('Missing required argument: model');
    }

    // Normalize arguments
    const count = Math.min(Math.max(args.count ?? 1, 1), 100); // Limit to 1-100
    const scenario = args.scenario ?? 'realistic';
    const outputFormat = args.output_format ?? 'json';
    const overrides = args.overrides ?? {};
    const withRelations = args.with_relations ?? [];

    // Find Prisma schema
    let schemaPath: string;
    if (args.schema_path) {
      schemaPath = resolveFilePath(args.schema_path, PROJECT_ROOT);
    } else {
      const foundPath = await findPrismaSchema(PROJECT_ROOT);
      if (!foundPath) {
        return createErrorResponse(
          'Prisma schema not found. Searched: ' + PRISMA_SCHEMA_PATHS.join(', ') +
          '. Use schema_path to specify the location.'
        );
      }
      schemaPath = foundPath;
    }

    // Read and parse schema
    let schemaContent: string;
    try {
      schemaContent = await fs.promises.readFile(schemaPath, 'utf-8');
    } catch (error) {
      return createErrorResponse(`Failed to read schema file: ${schemaPath}`);
    }

    const models = parsePrismaSchemaContent(schemaContent);

    // Find the requested model
    const model = models.get(args.model);
    if (!model) {
      const availableModels = Array.from(models.keys()).join(', ');
      return createErrorResponse(
        `Model "${args.model}" not found in schema. Available models: ${availableModels}`
      );
    }

    // Load faker (optional)
    const faker = await loadFaker();
    if (!faker && scenario === 'realistic') {
      warnings.push(
        '@faker-js/faker not installed. Using simple generated values. ' +
        'Install with: npm install -D @faker-js/faker'
      );
    }

    // Generate fixtures
    const fixtures = await generateFixtures(model, count, scenario, overrides, faker);

    // Generate related fixtures if requested
    let relatedFixtures: Record<string, unknown[]> | undefined;
    if (withRelations.length > 0) {
      relatedFixtures = await generateRelatedFixtures(
        model,
        models,
        withRelations,
        count,
        scenario,
        faker
      );

      // Warn about any relations that weren't found
      for (const relation of withRelations) {
        const found = model.fields.some(
          (f) => f.name === relation || f.relationTarget === relation
        );
        if (!found) {
          warnings.push(`Relation "${relation}" not found in model "${args.model}"`);
        }
      }
    }

    // Format output
    let code: string | undefined;
    if (outputFormat === 'typescript') {
      code = formatAsTypeScript(args.model, fixtures);
    } else if (outputFormat === 'prisma_seed') {
      code = formatAsPrismaSeed(args.model, fixtures);
    }

    const result: GenerateFixtureResult = {
      success: true,
      model: args.model,
      count: fixtures.length,
      fixtures,
      code,
      related_fixtures: relatedFixtures,
      warnings,
    };

    return createSuccessResponse(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return createErrorResponse(`Failed to generate fixtures: ${message}`);
  }
}
