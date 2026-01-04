/** Result of gathering and formatting session context */
export interface ContextInjectionResult {
    /** Formatted context string for injection */
    context: string;
    /** Whether the project is empty */
    isEmpty: boolean;
}
/** Gathers project context and formats it for session injection */
export declare function gatherAndFormatContext(cwd: string): Promise<ContextInjectionResult>;
