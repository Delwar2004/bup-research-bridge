const { AppError, badRequest, notAcceptable } = require('../utils/errors');
const { mapDatabaseError } = require('../utils/dbErrors');

function acceptJson(req, res, next) {
  const accept = req.get('accept');
  if (!accept || accept.includes('application/json') || accept.includes('*/*')) return next();
  next(notAcceptable());
}

function jsonParserError(err, req, res, next) {
  if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
    return next(badRequest('Request body must be valid JSON.'));
  }
  if (err.type === 'entity.parse.failed') {
    return next(badRequest('Request body must be valid JSON.'));
  }
  return next(err);
}

function notFoundHandler(req, res) {
  res.set('Cache-Control', 'no-store');
  res.status(404).json({
    success: false,
    message: 'Resource not found.',
    error: { code: 'NOT_FOUND', details: {} },
  });
}

function errorHandler(err, req, res, next) {
  const mapped = mapDatabaseError(err);
  res.set('Cache-Control', 'no-store');
  if (mapped instanceof AppError) {
    return res.status(mapped.status).json({
      success: false,
      message: mapped.message,
      error: { code: mapped.code, details: mapped.details || {} },
    });
  }
  console.error(mapped && mapped.stack ? mapped.stack : mapped);
  return res.status(500).json({
    success: false,
    message: 'An unexpected error occurred.',
    error: { code: 'INTERNAL_ERROR', details: {} },
  });
}

function send(res, status, message, data, meta) {
  const body = { success: true, message, data };
  if (meta !== undefined) body.meta = meta;
  res.set('Cache-Control', 'no-store');
  res.status(status).json(body);
}

module.exports = { acceptJson, jsonParserError, notFoundHandler, errorHandler, send };
