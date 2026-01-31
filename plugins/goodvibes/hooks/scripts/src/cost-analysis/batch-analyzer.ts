import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import type { ParsedTimeFilter, TokenUsage } from './types.js';
import { parseTimeFilter, walkDir, getProjectDirectories, extractMcpTool } from './parser.js';
import { getModelPricing } from './pricing.js';

// Cost constants per call (empirical)
export const BATCH_COST = 0.0139;
export const NATIVE_WRITE_COST = 0.0973;
export const NATIVE_READ_COST = 0.0255;
export const NATIVE_EDIT_COST = 0.0383;
export const NATIVE_GREP_COST = 0.0283;
export const NATIVE_GLOB_COST = 0.0194;
export const NATIVE_EXEC_COST = 0.0321;

export interface BatchPayload {
  operations?: Array<{ tool: string; [key: string]: unknown }>;
  commands?: Array<{ tool?: string; type?: string; [key: string]: unknown }>;
  files?: Array<{ path: string; [key: string]: unknown }>;
  queries?: Array<{ id: string; type: string; [key: string]: unknown }>;
  edits?: Array<{ file: string; [key: string]: unknown }>;
}

export interface OperationCount {
  read: number;
  write: number;
  edit: number;
  grep: number;
  glob: number;
  exec: number;
  other: number;
  total: number;
}

export interface BatchCall {
  file: string;
  timestamp: string;
  command: string;
  payload: BatchPayload | null;
  operationCount: number;
  operationsByType: OperationCount;
}

export interface BatchSavings {
  batchCost: number;
  nativeEquivalent: number;
  savings: number;
  savingsPercent: number;
  multiplier: number;
}

export interface AnalyzedBatch extends BatchCall, BatchSavings {}

export interface BatchAnalysisResult {
  totalBatches: number;
  totalOperations: number;
  operationsByType: OperationCount;
  totalBatchCost: number;
  totalNativeEquivalent: number;
  totalSavings: number;
  avgSavingsPercent: number;
  avgOpsPerBatch: number;
  greatestBatches: AnalyzedBatch[];
}

export function extractBatchPayload(command: string): BatchPayload | null {
  try {
    const jsonMatch = command.match(/mcp-clis+calls+[^s]+s+'({[sS]*})'/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[1]);
    }
    const stdinMatch = command.match(/mcp-clis+calls+[^s]+s+-s*<<['"]?EOF['"]?
([sS]*?)
EOF/);
    if (stdinMatch) {
      return JSON.parse(stdinMatch[1]);
    }
  } catch { }
  return null;
}

export function countBatchOperations(payload: BatchPayload): OperationCount {
  const counts: OperationCount = { read: 0, write: 0, edit: 0, grep: 0, glob: 0, exec: 0, other: 0, total: 0 };
  
  if (payload.files) {
    counts.write += payload.files.length;
  }
  if (payload.edits) {
    counts.edit += payload.edits.length;
  }
  if (payload.queries) {
    for (const q of payload.queries) {
      if (q.type === 'grep') counts.grep++;
      else if (q.type === 'glob') counts.glob++;
      else counts.other++;
    }
  }
  if (payload.commands) {
    counts.exec += payload.commands.length;
  }
  if (payload.operations) {
    for (const op of payload.operations) {
      const tool = op.tool?.toLowerCase() || '';
      if (tool.includes('read')) counts.read++;
      else if (tool.includes('write')) counts.write++;
      else if (tool.includes('edit')) counts.edit++;
      else if (tool.includes('grep')) counts.grep++;
      else if (tool.includes('glob')) counts.glob++;
      else if (tool.includes('exec')) counts.exec++;
      else counts.other++;
    }
  }
  
  counts.total = counts.read + counts.write + counts.edit + counts.grep + counts.glob + counts.exec + counts.other;
  return counts;
}

export function calculateBatchSavings(ops: OperationCount): BatchSavings {
  const nativeEquivalent = 
    ops.read * NATIVE_READ_COST +
    ops.write * NATIVE_WRITE_COST +
    ops.edit * NATIVE_EDIT_COST +
    ops.grep * NATIVE_GREP_COST +
    ops.glob * NATIVE_GLOB_COST +
    ops.exec * NATIVE_EXEC_COST +
    ops.other * 0.02;
  
  const batchCost = BATCH_COST;
  const savings = nativeEquivalent - batchCost;
  const savingsPercent = nativeEquivalent > 0 ? (savings / nativeEquivalent) * 100 : 0;
  const multiplier = batchCost > 0 ? nativeEquivalent / batchCost : 0;
  
  return { batchCost, nativeEquivalent, savings, savingsPercent, multiplier };
}

export function findBatchCalls(timeFilter?: ParsedTimeFilter): BatchCall[] {
  const filter = timeFilter || parseTimeFilter();
  const calls: BatchCall[] = [];
  const directories = getProjectDirectories();
  
  for (const dir of directories) {
    for (const filePath of walkDir(dir)) {
      try {
        const content = fs.readFileSync(filePath, 'utf8');
        const lines = content.split('
');
        
        for (const line of lines) {
          if (!line.includes('batch-engine/batch')) continue;
          try {
            const entry = JSON.parse(line);
            if (entry.type !== 'assistant') continue;
            if (entry.timestamp) {
              const ts = new Date(entry.timestamp).getTime();
              if (ts < filter.startTime || ts > filter.endTime) continue;
            }
            
            const blocks = entry.message?.content || [];
            for (const block of blocks) {
              if (block.type === 'tool_use' && block.name === 'Bash') {
                const cmd = block.input?.command || '';
                if (cmd.includes('batch-engine/batch')) {
                  const payload = extractBatchPayload(cmd);
                  const ops = payload ? countBatchOperations(payload) : { read: 0, write: 0, edit: 0, grep: 0, glob: 0, exec: 0, other: 0, total: 0 };
                  calls.push({
                    file: filePath,
                    timestamp: entry.timestamp || '',
                    command: cmd.substring(0, 500),
                    payload,
                    operationCount: ops.total,
                    operationsByType: ops
                  });
                }
              }
            }
          } catch { }
        }
      } catch { }
    }
  }
  
  return calls;
}

export function analyzeBatches(timeFilter?: ParsedTimeFilter): BatchAnalysisResult {
  const calls = findBatchCalls(timeFilter);
  
  const totals: OperationCount = { read: 0, write: 0, edit: 0, grep: 0, glob: 0, exec: 0, other: 0, total: 0 };
  const analyzed: AnalyzedBatch[] = [];
  
  for (const call of calls) {
    const ops = call.operationsByType;
    totals.read += ops.read;
    totals.write += ops.write;
    totals.edit += ops.edit;
    totals.grep += ops.grep;
    totals.glob += ops.glob;
    totals.exec += ops.exec;
    totals.other += ops.other;
    totals.total += ops.total;
    
    const savings = calculateBatchSavings(ops);
    analyzed.push({ ...call, ...savings });
  }
  
  const totalBatchCost = calls.length * BATCH_COST;
  const totalNativeEquivalent = analyzed.reduce((sum, b) => sum + b.nativeEquivalent, 0);
  const totalSavings = totalNativeEquivalent - totalBatchCost;
  
  analyzed.sort((a, b) => b.multiplier - a.multiplier);
  
  return {
    totalBatches: calls.length,
    totalOperations: totals.total,
    operationsByType: totals,
    totalBatchCost,
    totalNativeEquivalent,
    totalSavings,
    avgSavingsPercent: totalNativeEquivalent > 0 ? (totalSavings / totalNativeEquivalent) * 100 : 0,
    avgOpsPerBatch: calls.length > 0 ? totals.total / calls.length : 0,
    greatestBatches: analyzed.slice(0, 10)
  };
}
