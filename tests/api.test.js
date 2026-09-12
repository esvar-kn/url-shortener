const assert = require('assert');
const request = require('supertest');
const app = require('../src/app');
const prisma = require('../src/db/prisma');
const { safeRedisDel, safeRedisGet, redis } = require('../src/db/redis');
const { processClickEvents, stopWorker } = require('../src/workers/analyticsWorker');

async function runApiTests() {
  console.log('🧪 Running Express API, Redis Cache-Aside, 404 Error Handling & Analytics Tests...\n');

  // Test 1: GET /health
  const healthRes = await request(app).get('/health');
  assert.strictEqual(healthRes.status, 200, 'Health endpoint failed');
  assert.strictEqual(healthRes.body.status, 'OK');
  console.log('✅ GET /health passed');

  // Test 2: GET /encode/62
  const encodeRes = await request(app).get('/encode/62');
  assert.strictEqual(encodeRes.status, 200, 'Encode endpoint failed');
  assert.strictEqual(encodeRes.body.shortCode, 'BA');
  console.log('✅ GET /encode/:id passed');

  // Test 3: Input validation (missing payload & garbage input rejection)
  const emptyRes = await request(app).post('/api/shorten').send({});
  assert.strictEqual(emptyRes.status, 400, 'Missing longUrl payload should return 400');

  const invalidUrlRes = await request(app).post('/api/shorten').send({ longUrl: 'not-a-valid-url' });
  assert.strictEqual(invalidUrlRes.status, 400, 'Invalid URL format should return 400');
  console.log('✅ POST /api/shorten input validation (reject garbage input) passed');

  // Test 4: 404 Error Handling for Non-Existent Short Codes (Clean 404, No Server Crash)
  console.log('\n🛡️ Testing 404 Error Handling for Non-Existent Short Codes...');
  const missingRedirectRes = await request(app).get('/nonexistent_code_999');
  assert.strictEqual(missingRedirectRes.status, 404, 'Non-existent shortCode should return 404');
  assert.strictEqual(missingRedirectRes.body.error, 'Short URL not found');
  console.log('  1️⃣ GET /:shortCode non-existent short code clean 404 passed');

  const missingStatsRes = await request(app).get('/api/urls/nonexistent_code_999/stats');
  assert.strictEqual(missingStatsRes.status, 404, 'Non-existent shortCode stats should return 404');
  assert.strictEqual(missingStatsRes.body.error, 'Short URL not found');
  console.log('  2️⃣ GET /api/urls/:shortCode/stats non-existent stats clean 404 passed');

  // Test 5: Custom Alias Support & Uniqueness Check
  console.log('\n🎨 Testing Custom Alias Support...');
  const aliasPayload = {
    longUrl: 'https://example.com/custom-alias-target',
    customAlias: 'my-custom-link'
  };

  const createAliasRes = await request(app).post('/api/shorten').send(aliasPayload);
  assert.strictEqual(createAliasRes.status, 201, 'Creating custom alias should return 201 Created');
  assert.strictEqual(createAliasRes.body.shortCode, 'my-custom-link');
  console.log('  1️⃣ Custom Alias creation passed');

  // Duplicate Alias Collision check
  const duplicateAliasRes = await request(app).post('/api/shorten').send(aliasPayload);
  assert.strictEqual(duplicateAliasRes.status, 409, 'Duplicate custom alias should return 409 Conflict');
  assert.strictEqual(duplicateAliasRes.body.error, 'Custom alias is already taken');
  console.log('  2️⃣ Custom Alias uniqueness collision check passed');

  // Test 6: End-to-End Full Flow (Create -> Redirect -> Worker Queue -> Click Count Increment -> Stats)
  console.log('\n🔄 Testing End-to-End Full Flow (Create -> Redirect -> Redis Queue -> Async Worker -> Stats)...');

  const testLongUrl = 'https://example.com/full-flow-test-page';
  
  // 6a. Create short URL via API
  const createRes = await request(app).post('/api/shorten').send({ longUrl: testLongUrl });
  assert.strictEqual(createRes.status, 201);
  const testShortCode = createRes.body.shortCode;
  console.log(`  1️⃣ Created Short URL code: '${testShortCode}' for '${testLongUrl}'`);

  // Clear Redis cache key to test Cache Miss first
  await safeRedisDel(`url:${testShortCode}`);
  await safeRedisDel('click-events');

  // 6b. Visit short URL -> Redirect 1 (Cache MISS, queues click event)
  const firstReq = await request(app).get(`/${testShortCode}`);
  assert.strictEqual(firstReq.status, 302, 'Redirect 1 should return 302');
  assert.strictEqual(firstReq.headers.location, testLongUrl);
  assert.strictEqual(firstReq.headers['x-cache'], 'MISS');
  console.log('  2️⃣ Redirect 1 (Cache MISS): Returns 302 redirect & queues click event');

  // 6c. Visit short URL -> Redirect 2 (Cache HIT, queues click event)
  const secondReq = await request(app).get(`/${testShortCode}`);
  assert.strictEqual(secondReq.status, 302, 'Redirect 2 should return 302');
  assert.strictEqual(secondReq.headers.location, testLongUrl);
  assert.strictEqual(secondReq.headers['x-cache'], 'HIT');
  console.log('  3️⃣ Redirect 2 (Cache HIT): Returns 302 redirect from Redis & queues click event');

  // 6d. Launch Analytics Worker to consume queued click events
  const workerPromise = processClickEvents();
  await new Promise((resolve) => setTimeout(resolve, 800));
  stopWorker();
  console.log('  4️⃣ Async Analytics Worker: Consumed queued click events & updated database');

  // 6e. Fetch Analytics Endpoint (GET /api/urls/:shortCode/stats)
  const statsRes = await request(app).get(`/api/urls/${testShortCode}/stats`);
  assert.strictEqual(statsRes.status, 200);
  assert.strictEqual(statsRes.body.shortCode, testShortCode);
  assert.strictEqual(statsRes.body.longUrl, testLongUrl);
  assert.strictEqual(statsRes.body.clickCount, 2, 'Click count should be incremented to 2');
  assert.strictEqual(Array.isArray(statsRes.body.dailyBreakdown), true);
  assert.strictEqual(statsRes.body.dailyBreakdown[0].clicks, 2);
  console.log(`  5️⃣ Stats Endpoint Verified: Total Clicks = ${statsRes.body.clickCount}, Daily Breakdown = ${JSON.stringify(statsRes.body.dailyBreakdown)}`);

  // Clean up test data
  await prisma.url.deleteMany({
    where: {
      shortCode: { in: ['my-custom-link', testShortCode] }
    }
  }).catch(() => {});
  await safeRedisDel(`url:${testShortCode}`);
  await safeRedisDel('url:my-custom-link');
  await safeRedisDel('click-events');

  console.log('\n🎉 All Full Flow & 404 Error Handling Tests Passed Successfully!');

  await prisma.$disconnect();
  redis.disconnect();
}

runApiTests().catch((err) => {
  console.error('❌ API Integration Test Failed:', err);
  process.exit(1);
});
