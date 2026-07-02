// @ts-nocheck -- fixture simulates an external app; its deps aren't installed
// and code_read/api_routes only ever regex-scans this text, never compiles it.
import express from 'express';

const app = express();
const router = express.Router();

app.get('/api/health', (req, res) => {
  res.json({ ok: true });
});

router.get('/api/users/:id', authenticate, (req, res) => {
  res.json({ id: req.params.id });
});

router.post('/api/users', authenticate, validateBody, (req, res) => {
  res.status(201).json({ created: true });
});

router.delete('/api/users/:id', authenticate, (req, res) => {
  res.status(204).send();
});

function authenticate(req: unknown, res: unknown, next: () => void): void {
  next();
}
function validateBody(req: unknown, res: unknown, next: () => void): void {
  next();
}

export { app, router };
