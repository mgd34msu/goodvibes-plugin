import { createApp } from './api/routes';

const PORT = parseInt(process.env.API_PORT || '3999', 10);
const app = createApp();

const server = app.listen(PORT, () => {
  console.log(`Server started on port ${PORT}`);
});

process.on('SIGTERM', () => {
  console.log('Shutting down...');
  server.close(() => process.exit(0));
});

export { server };
