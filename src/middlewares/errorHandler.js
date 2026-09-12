const globalErrorHandler = (err, req, res, next) => {
  let error = { ...err };
  error.message = err.message;
  error.statusCode = err.statusCode || 500;
  error.status = err.status || 'error';

  // Handle Prisma Known Request Errors gracefully
  if (err.code === 'P2002') {
    const fields = err.meta && err.meta.target ? err.meta.target.join(', ') : 'field';
    error.message = `Duplicate value for ${fields}. Already exists.`;
    error.statusCode = 409;
    error.status = 'fail';
    error.isOperational = true;
  } else if (err.code === 'P2025') {
    error.message = 'Requested record not found in database.';
    error.statusCode = 404;
    error.status = 'fail';
    error.isOperational = true;
  }

  if (process.env.NODE_ENV === 'development' || process.env.NODE_ENV === 'test') {
    return res.status(error.statusCode).json({
      status: error.status,
      error: error.message,
      stack: err.stack
    });
  }

  // Production mode: handle operational errors cleanly without exposing stack trace
  if (error.isOperational || err.isOperational) {
    return res.status(error.statusCode).json({
      status: error.status,
      error: error.message
    });
  }

  // Non-operational or unknown programming errors
  console.error('ERROR 💥:', err);
  return res.status(500).json({
    status: 'error',
    error: 'Internal Server Error. Please try again later.'
  });
};

module.exports = globalErrorHandler;
