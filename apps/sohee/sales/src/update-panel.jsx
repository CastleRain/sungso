import React, { createContext, useContext, useEffect, useState } from 'react';
import { RefreshCw, Upload } from 'lucide-react';
import {Button, SourceFile, SourceDateTime, SourcePassword} from './ui.jsx';
export const UpdateContext = createContext(null);
export function UpdatePanel() {
  const context = useContext(UpdateContext);
  const [cap, setCap] = useState(null), [busy, setBusy] = useState(false), [message, setMessage] = useState(''), [candidate, setCandidate] = useState(null);
  const [file, setFile] = useState(null), [password, setPassword] = useState(''), [capturedAt, setCapturedAt] = useState('');
  useEffect(() => { let live = true; context?.connection.request('status').then(value => { if (live) setCap(value); }).catch(() => { if (live) setCap({ mode: 'unavailable', writesEnabled: false }); }); return () => { live = false; }; }, [context?.connection]);
  async function action(fn) { setBusy(true); setMessage(''); try { await fn(); } catch (error) { setMessage(error.message); } finally { setBusy(false); } }
  async function prepare(event) {
    event.preventDefault();
    if (!file || !capturedAt) return;
    if (file.size > 15 * 1024 * 1024) { setMessage('15MB 이하 토스 ZIP 파일을 선택해주세요.'); return; }
    const secret = password; setPassword(''); setCandidate(null);
    await action(async () => {
      const bytes = new Uint8Array(await file.arrayBuffer()); let binary = '';
      for (let i = 0; i < bytes.length; i += 8192) binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
      const result = await context.connection.request('prepare', { archive: btoa(binary), password: secret, capturedAt: capturedAt + ':00+09:00', expectedVersion: context.manifest?.version || null });
      setCandidate(result); setMessage('원본 대조를 통과했습니다. 기간을 확인한 뒤 저장하세요.');
    });
  }
  return <section className="panel update-panel"><div className="section-head"><div><div className="eyebrow">TOSS UPDATE</div><h2>이 컴퓨터에서 수동 갱신</h2><p>Codex에 수집 요청 → 이 컴퓨터의 토스에서 원본 받기 → 검증 후 Firebase 저장 순서로 진행합니다.</p></div><Button className="outline" disabled={busy || !context} onClick={() => action(() => context.reload())}><RefreshCw size={16}/> 저장된 분석 다시 불러오기</Button></div>
  <p className="note">{!cap?'갱신 연결 확인 중…':cap.mode==='local-only'?'저장된 분석을 조회하고 있습니다. 새 토스 원본은 요청할 때 Codex가 PC에서 가져와 반영합니다.':cap.mode==='upload'?'이 컴퓨터에서 받은 토스 ZIP을 처리합니다. 앱을 열거나 분석을 다시 불러와도 수집은 시작하지 않습니다.':'이 컴퓨터의 갱신 서비스가 꺼져 있습니다. 수동 갱신할 때 실행해주세요. 저장된 분석은 계속 조회할 수 있습니다.'}</p>
  <ol className="method-list"><li><strong>Codex에 “매출 갱신해줘” 요청하기</strong><p>요청할 때 Codex가 이 컴퓨터의 토스 화면을 열어 매출 원본 ZIP을 가져옵니다. 로그인·인증 입력이 필요하면 직접 진행해주세요. 마지막 부분일부터 최신일까지 포함하고, 사후 환불 확인이 필요하면 최근 기간을 겹쳐 받으세요.</p></li><li><strong>로컬에서 검증하고 저장</strong><p>가져온 원본과 실제 추출 시각으로 검증합니다. 아래 입력은 직접 받은 파일을 처리할 때도 사용할 수 있습니다. 검증 결과의 교체 기간을 확인한 뒤 저장합니다. 과거 페이히어는 다시 수집하지 않습니다.</p></li></ol>
  {cap?.mode!=='local-only'&&<form onSubmit={prepare} className="import-form"><SourceFile value={file} onChange={v=>{setFile(v);setCandidate(null)}} disabled={busy}/><SourceDateTime value={capturedAt} onChange={v=>{setCapturedAt(v);setCandidate(null)}} disabled={busy}/><SourcePassword value={password} onChange={e=>setPassword(e.target.value)} disabled={busy}/><Button className="primary" type="submit" disabled={busy || cap?.mode!=='upload' || !file || !capturedAt}><Upload size={16}/>{busy?'처리 중…':'새 원본 검증하기'}</Button></form>}
  {cap?.mode!=='local-only'&&<p className="footnote">조회·분석 재조회는 토스에서 새 데이터를 받는 동작이 아닙니다. 추출일을 정확히 입력해야 부분일을 구분할 수 있습니다. 비밀번호는 저장하지 않습니다.</p>}
  {candidate&&<div className="candidate"><h3>저장 전 확인</h3><p>교체 범위 {candidate.start}–{candidate.end} · 완결일 {candidate.completeThrough}</p><p>부분일 {candidate.partialDates.join(', ')||'없음'} · 검증된 새 분석 · 기존 페이히어 보존</p><Button className="primary" disabled={busy || !cap?.writesEnabled} onClick={()=>action(async()=>{await context.connection.request('commit',{candidateId:candidate.id,expectedVersion:context.manifest?.version||null});setCandidate(null);await context.reload();})}>검증한 분석을 Firebase에 저장</Button>{!cap?.writesEnabled&&<p className="footnote">로컬 검토 모드입니다. 운영 이전 승인 전까지 Firebase 쓰기가 잠겨 있습니다.</p>}</div>}
  <p role="status" aria-live="polite">{message}</p></section>;
}
