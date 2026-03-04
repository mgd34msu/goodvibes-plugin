import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { createLogger } from '../logger.js';

describe('createLogger level filtering', () => {
  let output: string[];
  let originalWrite: typeof process.stdout.write;

  beforeEach(() => {
    output = [];
    originalWrite = process.stdout.write.bind(process.stdout);
    process.stdout.write = (chunk: string | Uint8Array): boolean => {
      output.push(typeof chunk === 'string' ? chunk : Buffer.from(chunk).toString());
      return true;
    };
  });

  afterEach(() => {
    process.stdout.write = originalWrite;
  });

  it('emits debug messages when minLevel is debug', () => {
    const log = createLogger('debug');
    log.debug('hello');
    assert.equal(output.length, 1);
    const entry = JSON.parse(output[0]!);
    assert.equal(entry.level, 'debug');
    assert.equal(entry.message, 'hello');
  });

  it('suppresses debug messages when minLevel is info', () => {
    const log = createLogger('info');
    log.debug('suppressed');
    assert.equal(output.length, 0);
  });

  it('emits info messages when minLevel is info', () => {
    const log = createLogger('info');
    log.info('hi');
    assert.equal(output.length, 1);
    const entry = JSON.parse(output[0]!);
    assert.equal(entry.level, 'info');
  });

  it('suppresses info and debug when minLevel is warn', () => {
    const log = createLogger('warn');
    log.debug('no');
    log.info('no');
    assert.equal(output.length, 0);
  });

  it('emits warn and error when minLevel is warn', () => {
    const log = createLogger('warn');
    log.warn('w');
    log.error('e');
    assert.equal(output.length, 2);
  });

  it('includes extra fields in the log entry', () => {
    const log = createLogger('debug');
    log.info('msg', { requestId: '123' });
    const entry = JSON.parse(output[0]!);
    assert.equal(entry.requestId, '123');
  });

  it('includes a valid ISO 8601 timestamp', () => {
    const log = createLogger('info');
    log.info('ts');
    const entry = JSON.parse(output[0]!);
    assert.ok(!isNaN(Date.parse(entry.timestamp)));
  });
});
