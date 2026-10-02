class AppError extends Error {
  constructor(status, code, message, details = {}) {
    super(message);
    this.name = 'AppError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

function badRequest(message) {
  return new AppError(400, 'BAD_REQUEST', message, {});
}

function unauthorized(message = 'Authentication is required.') {
  return new AppError(401, 'UNAUTHORIZED', message, {});
}

function forbidden(message = 'You cannot perform this action.') {
  return new AppError(403, 'FORBIDDEN', message, {});
}

function accountStatusError(status) {
  const messages = {
    pending: ['ACCOUNT_PENDING', 'This account is waiting for an administrator to activate it.'],
    suspended: ['ACCOUNT_SUSPENDED', 'This account is suspended.'],
    rejected: ['ACCOUNT_REJECTED', 'This account was rejected.'],
  };
  const entry = messages[status];
  if (!entry) return forbidden('This account cannot sign in.');
  return new AppError(403, entry[0], entry[1], {});
}

function notFound(message = 'Resource not found.') {
  return new AppError(404, 'NOT_FOUND', message, {});
}

function notAcceptable(message = 'Only application/json responses are available.') {
  return new AppError(406, 'NOT_ACCEPTABLE', message, {});
}

function conflict(message) {
  return new AppError(409, 'CONFLICT', message, {});
}

function validation(fields, message = 'The request is invalid.') {
  return new AppError(422, 'VALIDATION_ERROR', message, { fields });
}

function invalid(field, rule, message) {
  return validation([{ field, rule, message }]);
}

module.exports = {
  AppError,
  badRequest,
  unauthorized,
  forbidden,
  accountStatusError,
  notFound,
  notAcceptable,
  conflict,
  validation,
  invalid,
};
