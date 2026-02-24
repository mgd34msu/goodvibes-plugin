import type { TokenStats, ModelPricing, ProjectStats, ModelStats, ToolStats, TokenUsage } from './types.js';
import type { ParsedProject } from './parser.js';
export declare function createEmptyStats(): TokenStats;
export declare function addStats(statsObj: Record<string, Record<string, TokenStats>>, key: string, model: string, usage: TokenUsage): void;
export declare function aggregateByProject(projects: ParsedProject[], pricing: Record<string, ModelPricing>): ProjectStats[];
export declare function aggregateByModel(projects: ParsedProject[], pricing: Record<string, ModelPricing>): ModelStats[];
export declare function aggregateByTool(projects: ParsedProject[], pricing: Record<string, ModelPricing>): ToolStats[];
