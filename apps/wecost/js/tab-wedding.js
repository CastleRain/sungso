import { won, dday, pct, CAT_COLOR } from './utils.js';
import { addItem, updateItem, deleteItem } from './firebase.js';

export function renderWedding(st) {
  const items         = st.items || [];
  const totalPlanned  = st.totalPlanned || 0;
  const totalPaid     = st.totalPaid    || 0;
  const remain        = Math.max(0, totalPlanned - totalPaid);
  const paidCount     = items.filter(i => (i.deposit || 0) + (i.actual || 0) > 0).length;
  const progPct       = pct(totalPaid, totalPlanned);

  // 상단 4 카드
  _set('s-total',      won(totalPlanned));
  _set('s-paid',       won(totalPaid));
  _set('s-remain',     won(remain));
  _set('s-total-hint', `${items.filter(i => i.planned > 0).length}개 항목`);
  _set('s-paid-hint',  `${paidCount}개 납부 완료`);

  // 30일 내 납부
  const is30 = i => { const d = dday(i.balanceDue); return d !== null && d >= 0 && d <= 30 && (i.balance || 0) > 0; };
  const soon30      = items.filter(is30).reduce((s, i) => s + (i.balance || 0), 0);
  const soon30count = items.filter(is30).length;
  _set('s-soon',      won(soon30));
  _set('s-soon-hint', soon30count > 0 ? `${soon30count}건` : '없음');

  // 진행률
  const progEl = document.getElementById('prog-fill');
  if (progEl) progEl.style.width = progPct + '%';
  _set('prog-info', `${progPct}% · ${won(totalPaid)} / ${won(totalPlanned)}`);

  // 빈 상태
  if (items.length === 0) {
    _renderEmptyState();
    return;
  }

  // 카테고리 집계
  const catMap = {};
  items.forEach(i => {
    if (!catMap[i.cat]) catMap[i.cat] = { planned: 0, paid: 0 };
    catMap[i.cat].planned += i.planned || 0;
    catMap[i.cat].paid    += (i.deposit || 0) + (i.actual || 0);
  });
  const cats = Object.entries(catMap).sort((a, b) => b[1].planned - a[1].planned);
  const maxP = Math.max(...cats.map(([, v]) => v.planned), 1);

  // 카테고리 바
  const catEl = document.getElementById('cat-rows');
  if (catEl) {
    catEl.innerHTML = '';
    cats.forEach(([k, v]) => {
      const color  = CAT_COLOR[k] || '#6b7280';
      const barPct = Math.round(v.planned / maxP * 100);
      const emoji  = k.match(/^[^가-힣\s]+/)?.[0] || k[0] || '';
      const label  = k.slice(emoji.length).trim();
      const div    = document.createElement('div');
      div.className = 'cat-row';
      div.innerHTML = `
        <div class="cat-badge" style="background:${color}22">${emoji}</div>
        <div class="cat-label">${label}</div>
        <div class="cat-bar-wrap">
          <div class="cat-bar-bg">
            <div class="cat-bar-fill" style="width:${barPct}%;background:${color}"></div>
          </div>
        </div>
        <div class="cat-amounts">
          <span class="cat-planned">${won(v.planned)}</span>
          <span class="cat-paid ${v.paid > 0 ? 'has' : 'none'}">${v.paid > 0 ? `지출 ${won(v.paid)}` : '-'}</span>
        </div>
      `;
      catEl.appendChild(div);
    });
  }

  // 잔금 타임라인
  const tlEl = document.getElementById('timeline');
  if (tlEl) {
    tlEl.innerHTML = '';
    const dues = items
      .filter(i => i.balanceDue && (i.balance || 0) > 0)
      .map(i => ({ ...i, dd: dday(i.balanceDue) }))
      .sort((a, b) => a.dd - b.dd);

    if (dues.length === 0) {
      tlEl.innerHTML = '<p style="color:var(--text-muted);font-size:13px;text-align:center;padding:16px">잔금지급일과 잔금이 입력된 항목이 없어요.</p>';
    } else {
      dues.forEach(item => {
        const d   = item.dd;
        const cls = d < 0 ? 'past' : d <= 7 ? 'urgent' : d <= 30 ? 'soon' : 'normal';
        const ddTxt = d < 0 ? `D+${Math.abs(d)}` : d === 0 ? 'D-Day!' : `D-${d}`;
        const el  = document.createElement('div');
        el.className = `tl-item ${cls}`;
        el.innerHTML = `
          <div class="tl-date">${item.balanceDue.replace(/-/g, '/')}</div>
          <div class="tl-dday ${cls}">${ddTxt}</div>
          <div class="tl-info">
            <div class="tl-name">${item.name}</div>
            <div class="tl-cat">${item.cat || ''}</div>
          </div>
          <div class="tl-bal">${won(item.balance)}</div>
        `;
        tlEl.appendChild(el);
      });
    }
  }

  // 상세 테이블
  _set('tbl-count', `(${items.length}개)`);
  const tbody = document.getElementById('tbl-body');
  if (tbody) {
    tbody.innerHTML = '';
    const maxPlanned = Math.max(...items.map(i => i.planned || 0), 1);
    [...items].sort((a, b) => (b.planned || 0) - (a.planned || 0)).forEach(item => {
      const paid    = (item.deposit || 0) + (item.actual || 0);
      const p       = pct(paid, item.planned || 0);
      const barW    = pct(item.planned || 0, maxPlanned);
      const bCls    = paid > 0 && item.planned > 0 && paid >= item.planned ? 'done'
                    : paid > 0                                              ? 'partial'
                    : item.planned > 0                                      ? 'unpaid'
                    : 'empty';
      const bTxt    = { done: '완납', partial: '일부납부', unpaid: '미납', empty: '미입력' }[bCls];
      const tr      = document.createElement('tr');
      tr.dataset.id = item.id || '';
      tr.innerHTML  = `
        <td><span style="font-weight:600">${_esc(item.name)}</span> <span class="status-badge ${bCls}">${bTxt}</span></td>
        <td style="font-size:11px;color:var(--text-muted)">${item.cat || ''}</td>
        <td class="amt">${item.planned > 0 ? won(item.planned) : '-'}</td>
        <td class="amt" style="color:${item.deposit > 0 ? 'var(--income)' : 'var(--text-muted)'}">${item.deposit > 0 ? won(item.deposit) : '-'}</td>
        <td class="amt" style="color:${(item.balance || 0) > 0 ? 'var(--expense)' : 'var(--text-muted)'}">${(item.balance || 0) > 0 ? won(item.balance) : '-'}</td>
        <td class="amt" style="color:${paid > 0 ? 'var(--income)' : 'var(--text-muted)'}">${won(paid)}</td>
        <td>
          <div class="mini-bar">
            <div class="mini-bg"><div class="mini-fill" style="width:${barW}%"></div></div>
            <span style="font-size:10px;color:var(--text-muted);min-width:22px">${item.planned > 0 ? p + '%' : '-'}</span>
          </div>
        </td>
        <td style="white-space:nowrap">
          <button class="tbl-action-btn" onclick="window._openItemDrawer('${item.id}')">수정</button>
          <button class="tbl-action-btn del" onclick="window._confirmDeleteItem('${item.id}', '${_esc(item.name)}')">삭제</button>
        </td>
      `;
      tbody.appendChild(tr);
    });
  }
}

// ===== 빈 상태 =====

function _renderEmptyState() {
  const catEl = document.getElementById('cat-rows');
  if (catEl) {
    catEl.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">💍</div>
        <div class="empty-title">아직 등록된 결혼비용이 없어요.</div>
        <div class="empty-desc">웨딩홀, 스드메, 신혼여행 같은 큰 항목부터 추가해보세요.</div>
        <button class="btn btn-primary" onclick="window._openItemDrawer(null)">+ 첫 결혼비용 추가</button>
        <button class="btn btn-ghost" onclick="window._loadSampleItems()" style="margin-top:8px">샘플 항목 불러오기</button>
      </div>
    `;
  }
  const tlEl = document.getElementById('timeline');
  if (tlEl) tlEl.innerHTML = '';
  const tbody = document.getElementById('tbl-body');
  if (tbody) tbody.innerHTML = '';
  _set('tbl-count', '(0개)');
}

// ===== 드로어 핸들러 =====

export function registerWeddingHandlers(getStFn) {
  window._openItemDrawer = (id) => {
    const isNew = !id;
    document.getElementById('drawer-title').textContent = isNew ? '항목 추가' : '항목 수정';
    document.getElementById('drawer-item-id').value = id || '';
    document.getElementById('drawer-delete-btn').style.display = isNew ? 'none' : '';

    // 폼 초기화
    _clearDrawer();

    if (!isNew) {
      const st   = getStFn();
      const item = (st.items || []).find(i => i.id === id);
      if (item) {
        _setDi('di-name',        item.name || '');
        _setDi('di-cat',         item.cat  || '✨기타');
        _setDiNum('di-planned',  item.planned  || 0);
        _setDiNum('di-deposit',  item.deposit  || 0);
        _setDiNum('di-actual',   item.actual   || 0);
        _setDi('di-balance-due', item.balanceDue || '');
        _setDi('di-memo',        item.memo || '');
        // 편집 모드: 기존 값의 한국어 단위 힌트 갱신
        ['di-planned:hint-di-planned', 'di-deposit:hint-di-deposit', 'di-actual:hint-di-actual'].forEach(pair => {
          const [inpId, hintId] = pair.split(':');
          const el = document.getElementById(inpId);
          if (el && window._fmtMoneyHint) window._fmtMoneyHint(el, hintId);
        });
      }
    }

    document.getElementById('item-drawer-backdrop').classList.remove('hidden');
    document.getElementById('item-drawer').classList.remove('hidden');
    setTimeout(() => document.getElementById('di-name')?.focus(), 50);
  };

  window._closeItemDrawer = () => {
    document.getElementById('item-drawer-backdrop').classList.add('hidden');
    document.getElementById('item-drawer').classList.add('hidden');
  };

  window._saveItemDrawer = async () => {
    const id      = document.getElementById('drawer-item-id').value;
    const nameVal = document.getElementById('di-name').value.trim();
    if (!nameVal) { alert('항목명을 입력해주세요.'); return; }

    const planned    = _getNum('di-planned');
    const deposit    = _getNum('di-deposit');
    const actual     = _getNum('di-actual');
    const balance    = Math.max(0, planned - deposit);
    const balanceDue = document.getElementById('di-balance-due').value || null;
    const memo       = document.getElementById('di-memo').value.trim() || null;
    const cat        = document.getElementById('di-cat').value || '✨기타';

    const payload = { name: nameVal, cat, planned, deposit, actual, balance, balanceDue, memo };

    const btn = document.querySelector('#item-drawer .btn-primary');
    if (btn) btn.textContent = '저장 중…';
    try {
      if (id) {
        await updateItem(id, payload);
      } else {
        await addItem(payload);
      }
      window._closeItemDrawer();
    } catch (e) {
      alert('저장 중 오류가 발생했어요. 다시 시도해주세요.');
    } finally {
      if (btn) btn.textContent = '저장';
    }
  };

  window._confirmDeleteItem = async (id, name) => {
    if (!id) return;
    const label = name || '이 항목';
    if (!confirm(`"${label}"을(를) 삭제할까요? 되돌릴 수 없어요.`)) return;
    try {
      await deleteItem(id);
      window._closeItemDrawer();
    } catch (e) {
      alert('삭제 중 오류가 발생했어요.');
    }
  };

  // 드로어 내 삭제 버튼용 (id를 hidden input에서 읽음)
  window._confirmDeleteItemDrawer = () => {
    const id   = document.getElementById('drawer-item-id').value;
    const name = document.getElementById('di-name').value.trim();
    window._confirmDeleteItem(id, name);
  };

  window._loadSampleItems = async () => {
    const samples = [
      { name: '웨딩홀', cat: '🏰웨딩홀', planned: 8000000, deposit: 0, actual: 0, balance: 8000000, balanceDue: null, memo: '날짜 미정' },
      { name: '스드메 패키지', cat: '👗스드메', planned: 3500000, deposit: 0, actual: 0, balance: 3500000, balanceDue: null, memo: null },
      { name: '신혼여행', cat: '✈️신혼여행', planned: 3000000, deposit: 0, actual: 0, balance: 3000000, balanceDue: null, memo: null },
      { name: '예물예단', cat: '💍예물예단', planned: 2000000, deposit: 0, actual: 0, balance: 2000000, balanceDue: null, memo: null },
      { name: '청첩장·모임', cat: '👥청첩장모임', planned: 1000000, deposit: 0, actual: 0, balance: 1000000, balanceDue: null, memo: null },
    ];
    if (!confirm(`샘플 항목 ${samples.length}개를 추가할까요?`)) return;
    try {
      await Promise.all(samples.map(s => addItem(s)));
    } catch (e) {
      alert('샘플 항목 추가 중 오류가 발생했어요.');
    }
  };
}

// ===== 내부 유틸 =====

function _clearDrawer() {
  ['di-name', 'di-planned', 'di-deposit', 'di-actual', 'di-balance-due', 'di-memo'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
  const cat = document.getElementById('di-cat');
  if (cat) cat.value = '✨기타';
}

function _setDi(id, val) {
  const el = document.getElementById(id);
  if (el) el.value = val;
}

function _setDiNum(id, n) {
  const el = document.getElementById(id);
  if (!el) return;
  el.value = n > 0 ? Math.round(n).toLocaleString() : '';
}

function _getNum(id) {
  const el = document.getElementById(id);
  if (!el) return 0;
  return Number(el.value.replace(/[^0-9]/g, '')) || 0;
}

function _set(id, text) {
  const el = document.getElementById(id);
  if (el) el.textContent = text;
}

function _esc(s) {
  return String(s || '').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/'/g, '&#39;');
}
