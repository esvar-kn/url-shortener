const prisma = require('../db/prisma');
const { redis } = require('../db/redis');

let isRunning = false;

/**
 * Worker process that consumes click tracking events from the Redis queue,
 * increments total clickCount, and records timestamped Click entries in Postgres DB.
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
        const { shortCode, timestamp } = payload;

        if (shortCode) {
          const urlRecord = await prisma.url.findUnique({
            where: { shortCode },
            select: { id: true }
          });

          if (urlRecord) {
            const clickedAt = timestamp ? new Date(timestamp) : new Date();

            await prisma.$transaction([
              prisma.url.update({
                where: { id: urlRecord.id },
                data: { clickCount: { increment: 1 } }
              }),
              prisma.click.create({
                data: {
                  urlId: urlRecord.id,
                  clickedAt
                }
              })
            ]).catch((err) => {
              console.error(`Failed to process click event for shortCode ${shortCode}:`, err.message);
            });
          }
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

if (require.main === module) {
  processClickEvents();
}

module.exports = {
  processClickEvents,
  stopWorker
};
