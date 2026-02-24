import type { TimeFilter, ParsedTimeFilter } from './types.js';
export declare function parseRelativeTime(relativeStr: string): number;
export declare function resolveTimeFilter(filter?: TimeFilter): ParsedTimeFilter;
export declare function isWithinTimeRange(timestamp: string | undefined, filter: ParsedTimeFilter): boolean;
