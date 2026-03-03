'use strict';

const { test, before, after, describe } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const express = require('express');

// Build a fresh test app around the users router for each describe block
// so the in-memory store resets between suites.
function buildApp() {
  const app = express();
  app.use(express.json());
  // Re-require to get a fresh module instance each time
  // Node caches modules, so we clear the cache manually.
  const routerPath = require.resolve('./users');
  delete require.cache[routerPath];
  const usersRouter = require('./users');
  app.use('/api/users', usersRouter);
  return app;
}

function startServer(app) {
  return new Promise((resolve) => {
    const server = http.createServer(app);
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      resolve({ server, port });
    });
  });
}

function stopServer(server) {
  return new Promise((resolve, reject) => {
    server.close((err) => (err ? reject(err) : resolve()));
  });
}

async function request(port, method, path, body) {
  const opts = {
    hostname: '127.0.0.1',
    port,
    path,
    method,
    headers: { 'Content-Type': 'application/json' },
  };
  return new Promise((resolve, reject) => {
    const req = http.request(opts, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        let json;
        try { json = JSON.parse(data); } catch { json = data; }
        resolve({ status: res.statusCode, body: json });
      });
    });
    req.on('error', reject);
    if (body !== undefined) req.write(JSON.stringify(body));
    req.end();
  });
}

// ─── GET /api/users ────────────────────────────────────────────────────────────
describe('GET /api/users', () => {
  let server, port;

  before(async () => {
    const result = await startServer(buildApp());
    server = result.server;
    port = result.port;
  });

  after(() => stopServer(server));

  test('returns 200 with all 3 seed users', async () => {
    const res = await request(port, 'GET', '/api/users');
    assert.equal(res.status, 200);
    assert.ok(Array.isArray(res.body));
    assert.equal(res.body.length, 3);
  });

  test('each user has id, name, email', async () => {
    const res = await request(port, 'GET', '/api/users');
    for (const user of res.body) {
      assert.ok('id' in user);
      assert.ok('name' in user);
      assert.ok('email' in user);
    }
  });
});

// ─── GET /api/users/:id ────────────────────────────────────────────────────────
describe('GET /api/users/:id', () => {
  let server, port;

  before(async () => {
    const result = await startServer(buildApp());
    server = result.server;
    port = result.port;
  });

  after(() => stopServer(server));

  test('returns 200 with existing user', async () => {
    const res = await request(port, 'GET', '/api/users/1');
    assert.equal(res.status, 200);
    assert.equal(res.body.id, 1);
    assert.equal(res.body.name, 'Alice Smith');
    assert.equal(res.body.email, 'alice@example.com');
  });

  test('returns 404 for missing user', async () => {
    const res = await request(port, 'GET', '/api/users/999');
    assert.equal(res.status, 404);
    assert.ok(res.body.error);
  });

  test('returns 404 for id 0', async () => {
    const res = await request(port, 'GET', '/api/users/0');
    assert.equal(res.status, 404);
  });
});

// ─── POST /api/users ───────────────────────────────────────────────────────────
describe('POST /api/users', () => {
  let server, port;

  before(async () => {
    const result = await startServer(buildApp());
    server = result.server;
    port = result.port;
  });

  after(() => stopServer(server));

  test('creates a user and returns 201', async () => {
    const res = await request(port, 'POST', '/api/users', {
      name: 'Dave Brown',
      email: 'dave@example.com',
    });
    assert.equal(res.status, 201);
    assert.equal(res.body.name, 'Dave Brown');
    assert.equal(res.body.email, 'dave@example.com');
    assert.ok(typeof res.body.id === 'number');
  });

  test('new user appears in list', async () => {
    await request(port, 'POST', '/api/users', {
      name: 'Eve Green',
      email: 'eve@example.com',
    });
    const listRes = await request(port, 'GET', '/api/users');
    const found = listRes.body.find((u) => u.email === 'eve@example.com');
    assert.ok(found);
  });

  test('returns 400 when name is missing', async () => {
    const res = await request(port, 'POST', '/api/users', { email: 'x@x.com' });
    assert.equal(res.status, 400);
    assert.ok(res.body.error);
  });

  test('returns 400 when email is missing', async () => {
    const res = await request(port, 'POST', '/api/users', { name: 'No Email' });
    assert.equal(res.status, 400);
    assert.ok(res.body.error);
  });

  test('returns 400 when body is empty', async () => {
    const res = await request(port, 'POST', '/api/users', {});
    assert.equal(res.status, 400);
    assert.ok(res.body.error);
  });
});

// ─── DELETE /api/users/:id ─────────────────────────────────────────────────────
describe('DELETE /api/users/:id', () => {
  let server, port;

  before(async () => {
    const result = await startServer(buildApp());
    server = result.server;
    port = result.port;
  });

  after(() => stopServer(server));

  test('deletes existing user and returns it', async () => {
    const res = await request(port, 'DELETE', '/api/users/2');
    assert.equal(res.status, 200);
    assert.equal(res.body.id, 2);
    assert.equal(res.body.name, 'Bob Jones');
  });

  test('deleted user no longer appears in list', async () => {
    await request(port, 'DELETE', '/api/users/3');
    const listRes = await request(port, 'GET', '/api/users');
    const found = listRes.body.find((u) => u.id === 3);
    assert.equal(found, undefined);
  });

  test('returns 404 for missing user', async () => {
    const res = await request(port, 'DELETE', '/api/users/999');
    assert.equal(res.status, 404);
    assert.ok(res.body.error);
  });

  test('returns 404 on double-delete', async () => {
    await request(port, 'DELETE', '/api/users/1');
    const res = await request(port, 'DELETE', '/api/users/1');
    assert.equal(res.status, 404);
  });
});
