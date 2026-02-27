/**
 * Response helper functions for consistent API responses
 */

/**
 * Send a successful response
 * @param {object} res - Express response object
 * @param {*} data - Response data
 * @param {number} statusCode - HTTP status code (default 200)
 */
const success = (res, data, statusCode = 200) => {
  return res.status(statusCode).json({
    success: true,
    data,
  });
};

/**
 * Send an error response
 * @param {object} res - Express response object
 * @param {string} message - Error message
 * @param {number} statusCode - HTTP status code (default 400)
 */
const sendError = (res, message, statusCode = 400) => {
  return res.status(statusCode).json({
    success: false,
    error: message,
  });
};

/**
 * Send a 404 not found response
 * @param {object} res - Express response object
 * @param {string} resource - Resource name (default 'Resource')
 */
const notFound = (res, resource = 'Resource') => {
  return res.status(404).json({
    success: false,
    error: `${resource} not found`,
  });
};

export { success, sendError, notFound };
