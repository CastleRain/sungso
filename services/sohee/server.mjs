import http from 'node:http';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { createImporter } from './importer.mjs';
import { publishSnapshot } from './snapshot.mjs';

const messages = {
  AUTH_REQUIRED: 'Google 회원 로그인이 필요합니다.', FORBIDDEN: '활성 회원 권한이 필요합니다.',
  WRITES_DISABLED: '운영 저장은 아직 승인 전입니다. 검증 결과만 확인할 수 있습니다.',
  INVALID_INPUT: '파일과 한국 시간 기준 추출 시각을 확인해주세요.', INVALID_ARCHIVE: '유효한 15MB 이하 ZIP 파일을 선택해주세요.',
  DUPLICATE_ARCHIVE: '이미 반영한 원본입니다. 새로운 토스 내보내기를 선택해주세요.',
  IMPORT_BUSY: '다른 원본을 검증 중입니다. 잠시 후 다시 시도해주세요.',
  IMPORT_VALIDATION_FAILED: '원본 검증에 실패했습니다. 암호·조회 기간·합계·집계 기준을 확인해주세요. 기존 자료는 유지했습니다.',
  REVISION_CONFLICT: '다른 갱신이 먼저 반영되었습니다. 최신 분석을 불러온 뒤 원본을 다시 검증해주세요.',
  BASELINE_UNAVAILABLE: '현재 Firebase 버전의 로컬 원본이 없습니다. 관리자에게 원본 복원을 요청해주세요.',
  CANDIDATE_UNAVAILABLE: '검증 결과가 만료되었거나 계정이 다릅니다. 원본을 다시 검증해주세요.'
};
export async function authorize({ token, verifyToken, readMember }) {
  if (!token) throw new Error('AUTH_REQUIRED');
  let claims; try { claims = await verifyToken(token); } catch { throw new Error('AUTH_REQUIRED'); }
  if (claims.email_verified !== true || claims.firebase?.sign_in_provider !== 'google.com') throw new Error('FORBIDDEN');
  const member = await readMember(claims.uid);
  if (!member?.active || !['sungwoo', 'sohee'].includes(member.role)) throw new Error('FORBIDDEN');
  return claims.uid;
}

export function createSalesApi({ db, verifyToken, importer, writesEnabled = false, origin }) {
  const readMember = async uid => (await db.doc(`site_members/${uid}`).get()).data();
  const send = (res, status, value) => { res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' }); res.end(JSON.stringify(value)); };
  return async (req, res) => {
    try {
      if (req.headers.origin && req.headers.origin !== origin) return send(res, 403, { message: '허용되지 않은 요청입니다.' });
      const token = req.headers.authorization?.match(/^Bearer (\S+)$/)?.[1];
      const assertAuthorized = () => authorize({ token, verifyToken, readMember });
      const actor = await assertAuthorized();
      const route = new URL(req.url, origin).pathname;
      if (req.method === 'GET' && route === '/api/sohee/status') return send(res, 200, { mode: 'upload', automaticCollection: false, writesEnabled });
      if (req.method !== 'POST' || !['/api/sohee/prepare','/api/sohee/commit'].includes(route)) return send(res, 404, { message: '요청 경로를 찾을 수 없습니다.' });
      if (!req.headers['content-type']?.startsWith('application/json')) return send(res, 415, { message: '지원하지 않는 형식입니다.' });
      let bytes = 0; const parts = [];
      for await (const part of req) { bytes += part.length; if (bytes > 21 * 1024 * 1024) return send(res, 413, { message: '원본 파일이 너무 큽니다.' }); parts.push(part); }
      const body = JSON.parse(Buffer.concat(parts).toString('utf8'));
      if (route.endsWith('/prepare')) {
        const current = (await db.doc('sohee_sales/current').get()).data();
        if ((current?.version || null) !== (body.expectedVersion || null)) throw new Error('REVISION_CONFLICT');
        const result = await importer.prepare(body, actor);
        await assertAuthorized(); return send(res, 200, result);
      }
      if (!writesEnabled) throw new Error('WRITES_DISABLED');
      const result = await importer.commit(body.candidateId, actor, body.expectedVersion || null, (snapshot, expectedVersion) => publishSnapshot(db, snapshot, expectedVersion, assertAuthorized));
      return send(res, 200, result);
    } catch (error) {
      const code = messages[error.message] ? error.message : 'IMPORT_VALIDATION_FAILED';
      send(res, ['FORBIDDEN','WRITES_DISABLED'].includes(code) ? 403 : code === 'AUTH_REQUIRED' ? 401 : code === 'REVISION_CONFLICT' ? 409 : 400, { message: messages[code] });
    }
  };
}

export async function runtime() {
  const emulator = process.env.FIRESTORE_EMULATOR_HOST;
  if (emulator && !/^(127\.0\.0\.1|localhost):\d+$/.test(emulator)) throw new Error('Only a loopback Emulator is allowed.');
  const { initializeApp, applicationDefault } = await import('firebase-admin/app');
  const { getAuth } = await import('firebase-admin/auth');
  const { getFirestore, Firestore } = await import('firebase-admin/firestore');
  const cli = !emulator && process.env.SOHEE_FIREBASE_CLI ? (await import('./local-credentials.mjs')).cliCredentials(process.env.SOHEE_FIREBASE_CLI) : null;
  const app = initializeApp({ projectId: emulator ? 'demo-homehunt' : 'sungso-358cb', ...(!emulator ? { credential: cli?.credential || applicationDefault() } : {}) }, 'sohee-import-server');
  return { db: cli ? new Firestore({ projectId: 'sungso-358cb', credentials: cli.firestore }) : getFirestore(app), verifyToken: token => getAuth(app).verifyIdToken(token, true) };
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const port = Number(process.env.PORT || 8791), origin = process.env.SOHEE_ALLOWED_ORIGIN || 'http://127.0.0.1:4177';
  const dependencies = await runtime();
  const importer = createImporter({ privateRoot: path.resolve(process.env.SOHEE_PRIVATE_ROOT || 'sohee'), python: process.env.SOHEE_PYTHON || 'python3' });
  const handler = createSalesApi({ ...dependencies, importer, origin, writesEnabled: !!process.env.FIRESTORE_EMULATOR_HOST || process.env.SOHEE_WRITES_ENABLED === '1' });
  http.createServer(handler).listen(port, '127.0.0.1', () => console.log('Private sales import service ready on loopback.'));
}
