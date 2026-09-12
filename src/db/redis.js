const Redis = require('ioredis');

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';
const isTest = process.env.NODE_ENV === 'test';

const redis = new Redis(REDIS_URL, {
  maxRetriesPerRequest: 1,
  enableOfflineQueue: false,
  retryStrategy: isTest ? () => null : (times) => Math.min(times * 200, 5000)
});

let loggedWarning = false;

redis.on('error', (err) => {
  if (!loggedWarning) {
    console.warn(`⚠️ Redis offline (caching disabled, database fallback active): ${err.message}`);
    loggedWarning = true;
  }
});

redis.on('ready', () => {
  if (loggedWarning) {
    console.log('✅ Redis connection re-established — caching active');
    loggedWarning = false;
  }
});

/**
 * Safely fetch string value from Redis
 */
const safeRedisGet = async (key) => {
  try {
    if (redis.status === 'ready') {
      return await redis.get(key);
    }
  } catch (err) {
    console.warn(`Redis GET failed for key ${key}:`, err.message);
  }
  return null;
};

/**
 * Safely store string value in Redis with TTL expiration in seconds
 */
const safeRedisSetEx = async (key, seconds, value) => {
  try {
    if (redis.status === 'ready') {
      await redis.set(key, value, 'EX', seconds);
    }
  } catch (err) {
    console.warn(`Redis SETEX failed for key ${key}:`, err.message);
  }
};

/**
 * Safely delete key from Redis
 */
const safeRedisDel = async (key) => {
  try {
    if (redis.status === 'ready') {
      await redis.del(key);
    }
  } catch (err) {
    console.warn(`Redis DEL failed for key ${key}:`, err.message);
  }
};

module.exports = {
  redis,
  safeRedisGet,
  safeRedisSetEx,
  safeRedisDel
};
