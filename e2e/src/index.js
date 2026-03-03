const express = require('express');
const app = express();
const PORT = process.env.PORT || 3456;
const { router: quotesRouter } = require('./routes/quotes');

app.use(express.json());

// Routes
app.use('/api', quotesRouter);
// - GET/POST /api/users  (Engineer 2)
const usersRouter = require('./routes/users');
app.use('/api/users', usersRouter);

app.get('/health', (req, res) => res.json({ status: 'ok' }));

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));

module.exports = app;