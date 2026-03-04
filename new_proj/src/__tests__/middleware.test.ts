import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { requestLogger } from '../middleware.js';

/** Minimal mock for IncomingMessage */
function makeMockReq(method = 'GET', url = '/test'): IncomingMessage {
  const emitter = new EventEmitter() as IncomingMessage;
  emitter.method = method;
  emitter.url = url;
  return emitter;
}

/** Minimal mock for ServerResponse */
function makeMockRes(): ServerResponse & { _headers: Record<string, string | number>; _statusCode: number } {
  const emitter = new EventEmitter() as ServerResponse & {
    _headers: Record<string, string | number>;
    _statusCode: number;
  };
  emitter._headers = {};
  emitter._statusCode = 200;
  Object.defineProperty(emitter, 'statusCode', {
    get() { return this._statusCode; },
    set(v: number) { this._statusCode = v; },
    configurable: true,
  });
  return emitter;
}

describe('requestLogger middleware', () => {
  it('calls next()', (_, done) => {
    const handler = requestLogger();
    const req = makeMockReq();
    const res = makeMockRes();
    handler(req, res, () => {
      // next was called
      done();
    });
  });

  it('logs a request entry on the finish event', (_, done) => {
    const output: string[] = [];
    const originalWrite = process.stdout.write.bind(process.stdout);
    process.stdout.write = (chunk: string | Uint8Array): boolean => {
      output.push(typeof chunk === 'string' ? chunk : Buffer.from(chunk).toString());
      return true;
    };

    const handler = requestLogger();
    const req = makeMockReq('POST', '/api/data');
    const res = makeMockRes();
    res._statusCode = 201;

    handler(req, res, () => {
      res.emit('finish');
      process.stdout.write = originalWrite;

      assert.equal(output.length, 1);
      const entry = JSON.parse(output[0]!);
      assert.equal(entry.method, 'POST');
      assert.equal(entry.url, '/api/data');
      assert.equal(entry.statusCode, 201);
      assert.ok(typeof entry.responseTimeMs === 'number');
      done();
    });
  });

  it('uses fallback values for missing method and url', (_, done) => {
    const output: string[] = [];
    const originalWrite = process.stdout.write.bind(process.stdout);
    process.stdout.write = (chunk: string | Uint8Array): boolean => {
      output.push(typeof chunk === 'string' ? chunk : Buffer.from(chunk).toString());
      return true;
    };

    const handler = requestLogger();
    const req = makeMockReq();
    req.method = undefined as unknown as string;
    req.url = undefined as unknown as string;
    const res = makeMockRes();

    handler(req, res, () => {
      res.emit('finish');
      process.stdout.write = originalWrite;

      const entry = JSON.parse(output[0]!);
      assert.equal(entry.method, 'UNKNOWN');
      assert.equal(entry.url, '/');
      done();
    });
  });
});
