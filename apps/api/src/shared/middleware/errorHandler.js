const ApiError = require('../errors/ApiError');
const { isDevelopment } = require('../config/validateEnv');

/** 404 handler for unmatched routes. Runs before the error handler. */
const notFound = (req, _res, next) => {
  next(ApiError.notFound(`Route not found: ${req.method} ${req.originalUrl}`));
};

/**
 * Single place where every error becomes a JSON response.
 * Postgres / JWT errors are translated into friendly messages; unexpected
 * errors are logged in full but reported generically in production.
 */
// eslint-disable-next-line no-unused-vars
const errorHandler = (err, req, res, _next) => {
  let statusCode = err.statusCode || 500;
  let message = err.message || 'Something went wrong';
  let details = err.details;

  // Postgres: unique violation. The constraint name says which one, so the
  // duplicate email keeps the friendly wording it has always had.
  if (err.code === '23505') {
    statusCode = 409;
    message =
      err.constraint === 'users_email_key'
        ? 'An account with this email already exists'
        : 'That value is already taken';
  }

  // Postgres: a malformed uuid or number reached a query. Repositories check
  // ids before querying, so this is a bad body rather than a bad route param.
  if (err.code === '22P02') {
    statusCode = 400;
    message = 'One of the values sent is not in a valid format';
  }

  // Postgres: a CHECK constraint rejected the row (a negative amount, a rating
  // outside 1-5). The validators catch these first; this is the backstop.
  if (err.code === '23514') {
    statusCode = 400;
    message = 'One of the values sent is out of range';
  }

  // Postgres: the referenced row is gone.
  if (err.code === '23503') {
    statusCode = 400;
    message = 'That record no longer exists';
  }

  if (err.name === 'JsonWebTokenError') {
    statusCode = 401;
    message = 'Invalid token';
  }

  const isServerError = statusCode >= 500;
  if (isServerError) {
    // The event is an integration point for optional centralized error
    // tracking. Logs contain no SQL parameters, request bodies, or tokens.
    req.app.emit('api:error', { error: err, requestId: req.requestId, statusCode });
    console.error(JSON.stringify({ level: 'error', event: 'api_error',
      requestId: req.requestId, statusCode, code: err.code || 'UNEXPECTED' }));
  }

  // Default-deny: internals are only ever revealed when NODE_ENV explicitly
  // says "development". An unset NODE_ENV must not leak stack traces.
  const debug = isDevelopment();

  res.status(statusCode).json({
    success: false,
    requestId: req.requestId,
    message: isServerError && !debug ? 'Something went wrong' : message,
    ...(details ? { errors: details } : {}),
    ...(debug && isServerError ? { stack: err.stack } : {}),
  });
};

module.exports = { notFound, errorHandler };
