const prisma = require('../db/prisma');
const { safeRedisGet, safeRedisSetEx, safeRedisLpush } = require('../db/redis');
const { encodeBase62, DEFAULT_ID_OFFSET } = require('../utils/base62');
const AppError = require('../utils/appError');

const CACHE_TTL = parseInt(process.env.CACHE_TTL_SECONDS, 10) || 86400; // 24 hours default

/**
 * POST /api/shorten
 * Shortens a long URL with strict input validation and optional custom alias support
 */
exports.createShortUrl = async (req, res, next) => {
  try {
    const { longUrl, customAlias } = req.body;

    // 1. Basic URL Input Validation
    if (!longUrl || typeof longUrl !== 'string' || !longUrl.trim()) {
      return next(new AppError('Valid longUrl string is required', 400));
    }

    const trimmedUrl = longUrl.trim();

    // Verify valid URL structure and protocol (http/https)
    try {
      const parsedUrl = new URL(trimmedUrl);
      if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
        return next(new AppError('URL must use http or https protocol', 400));
      }
    } catch (_) {
      return next(new AppError('Invalid URL format. Rejecting garbage input.', 400));
    }

    let finalShortCode = null;

    // 2. Custom Alias Handling & Uniqueness Check
    if (customAlias) {
      if (typeof customAlias !== 'string' || !/^[a-zA-Z0-9_-]{3,30}$/.test(customAlias.trim())) {
        return next(new AppError('Custom alias must be 3-30 alphanumeric characters, hyphens, or underscores', 400));
      }

      const cleanAlias = customAlias.trim();

      // Check uniqueness in database
      const existingUrl = await prisma.url.findUnique({
        where: { shortCode: cleanAlias }
      });

      if (existingUrl) {
        return next(new AppError('Custom alias is already taken', 409));
      }

      finalShortCode = cleanAlias;

      // Create record with custom shortCode directly
      const createdRecord = await prisma.url.create({
        data: {
          longUrl: trimmedUrl,
          shortCode: finalShortCode
        }
      });

      // Pre-cache in Redis
      await safeRedisSetEx(`url:${finalShortCode}`, CACHE_TTL, trimmedUrl);

      const host = req.get('host');
      const protocol = req.protocol;
      const shortUrl = `${protocol}://${host}/${finalShortCode}`;

      return res.status(201).json({
        id: createdRecord.id,
        shortCode: createdRecord.shortCode,
        shortUrl,
        longUrl: createdRecord.longUrl,
        createdAt: createdRecord.createdAt,
        clickCount: createdRecord.clickCount
      });
    }

    // 3. Standard Auto-Increment + Base62 Encoding Flow (Offset 100M ensures 5-6 character length)
    const urlRecord = await prisma.url.create({
      data: {
        longUrl: trimmedUrl
      }
    });

    finalShortCode = encodeBase62(DEFAULT_ID_OFFSET + urlRecord.id);

    const updatedRecord = await prisma.url.update({
      where: { id: urlRecord.id },
      data: { shortCode: finalShortCode }
    });

    await safeRedisSetEx(`url:${finalShortCode}`, CACHE_TTL, trimmedUrl);

    const host = req.get('host');
    const protocol = req.protocol;
    const shortUrl = `${protocol}://${host}/${finalShortCode}`;

    return res.status(201).json({
      id: updatedRecord.id,
      shortCode: updatedRecord.shortCode,
      shortUrl,
      longUrl: updatedRecord.longUrl,
      createdAt: updatedRecord.createdAt,
      clickCount: updatedRecord.clickCount
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /:shortCode
 * Redirects shortCode to longUrl using Redis Cache-Aside pattern & async queue click tracking
 */
exports.redirectUrl = async (req, res, next) => {
  try {
    const { shortCode } = req.params;

    if (!shortCode) {
      return next(new AppError('shortCode is required', 400));
    }

    const cacheKey = `url:${shortCode}`;

    // Step 1: Redis Cache Lookup (Cache-Aside)
    const cachedLongUrl = await safeRedisGet(cacheKey);

    if (cachedLongUrl) {
      res.setHeader('X-Cache', 'HIT');

      // Fast Path: Push click tracking event payload to Redis async queue without blocking response
      await safeRedisLpush('click-events', JSON.stringify({ shortCode, timestamp: Date.now() }));

      return res.redirect(302, cachedLongUrl);
    }

    // Step 2: Cache Miss -> Query Postgres DB
    const urlRecord = await prisma.url.findUnique({
      where: { shortCode }
    });

    if (!urlRecord) {
      return next(new AppError('Short URL not found', 404));
    }

    // Step 3: Populate Redis Cache with TTL (Cache-Aside)
    await safeRedisSetEx(cacheKey, CACHE_TTL, urlRecord.longUrl);

    // Fast Path: Push click tracking event payload to Redis async queue
    await safeRedisLpush('click-events', JSON.stringify({ shortCode, timestamp: Date.now() }));

    res.setHeader('X-Cache', 'MISS');
    return res.redirect(302, urlRecord.longUrl);
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/urls/:shortCode/stats
 * Retrieves analytics for a short URL including total click count and daily breakdown
 */
exports.getUrlStats = async (req, res, next) => {
  try {
    const { shortCode } = req.params;

    if (!shortCode) {
      return next(new AppError('shortCode is required', 400));
    }

    const urlRecord = await prisma.url.findUnique({
      where: { shortCode },
      include: {
        clicks: {
          orderBy: { clickedAt: 'asc' }
        }
      }
    });

    if (!urlRecord) {
      return next(new AppError('Short URL not found', 404));
    }

    // Calculate daily breakdown by grouping clicks by YYYY-MM-DD
    const dailyMap = new Map();
    for (const click of urlRecord.clicks) {
      const dateStr = click.clickedAt.toISOString().split('T')[0];
      dailyMap.set(dateStr, (dailyMap.get(dateStr) || 0) + 1);
    }

    const dailyBreakdown = Array.from(dailyMap.entries()).map(([date, clicks]) => ({
      date,
      clicks
    }));

    return res.status(200).json({
      shortCode: urlRecord.shortCode,
      longUrl: urlRecord.longUrl,
      clickCount: urlRecord.clickCount,
      createdAt: urlRecord.createdAt,
      dailyBreakdown
    });
  } catch (error) {
    next(error);
  }
};
