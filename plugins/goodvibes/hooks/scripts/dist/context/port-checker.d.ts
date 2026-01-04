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
/** Common development server ports to check. */
export declare const COMMON_DEV_PORTS: number[];
/** Check which common development ports are in use. */
export declare function checkPorts(_cwd: string): Promise<PortInfo[]>;
/** Format port status for display in context output. */
export declare function formatPortStatus(ports: PortInfo[]): string;
