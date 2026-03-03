'use strict';

const { test, before, after, describe } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const express = require('express');
const { router, resetStore } = require('./quotes.js');

let server;
let baseUrl;

before(async () => {
  const app = express();
  app.use(express.json());
  app.use('/api', router);
  await new Promise((resolve) => {
    server = app.listen(0, '127.0.0.1', resolve);
  });
  const { port } = server.address();
  baseUrl = `http://127.0.0.1:${port}`;
});

after(async () => {
  await new Promise((resolve, reject) =>
    server.close((err) => (err ? reject(err) : resolve()))
  );
});

async function req(method, path, body) {
  const opts = {
    method,
    headers: { 'Content-Type': 'application/json' },
  };
  const response = await fetch(`${baseUrl}${path}`, {
    ...opts,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  let data;
  try {
    data = await response.json();
  } catch {
    data = null;
  }
  return { status: response.status, body: data };
}

describe('GET /api/quotes', () => {
  before(() => resetStore());

  test('returns all 3 seed quotes', async () => {
    const { status, body } = await req('GET', '/api/quotes');
    assert.equal(status, 200);
    assert.equal(Array.isArray(body), true);
    assert.equal(body.length, 3);
  });

  test('each quote has id, text, author', async () => {
    const { body } = await req('GET', '/api/quotes');
    for (const q of body) {
      assert.ok(typeof q.id === 'number', 'id should be a number');
      assert.ok(typeof q.text === 'string', 'text should be a string');
      assert.ok(typeof q.author === 'string', 'author should be a string');
    }
  });
});

describe('GET /api/quotes/:id', () => {
  before(() => resetStore());

  test('returns a quote by id', async () => {
    const { status, body } = await req('GET', '/api/quotes/1');
    assert.equal(status, 200);
    assert.equal(body.id, 1);
    assert.equal(typeof body.text, 'string');
    assert.equal(typeof body.author, 'string');
  });

  test('returns 404 for non-existent id', async () => {
    const { status, body } = await req('GET', '/api/quotes/9999');
    assert.equal(status, 404);
    assert.ok(body.error, 'should have error field');
  });

  test('returns 400 for non-numeric id', async () => {
    const { status, body } = await req('GET', '/api/quotes/abc');
    assert.equal(status, 400);
    assert.ok(body.error, 'should have error field');
  });
});

describe('POST /api/quotes', () => {
  before(() => resetStore());

  test('creates a new quote with valid input', async () => {
    const { status, body } = await req('POST', '/api/quotes', {
      text: 'A journey of a thousand miles begins with a single step.',
      author: 'Lao Tzu',
    });
    assert.equal(status, 201);
    assert.equal(typeof body.id, 'number');
    assert.equal(body.text, 'A journey of a thousand miles begins with a single step.');
    assert.equal(body.author, 'Lao Tzu');
  });

  test('new quote appears in the list', async () => {
    const { body: created } = await req('POST', '/api/quotes', {
      text: 'Be the change.',
      author: 'Gandhi',
    });
    const { body: all } = await req('GET', '/api/quotes');
    const found = all.find((q) => q.id === created.id);
    assert.ok(found, 'created quote should be in list');
  });

  test('returns 400 when text is missing', async () => {
    const { status, body } = await req('POST', '/api/quotes', { author: 'Nobody' });
    assert.equal(status, 400);
    assert.ok(body.error, 'should have error field');
  });

  test('returns 400 when author is missing', async () => {
    const { status, body } = await req('POST', '/api/quotes', { text: 'Something' });
    assert.equal(status, 400);
    assert.ok(body.error, 'should have error field');
  });

  test('returns 400 when both fields are missing', async () => {
    const { status, body } = await req('POST', '/api/quotes', {});
    assert.equal(status, 400);
    assert.ok(body.error, 'should have error field');
  });

  test('returns 400 when text is whitespace-only', async () => {
    const { status, body } = await req('POST', '/api/quotes', { text: '   ', author: 'Someone' });
    assert.equal(status, 400);
    assert.ok(body.error, 'should have error field');
  });

  test('returns 400 when author is whitespace-only', async () => {
    const { status, body } = await req('POST', '/api/quotes', { text: 'Valid text', author: '   ' });
    assert.equal(status, 400);
    assert.ok(body.error, 'should have error field');
  });

  test('trims whitespace from text and author', async () => {
    const { status, body } = await req('POST', '/api/quotes', {
      text: '  Padded text  ',
      author: '  Padded Author  ',
    });
    assert.equal(status, 201);
    assert.equal(body.text, 'Padded text');
    assert.equal(body.author, 'Padded Author');
  });
});

describe('DELETE /api/quotes/:id', () => {
  before(() => resetStore());

  test('deletes an existing quote and returns it', async () => {
    const { status, body } = await req('DELETE', '/api/quotes/1');
    assert.equal(status, 200);
    assert.equal(body.id, 1);
  });

  test('deleted quote no longer in list', async () => {
    resetStore();
    await req('DELETE', '/api/quotes/2');
    const { body: all } = await req('GET', '/api/quotes');
    assert.ok(!all.find((q) => q.id === 2), 'deleted quote should not be in list');
  });

  test('returns 404 for non-existent id', async () => {
    const { status, body } = await req('DELETE', '/api/quotes/9999');
    assert.equal(status, 404);
    assert.ok(body.error, 'should have error field');
  });

  test('returns 400 for non-numeric id', async () => {
    const { status, body } = await req('DELETE', '/api/quotes/abc');
    assert.equal(status, 400);
    assert.ok(body.error, 'should have error field');
  });
});
