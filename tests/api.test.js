const assert = require('assert');
const request = require('supertest');
const app = require('../src/app');

async function runApiTests() {
  console.log('🧪 Running Express API & Endpoint Integration Tests...\n');

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

  console.log('\n🎉 All API Integration Tests Passed Successfully!');
}

runApiTests().catch((err) => {
  console.error('❌ API Integration Test Failed:', err);
  process.exit(1);
});
