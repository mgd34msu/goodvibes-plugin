import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from './api/routes';

describe('GET /api/users', () => {
  it('returns 200 with paginated empty list', async () => {
    const app = createApp();
    const res = await request(app).get('/api/users');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toBeTypeOf('object');
    expect(res.body.page).toBe(1);
    expect(res.body.total).toBe(0);
  });
});

describe('POST /api/users', () => {
  let app: ReturnType<typeof createApp>;

  beforeEach(() => {
    app = createApp();
  });

  it('creates a user with valid payload', async () => {
    const res = await request(app)
      .post('/api/users')
      .send({ email: 'test@example.com', password: 'securepass', name: 'Alice' });
    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.email).toBe('test@example.com');
    expect(res.body.data.role).toBe('user');
  });

  it('returns 400 for invalid email', async () => {
    const res = await request(app)
      .post('/api/users')
      .send({ email: 'not-an-email', password: 'securepass' });
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  it('returns 400 for missing password', async () => {
    const res = await request(app)
      .post('/api/users')
      .send({ email: 'test@example.com' });
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  it('returns 400 for password too short', async () => {
    const res = await request(app)
      .post('/api/users')
      .send({ email: 'test@example.com', password: 'short' });
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });
});

describe('GET /api/users/:id', () => {
  it('returns 400 for non-numeric id', async () => {
    const app = createApp();
    const res = await request(app).get('/api/users/abc');
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  it('returns 200 for valid id', async () => {
    const app = createApp();
    const res = await request(app).get('/api/users/1');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });
});

describe('DELETE /api/users/:id', () => {
  it('returns 204 for valid id', async () => {
    const app = createApp();
    const res = await request(app).delete('/api/users/1');
    expect(res.status).toBe(204);
  });

  it('returns 400 for invalid id', async () => {
    const app = createApp();
    const res = await request(app).delete('/api/users/abc');
    expect(res.status).toBe(400);
  });
});

describe('GET /api/posts', () => {
  it('returns 200 with paginated empty list', async () => {
    const app = createApp();
    const res = await request(app).get('/api/posts');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toBeTypeOf('object');
  });
});

describe('PUT /api/posts/:id', () => {
  it('updates post with valid payload', async () => {
    const app = createApp();
    const res = await request(app)
      .put('/api/posts/1')
      .send({ title: 'Updated Title', published: true });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.title).toBe('Updated Title');
  });

  it('returns 400 for empty title', async () => {
    const app = createApp();
    const res = await request(app)
      .put('/api/posts/1')
      .send({ title: '' });
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });
});

describe('GET /api/posts/:id/comments', () => {
  it('returns 200 with empty list', async () => {
    const app = createApp();
    const res = await request(app).get('/api/posts/1/comments');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });
});
