/**
 * Response Formatter Module
 *
 * Handles the creation of session-start hook responses,
 * including system message building and response structure.
 */
import type { ContextGatheringResult } from './context-builder.js';
/**
 * Builds the system message based on context gathering results.
 *
 * The system message provides a brief summary of the plugin state
 * and any important context about the current session.
 *
 * @param sessionId - The current session identifier
 * @param context - The gathered context result
 * @returns A formatted system message string
 */
export declare function buildSystemMessage(sessionId: string, context: ContextGatheringResult): string;
