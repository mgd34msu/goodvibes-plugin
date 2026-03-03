import express from 'express';
import { requestLogger } from './middleware/logger';
import healthRouter from './routes/health';
import echoRouter from './routes/echo';

const app = express();
const PORT = 3456;

app.use(express.json());
app.use(requestLogger);

app.use(healthRouter);
app.use(echoRouter);

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});

export default app;
