/**
 * Post-Tool-Use Hook (GoodVibes)
 *
 * Processes tool results:
 * - detect_stack: Cache results, suggest running recommend_skills
 * - search_*: Log queries for analytics
 * - validate_implementation: Track issues found
 * - run_smoke_test: Summarize failures
 * - check_types: Track type errors
 */
import * as fs from 'fs';
import * as path from 'path';
import { respond, loadAnalytics, saveAnalytics, logToolUsage, ensureCacheDir, CACHE_DIR, } from './shared.js';
const toolName = process.argv[2];
// Read tool result from stdin
let toolResult = '';
process.stdin.setEncoding('utf8');
async function readStdin() {
    return new Promise((resolve) => {
        let data = '';
        // Set a short timeout for stdin
        const timeout = setTimeout(() => {
            resolve(data);
        }, 100);
        process.stdin.on('data', (chunk) => {
            data += chunk;
        });
        process.stdin.on('end', () => {
            clearTimeout(timeout);
            resolve(data);
        });
        // If stdin is not being piped, resolve immediately
        if (process.stdin.isTTY) {
            clearTimeout(timeout);
            resolve('');
        }
    });
}
function handleDetectStack(result) {
    try {
        // Cache the stack detection result
        ensureCacheDir();
        const cacheFile = path.join(CACHE_DIR, 'detected-stack.json');
        if (result) {
            fs.writeFileSync(cacheFile, result);
        }
        // Log usage
        logToolUsage({
            tool: 'detect_stack',
            timestamp: new Date().toISOString(),
            success: true,
        });
        respond({
            continue: true,
            systemMessage: 'Stack detected. Consider using recommend_skills for relevant skill suggestions.',
        });
    }
    catch {
        respond({ continue: true });
    }
}
function handleRecommendSkills(result) {
    try {
        const analytics = loadAnalytics();
        if (analytics && result) {
            // Try to parse and track recommended skills
            try {
                const parsed = JSON.parse(result);
                if (parsed.recommendations) {
                    const skillPaths = parsed.recommendations.map((r) => r.path);
                    analytics.skills_recommended.push(...skillPaths);
                    saveAnalytics(analytics);
                }
            }
            catch {
                // Ignore parse errors
            }
        }
        logToolUsage({
            tool: 'recommend_skills',
            timestamp: new Date().toISOString(),
            success: true,
        });
        respond({ continue: true });
    }
    catch {
        respond({ continue: true });
    }
}
function handleSearch(result) {
    logToolUsage({
        tool: 'search',
        timestamp: new Date().toISOString(),
        success: true,
    });
    respond({ continue: true });
}
function handleValidateImplementation(result) {
    try {
        const analytics = loadAnalytics();
        if (analytics) {
            analytics.validations_run += 1;
            // Try to count issues
            if (result) {
                try {
                    const parsed = JSON.parse(result);
                    if (parsed.summary) {
                        analytics.issues_found += (parsed.summary.errors || 0) + (parsed.summary.warnings || 0);
                    }
                }
                catch {
                    // Ignore parse errors
                }
            }
            saveAnalytics(analytics);
        }
        logToolUsage({
            tool: 'validate_implementation',
            timestamp: new Date().toISOString(),
            success: true,
        });
        respond({ continue: true });
    }
    catch {
        respond({ continue: true });
    }
}
function handleRunSmokeTest(result) {
    try {
        logToolUsage({
            tool: 'run_smoke_test',
            timestamp: new Date().toISOString(),
            success: true,
        });
        // Check if tests failed and add system message
        if (result) {
            try {
                const parsed = JSON.parse(result);
                if (parsed.passed === false) {
                    const failed = parsed.summary?.failed || 0;
                    respond({
                        continue: true,
                        systemMessage: `Smoke test: ${failed} check(s) failed. Review output for details.`,
                    });
                    return;
                }
            }
            catch {
                // Ignore parse errors
            }
        }
        respond({ continue: true });
    }
    catch {
        respond({ continue: true });
    }
}
function handleCheckTypes(result) {
    try {
        const analytics = loadAnalytics();
        logToolUsage({
            tool: 'check_types',
            timestamp: new Date().toISOString(),
            success: true,
        });
        // Check for type errors
        if (result && analytics) {
            try {
                const parsed = JSON.parse(result);
                if (parsed.errors?.length > 0) {
                    analytics.issues_found += parsed.errors.length;
                    saveAnalytics(analytics);
                    respond({
                        continue: true,
                        systemMessage: `TypeScript: ${parsed.errors.length} type error(s) found.`,
                    });
                    return;
                }
            }
            catch {
                // Ignore parse errors
            }
        }
        respond({ continue: true });
    }
    catch {
        respond({ continue: true });
    }
}
async function main() {
    try {
        // Read stdin for tool result
        toolResult = await readStdin();
        switch (toolName) {
            case 'detect_stack':
                handleDetectStack(toolResult);
                break;
            case 'recommend_skills':
                handleRecommendSkills(toolResult);
                break;
            case 'search':
                handleSearch(toolResult);
                break;
            case 'validate_implementation':
                handleValidateImplementation(toolResult);
                break;
            case 'run_smoke_test':
                handleRunSmokeTest(toolResult);
                break;
            case 'check_types':
                handleCheckTypes(toolResult);
                break;
            default:
                respond({ continue: true });
        }
    }
    catch (error) {
        respond({ continue: true });
    }
}
main();
