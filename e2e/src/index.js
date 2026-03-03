import express from 'express';
import quotesRouter from './routes/quotes.js';
import searchRouter from './routes/search.js';
import statsRouter from './routes/stats.js';

const app = express();
const PORT = 3456;

app.use(express.json());

app.use('/quotes', quotesRouter);
app.use('/search', searchRouter);
app.use('/stats', statsRouter);

// Basic error handler
app.use((err, req, res, next) => {
  const status = err.status || 500;
  res.status(status).json({ error: err.message || 'Internal Server Error' });
});

app.listen(PORT, () => {
  console.log(`Quotes API running on http://localhost:${PORT}`);
});

export default app;
