import { describe, it, expect } from 'vitest';
import { RateLimiterError } from './types.js';

describe('RateLimiterError', () => {
  it('is an instance of Error', () => {
    const err = new RateLimiterError('bad config');
    expect(err).toBeInstanceOf(Error);
  });

  it('is an instance of RateLimiterError', () => {
    const err = new RateLimiterError('bad config');
    expect(err).toBeInstanceOf(RateLimiterError);
  });

  it('has the correct name property', () => {
    const err = new RateLimiterError('test message');
    expect(err.name).toBe('RateLimiterError');
  });

  it('preserves the message', () => {
    const err = new RateLimiterError('something invalid');
    expect(err.message).toBe('something invalid');
  });

  it('has a stack trace', () => {
    const err = new RateLimiterError('trace test');
    expect(err.stack).toBeDefined();
  });
});
