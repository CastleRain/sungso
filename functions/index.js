// functions/index.js — Naver Blog Search proxy + Firestore cache
const functions = require('firebase-functions');
const admin     = require('firebase-admin');
const https     = require('https');

admin.initializeApp();
const db = admin.firestore();

const NAVER_CLIENT_ID     = 'SIUfSSP3KTI1ui7rzHSk';
const NAVER_CLIENT_SECRET = 'kPSbNhWM3y';

const RESORT_QUERIES = {
  cora_cora:    '코라코라 몰디브 후기',
  ananea:       '아나네아 몰디브 후기',
  veligandu:    '벨리간두 몰디브 후기',
  dhigufaru:    '디구파루 몰디브 후기',
  furaveri:     '푸라베리 몰디브 후기',
  fushifaru:    '푸시파루 몰디브 후기',
  raaya:        '라야 바이 앳모스피어 후기',
  varu:         '바루 앳모스피어 몰디브 후기',
  saii_so:      '사이라군 SO몰디브 후기',
  emerald:      '에메랄드 파스멘두 몰디브 후기',
  oblu_sangeli: '오블루 상겔리 몰디브 후기',
  outrigger:    '아웃리거 마푸시바루 후기',
};

// djb2 hash → base36 (same algorithm as frontend)
function makeLinkHash(url) {
  let h = 5381;
  for (let i = 0; i < url.length; i++) {
    h = (Math.imul(h, 33) ^ url.charCodeAt(i)) >>> 0;
  }
  return h.toString(36);
}

function stripHtml(str) {
  return (str || '').replace(/<[^>]*>/g, '').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&amp;/g,'&').replace(/&quot;/g,'"').replace(/&#39;/g,"'").trim();
}

function fetchNaverApi(query, sort) {
  return new Promise((resolve, reject) => {
    const params = new URLSearchParams({ query, display: '8', start: '1', sort });
    const options = {
      hostname: 'openapi.naver.com',
      path:     `/v1/search/blog?${params}`,
      headers: {
        'X-Naver-Client-Id':     NAVER_CLIENT_ID,
        'X-Naver-Client-Secret': NAVER_CLIENT_SECRET,
      },
    };
    const req = https.get(options, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          resolve(parsed.items || []);
        } catch (e) {
          reject(new Error('Naver API parse error: ' + data.slice(0, 200)));
        }
      });
    });
    req.on('error', reject);
    req.setTimeout(8000, () => { req.destroy(); reject(new Error('Naver API timeout')); });
  });
}

exports.naverBlogSearch = functions.https.onRequest(async (req, res) => {
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(204).send('');
  }
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { resortId, sort = 'sim' } = req.query;

  if (!resortId || !RESORT_QUERIES[resortId]) {
    return res.status(400).json({ error: 'Invalid or missing resortId' });
  }
  if (sort !== 'sim' && sort !== 'date') {
    return res.status(400).json({ error: 'sort must be sim or date' });
  }

  const query = RESORT_QUERIES[resortId];

  try {
    const rawItems = await fetchNaverApi(query, sort);

    const items = rawItems.map(item => ({
      linkHash:    makeLinkHash(item.link || ''),
      link:        item.link        || '',
      title:       stripHtml(item.title).slice(0, 100),
      bloggername: item.bloggername || '',
      bloggerlink: item.bloggerlink || '',
      postdate:    item.postdate    || '',
      description: stripHtml(item.description).slice(0, 120),
    }));

    // naver_blog_cache/{resortId} 저장
    await db.collection('naver_blog_cache').doc(resortId).set({
      query,
      sort,
      items,
      fetchedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    // naver_blog_meta/{resortId} count 갱신
    await db.collection('naver_blog_meta').doc(resortId).set({
      count:     items.length,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    return res.json({ ok: true, items, query, sort });

  } catch (err) {
    console.error('naverBlogSearch error:', err);
    return res.status(500).json({ error: err.message });
  }
});
