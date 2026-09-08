import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = readFileSync(new URL('../scripts/local-market-server.mjs', import.meta.url), 'utf8');
const catalog = { catalogId: '41465100008375', regionCode: '41465', name: 'fixture complex', address: 'fixture official address' };
function harness(upstream = async () => ({ provider: 'kapt', status: 'matched', errors: [] })) {
  let calls = 0;
  const context = vm.createContext({ Date,
    loadCatalog: async () => ({ apartments: [catalog] }),
    kaptProvider: { getComplexInfo: async record => { calls++; assert.strictEqual(record, catalog); return upstream(); } },
    kaptDiagnostic: null,
    json: (_, status, body) => ({ status, body }),
    errorPayload: (code, error) => ({ ok: false, code, error }),
  });
  vm.runInContext(source.match(/async function handleOfficialComplex\([^]*?\n\}/)[0], context);
  return { calls: () => calls, context, get: query => context.handleOfficialComplex(new URL(`http://127.0.0.1/api/kapt/complex?${query}`), {}) };
}
test('K-apt endpoint resolves only an existing server catalog id and ignores caller addresses', async () => {
  const h = harness();
  const result = await h.get(`catalogId=${catalog.catalogId}&address=forged&kaptCode=forged&url=https://other.invalid`);
  assert.equal(result.status, 200);
  assert.equal(result.body.ok, true);
  assert.equal(h.calls(), 1);
  assert.equal(h.context.kaptDiagnostic.state, 'matched');
});
test('invalid and missing catalog ids never call any provider', async () => {
  const h = harness();
  assert.equal((await h.get('')).status, 400);
  assert.equal((await h.get('catalogId=../secret')).status, 400);
  assert.equal((await h.get('catalogId=not-present')).status, 404);
  assert.equal(h.calls(), 0);
});
test('unexpected provider errors never expose URLs, credentials or raw bodies', async () => {
  const h = harness(async () => { throw new Error('secret-key https://upstream.invalid private-body'); });
  const result = await h.get(`catalogId=${catalog.catalogId}`);
  assert.equal(result.status, 502);
  assert.equal(result.body.code, 'KAPT_UNAVAILABLE');
  assert.doesNotMatch(JSON.stringify(result), /secret-key|private-body|upstream.invalid/);
});
test('partial evidence remains available, with status separate from key configuration', async () => {
  const h = harness(async () => ({ status: 'partial', households: 700, errors: [{ code: 'ACCESS_DENIED', part: 'detail' }] }));
  const result = await h.get(`catalogId=${catalog.catalogId}`);
  assert.equal(result.status, 200);
  assert.equal(result.body.households, 700);
  assert.equal(h.context.kaptDiagnostic.codes[0], 'ACCESS_DENIED');
});
