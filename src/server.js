require('dotenv').config();
const app = require('./app');
const prisma = require('./db/prisma');
const { redis } = require('./db/redis');
const { processClickEvents, stopWorker } = require('./workers/analyticsWorker');

const PORT = process.env.PORT || 3000;

const server = app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 URL Shortener Express service listening on port ${PORT}`);
  // Launch asynchronous click-tracking background worker
  processClickEvents().catch((err) => console.error('Worker error:', err));
});

// Production Graceful Shutdown
const gracefulShutdown = async (signal) => {
  console.log(`\n⚠️ ${signal} received. Starting graceful shutdown...`);
  stopWorker();

  server.close(async () => {
    console.log('🛑 Express HTTP server closed.');
    try {
      await prisma.$disconnect();
      console.log('🔌 Prisma Postgres connection closed.');

      if (redis.status === 'ready') {
        await redis.quit();
        console.log('🔌 Redis connection closed.');
      }
      process.exit(0);
    } catch (err) {
      console.error('Error during graceful shutdown:', err);
      process.exit(1);
    }
  });
};

process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));

process.on('unhandledRejection', (reason, promise) => {
  console.error('💥 Unhandled Rejection at:', promise, 'reason:', reason);
});
