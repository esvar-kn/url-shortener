const express = require('express');
const router = express.Router();
const urlController = require('../controllers/url.controller');

// POST /api/shorten - Create a shortened URL
router.post('/api/shorten', urlController.createShortUrl);

// GET /:shortCode - Redirect short URL using Redis cache-aside
router.get('/:shortCode', urlController.redirectUrl);

module.exports = router;
