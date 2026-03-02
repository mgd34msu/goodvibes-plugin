import express from 'express';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { loggerMiddleware } from './middleware/logger.js';
import itemsRouter from './routes/items.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = 3000;

app.use(express.json());
app.use(loggerMiddleware);
app.use(express.static(join(__dirname, '..', 'public')));

app.use('/api/items', itemsRouter);

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});

export default app;
