const assert = require('assert');
const { BASE62, encodeBase62, decodeBase62 } = require('../src/utils/base62');

console.log('🧪 Running Base62 Encoder / Decoder Unit Tests...\n');

// Test Case 1: Encoding test cases
assert.strictEqual(encodeBase62(0), '0', 'Test 1 Failed: encodeBase62(0)');
assert.strictEqual(encodeBase62(1), 'B', 'Test 2 Failed: encodeBase62(1)');
assert.strictEqual(encodeBase62(25), 'Z', 'Test 3 Failed: encodeBase62(25)');
assert.strictEqual(encodeBase62(26), 'a', 'Test 4 Failed: encodeBase62(26)');
assert.strictEqual(encodeBase62(51), 'z', 'Test 5 Failed: encodeBase62(51)');
assert.strictEqual(encodeBase62(52), '0', 'Test 6 Failed: encodeBase62(52)');
assert.strictEqual(encodeBase62(61), '9', 'Test 7 Failed: encodeBase62(61)');
assert.strictEqual(encodeBase62(62), 'BA', 'Test 8 Failed: encodeBase62(62)');
assert.strictEqual(encodeBase62(125), 'CB', 'Test 9 Failed: encodeBase62(125)');

// Test Case 2: Roundtrip encode -> decode for positive IDs (> 0)
const positiveIDs = [1, 2, 62, 125, 1000, 99999, 100000000];
for (const id of positiveIDs) {
  const encoded = encodeBase62(id);
  const decoded = decodeBase62(encoded);
  assert.strictEqual(decoded, id, `Roundtrip test failed for ID ${id}: encoded="${encoded}", decoded=${decoded}`);
}

console.log('✅ All Base62 Unit Tests Passed Successfully!');
