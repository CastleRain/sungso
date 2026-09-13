import { ApiError } from './auth-gate.mjs';
import { stripNaverMarkup } from '../scripts/naver-local-search.mjs';

const endpoint = 'https://openapi.naver.com/v1/search/blog.json';
const resortIds = new Set(['cora_cora', 'ananea', 'veligandu', 'dhigufaru', 'furaveri', 'fushifaru', 'raaya', 'varu', 'saii_so', 'emerald', 'oblu_sangeli', 'outrigger']);
const safeLink = value => { try { const url = new URL(value); return ['http:', 'https:'].includes(url.protocol) ? url.href : ''; } catch { return ''; } };
function linkHash(url) { let value = 5381; for (const char of url) value = (Math.imul(value, 33) ^ char.charCodeAt(0)) >>> 0; return value.toString(36); }

export function createBlogSearch({ env = {}, db = null, fetchImpl = fetch, now = () => new Date() } = {}) {
  return async ({ query: raw, sort = 'sim', resortId = '' } = {}) => {
    const query = String(raw || '').normalize('NFKC').trim();
    if (query.length < 2 || query.length > 100 || /[\x00-\x1f]/.test(query) || !['sim', 'date'].includes(sort)
      || (resortId && !resortIds.has(resortId))) {
      throw new ApiError('INVALID_BLOG_QUERY', '검색어와 정렬을 확인해주세요.');
    }
    const clientId = String(env.NAVER_SEARCH_CLIENT_ID || '').trim();
    const clientSecret = String(env.NAVER_SEARCH_CLIENT_SECRET || '').trim();
    if (!clientId || !clientSecret) throw new ApiError('BLOG_SEARCH_NOT_CONFIGURED', '블로그 검색 연결을 준비하고 있어요.', 503);
    const url = new URL(endpoint);
    url.search = new URLSearchParams({ query, sort, display: '8', start: '1' }).toString();
    let payload;
    try {
      const response = await fetchImpl(url, { headers: { 'X-Naver-Client-Id': clientId, 'X-Naver-Client-Secret': clientSecret },
        signal: AbortSignal.timeout(8000), redirect: 'error' });
      if (!response.ok) throw new Error('provider unavailable');
      const text = await response.text();
      if (text.length > 256 * 1024) throw new Error('oversized provider response');
      payload = JSON.parse(text);
    } catch { throw new ApiError('BLOG_SEARCH_UNAVAILABLE', '블로그 검색에 연결하지 못했어요. 잠시 후 다시 시도해주세요.', 503); }
    const items = (Array.isArray(payload.items) ? payload.items : []).slice(0, 8).map(item => ({
      title: stripNaverMarkup(item.title).slice(0, 100), description: stripNaverMarkup(item.description).slice(0, 200),
      link: safeLink(item.link), linkHash: linkHash(safeLink(item.link)), bloggername: stripNaverMarkup(item.bloggername).slice(0, 100),
      bloggerlink: safeLink(item.bloggerlink), postdate: /^\d{8}$/.test(String(item.postdate || '')) ? item.postdate : '',
    })).filter(item => item.link);
    if (db && resortId) {
      const timestamp = now();
      await db.runTransaction(async tx => {
        tx.set(db.doc(`naver_blog_cache/${resortId}`), { query, sort, items, fetchedAt: timestamp });
        tx.set(db.doc(`naver_blog_meta/${resortId}`), { count: items.length, updatedAt: timestamp });
      });
    }
    return { ok: true, query, sort, items };
  };
}
