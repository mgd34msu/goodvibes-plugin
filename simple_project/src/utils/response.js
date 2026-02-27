export const success = (res, data, statusCode = 200) => {
  return res.status(statusCode).json({ success: true, data });
};

export const error = (res, message, statusCode = 400) => {
  return res.status(statusCode).json({ success: false, error: message });
};

export const notFound = (res, resource = 'Resource') => {
  return res.status(404).json({ success: false, error: `${resource} not found` });
};
