/**
 * Middleware factory that validates required fields exist in req.body.
 *
 * @param {string[]} requiredFields - Field names that must be present and non-empty.
 * @returns {import('express').RequestHandler}
 *
 * @example
 * router.post('/', validate(['title', 'url']), createBookmark);
 */
export function validate(requiredFields) {
  return (req, res, next) => {
    const missing = requiredFields.filter(
      (field) => req.body[field] === undefined || req.body[field] === null || req.body[field] === ''
    );

    if (missing.length > 0) {
      const err = new Error(`Missing required fields: ${missing.join(', ')}`);
      err.status = 400;
      return next(err);
    }

    next();
  };
}
