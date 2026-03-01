import express, { Request, Response, Router } from 'express';
import { z } from 'zod';
import { ApiResponse, User, Post, PaginatedResponse } from '../types';

const CreateUserSchema = z.object({
  email: z.string().email(),
  name: z.string().optional(),
  password: z.string().min(8),
});

const UpdatePostSchema = z.object({
  title: z.string().min(1).optional(),
  content: z.string().optional(),
  published: z.boolean().optional(),
});

export function createApp(): express.Application {
  const app = express();
  app.use(express.json());

  const router = Router();

  // GET /api/users
  router.get('/api/users', (_req: Request, res: Response) => {
    const response: PaginatedResponse<User> = {
      success: true,
      data: [],
      page: 1,
      pageSize: 20,
      total: 0,
      timestamp: Date.now(),
    };
    res.json(response);
  });

  // POST /api/users
  router.post('/api/users', (req: Request, res: Response) => {
    const result = CreateUserSchema.safeParse(req.body);
    if (!result.success) {
      const response: ApiResponse<null> = {
        success: false,
        error: result.error.message,
        timestamp: Date.now(),
      };
      res.status(400).json(response);
      return;
    }
    const response: ApiResponse<User> = {
      success: true,
      data: { id: 1, ...result.data, name: result.data.name || null, role: 'user', createdAt: new Date() },
      timestamp: Date.now(),
    };
    res.status(201).json(response);
  });

  // GET /api/users/:id
  router.get('/api/users/:id', (req: Request, res: Response) => {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      res.status(400).json({ success: false, error: 'Invalid ID', timestamp: Date.now() });
      return;
    }
    res.json({ success: true, data: null, timestamp: Date.now() });
  });

  // DELETE /api/users/:id
  router.delete('/api/users/:id', (req: Request, res: Response) => {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      res.status(400).json({ success: false, error: 'Invalid ID', timestamp: Date.now() });
      return;
    }
    res.status(204).send();
  });

  // GET /api/posts
  router.get('/api/posts', (_req: Request, res: Response) => {
    const response: PaginatedResponse<Post> = {
      success: true,
      data: [],
      page: 1,
      pageSize: 20,
      total: 0,
      timestamp: Date.now(),
    };
    res.json(response);
  });

  // POST /api/posts
  router.post('/api/posts', (req: Request, res: Response) => {
    res.status(201).json({ success: true, data: req.body, timestamp: Date.now() });
  });

  // PUT /api/posts/:id
  router.put('/api/posts/:id', (req: Request, res: Response) => {
    const result = UpdatePostSchema.safeParse(req.body);
    if (!result.success) {
      res.status(400).json({ success: false, error: result.error.message, timestamp: Date.now() });
      return;
    }
    res.json({ success: true, data: result.data, timestamp: Date.now() });
  });

  // DELETE /api/posts/:id
  router.delete('/api/posts/:id', (_req: Request, res: Response) => {
    res.status(204).send();
  });

  // GET /api/posts/:id/comments
  router.get('/api/posts/:id/comments', (_req: Request, res: Response) => {
    res.json({ success: true, data: [], timestamp: Date.now() });
  });

  // POST /api/posts/:id/comments
  router.post('/api/posts/:id/comments', (req: Request, res: Response) => {
    res.status(201).json({ success: true, data: req.body, timestamp: Date.now() });
  });

  app.use(router);
  return app;
}
