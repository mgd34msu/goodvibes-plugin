import type { ParsedTimeFilter, SubagentSession, SubagentSummary } from './types.js';
export declare function findSubagentFiles(timeFilter?: ParsedTimeFilter): string[];
export declare function parseSubagentSession(filePath: string, timeFilter?: ParsedTimeFilter): SubagentSession | null;
export declare function analyzeSubagents(timeFilter?: ParsedTimeFilter): Promise<SubagentSummary>;
