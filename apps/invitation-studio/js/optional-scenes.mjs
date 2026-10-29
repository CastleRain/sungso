import { formatWedding } from './core.mjs';

export const OPTIONAL_SECTION_IDS = Object.freeze(['guest-guide', 'day-checklist', 'keepsake']);
export const OPTIONAL_SCENE_CHOICES = Object.freeze({
  guestGuide: Object.freeze(['folded', 'cards', 'slider']),
  checklist: Object.freeze(['list', 'steps']),
  keepsake: Object.freeze(['ticket', 'postcard', 'qr']),
});
const SECTION_KEYS = Object.freeze({ 'guest-guide': 'guestGuide', 'day-checklist': 'checklist', keepsake: 'keepsake' });
const GUEST_INFO_FIELDS = Object.freeze([
  ['parking', '주차 안내'], ['dining', '식사 안내'], ['shuttle', '대절버스 안내'],
  ['accessibility', '편의시설 안내'], ['children', '아이와 함께 오시나요?'],
]);
const text = value => typeof value === 'string' ? value.trim().slice(0, 600) : '';

export function optionalSceneChoices(input) {
  return Object.fromEntries(Object.entries(OPTIONAL_SCENE_CHOICES).map(([key, values]) => [key, values.includes(input?.[key]) ? input[key] : values[0]]));
}

/** Venue information comes from the existing public wedding config, never a visual composition. */
export function guestGuideItems(wedding = {}) {
  const location = [text(wedding.venue), text(wedding.room)].filter(Boolean).join(' · ');
  const items = [
    ...(location ? [{ id: 'venue', question: '어느 홀에서 만나나요?', answer: location }] : []),
    ...(text(wedding.address) ? [{ id: 'address', question: '도착지 주소가 궁금해요.', answer: text(wedding.address) }] : []),
    { id: 'subway', question: '지하철로 오시나요?', answer: '부산 지하철 1·3호선 연산역 7번 출구 인근입니다. 정확한 도보 경로는 지도 앱에서 확인해 주세요.' },
  ];
  for (const [id, question] of GUEST_INFO_FIELDS) {
    const answer = text(wedding.guestInfo?.[id]);
    if (answer) items.push({ id, question, answer });
  }
  return items;
}

/** Extra scenes only present information. No network, clipboard, calendar or saved draft writes. */
export function mountOptionalScenes({ doc = document, win = window, enabled = true, composition, wedding = {} } = {}) {
  const sections = OPTIONAL_SECTION_IDS.map(id => doc.getElementById(id)).filter(Boolean);
  const links = [...doc.querySelectorAll('[data-optional-nav]')].filter(link => OPTIONAL_SECTION_IDS.includes(link.dataset.optionalNav));
  const originals = sections.map(node => ({ node, hidden: node.hidden, layout: node.dataset.optionalLayout }));
  const originalLinks = links.map(node => ({ node, hidden: node.hidden }));
  const initialEffects = doc.body.classList.contains('optional-effects');
  const media = win.matchMedia?.('(prefers-reduced-motion: reduce)');
  const guide = doc.getElementById('guest-guide-items');
  const created = [], guideRows = [];
  let destroyed = false, requested = Boolean(enabled), guideLayout = 'folded', guideIndex = 0;
  let guideUserRevision = 0, finishGuideDemo = null;

  for (const item of guestGuideItems(wedding)) {
    if (!guide) break;
    const row = doc.createElement('details'), summary = doc.createElement('summary');
    const label = doc.createElement('span'), marker = doc.createElement('span'), answer = doc.createElement('p');
    row.className = 'guide-question'; row.dataset.guideItem = item.id;
    label.textContent = item.question;
    marker.className = 'guide-question-mark'; marker.setAttribute('aria-hidden', 'true'); marker.textContent = '+';
    answer.className = 'guide-answer'; answer.textContent = item.answer;
    summary.append(label, marker); row.append(summary, answer); guide.append(row); created.push(row);
    const preventCollapse = event => {
      if (!destroyed && guideLayout !== 'folded' && (event.type === 'click' || ['Enter', ' '].includes(event.key))) event.preventDefault();
    };
    const keepVisible = () => { if (!destroyed && guideLayout !== 'folded' && !row.open) row.open = true; };
    summary.addEventListener('click', preventCollapse);
    summary.addEventListener('keydown', preventCollapse);
    row.addEventListener('toggle', keepVisible);
    guideRows.push({ row, summary, preventCollapse, keepVisible, foldedOpen: false });
  }

  const guideControls = doc.createElement('div'); guideControls.className = 'guide-slider-controls'; guideControls.hidden = true;
  const guidePrevious = doc.createElement('button'), guideNext = doc.createElement('button'), guideCount = doc.createElement('span');
  guidePrevious.type = guideNext.type = 'button'; guidePrevious.id = 'guest-guide-previous'; guideNext.id = 'guest-guide-next';
  guidePrevious.textContent = '←'; guideNext.textContent = '→';
  guidePrevious.setAttribute('aria-label', '이전 하객 안내'); guideNext.setAttribute('aria-label', '다음 하객 안내');
  guideCount.id = 'guest-guide-count'; guideCount.setAttribute('aria-live', 'polite'); guideCount.setAttribute('aria-atomic', 'true');
  guideControls.append(guidePrevious, guideCount, guideNext); guide?.parentNode?.append(guideControls); created.push(guideControls);
  function showGuide(index) {
    if (destroyed) return;
    guideIndex = Math.max(0, Math.min(guideRows.length - 1, index));
    guideRows.forEach(({ row }, i) => { row.hidden = guideLayout === 'slider' && i !== guideIndex; });
    guideCount.textContent = `${guideIndex + 1} / ${guideRows.length}`;
    guidePrevious.disabled = guideIndex === 0; guideNext.disabled = guideIndex === guideRows.length - 1;
  }
  const previousGuide = () => { guideUserRevision++; showGuide(guideIndex - 1); };
  const nextGuide = () => { guideUserRevision++; showGuide(guideIndex + 1); };
  const guideKey = event => {
    if (guideLayout !== 'slider' || !['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault(); guideUserRevision++;
    showGuide(event.key === 'Home' ? 0 : event.key === 'End' ? guideRows.length - 1 : guideIndex + (event.key === 'ArrowLeft' ? -1 : 1));
  };
  guidePrevious.addEventListener('click', previousGuide); guideNext.addEventListener('click', nextGuide); guideControls.addEventListener('keydown', guideKey);

  function setGuideLayout(layout) {
    if (guideLayout === layout) return;
    // Preserve the folded selection across cards ↔ slider changes and unrelated composition updates.
    if (guideLayout === 'folded') guideRows.forEach(item => { item.foldedOpen = Boolean(item.row.open); });
    guideLayout = layout;
    for (const { row, summary, foldedOpen } of guideRows) {
      row.open = guideLayout !== 'folded' || foldedOpen;
      if (guideLayout !== 'folded') {
        summary.setAttribute('aria-disabled', 'true');
        summary.setAttribute('tabindex', '-1');
      } else {
        summary.removeAttribute('aria-disabled');
        summary.removeAttribute('tabindex');
      }
    }
    guideControls.hidden = guideLayout !== 'slider';
    showGuide(guideIndex);
  }

  let formatted = {};
  try { formatted = formatWedding(wedding.startsAt); } catch { /* Leave the build's confirmed date intact. */ }
  const facts = {
    names: [text(wedding.groom), text(wedding.bride)].filter(Boolean).join(' & '),
    date: formatted.dateKorean, dateShort: formatted.date, time: formatted.time,
    venue: text(wedding.venue), room: text(wedding.room), address: text(wedding.address),
  };
  for (const node of doc.querySelectorAll('[data-keepsake-fact]')) {
    const value = facts[node.dataset.keepsakeFact];
    if (value) node.textContent = value;
  }

  const checklist = doc.getElementById('day-checklist');
  const checks = checklist ? [...checklist.querySelectorAll('[data-day-check]')] : [];
  const status = doc.getElementById('day-checklist-status');
  const progress = doc.getElementById('day-checklist-progress');
  function updateChecklist() {
    if (destroyed) return;
    const count = checks.filter(input => input.checked).length;
    if (status) status.textContent = count === checks.length && count ? '준비가 되었어요. 그날 만나요!' : `${checks.length}가지 중 ${count}가지 확인했어요`;
    if (progress) { progress.max = checks.length || 1; progress.value = count; }
    if (checklist) checklist.dataset.completed = String(count);
  }
  checks.forEach(input => input.addEventListener('change', updateChecklist));

  function syncMotion() {
    if (destroyed) return;
    const motion = requested && !media?.matches && !doc.hidden && !doc.querySelector('dialog[open]');
    if (!motion) finishGuideDemo?.();
    doc.body.classList.toggle('optional-effects', motion);
  }
  function setComposition(input) {
    if (destroyed) return;
    finishGuideDemo?.();
    const values = optionalSceneChoices(input);
    setGuideLayout(values.guestGuide);
    const active = new Set(Array.isArray(input?.extras) ? input.extras.filter(id => OPTIONAL_SECTION_IDS.includes(id)) : []);
    for (const section of sections) {
      section.hidden = !active.has(section.id);
      section.dataset.optionalLayout = values[SECTION_KEYS[section.id]];
    }
    for (const link of links) link.hidden = !active.has(link.dataset.optionalNav);
    syncMotion();
  }
  doc.addEventListener('visibilitychange', syncMotion);
  doc.addEventListener('lab:dialog-change', syncMotion);
  media?.addEventListener?.('change', syncMotion);
  setComposition(composition); updateChecklist();
  return {
    setComposition,
    demoInteraction(key) {
      finishGuideDemo?.();
      if (key !== 'guestGuide' || destroyed || guideLayout !== 'slider' || guideRows.length < 2 || !requested || media?.matches || doc.hidden || doc.getElementById('guest-guide')?.hidden || doc.querySelector('dialog[open]')) return () => {};
      const before = guideIndex, revision = guideUserRevision;
      showGuide((before + 1) % guideRows.length);
      let finished = false;
      const finish = () => {
        if (finished) return; finished = true;
        if (finishGuideDemo === finish) finishGuideDemo = null;
        if (!destroyed && guideLayout === 'slider' && guideUserRevision === revision) showGuide(before);
      };
      finishGuideDemo = finish;
      return finish;
    },
    setEnabled(value) { requested = Boolean(value); syncMotion(); },
    refresh() { syncMotion(); updateChecklist(); },
    destroy() {
      if (destroyed) return;
      finishGuideDemo?.();
      destroyed = true;
      guidePrevious.removeEventListener('click', previousGuide); guideNext.removeEventListener('click', nextGuide); guideControls.removeEventListener('keydown', guideKey);
      checks.forEach(input => input.removeEventListener('change', updateChecklist));
      for (const { row, summary, preventCollapse, keepVisible } of guideRows) {
        summary.removeEventListener('click', preventCollapse);
        summary.removeEventListener('keydown', preventCollapse);
        row.removeEventListener('toggle', keepVisible);
      }
      doc.removeEventListener('visibilitychange', syncMotion);
      doc.removeEventListener('lab:dialog-change', syncMotion);
      media?.removeEventListener?.('change', syncMotion);
      created.forEach(node => { if (node.parentNode) node.remove(); });
      for (const { node, hidden, layout } of originals) {
        node.hidden = hidden;
        if (layout === undefined) delete node.dataset.optionalLayout; else node.dataset.optionalLayout = layout;
      }
      for (const { node, hidden } of originalLinks) node.hidden = hidden;
      doc.body.classList.toggle('optional-effects', initialEffects);
    },
  };
}
