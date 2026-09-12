require('dotenv').config();
const app = require('./app');
const { processClickEvents } = require('./workers/analyticsWorker');

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`🚀 URL Shortener Express service listening on port ${PORT}`);
  // Launch asynchronous click-tracking background worker
  processClickEvents().catch((err) => console.error('Worker error:', err));
});
