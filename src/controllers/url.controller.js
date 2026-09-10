const prisma = require('../db/prisma');
const { encodeBase62 } = require('../utils/base62');

/**
 * POST /api/shorten
 * Creates a short URL mapping for a given long URL using Postgres + Prisma & Base62 encoding
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
