/**
 * Cost Analysis Types
 *
 * All interfaces and types for the cost analysis system.
 */
export function validateJournalEntry(raw) {
    if (!raw || typeof raw !== 'object')
        return null;
    const entry = raw;
    if (typeof entry.type !== 'string')
        return null;
    const timestamp = entry.timestamp && typeof entry.timestamp === 'string' ? entry.timestamp : undefined;
    let message;
    if (entry.message && typeof entry.message === 'object') {
        const msg = entry.message;
        message = {
            id: typeof msg.id === 'string' ? msg.id : undefined,
            model: typeof msg.model === 'string' ? msg.model : undefined,
            usage: msg.usage && typeof msg.usage === 'object' ? msg.usage : undefined,
            content: Array.isArray(msg.content) ? msg.content : undefined,
        };
    }
    const requestId = entry.requestId && typeof entry.requestId === 'string' ? entry.requestId : undefined;
    return { type: entry.type, timestamp, message, requestId };
}
