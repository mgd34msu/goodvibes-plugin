/**
 * Validation middleware factory
 * Returns middleware that checks req.body has all required fields
 */

/**
 * @param {string[]} requiredFields - Array of required field names
 * @returns {Function} Express middleware
 */
const validateBody = (requiredFields) => (req, res, next) => {
  const body = req.body || {};
  const missing = requiredFields.filter((field) => {
    const value = body[field];
    if (value === undefined || value === null) return true;
    if (typeof value === 'string') return value.trim() === '';
    if (typeof value === 'boolean' || typeof value === 'number') return false;
    return false;
  });

  if (missing.length > 0) {
    return res.status(400).json({
      success: false,
      error: 'Validation failed',
      missing,
    });
  }

  next();
};

export { validateBody };
