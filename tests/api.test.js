const assert = require('assert');
const request = require('supertest');
const app = require('../src/app');
const prisma = require('../src/db/prisma');
const { safeRedisDel, safeRedisGet, redis } = require('../src/db/redis');
const { processClickEvents, stopWorker } = require('../src/workers/analyticsWorker');

async function runApiTests() {
  console.log('🧪 Running Express API, Redis Cache-Aside & Async Queue Integration Tests...\n');

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

  // Test 3: POST /api/shorten with missing payload
  const emptyRes = await request(app).post('/api/shorten').send({});
  assert.strictEqual(emptyRes.status, 400, 'Missing longUrl payload should return 400');
  console.log('✅ POST /api/shorten validation (missing payload) passed');

  // Test 4: POST /api/shorten with invalid URL
  const invalidUrlRes = await request(app).post('/api/shorten').send({ longUrl: 'not-a-valid-url' });
  assert.strictEqual(invalidUrlRes.status, 400, 'Invalid URL format should return 400');
  console.log('✅ POST /api/shorten validation (invalid URL) passed');

  // Test 5: End-to-End Cache-Aside Redirect & Async Click Queue Test
  console.log('\n🔄 Testing GET /:shortCode Redirect, Cache-Aside & Async Click Worker...');

  const testLongUrl = 'https://example.com/test-redirect-page';
  
  // 5a. Create short URL in DB
  const createdRecord = await prisma.url.create({
    data: {
      longUrl: testLongUrl
    }
  });

  const { encodeBase62 } = require('../src/utils/base62');
  const testShortCode = encodeBase62(createdRecord.id);

  await prisma.url.update({
    where: { id: createdRecord.id },
    data: { shortCode: testShortCode }
  });

  // Clear Redis key and queue to simulate clean state
  await safeRedisDel(`url:${testShortCode}`);
  await safeRedisDel('click-events');

  // 5b. First Request -> Cache MISS (Queries Postgres DB & populates Redis, pushes click event)
  const firstReq = await request(app).get(`/${testShortCode}`);
  assert.strictEqual(firstReq.status, 302, 'First redirect request should return 302 Found');
  assert.strictEqual(firstReq.headers.location, testLongUrl, 'Redirect Location should match longUrl');
  assert.strictEqual(firstReq.headers['x-cache'], 'MISS', 'First request should be a Cache MISS');
  console.log('  1️⃣ First request: Cache MISS -> Fetched from DB, cached in Redis & click event queued');

  // Verify key is now populated in Redis
  const cachedVal = await safeRedisGet(`url:${testShortCode}`);
  assert.strictEqual(cachedVal, testLongUrl, 'Redis key should store longUrl');

  // 5c. Second Request -> Cache HIT (Served directly from Redis, pushes click event)
  const secondReq = await request(app).get(`/${testShortCode}`);
  assert.strictEqual(secondReq.status, 302, 'Second redirect request should return 302 Found');
  assert.strictEqual(secondReq.headers.location, testLongUrl, 'Redirect Location should match longUrl');
  assert.strictEqual(secondReq.headers['x-cache'], 'HIT', 'Second request should be a Cache HIT');
  console.log('  2️⃣ Second request: Cache HIT -> Served directly from Redis & click event queued');

  // 5d. Start worker temporarily to consume queued click events from Redis list
  const workerPromise = processClickEvents();

  // Give worker a moment to consume events and update DB
  await new Promise((resolve) => setTimeout(resolve, 800));
  stopWorker();

  // 5e. Verify clickCount in DB was updated by the worker to 2
  const updatedRecordInDb = await prisma.url.findUnique({
    where: { id: createdRecord.id }
  });
  assert.strictEqual(updatedRecordInDb.clickCount, 2, 'Click count in DB should be updated to 2 by async worker');
  console.log('  3️⃣ Async Analytics Worker: Consumed events from Redis list & updated clickCount to 2 in Postgres DB');

  // Clean up test data
  await prisma.url.delete({ where: { id: createdRecord.id } }).catch(() => {});
  await safeRedisDel(`url:${testShortCode}`);
  await safeRedisDel('click-events');

  console.log('\n🎉 All API, Redis Cache-Aside & Async Queue Integration Tests Passed Successfully!');
  
  // Close connection handles so process exits cleanly
  await prisma.$disconnect();
  redis.disconnect();
}

runApiTests().catch((err) => {
  console.error('❌ API & Redis Integration Test Failed:', err);
  process.exit(1);
});
