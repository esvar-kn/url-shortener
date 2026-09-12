const rateLimit = require('express-rate-limit');

const isTest = process.env.NODE_ENV === 'test';

// Rate limit POST /api/shorten: max 30 creations per 15 minutes per IP (disabled during tests)
const shortenLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: isTest ? 10000 : 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    status: 'fail',
    error: 'Too many URL shortening requests from this IP. Please try again after 15 minutes.'
  }
});

// General API limiter: max 300 requests per 15 minutes per IP
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: isTest ? 10000 : 300,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    status: 'fail',
    error: 'Too many requests. Please slow down.'
  }
});

module.exports = {
  shortenLimiter,
  apiLimiter
};
