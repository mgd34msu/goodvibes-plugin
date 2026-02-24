import type { JournalEntry, TokenUsage, ParsedTimeFilter, TimeFilter } from './types.js';
export declare function getProjectDirectories(): string[];
export declare function walkDir(dir: string): Generator<string>;
export declare function findJSONLFiles(): string[];
export declare function getProjectName(filePath: string): string;
export declare function extractMcpTool(bashInput: unknown): string | null;
export declare function createEntryHash(entry: JournalEntry): string;
export declare function parseTimeFilter(filter?: TimeFilter): ParsedTimeFilter;
export interface ParsedEntry {
    model: string;
    usage: TokenUsage;
    tools: string[];
}
export declare function parseJournalFile(filePath: string, timeFilter: ParsedTimeFilter, seenHashes: Set<string>): ParsedEntry[];
export interface ParsedProject {
    projectName: string;
    entries: ParsedEntry[];
}
export interface ParseAllProjectsOptions {
    timeFilter?: TimeFilter;
    projectFilter?: string[];
    modelFilter?: string[];
}
export declare function parseAllProjects(options?: ParseAllProjectsOptions): ParsedProject[];
