import React, { useEffect, useState, useMemo } from 'react';
import { createRoot } from 'react-dom/client';
import { connectSales } from './firebase.mjs';
import { SalesApp, ErrorBoundary, BASE } from './pages.jsx';
import { UpdateContext } from './update-panel.jsx';
import {SalesUI, Button} from './ui.jsx';
import '@mantine/core/styles.css';
import '@mantine/dates/styles.css';
import './style.css';
import './ui.css';
import './dashboard.css';
import './owner.css';
import './menu-edit.css';
import './polish.css';
import './compact.css';
import './menu-compact.css';
import './prep-compact.css';
import {MenuRuleContext} from './menu-editor.jsx';
import {applyMenuRules} from '../../../../services/sohee/menu-rules.mjs';

function App({ connection }) {
  const [state, setState] = useState({ loading: true, data: null, error: '' });
  async function reload() {
    setState(old => ({ ...old, loading: true, error: '' }));
    try { const result = await connection.load(); setState({ ...result, loading: false, error: '' }); }
    catch { setState({ data: null, loading: false, error: '매출을 불러오지 못했습니다. 회원 권한과 연결 상태를 확인해주세요.' }); }
  }
  useEffect(() => { void reload(); }, []);
  const displayData=useMemo(()=>applyMenuRules(state.data,state.menuRules||[]),[state.data,state.menuRules]);
  async function refreshRules(){const rules=await connection.loadMenuRules();setState(old=>({...old,menuRules:rules}));return rules;}
  async function saveRule(draft,revision){const saved=await connection.saveMenuRule(draft,revision);setState(old=>({...old,menuRules:[...(old.menuRules||[]).filter(rule=>rule.sourceName!==saved.sourceName),saved]}));return saved;}
  if (state.loading && !state.data) return <div className="empty" role="status">회원 전용 매출을 불러오고 있습니다…</div>;
  if (state.error) return <div className="empty" role="alert"><h1>연결을 확인해주세요</h1><p>{state.error}</p><Button className="primary" onClick={reload}>다시 불러오기</Button><a href="/sungso/sohee/workspace/">작업실로</a></div>;
  const route = location.pathname.slice(BASE.length).replace(/\/$/, '') || 'changes';
  return <UpdateContext.Provider value={{ connection, reload, manifest: state.manifest }}><MenuRuleContext.Provider value={{rawData:state.data,rules:state.menuRules||[],saveRule,refreshRules}}><SalesApp data={displayData} route={route} status={connection.label||"Firebase 회원 전용"}/></MenuRuleContext.Provider></UpdateContext.Provider>;
}

const root = createRoot(document.getElementById('sales-root'));
try {
  const connection = await connectSales(() => {
    root.unmount();
    // Recharts measures tick/tooltip text in a body-level span outside React.
    document.getElementById('recharts_measurement_span')?.remove();
  });
  root.render(<SalesUI><ErrorBoundary><App connection={connection}/></ErrorBoundary></SalesUI>);
} catch {
  root.render(<div className="empty" role="alert">회원 연결을 완료하지 못했습니다. 새로고침해 다시 확인해주세요.</div>);
}
