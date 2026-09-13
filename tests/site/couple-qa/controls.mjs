import { actor, setActor } from './runtime.mjs';
import './maps.mjs';
const ready = document.readyState === 'loading' ? new Promise(resolve => document.addEventListener('DOMContentLoaded', resolve, { once: true })) : Promise.resolve();
await ready;
const panel = document.createElement('details'); panel.id = 'qa-controls'; panel.open = true;
Object.assign(panel.style, { position: 'fixed', zIndex: '2147483647', bottom: '8px', left: '8px', maxWidth: 'calc(100vw - 16px)', width: '360px', padding: '9px', border: '1px solid #6575a4', borderRadius: '8px', background: '#fff', color: '#223', font: '11px system-ui', boxShadow: '0 3px 20px #0002' });
const summary = document.createElement('summary'); summary.textContent = 'QA 대역 · 운영 DB/공급자 연결 차단'; panel.append(summary);
// Keep the collapsed harness away from the app's mobile action bar.
const panelStyle = document.createElement('style');
panelStyle.textContent = '#qa-controls:not([open]){top:72px;right:8px;bottom:auto!important;left:auto!important;width:auto!important}#qa-controls:not([open]) summary{font-size:0}#qa-controls:not([open]) summary::after{content:"QA";font:10px system-ui}';
document.head.append(panelStyle);
const actions = document.createElement('div'); Object.assign(actions.style, { display: 'flex', flexWrap: 'wrap', gap: '5px', marginTop: '8px' }); panel.append(actions);
const button = (title, action) => { const button = document.createElement('button'); button.textContent = title; button.type = 'button'; button.style.cssText = 'padding:5px;border:1px solid #ddd;border-radius:4px;background:#f5f7ff;color:#223;font:11px system-ui;cursor:pointer'; button.addEventListener('click', action); actions.append(button); };
for (const [title, value] of [['성우 로그인', 'sungwoo'], ['소희 로그인', 'sohee'], ['비회원 로그인', 'nonmember'], ['로그아웃', 'signed-out']]) button(title, () => setActor(value));
async function control(action, extra = {}) { await fetch('/__qa/control', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, ...extra }) }); }
button('권한 회수', () => control('revoke', { uid: actor() === 'sohee' ? 'qa-sohee' : 'qa-sungwoo' }));
button('회원 복구', () => control('restore-members'));
button('다음 저장 실패', () => control('fail-next-write'));
button('다른 기기 홈 편집', () => control('remote-home-edit'));
const status = document.createElement('p'); status.style.cssText = 'margin:8px 0 0;line-height:1.6;overflow-wrap:anywhere'; panel.append(status); document.body.append(panel);
async function refresh() { try { const state = await (await fetch('/__qa/state')).json(); status.textContent = `${actor()} · 대역 읽기 ${state.counters.reads} / 쓰기 ${state.counters.writes} / 거절 ${state.counters.denied} · 운영 요청 0 · 홈 rev ${state.home.revision}${state.failNextWrite ? ' · 다음 저장 실패 예약' : ''}`; } catch {} }
setInterval(refresh, 1000); void refresh();
