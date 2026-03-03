import { Router } from 'express';
import { notes } from './notes.js';

export const statsRouter = Router();
export default statsRouter;

/**
 * GET /stats
 * Returns summary statistics for all notes.
 * Response: { total_notes, avg_title_length, avg_body_length, newest_note_date, oldest_note_date }
 */
statsRouter.get('/', (_req, res) => {
  const total_notes = notes.length;

  if (total_notes === 0) {
    return res.json({
      total_notes: 0,
      avg_title_length: 0,
      avg_body_length: 0,
      newest_note_date: null,
      oldest_note_date: null,
    });
  }

  const avg_title_length =
    notes.reduce((sum, n) => sum + n.title.length, 0) / total_notes;

  const avg_body_length =
    notes.reduce((sum, n) => sum + n.body.length, 0) / total_notes;

  const dates = notes.map((n) => new Date(n.createdAt).getTime());
  const newest_note_date = new Date(Math.max(...dates)).toISOString();
  const oldest_note_date = new Date(Math.min(...dates)).toISOString();

  res.json({
    total_notes,
    avg_title_length,
    avg_body_length,
    newest_note_date,
    oldest_note_date,
  });
});
