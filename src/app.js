const express = require('express');
const cors = require('cors');
const { encodeBase62 } = require('./utils/base62');

const app = express();

app.use(cors());
app.use(express.json());

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'OK', service: 'url-shortener' });
});

// Base62 encoding test endpoint
app.get('/encode/:id', (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id) || id < 0) {
    return res.status(400).json({ error: 'Please provide a valid non-negative integer ID' });
  }
  const shortCode = encodeBase62(id);
  return res.status(200).json({ id, shortCode });
});

module.exports = app;
