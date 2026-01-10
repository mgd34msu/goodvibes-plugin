/**
 * Fixture generation handlers
 *
 * Provides test fixture generation tools:
 * - generate_fixture: Generate test fixtures from Prisma/TypeScript schemas
 *
 * @module handlers/fixtures
 */

// Generate Fixture
export { handleGenerateFixture, resetIdCounter } from './generate-fixture.js';
export type { GenerateFixtureArgs, GenerateFixtureResult } from './generate-fixture.js';
