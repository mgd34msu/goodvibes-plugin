import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import app from '../../index';
import { _resetStore } from '../../store/tasks';

beforeEach(() => {
  _resetStore();
});

describe('GET /api/tasks', () => {
  it('returns 200 with an empty array initially', async () => {
    const res = await request(app).get('/api/tasks');
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it('returns 200 with all tasks after creation', async () => {
    await request(app).post('/api/tasks').send({ title: 'Task A' });
    await request(app).post('/api/tasks').send({ title: 'Task B' });
    const res = await request(app).get('/api/tasks');
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(2);
  });
});

describe('POST /api/tasks', () => {
  it('returns 201 with the created task', async () => {
    const res = await request(app)
      .post('/api/tasks')
      .send({ title: 'New Task', description: 'Some desc' });
    expect(res.status).toBe(201);
    expect(res.body.id).toBeTruthy();
    expect(res.body.title).toBe('New Task');
    expect(res.body.description).toBe('Some desc');
    expect(res.body.completed).toBe(false);
    expect(res.body.createdAt).toBeTruthy();
  });

  it('trims title whitespace', async () => {
    const res = await request(app)
      .post('/api/tasks')
      .send({ title: '  Trimmed  ' });
    expect(res.status).toBe(201);
    expect(res.body.title).toBe('Trimmed');
  });

  it('trims description whitespace', async () => {
    const res = await request(app)
      .post('/api/tasks')
      .send({ title: 'T', description: '  spaced  ' });
    expect(res.status).toBe(201);
    expect(res.body.description).toBe('spaced');
  });

  it('returns 400 when title is missing', async () => {
    const res = await request(app).post('/api/tasks').send({ description: 'no title' });
    expect(res.status).toBe(400);
    expect(res.body.error).toBeTruthy();
  });

  it('returns 400 when title is an empty string', async () => {
    const res = await request(app).post('/api/tasks').send({ title: '' });
    expect(res.status).toBe(400);
    expect(res.body.error).toBeTruthy();
  });

  it('returns 400 when title is whitespace-only', async () => {
    const res = await request(app).post('/api/tasks').send({ title: '   ' });
    expect(res.status).toBe(400);
    expect(res.body.error).toBeTruthy();
  });

  it('strips unknown fields from response', async () => {
    const res = await request(app)
      .post('/api/tasks')
      .send({ title: 'Clean', injected: 'evil' });
    expect(res.status).toBe(201);
    expect(res.body.injected).toBeUndefined();
  });
});

describe('PATCH /api/tasks/:id', () => {
  it('returns 200 with updated task', async () => {
    const created = await request(app).post('/api/tasks').send({ title: 'Original' });
    const id = created.body.id;
    const res = await request(app)
      .patch(`/api/tasks/${id}`)
      .send({ title: 'Updated', completed: true });
    expect(res.status).toBe(200);
    expect(res.body.title).toBe('Updated');
    expect(res.body.completed).toBe(true);
  });

  it('trims title and description on update', async () => {
    const created = await request(app).post('/api/tasks').send({ title: 'T' });
    const id = created.body.id;
    const res = await request(app)
      .patch(`/api/tasks/${id}`)
      .send({ title: '  Trim  ', description: '  desc  ' });
    expect(res.status).toBe(200);
    expect(res.body.title).toBe('Trim');
    expect(res.body.description).toBe('desc');
  });

  it('returns 404 when task does not exist', async () => {
    const res = await request(app).patch('/api/tasks/nonexistent').send({ title: 'x' });
    expect(res.status).toBe(404);
    expect(res.body.error).toBeTruthy();
  });

  it('returns 400 when title is an empty string', async () => {
    const created = await request(app).post('/api/tasks').send({ title: 'T' });
    const id = created.body.id;
    const res = await request(app).patch(`/api/tasks/${id}`).send({ title: '' });
    expect(res.status).toBe(400);
    expect(res.body.error).toBeTruthy();
  });

  it('returns 400 when completed is not a boolean', async () => {
    const created = await request(app).post('/api/tasks').send({ title: 'T' });
    const id = created.body.id;
    const res = await request(app).patch(`/api/tasks/${id}`).send({ completed: 'yes' });
    expect(res.status).toBe(400);
    expect(res.body.error).toBeTruthy();
  });
});

describe('DELETE /api/tasks/:id', () => {
  it('returns 204 on successful deletion', async () => {
    const created = await request(app).post('/api/tasks').send({ title: 'Delete me' });
    const id = created.body.id;
    const res = await request(app).delete(`/api/tasks/${id}`);
    expect(res.status).toBe(204);
  });

  it('returns 404 when task does not exist', async () => {
    const res = await request(app).delete('/api/tasks/nonexistent');
    expect(res.status).toBe(404);
    expect(res.body.error).toBeTruthy();
  });

  it('removes task from store after deletion', async () => {
    const created = await request(app).post('/api/tasks').send({ title: 'Gone' });
    const id = created.body.id;
    await request(app).delete(`/api/tasks/${id}`);
    const all = await request(app).get('/api/tasks');
    expect(all.body.find((t: { id: string }) => t.id === id)).toBeUndefined();
  });
});

describe('404 handler', () => {
  it('returns 404 for unknown routes', async () => {
    const res = await request(app).get('/api/unknown');
    expect(res.status).toBe(404);
    expect(res.body.error).toBe('Route not found');
  });
});
