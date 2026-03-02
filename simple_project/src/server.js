import express from 'express';
import { logger } from './middleware/logger.js';
import itemsRouter from './routes/items.js';

const app = express();
const PORT = 3000;

app.use(express.json());
app.use(logger);

app.use('/api/items', itemsRouter);

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});

export default app;
