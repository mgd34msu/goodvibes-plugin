// @ts-nocheck -- fixture simulates an external app; its deps aren't installed
// and api_routes/api_validate only ever regex-scan this text, never compile it.
import express from 'express';

const app = express();

// Matches the spec exactly (same path shape, same param name).
app.get('/api/users/:id', (req, res) => {
  res.json({ id: req.params.id });
});

// Implemented but NOT declared in the spec -> undocumented_route.
app.get('/api/health', (req, res) => {
  res.json({ ok: true });
});

// Declared in the spec as /api/posts/{id} but implemented with a different
// param name -> parameter_mismatch (planted).
app.get('/api/posts/:postId', (req, res) => {
  res.json({ id: req.params.postId });
});

// NOTE: the spec also declares POST /api/users, which has no implementation
// here -> missing_route (planted).

export { app };
