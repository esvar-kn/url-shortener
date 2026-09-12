const express = require('express');
const router = express.Router();
const urlController = require('../controllers/url.controller');
const { shortenLimiter } = require('../middlewares/rateLimiter');

// POST /api/shorten - Create a shortened URL (Rate limited + supports optional customAlias)
router.post('/api/shorten', shortenLimiter, urlController.createShortUrl);

// GET /api/urls/:shortCode/stats - Get click analytics & daily breakdown
router.get('/api/urls/:shortCode/stats', urlController.getUrlStats);

// GET /:shortCode - Redirect short URL using Redis cache-aside
router.get('/:shortCode', urlController.redirectUrl);

module.exports = router;
