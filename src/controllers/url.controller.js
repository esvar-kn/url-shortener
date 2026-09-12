const prisma = require('../db/prisma');
const { safeRedisGet, safeRedisSetEx } = require('../db/redis');
const { encodeBase62 } = require('../utils/base62');

const CACHE_TTL = parseInt(process.env.CACHE_TTL_SECONDS, 10) || 86400; // 24 hours default

/**
 * POST /api/shorten
 * Shortens a long URL and pre-caches the mapping in Redis
 */
exports.createShortUrl = async (req, res) => {
  try {
    const { longUrl } = req.body;

    if (!longUrl || typeof longUrl !== 'string' || !longUrl.trim()) {
      return res.status(400).json({ error: 'Valid longUrl string is required' });
    }

    const trimmedUrl = longUrl.trim();

    // Validate URL format
    try {
      new URL(trimmedUrl);
    } catch (_) {
      return res.status(400).json({ error: 'Invalid URL format. Must include protocol (e.g. http:// or https://)' });
    }

    // 1. Create URL record in DB to generate auto-increment ID
    const urlRecord = await prisma.url.create({
      data: {
        longUrl: trimmedUrl
      }
    });

    // 2. Encode auto-increment ID to Base62 short code
    const shortCode = encodeBase62(urlRecord.id);

    // 3. Update DB record with the generated shortCode
    const updatedRecord = await prisma.url.update({
      where: { id: urlRecord.id },
      data: { shortCode }
    });

    // 4. Pre-cache in Redis for fast immediate lookup
    await safeRedisSetEx(`url:${shortCode}`, CACHE_TTL, trimmedUrl);

    const host = req.get('host');
    const protocol = req.protocol;
    const shortUrl = `${protocol}://${host}/${shortCode}`;

    return res.status(201).json({
      id: updatedRecord.id,
      shortCode: updatedRecord.shortCode,
      shortUrl,
      longUrl: updatedRecord.longUrl,
      createdAt: updatedRecord.createdAt,
      clickCount: updatedRecord.clickCount
    });
  } catch (error) {
    console.error('Error creating short URL:', error);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
};

/**
 * GET /:shortCode
 * Redirects shortCode to longUrl using Redis Cache-Aside pattern
 */
exports.redirectUrl = async (req, res) => {
  try {
    const { shortCode } = req.params;

    if (!shortCode) {
      return res.status(400).json({ error: 'shortCode is required' });
    }

    const cacheKey = `url:${shortCode}`;

    // Step 1: Redis Cache Lookup (Cache-Aside)
    const cachedLongUrl = await safeRedisGet(cacheKey);

    if (cachedLongUrl) {
      // Cache Hit: Return 302 redirect directly from Redis without hitting Postgres
      res.setHeader('X-Cache', 'HIT');
      
      // Asynchronously increment click count in Postgres DB
      prisma.url.update({
        where: { shortCode },
        data: { clickCount: { increment: 1 } }
      }).catch((err) => console.error('Failed to increment click count on cache hit:', err.message));

      return res.redirect(302, cachedLongUrl);
    }

    // Step 2: Cache Miss -> Query Postgres DB
    const urlRecord = await prisma.url.findUnique({
      where: { shortCode }
    });

    if (!urlRecord) {
      return res.status(404).json({ error: 'Short URL not found' });
    }

    // Step 3: Populate Redis Cache with TTL (Cache-Aside)
    await safeRedisSetEx(cacheKey, CACHE_TTL, urlRecord.longUrl);

    // Increment click count in Postgres DB
    await prisma.url.update({
      where: { id: urlRecord.id },
      data: { clickCount: { increment: 1 } }
    });

    res.setHeader('X-Cache', 'MISS');
    return res.redirect(302, urlRecord.longUrl);
  } catch (error) {
    console.error('Error handling redirect:', error);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
};
