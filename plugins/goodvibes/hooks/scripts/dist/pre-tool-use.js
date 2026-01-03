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
import { respond, readHookInput, allowTool, blockTool, fileExists, debug, logError, } from './shared.js';
function validateDetectStack(input) {
    if (!fileExists('package.json')) {
        respond(blockTool('PreToolUse', 'No package.json found in project root. Cannot detect stack.'), true);
        return;
    }
    respond(allowTool('PreToolUse'));
}
function validateGetSchema(input) {
    // Check for common schema files
    const schemaFiles = [
        'prisma/schema.prisma',
        'drizzle.config.ts',
        'drizzle/schema.ts',
    ];
    const found = schemaFiles.some(f => fileExists(f));
    if (!found) {
        // Allow but warn
        respond(allowTool('PreToolUse', 'No schema file detected. get_schema may fail.'));
        return;
    }
    respond(allowTool('PreToolUse'));
}
function validateRunSmokeTest(input) {
    // Check if package.json exists
    if (!fileExists('package.json')) {
        respond(blockTool('PreToolUse', 'No package.json found. Cannot run smoke tests.'), true);
        return;
    }
    // Check for package manager
    const hasPnpm = fileExists('pnpm-lock.yaml');
    const hasYarn = fileExists('yarn.lock');
    const hasNpm = fileExists('package-lock.json');
    if (!hasPnpm && !hasYarn && !hasNpm) {
        respond(allowTool('PreToolUse', 'No lockfile detected. Install dependencies first.'));
        return;
    }
    respond(allowTool('PreToolUse'));
}
function validateCheckTypes(input) {
    // Check for TypeScript config
    if (!fileExists('tsconfig.json')) {
        respond(blockTool('PreToolUse', 'No tsconfig.json found. TypeScript not configured.'), true);
        return;
    }
    respond(allowTool('PreToolUse'));
}
function validateImplementation(input) {
    // Just allow and let the tool handle validation
    respond(allowTool('PreToolUse'));
}
async function main() {
    try {
        const input = await readHookInput();
        debug('PreToolUse hook received input', { tool_name: input.tool_name, cwd: input.cwd });
        // Extract tool name from the full MCP tool name (e.g., "mcp__goodvibes-tools__detect_stack")
        const toolName = input.tool_name?.split('__').pop() || '';
        debug(`Extracted tool name: ${toolName}`);
        switch (toolName) {
            case 'detect_stack':
                validateDetectStack(input);
                break;
            case 'get_schema':
                validateGetSchema(input);
                break;
            case 'run_smoke_test':
                validateRunSmokeTest(input);
                break;
            case 'check_types':
                validateCheckTypes(input);
                break;
            case 'validate_implementation':
                validateImplementation(input);
                break;
            default:
                debug(`Unknown tool '${toolName}', allowing by default`);
                respond(allowTool('PreToolUse'));
        }
    }
    catch (error) {
        logError('PreToolUse main', error);
        // On error, allow the tool to proceed but log the issue
        respond(allowTool('PreToolUse', `Hook error: ${error instanceof Error ? error.message : String(error)}`));
    }
}
main();
