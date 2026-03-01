/**
 * File I/O — Core Layer
 *
 * Re-exports the file I/O utilities from the shared layer.
 * Implementations live in shared/file-io.ts to allow the shared layer
 * to use them without cross-layer import violations.
 */

export { writeAtomicSync, writeJsonSync, readJsonSync } from '../../shared/file-io.js';
