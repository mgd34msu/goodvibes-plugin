/**
 * Stream Reader — Core Layer
 *
 * Bounded body reader for Node.js Readable streams.
 * Reads up to maxBytes, returns null if limit exceeded.
 *
 * NOTE: ipc/ipc-server.ts has a different stream protocol — it stays inline.
 */

import type { Readable } from 'node:stream';

/**
 * Read the full content of a readable stream up to `maxBytes`.
 * Returns null if the byte limit is exceeded (stream is drained to prevent hanging).
 * Rejects on stream error.
 */
export function readStreamBody(
  stream: Readable,
  maxBytes: number,
): Promise<string | null> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let totalBytes = 0;
    let limitExceeded = false;
    let resolved = false;

    stream.on('data', (chunk: Buffer) => {
      if (limitExceeded) return;
      totalBytes += chunk.length;
      if (totalBytes > maxBytes) {
        limitExceeded = true;
        stream.removeAllListeners('data');
        stream.resume();
        if (!resolved) { resolved = true; resolve(null); }
        return;
      }
      chunks.push(chunk);
    });

    stream.on('end', () => {
      if (limitExceeded) return;
      if (!resolved) { resolved = true; resolve(Buffer.concat(chunks).toString('utf-8')); }
    });

    stream.on('error', (err) => {
      if (!resolved) { resolved = true; reject(err); }
    });
  });
}
