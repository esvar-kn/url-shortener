const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const morgan = require('morgan');
const path = require('path');
const urlRoutes = require('./routes/url.routes');
const { encodeBase62 } = require('./utils/base62');
const globalErrorHandler = require('./middlewares/errorHandler');
const AppError = require('./utils/appError');
const { apiLimiter } = require('./middlewares/rateLimiter');

const app = express();

// Trust Railway reverse proxy (required for rate-limiter IP detection)
app.set('trust proxy', 1);

// 1. Security HTTP Headers with CSP allowing external CDNs for frontend
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'", "https://cdn.jsdelivr.net", "https://cdnjs.cloudflare.com"],
        styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com", "https://cdnjs.cloudflare.com"],
        fontSrc: ["'self'", "https://fonts.gstatic.com", "https://cdnjs.cloudflare.com"],
        imgSrc: ["'self'", "data:", "https:"],
        connectSrc: ["'self'"]
      }
    }
  })
);

// 2. CORS & Compression
app.use(cors());
app.use(compression());
app.use(express.json({ limit: '10kb' })); // Body parser limit to 10kb

// 3. HTTP Logger (development format, silent in test)
if (process.env.NODE_ENV !== 'test') {
  app.use(morgan('dev'));
}

// 4. Rate limiting for general API requests
app.use('/api', apiLimiter);

// 5. Serve static frontend files from public directory
app.use(express.static(path.join(__dirname, '../public')));

// 6. Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'OK', service: 'url-shortener', timestamp: new Date().toISOString() });
});

// 7. Base62 encoding test endpoint
app.get('/encode/:id', (req, res, next) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id) || id < 0) {
    return next(new AppError('Please provide a valid non-negative integer ID', 400));
  }
  const shortCode = encodeBase62(id);
  return res.status(200).json({ id, shortCode });
});

// 8. Mount URL Shortener routes
app.use('/', urlRoutes);

// 9. Handle 404 for unhandled routes
app.all('*', (req, res, next) => {
  next(new AppError(`Cannot find ${req.originalUrl} on this server!`, 404));
});

// 10. Global Error Handler Middleware
app.use(globalErrorHandler);

module.exports = app;
