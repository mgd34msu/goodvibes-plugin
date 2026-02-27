import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import app from '../src/app.js';
import { clearAll } from '../src/db.js';

beforeEach(() => {
  clearAll();
});

describe('POST /api/tasks', () => {
  it('creates a task and returns 201', async () => {
    const res = await request(app)
      .post('/api/tasks')
      .send({ title: 'New Task', description: 'Do something' });
    expect(res.status).toBe(201);
    expect(res.body.data).toHaveProperty('id');
    expect(res.body.data.title).toBe('New Task');
    expect(res.body.data.status).toBe('pending');
  });

  it('returns 400 when title is missing', async () => {
    const res = await request(app)
      .post('/api/tasks')
      .send({ description: 'No title' });
    expect(res.status).toBe(400);
  });

  it('returns 400 when title is empty', async () => {
    const res = await request(app)
      .post('/api/tasks')
      .send({ title: '' });
    expect(res.status).toBe(400);
  });
});

describe('GET /api/tasks', () => {
  it('returns all tasks', async () => {
    await request(app).post('/api/tasks').send({ title: 'Task 1' });
    await request(app).post('/api/tasks').send({ title: 'Task 2' });
    const res = await request(app).get('/api/tasks');
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(2);
  });

  it('filters tasks by status query param', async () => {
    await request(app).post('/api/tasks').send({ title: 'Pending Task' });
    await request(app).post('/api/tasks').send({ title: 'Another Pending' });
    const res = await request(app).get('/api/tasks?status=pending');
    expect(res.status).toBe(200);
    expect(res.body.data.every((t) => t.status === 'pending')).toBe(true);
  });
});

describe('GET /api/tasks/:id', () => {
  it('returns the task with the given id', async () => {
    const created = await request(app)
      .post('/api/tasks')
      .send({ title: 'Find Me' });
    const id = created.body.data.id;
    const res = await request(app).get(`/api/tasks/${id}`);
    expect(res.status).toBe(200);
    expect(res.body.data.id).toBe(id);
  });

  it('returns 404 for an invalid id', async () => {
    const res = await request(app).get('/api/tasks/nonexistent-id');
    expect(res.status).toBe(404);
  });
});

describe('PUT /api/tasks/:id', () => {
  it('updates a task and returns the updated resource', async () => {
    const created = await request(app)
      .post('/api/tasks')
      .send({ title: 'Original Title' });
    const id = created.body.data.id;
    const res = await request(app)
      .put(`/api/tasks/${id}`)
      .send({ title: 'Updated Title', status: 'in-progress' });
    expect(res.status).toBe(200);
    expect(res.body.data.title).toBe('Updated Title');
    expect(res.body.data.status).toBe('in-progress');
  });

  it('returns 404 for an invalid id', async () => {
    const res = await request(app)
      .put('/api/tasks/nonexistent-id')
      .send({ title: 'Ghost' });
    expect(res.status).toBe(404);
  });
});

describe('DELETE /api/tasks/:id', () => {
  it('deletes a task and returns 204', async () => {
    const created = await request(app)
      .post('/api/tasks')
      .send({ title: 'Delete Me' });
    const id = created.body.data.id;
    const res = await request(app).delete(`/api/tasks/${id}`);
    expect(res.status).toBe(204);
  });

  it('returns 404 for an invalid id', async () => {
    const res = await request(app).delete('/api/tasks/nonexistent-id');
    expect(res.status).toBe(404);
  });
});

describe('Unknown routes', () => {
  it('returns 404 for an unregistered path', async () => {
    const res = await request(app).get('/unknown');
    expect(res.status).toBe(404);
  });
});
