import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../../index.js';
import { bookmarkStore } from '../../store/bookmarks.js';

describe('Bookmarks API', () => {
  const app = createApp();

  beforeEach(() => {
    bookmarkStore.clear();
  });

  // -----------------------------------------------------------------------
  // GET /api/bookmarks
  // -----------------------------------------------------------------------
  describe('GET /api/bookmarks', () => {
    it('returns 200 with empty list when no bookmarks exist', async () => {
      const res = await request(app).get('/api/bookmarks');
      expect(res.status).toBe(200);
      expect(res.body.data).toEqual([]);
      expect(res.body.total).toBe(0);
    });

    it('returns all bookmarks with correct total', async () => {
      bookmarkStore.create({ url: 'https://a.com', title: 'A', tags: [] });
      bookmarkStore.create({ url: 'https://b.com', title: 'B', tags: ['tag'] });

      const res = await request(app).get('/api/bookmarks');
      expect(res.status).toBe(200);
      expect(res.body.total).toBe(2);
      expect(res.body.data).toHaveLength(2);
    });

    it('returns bookmarks with correct shape', async () => {
      bookmarkStore.create({
        url: 'https://example.com',
        title: 'Example',
        description: 'A site',
        tags: ['web'],
      });

      const res = await request(app).get('/api/bookmarks');
      const bookmark = res.body.data[0];
      expect(bookmark).toMatchObject({
        url: 'https://example.com',
        title: 'Example',
        description: 'A site',
        tags: ['web'],
      });
      expect(bookmark.id).toBeDefined();
      expect(bookmark.createdAt).toBeDefined();
    });
  });

  // -----------------------------------------------------------------------
  // GET /api/bookmarks/:id
  // -----------------------------------------------------------------------
  describe('GET /api/bookmarks/:id', () => {
    it('returns 200 with bookmark when found', async () => {
      const created = bookmarkStore.create({
        url: 'https://example.com',
        title: 'Example',
        tags: [],
      });

      const res = await request(app).get(`/api/bookmarks/${created.id}`);
      expect(res.status).toBe(200);
      expect(res.body.data.id).toBe(created.id);
      expect(res.body.data.url).toBe('https://example.com');
    });

    it('returns 404 when bookmark does not exist', async () => {
      const res = await request(app).get('/api/bookmarks/00000000-0000-0000-0000-000000000000');
      expect(res.status).toBe(404);
      expect(res.body.error).toMatch(/not found/i);
      expect(res.body.statusCode).toBe(404);
    });
  });

  // -----------------------------------------------------------------------
  // POST /api/bookmarks
  // -----------------------------------------------------------------------
  describe('POST /api/bookmarks', () => {
    it('creates a bookmark with valid data and returns 201', async () => {
      const res = await request(app)
        .post('/api/bookmarks')
        .send({ url: 'https://example.com', title: 'Example', tags: ['ts'] });

      expect(res.status).toBe(201);
      expect(res.body.data.id).toBeDefined();
      expect(res.body.data.url).toBe('https://example.com');
      expect(res.body.data.title).toBe('Example');
      expect(res.body.data.tags).toEqual(['ts']);
      expect(res.body.data.createdAt).toBeDefined();
    });

    it('creates a bookmark without optional fields', async () => {
      const res = await request(app)
        .post('/api/bookmarks')
        .send({ url: 'https://example.com', title: 'Example' });

      expect(res.status).toBe(201);
      expect(res.body.data.tags).toEqual([]);
      expect(res.body.data.description).toBeUndefined();
    });

    it('returns 400 when URL is missing', async () => {
      const res = await request(app)
        .post('/api/bookmarks')
        .send({ title: 'No URL' });

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/validation/i);
    });

    it('returns 400 when URL is invalid', async () => {
      const res = await request(app)
        .post('/api/bookmarks')
        .send({ url: 'not-a-url', title: 'Bad URL' });

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/validation/i);
    });

    it('returns 400 when title is missing', async () => {
      const res = await request(app)
        .post('/api/bookmarks')
        .send({ url: 'https://example.com' });

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/validation/i);
    });

    it('returns 400 when body is empty', async () => {
      const res = await request(app).post('/api/bookmarks').send({});
      expect(res.status).toBe(400);
    });

    it('stores the bookmark persistently', async () => {
      await request(app)
        .post('/api/bookmarks')
        .send({ url: 'https://example.com', title: 'Stored' });

      const listRes = await request(app).get('/api/bookmarks');
      expect(listRes.body.total).toBe(1);
    });
  });

  // -----------------------------------------------------------------------
  // PUT /api/bookmarks/:id
  // -----------------------------------------------------------------------
  describe('PUT /api/bookmarks/:id', () => {
    it('updates an existing bookmark and returns updated data', async () => {
      const created = bookmarkStore.create({
        url: 'https://old.com',
        title: 'Old',
        tags: [],
      });

      const res = await request(app)
        .put(`/api/bookmarks/${created.id}`)
        .send({ title: 'New Title', url: 'https://new.com' });

      expect(res.status).toBe(200);
      expect(res.body.data.title).toBe('New Title');
      expect(res.body.data.url).toBe('https://new.com');
      expect(res.body.data.id).toBe(created.id);
    });

    it('can update only tags', async () => {
      const created = bookmarkStore.create({
        url: 'https://example.com',
        title: 'Title',
        tags: ['old'],
      });

      const res = await request(app)
        .put(`/api/bookmarks/${created.id}`)
        .send({ tags: ['new1', 'new2'] });

      expect(res.status).toBe(200);
      expect(res.body.data.tags).toEqual(['new1', 'new2']);
    });

    it('returns 404 when bookmark does not exist', async () => {
      const res = await request(app)
        .put('/api/bookmarks/00000000-0000-0000-0000-000000000000')
        .send({ title: 'X' });

      expect(res.status).toBe(404);
      expect(res.body.error).toMatch(/not found/i);
    });

    it('returns 400 when body is empty', async () => {
      const created = bookmarkStore.create({
        url: 'https://example.com',
        title: 'Title',
        tags: [],
      });

      const res = await request(app)
        .put(`/api/bookmarks/${created.id}`)
        .send({});

      expect(res.status).toBe(400);
    });

    it('returns 400 when URL is invalid', async () => {
      const created = bookmarkStore.create({
        url: 'https://example.com',
        title: 'Title',
        tags: [],
      });

      const res = await request(app)
        .put(`/api/bookmarks/${created.id}`)
        .send({ url: 'not-a-url' });

      expect(res.status).toBe(400);
    });
  });

  // -----------------------------------------------------------------------
  // DELETE /api/bookmarks/:id
  // -----------------------------------------------------------------------
  describe('DELETE /api/bookmarks/:id', () => {
    it('deletes an existing bookmark and returns 200 with id', async () => {
      const created = bookmarkStore.create({
        url: 'https://example.com',
        title: 'To Delete',
        tags: [],
      });

      const res = await request(app).delete(`/api/bookmarks/${created.id}`);
      expect(res.status).toBe(200);
      expect(res.body.data.id).toBe(created.id);
    });

    it('removes the bookmark so subsequent GET returns 404', async () => {
      const created = bookmarkStore.create({
        url: 'https://example.com',
        title: 'To Delete',
        tags: [],
      });

      await request(app).delete(`/api/bookmarks/${created.id}`);

      const getRes = await request(app).get(`/api/bookmarks/${created.id}`);
      expect(getRes.status).toBe(404);
    });

    it('returns 404 when bookmark does not exist', async () => {
      const res = await request(app).delete('/api/bookmarks/00000000-0000-0000-0000-000000000000');
      expect(res.status).toBe(404);
      expect(res.body.error).toMatch(/not found/i);
    });

    it('decrements total count after deletion', async () => {
      bookmarkStore.create({ url: 'https://a.com', title: 'A', tags: [] });
      const b = bookmarkStore.create({ url: 'https://b.com', title: 'B', tags: [] });

      await request(app).delete(`/api/bookmarks/${b.id}`);

      const listRes = await request(app).get('/api/bookmarks');
      expect(listRes.body.total).toBe(1);
    });
  });

  // -----------------------------------------------------------------------
  // CORS
  // -----------------------------------------------------------------------
  describe('CORS', () => {
    it('includes CORS headers in response for allowed origin', async () => {
      const res = await request(app)
        .get('/api/bookmarks')
        .set('Origin', 'http://localhost:5173');

      expect(res.headers['access-control-allow-origin']).toBe('http://localhost:5173');
    });

    it('does not reflect arbitrary origins', async () => {
      const res = await request(app)
        .get('/api/bookmarks')
        .set('Origin', 'https://evil.com');

      expect(res.headers['access-control-allow-origin']).not.toBe('https://evil.com');
    });
  });

  // -----------------------------------------------------------------------
  // Helmet security headers
  // -----------------------------------------------------------------------
  describe('Security headers (helmet)', () => {
    it('sets X-Content-Type-Options header', async () => {
      const res = await request(app).get('/api/bookmarks');
      expect(res.headers['x-content-type-options']).toBe('nosniff');
    });

    it('sets X-Frame-Options header', async () => {
      const res = await request(app).get('/api/bookmarks');
      expect(res.headers['x-frame-options']).toBeDefined();
    });
  });

  // -----------------------------------------------------------------------
  // UUID validation
  // -----------------------------------------------------------------------
  describe('UUID validation', () => {
    it('returns 400 for malformed ID on GET', async () => {
      const res = await request(app).get('/api/bookmarks/not-a-uuid');
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/invalid id/i);
    });

    it('returns 400 for malformed ID on PUT', async () => {
      const res = await request(app)
        .put('/api/bookmarks/not-a-uuid')
        .send({ title: 'X' });
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/invalid id/i);
    });

    it('returns 400 for malformed ID on DELETE', async () => {
      const res = await request(app).delete('/api/bookmarks/not-a-uuid');
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/invalid id/i);
    });

    it('allows valid UUID through validation', async () => {
      const res = await request(app).get('/api/bookmarks/00000000-0000-0000-0000-000000000000');
      // Should be 404 (not found), not 400 (bad format)
      expect(res.status).toBe(404);
    });
  });

  // -----------------------------------------------------------------------
  // Health check
  // -----------------------------------------------------------------------
  describe('GET /health', () => {
    it('returns 200 with ok status', async () => {
      const res = await request(app).get('/health');
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('ok');
    });
  });

  // -----------------------------------------------------------------------
  // 404 for unknown routes
  // -----------------------------------------------------------------------
  describe('Unknown routes', () => {
    it('returns 404 for unregistered routes', async () => {
      const res = await request(app).get('/api/unknown-resource');
      expect(res.status).toBe(404);
    });
  });
});
