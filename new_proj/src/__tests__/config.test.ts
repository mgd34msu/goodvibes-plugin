import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { parsePort, parseLogLevel } from '../config.js';

describe('parsePort', () => {
  it('returns the parsed integer for a valid port string', () => {
    assert.equal(parsePort('8080'), 8080);
  });

  it('returns 3000 for undefined', () => {
    assert.equal(parsePort(undefined), 3000);
  });

  it('returns 3000 for a non-numeric string', () => {
    assert.equal(parsePort('abc'), 3000);
  });

  it('returns 3000 for port 0', () => {
    assert.equal(parsePort('0'), 3000);
  });

  it('returns 3000 for port >= 65536', () => {
    assert.equal(parsePort('65536'), 3000);
  });

  it('accepts port 1', () => {
    assert.equal(parsePort('1'), 1);
  });

  it('accepts port 65535', () => {
    assert.equal(parsePort('65535'), 65535);
  });
});

describe('parseLogLevel', () => {
  it('returns the given level when valid', () => {
    assert.equal(parseLogLevel('debug'), 'debug');
    assert.equal(parseLogLevel('info'), 'info');
    assert.equal(parseLogLevel('warn'), 'warn');
    assert.equal(parseLogLevel('error'), 'error');
  });

  it('returns info for undefined', () => {
    assert.equal(parseLogLevel(undefined), 'info');
  });

  it('returns info for an unrecognised level', () => {
    assert.equal(parseLogLevel('verbose'), 'info');
  });

  it('is case-sensitive (uppercase is not valid)', () => {
    assert.equal(parseLogLevel('INFO'), 'info');
  });
});
