/**
 * Pre-Tool-Use Hook (GoodVibes)
 *
 * Validates prerequisites before tool execution:
 * - detect_stack: Check project has package.json
 * - get_schema: Check schema file exists
 * - run_smoke_test: Check npm/pnpm available
 * - check_types: Check TypeScript available
 * - validate_implementation: Check files exist
 */
import { respond, fileExists, } from './shared.js';
const toolName = process.argv[2];
function validateDetectStack() {
    if (!fileExists('package.json')) {
        respond({
            decision: 'block',
            reason: 'No package.json found in project root. Cannot detect stack.',
        });
        return;
    }
    respond({ decision: 'allow' });
}
function validateGetSchema() {
    // Check for common schema files
    const schemaFiles = [
        'prisma/schema.prisma',
        'drizzle.config.ts',
        'drizzle/schema.ts',
    ];
    const found = schemaFiles.some(f => fileExists(f));
    if (!found) {
        respond({
            decision: 'allow', // Allow but warn
            systemMessage: 'No schema file detected. get_schema may fail.',
        });
        return;
    }
    respond({ decision: 'allow' });
}
function validateRunSmokeTest() {
    // Check if package.json exists
    if (!fileExists('package.json')) {
        respond({
            decision: 'block',
            reason: 'No package.json found. Cannot run smoke tests.',
        });
        return;
    }
    // Check for package manager
    const hasPnpm = fileExists('pnpm-lock.yaml');
    const hasYarn = fileExists('yarn.lock');
    const hasNpm = fileExists('package-lock.json');
    if (!hasPnpm && !hasYarn && !hasNpm) {
        respond({
            decision: 'allow',
            systemMessage: 'No lockfile detected. Install dependencies first.',
        });
        return;
    }
    respond({ decision: 'allow' });
}
function validateCheckTypes() {
    // Check for TypeScript config
    if (!fileExists('tsconfig.json')) {
        respond({
            decision: 'block',
            reason: 'No tsconfig.json found. TypeScript not configured.',
        });
        return;
    }
    respond({ decision: 'allow' });
}
function validateImplementation() {
    // Read tool input from stdin if available
    // For now, just allow and let the tool handle validation
    respond({ decision: 'allow' });
}
function main() {
    try {
        switch (toolName) {
            case 'detect_stack':
                validateDetectStack();
                break;
            case 'get_schema':
                validateGetSchema();
                break;
            case 'run_smoke_test':
                validateRunSmokeTest();
                break;
            case 'check_types':
                validateCheckTypes();
                break;
            case 'validate_implementation':
                validateImplementation();
                break;
            default:
                respond({ decision: 'allow' });
        }
    }
    catch (error) {
        // On error, allow the tool to proceed
        respond({ decision: 'allow' });
    }
}
main();
