import { Hono } from 'hono';

const app = new Hono();

app.get('/api/ping', (c) => c.json({ pong: true }));

app.post('/api/widgets', (c) => c.json({ created: true }, 201));

app.on('PURGE', '/api/cache', (c) => c.json({ purged: true }));

export { app };
