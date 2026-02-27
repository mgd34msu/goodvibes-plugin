export const requireFields = (...fields) => (req, res, next) => {
  const missing = fields.filter((field) => {
    const value = req.body[field];
    return value === undefined || value === null || value === '';
  });

  if (missing.length > 0) {
    return res.status(400).json({
      error: `Missing required fields: ${missing.join(', ')}`,
    });
  }

  next();
};

export const validateId = (req, res, next) => {
  const id = parseInt(req.params.id, 10);

  if (isNaN(id) || id <= 0 || !Number.isInteger(id)) {
    return res.status(400).json({
      error: 'Invalid id: must be a positive integer',
    });
  }

  next();
};
