// Parse relative time strings like "7d", "24h", "2w", "1m" to milliseconds
export function parseRelativeTime(relativeStr) {
    const match = relativeStr.match(/^(\d+)([hdwm])$/i);
    if (!match) {
        throw new Error(`Invalid relative time format: ${relativeStr}`);
    }
    const value = parseInt(match[1], 10);
    const unit = match[2].toLowerCase();
    const MS_PER_HOUR = 60 * 60 * 1000;
    const MS_PER_DAY = 24 * MS_PER_HOUR;
    switch (unit) {
        case 'h': return value * MS_PER_HOUR;
        case 'd': return value * MS_PER_DAY;
        case 'w': return value * 7 * MS_PER_DAY;
        case 'm': return value * 30 * MS_PER_DAY;
        default: throw new Error(`Unknown time unit: ${unit}`);
    }
}
// Resolve TimeFilter to concrete timestamps
export function resolveTimeFilter(filter) {
    const now = Date.now();
    if (!filter) {
        return { startTime: 0, endTime: now, description: 'All time' };
    }
    if (filter.type === 'relative' && filter.relativeStart) {
        const duration = parseRelativeTime(filter.relativeStart);
        return { startTime: now - duration, endTime: now, description: `Last ${filter.relativeStart}` };
    }
    if (filter.type === 'absolute') {
        const start = filter.startDate ? new Date(filter.startDate).getTime() : 0;
        const end = filter.endDate ? new Date(filter.endDate).getTime() : now;
        const startStr = filter.startDate ? new Date(filter.startDate).toISOString().split('T')[0] : 'beginning';
        const endStr = filter.endDate ? new Date(filter.endDate).toISOString().split('T')[0] : 'now';
        return { startTime: start, endTime: end, description: `${startStr} to ${endStr}` };
    }
    return { startTime: 0, endTime: now, description: 'All time' };
}
// Check if timestamp is within filter range
export function isWithinTimeRange(timestamp, filter) {
    if (!timestamp)
        return false;
    const ts = new Date(timestamp).getTime();
    return ts >= filter.startTime && ts <= filter.endTime;
}
