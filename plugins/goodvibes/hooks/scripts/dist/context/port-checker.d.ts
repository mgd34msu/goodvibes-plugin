/**
 * Port Checker
 *
 * Checks for active development server ports on common ports.
 */
/** Information about a network port. */
export interface PortInfo {
    port: number;
    inUse: boolean;
    process?: string;
}
/**
 * Common development server ports to check.
 * Includes ports for Next.js, Vite, Express, and other popular frameworks.
 */
export declare const COMMON_DEV_PORTS: number[];
/**
 * Check which common development ports are in use.
 * Platform-agnostic function that detects the OS and uses appropriate method.
 *
 * @param _cwd - The current working directory (unused but kept for API consistency)
 * @returns Promise resolving to an array of PortInfo objects for all common dev ports
 *
 * @example
 * const ports = await checkPorts('/my-project');
 * const activePorts = ports.filter(p => p.inUse);
 * activePorts.forEach(p => console.log(`Port ${p.port}: ${p.process}`));
 */
export declare function checkPorts(_cwd: string): Promise<PortInfo[]>;
/**
 * Format port status for display in context output.
 * Creates a human-readable summary of active development server ports.
 *
 * @param ports - Array of PortInfo objects to format
 * @returns Formatted string with active port numbers and process names
 *
 * @example
 * const formatted = formatPortStatus(ports);
 * // Returns: "Active ports: 3000 (node), 5173 (vite)"
 */
export declare function formatPortStatus(ports: PortInfo[]): string;
