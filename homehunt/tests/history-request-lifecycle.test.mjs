import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { connectedHistoryMonthLoader } from '../scripts/history-request-lifecycle.mjs';
const require = createRequire(import.meta.url);
const { fetchApartmentHistoryDirect } = require('../../functions/molit.js');

test('a cancelled five-year server batch stops before scheduling its remaining monthly API work', async () => {
  const response = { destroyed: false };
  let upstreamCalls = 0;
  const payload = await fetchApartmentHistoryDirect({
    serviceKey: 'unit-test-key', lawdCd: '41171', aptName: '테스트단지', months: 60,
    endMonth: '2026-08', concurrency: 3,
    monthLoader: connectedHistoryMonthLoader(response, async () => {
      upstreamCalls += 1;
      if (upstreamCalls === 3) response.destroyed = true;
      return { records: [], totalCount: 0 };
    }),
  });
  assert.equal(upstreamCalls, 3);
  assert.equal(payload.partial, true);
  assert.equal(payload.missingRequests.length, 117);
});

test('disconnected clients cannot start any monthly API request', async () => {
  let called = false;
  const load = connectedHistoryMonthLoader({ destroyed: true }, async () => { called = true; });
  await assert.rejects(load({ dealYmd: '202608', type: 'sale' }), { name: 'AbortError' });
  assert.equal(called, false);
});
