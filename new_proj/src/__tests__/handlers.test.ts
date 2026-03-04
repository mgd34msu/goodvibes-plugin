import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { healthHandler, notFoundHandler } from '../handlers.js';

/** Minimal ServerResponse mock that captures writeHead and end calls */
function makeMockRes() {
  const emitter = new EventEmitter();
  const calls: { writeHead?: [number, Record<string, string | number>]; end?: string } = {};
  const mock = Object.assign(emitter, {
    _statusCode: 200,
    calls,
    writeHead(code: number, headers: Record<string, string | number>): void {
      calls.writeHead = [code, headers];
    },
    end(body: string): void {
      calls.end = body;
    },
  }) as unknown as ServerResponse & { calls: typeof calls };
  return mock;
}

describe('healthHandler', () => {
  it('responds with status 200', () => {
    const req = {} as IncomingMessage;
    const res = makeMockRes();
    healthHandler(req, res);
    assert.equal(res.calls.writeHead?.[0], 200);
  });

  it('sets Content-Type to application/json', () => {
    const req = {} as IncomingMessage;
    const res = makeMockRes();
    healthHandler(req, res);
    assert.equal(res.calls.writeHead?.[1]?.['Content-Type'], 'application/json');
  });

  it('responds with status "ok" in body', () => {
    const req = {} as IncomingMessage;
    const res = makeMockRes();
    healthHandler(req, res);
    const body = JSON.parse(res.calls.end ?? '{}');
    assert.equal(body.status, 'ok');
  });

  it('includes a valid ISO timestamp in body', () => {
    const req = {} as IncomingMessage;
    const res = makeMockRes();
    healthHandler(req, res);
    const body = JSON.parse(res.calls.end ?? '{}');
    assert.ok(!isNaN(Date.parse(body.timestamp)));
  });

  it('sets Content-Length matching the body byte length', () => {
    const req = {} as IncomingMessage;
    const res = makeMockRes();
    healthHandler(req, res);
    const bodyStr = res.calls.end ?? '';
    const expectedLen = Buffer.byteLength(bodyStr);
    assert.equal(res.calls.writeHead?.[1]?.['Content-Length'], expectedLen);
  });
});

describe('notFoundHandler', () => {
  it('responds with status 404', () => {
    const req = {} as IncomingMessage;
    const res = makeMockRes();
    notFoundHandler(req, res);
    assert.equal(res.calls.writeHead?.[0], 404);
  });

  it('responds with JSON error body { error: "Not Found" }', () => {
    const req = {} as IncomingMessage;
    const res = makeMockRes();
    notFoundHandler(req, res);
    const body = JSON.parse(res.calls.end ?? '{}');
    assert.equal(body.error, 'Not Found');
  });

  it('sets Content-Type to application/json', () => {
    const req = {} as IncomingMessage;
    const res = makeMockRes();
    notFoundHandler(req, res);
    assert.equal(res.calls.writeHead?.[1]?.['Content-Type'], 'application/json');
  });

  it('sets Content-Length matching the body byte length', () => {
    const req = {} as IncomingMessage;
    const res = makeMockRes();
    notFoundHandler(req, res);
    const bodyStr = res.calls.end ?? '';
    const expectedLen = Buffer.byteLength(bodyStr);
    assert.equal(res.calls.writeHead?.[1]?.['Content-Length'], expectedLen);
  });
});
