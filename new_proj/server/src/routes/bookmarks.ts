import { Router, type Request, type Response, type NextFunction } from 'express';
import { ZodError } from 'zod';
import { bookmarkStore } from '../store/bookmarks.js';
import {
  CreateBookmarkSchema,
  UpdateBookmarkSchema,
  type ApiError,
  type ApiSuccess,
  type ApiList,
  type Bookmark,
} from '../types/bookmark.js';

export const bookmarkRouter = Router();

/**
 * Sends a typed error response.
 */
function sendError(res: Response, statusCode: number, error: string, details?: unknown): void {
  const body: ApiError = { error, statusCode, ...(details !== undefined && { details }) };
  res.status(statusCode).json(body);
}

/** UUID regex for route parameter validation (any version). */
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Middleware that validates the :id route parameter is a valid UUID.
 * Returns 400 if malformed.
 */
function validateId(req: Request, res: Response, next: NextFunction): void {
  const id = req.params['id'] as string;
  if (!UUID_REGEX.test(id)) {
    sendError(res, 400, 'Invalid ID format: must be a valid UUID');
    return;
  }
  next();
}

/**
 * Sends a typed success response.
 */
function sendSuccess<T>(res: Response, data: T, statusCode = 200): void {
  const body: ApiSuccess<T> = { data };
  res.status(statusCode).json(body);
}

/**
 * Wraps async route handlers to forward thrown errors to Express error middleware.
 */
function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<void>
) {
  return (req: Request, res: Response, next: NextFunction): void => {
    fn(req, res, next).catch(next);
  };
}

// GET /api/bookmarks
bookmarkRouter.get(
  '/',
  asyncHandler(async (_req, res) => {
    const bookmarks = bookmarkStore.getAll();
    const body: ApiList<Bookmark> = { data: bookmarks, total: bookmarks.length };
    res.status(200).json(body);
  })
);

// GET /api/bookmarks/:id
bookmarkRouter.get(
  '/:id',
  validateId,
  asyncHandler(async (req, res) => {
    const id = req.params['id'] as string;
    const result = bookmarkStore.getById(id);
    if (!result.success) {
      sendError(res, result.statusCode, result.error);
      return;
    }
    sendSuccess(res, result.data);
  })
);

// POST /api/bookmarks
bookmarkRouter.post(
  '/',
  asyncHandler(async (req, res) => {
    const parsed = CreateBookmarkSchema.safeParse(req.body);
    if (!parsed.success) {
      sendError(res, 400, 'Validation failed', parsed.error.flatten());
      return;
    }
    const bookmark = bookmarkStore.create(parsed.data);
    sendSuccess(res, bookmark, 201);
  })
);

// PUT /api/bookmarks/:id
bookmarkRouter.put(
  '/:id',
  validateId,
  asyncHandler(async (req, res) => {
    const parsed = UpdateBookmarkSchema.safeParse(req.body);
    if (!parsed.success) {
      sendError(res, 400, 'Validation failed', parsed.error.flatten());
      return;
    }
    const id = req.params['id'] as string;
    const result = bookmarkStore.update(id, parsed.data);
    if (!result.success) {
      sendError(res, result.statusCode, result.error);
      return;
    }
    sendSuccess(res, result.data);
  })
);

// DELETE /api/bookmarks/:id
bookmarkRouter.delete(
  '/:id',
  validateId,
  asyncHandler(async (req, res) => {
    const id = req.params['id'] as string;
    const result = bookmarkStore.delete(id);
    if (!result.success) {
      sendError(res, result.statusCode, result.error);
      return;
    }
    sendSuccess(res, result.data);
  })
);

/**
 * Global error handler for unexpected errors.
 * Must be registered AFTER routes via app.use().
 */
export function globalErrorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction
): void {
  if (err instanceof ZodError) {
    sendError(res, 400, 'Validation failed', err.flatten());
    return;
  }
  console.error('[unhandled error]', err);
  sendError(res, 500, 'Internal server error');
}
