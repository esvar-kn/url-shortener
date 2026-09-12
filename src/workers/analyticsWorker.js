const prisma = require('../db/prisma');
const { redis } = require('../db/redis');

let isRunning = false;

/**
 * Worker process that consumes click tracking events from the Redis queue
 * and asynchronously persists click increments to Postgres DB.
 */
async function processClickEvents() {
  isRunning = true;
  console.log('⚡ Analytics Worker started. Consuming click-events from Redis list...');

  while (isRunning) {
    try {
      if (redis.status !== 'ready') {
        await new Promise((resolve) => setTimeout(resolve, 500));
        continue;
      }

      // BRPOP blocks until a click event is pushed or 2-second timeout
      const res = await redis.brpop('click-events', 2);
      if (res && res[1]) {
        const payload = JSON.parse(res[1]);
        const { shortCode } = payload;

        if (shortCode) {
          await prisma.url.update({
            where: { shortCode },
            data: { clickCount: { increment: 1 } }
          }).catch((err) => {
            console.error(`Failed to update clickCount for shortCode ${shortCode}:`, err.message);
          });
        }
      }
    } catch (err) {
      if (isRunning) {
        console.error('Error in Analytics Worker loop:', err.message);
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
    }
  }
}

function stopWorker() {
  isRunning = false;
}

// Automatically start if launched directly from CLI
if (require.main === module) {
  processClickEvents();
}

module.exports = {
  processClickEvents,
  stopWorker
};
