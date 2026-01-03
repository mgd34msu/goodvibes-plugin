/**
 * Pre-Compact Hook (GoodVibes)
 *
 * Runs before context compression (auto or manual).
 * Can save important context before it's compacted.
 */
import * as fs from 'fs';
import * as path from 'path';
import { respond, readHookInput, loadAnalytics, debug, logError, CACHE_DIR, } from './shared.js';
function createResponse(systemMessage) {
    return {
        continue: true,
        systemMessage,
    };
}
async function main() {
    try {
        debug('PreCompact hook starting');
        const input = await readHookInput();
        debug('PreCompact received input', {
            hook_event_name: input.hook_event_name,
        });
        // Save current analytics state before compact
        const analytics = loadAnalytics();
        if (analytics) {
            const compactBackup = path.join(CACHE_DIR, 'pre-compact-backup.json');
            fs.writeFileSync(compactBackup, JSON.stringify({
                ...analytics,
                compact_at: new Date().toISOString(),
            }, null, 2));
            debug(`Saved pre-compact backup to ${compactBackup}`);
        }
        respond(createResponse());
    }
    catch (error) {
        logError('PreCompact main', error);
        respond(createResponse());
    }
}
main();
