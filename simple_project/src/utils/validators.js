/**
 * Input validation helper functions
 */

const VALID_STATUSES = ['pending', 'in-progress', 'completed'];
const MAX_STRING_LENGTH = 500;

/**
 * Check if a value is a non-empty string
 * @param {*} value
 * @returns {boolean}
 */
const isNonEmptyString = (value) => {
  return typeof value === 'string' && value.trim().length > 0;
};

/**
 * Check if a status value is valid
 * @param {*} status
 * @returns {boolean}
 */
const isValidStatus = (status) => {
  return VALID_STATUSES.includes(status);
};

/**
 * Trim and limit a string to 500 characters
 * @param {*} value
 * @returns {string}
 */
const sanitizeString = (value) => {
  if (typeof value !== 'string') return '';
  return value.trim().slice(0, MAX_STRING_LENGTH);
};

/**
 * Validate task input fields
 * @param {object} input - Task input object
 * @returns {{ valid: boolean, errors: string[] }}
 */
const validateTaskInput = (input) => {
  const errors = [];

  if (!isNonEmptyString(input?.title)) {
    errors.push('title must be a non-empty string');
  }

  if (input?.status !== undefined && !isValidStatus(input.status)) {
    errors.push(`status must be one of: ${VALID_STATUSES.join(', ')}`);
  }

  return {
    valid: errors.length === 0,
    errors,
  };
};

export { isNonEmptyString, isValidStatus, sanitizeString, validateTaskInput, MAX_STRING_LENGTH };
