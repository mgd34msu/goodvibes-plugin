const VALID_STATUSES = ['pending', 'in-progress', 'completed'];

export const isValidTitle = (title) => {
  return typeof title === 'string' && title.trim().length > 0 && title.length <= 200;
};

export const isValidStatus = (status) => {
  return VALID_STATUSES.includes(status);
};

export const sanitizeString = (str) => {
  if (typeof str !== 'string') return str;
  return str.trim();
};
