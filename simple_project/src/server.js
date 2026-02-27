import app from './app.js';

const PORT = parseInt(process.env.PORT, 10) || 3000;

app.listen(PORT, () => {
  console.log(`Task API server listening on port ${PORT}`);
});
