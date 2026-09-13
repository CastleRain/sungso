import test from 'node:test';
import assert from 'node:assert/strict';
import { createBlogSearch } from '../services/homehunt/server/blog-search.mjs';
const env = { NAVER_SEARCH_CLIENT_ID: 'synthetic-id', NAVER_SEARCH_CLIENT_SECRET: 'synthetic-secret' };

test('blog proxy needs explicitly configured server credentials and validates input before fetching', async () => {
  let calls = 0;
  const fetchImpl = async () => { calls++; };
  await assert.rejects(createBlogSearch({ fetchImpl })({ query: 'fixture' }), { code: 'BLOG_SEARCH_NOT_CONFIGURED' });
  for (const request of [{ query: 'x' }, { query: 'x'.repeat(101) }, { query: 'a\nb' }, { query: 'fixture', sort: 'injected' }, { query: 'fixture', resortId: '../other' }]) {
    await assert.rejects(createBlogSearch({ env, fetchImpl })(request), { code: 'INVALID_BLOG_QUERY' });
  }
  assert.equal(calls, 0);
});

test('successful resort searches atomically preserve the existing cache and meta contract on the server', async () => {
  const batches = [], timestamp = new Date('2030-01-01T00:00:00Z');
  const db = { doc: path => ({ path }), async runTransaction(action) { const writes = []; await action({ set: (ref, data) => writes.push([ref.path, data]) }); batches.push(writes); } };
  const search = createBlogSearch({ env, db, now: () => timestamp, fetchImpl: async () => ({ ok: true,
    text: async () => JSON.stringify({ items: [{ title: 'Fixture', link: 'https://blog.naver.com/fixture' }] }) }) });
  const result = await search({ query: 'fixture', resortId: 'cora_cora' });
  assert.equal(batches.length, 1);
  assert.deepEqual(batches[0].map(write => write[0]), ['naver_blog_cache/cora_cora', 'naver_blog_meta/cora_cora']);
  assert.deepEqual(batches[0][0][1].items, result.items);
  assert.equal(batches[0][0][1].fetchedAt, timestamp);
  assert.equal(batches[0][1][1].count, 1);
  assert.equal(batches[0][1][1].updatedAt, timestamp);
});

test('blog request uses fixed HTTPS upstream, bounded results and sanitized display values', async () => {
  let request;
  const search = createBlogSearch({ env, fetchImpl: async (url, options) => {
    request = { url, options };
    return { ok: true, text: async () => JSON.stringify({ items: [
      { title: '<b>Fixture</b>', description: '&amp; text', link: 'https://blog.naver.com/fixture', postdate: '20260913' },
      { title: 'bad link', link: 'javascript:alert(1)' },
    ] }) };
  } });
  const value = await search({ query: 'fixture & query', sort: 'date' });
  assert.equal(request.url.origin, 'https://openapi.naver.com');
  assert.equal(request.url.searchParams.get('query'), 'fixture & query');
  assert.equal(request.options.redirect, 'error');
  assert.equal(request.options.headers['X-Naver-Client-Secret'], 'synthetic-secret');
  assert.equal(value.items.length, 1); assert.equal(value.items[0].title, 'Fixture');
  assert.equal(value.items[0].description, '& text');
  assert.ok(!JSON.stringify(value).includes('synthetic-secret'));
});

test('provider failures never return supplier text or credentials', async () => {
  const search = createBlogSearch({ env, fetchImpl: async () => { throw new Error('synthetic-secret'); } });
  await assert.rejects(search({ query: 'fixture' }), error => error.code === 'BLOG_SEARCH_UNAVAILABLE' && !error.message.includes('synthetic-secret'));
});
