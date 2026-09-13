export const APP_REGISTRY = Object.freeze([
  { id: 'dates', groupId: 'daily', title: '우리의 날짜', name: '기념일과 약속', description: '기억하고 싶은 날들', href: './dates/', icon: 'calendar' },
  { id: 'homehunt', groupId: 'daily', title: '우리 집 찾기', name: 'HomeHunt', description: '둘이 살고 싶은 곳', href: './homehunt/', icon: 'home' },
  { id: 'wecost', groupId: 'wedding', title: '함께 쓰는 가계부', name: 'WeCost', description: '살림과 결혼 예산', href: './wecost/', icon: 'wallet' },
  { id: 'invitation', groupId: 'wedding', title: '모바일 청첩장', name: 'Invitation', description: '우리다운 초대장 고르기', href: './invitation/', icon: 'mail' },
  { id: 'travel', groupId: 'travel', title: '여행 일정', name: 'Travel', description: '함께 떠나는 다음 여행', href: './travel/', icon: 'plane' },
  { id: 'honeymoon', groupId: 'travel', title: '신혼여행 고르기', name: 'Honeymoon', description: '리조트와 견적 비교', href: './honeymoon/', icon: 'palm' },
]);
export const DEFAULT_GROUPS = Object.freeze([
  { id: 'daily', name: '일상·집 준비' }, { id: 'wedding', name: '결혼 준비' }, { id: 'travel', name: '우리의 여행' },
]);
const groupIds = new Set(DEFAULT_GROUPS.map(group => group.id));
const appIds = new Set(APP_REGISTRY.map(app => app.id));

// Stored IDs never become URLs. New registered apps supplement old shared settings.
export function normalizeHomeConfig(raw = {}) {
  const groups = [];
  for (const group of Array.isArray(raw.groups) ? raw.groups : []) {
    if (groupIds.has(group?.id) && !groups.some(item => item.id === group.id)) {
      groups.push({ id: group.id, name: String(group.name || '').trim().slice(0, 30) || DEFAULT_GROUPS.find(item => item.id === group.id).name });
    }
  }
  for (const group of DEFAULT_GROUPS) if (!groups.some(item => item.id === group.id)) groups.push({ ...group });
  const apps = [];
  for (const app of Array.isArray(raw.apps) ? raw.apps : []) {
    if (appIds.has(app?.id) && !apps.some(item => item.id === app.id)) {
      apps.push({ id: app.id, groupId: groupIds.has(app.groupId) ? app.groupId : APP_REGISTRY.find(item => item.id === app.id).groupId, hidden: app.hidden === true });
    }
  }
  for (const app of APP_REGISTRY) if (!apps.some(item => item.id === app.id)) apps.push({ id: app.id, groupId: app.groupId, hidden: false });
  return { groups, apps, revision: Number.isSafeInteger(raw.revision) && raw.revision >= 0 ? raw.revision : 0 };
}

export function validateHomeConfig(config) {
  if (!Array.isArray(config?.groups) || config.groups.length !== DEFAULT_GROUPS.length || new Set(config.groups.map(group => group.id)).size !== DEFAULT_GROUPS.length || config.groups.some(group => !groupIds.has(group.id) || typeof group.name !== 'string' || !group.name.trim() || group.name.length > 30)) throw new Error('그룹 이름은 1~30자로 입력해 주세요.');
  if (!Array.isArray(config.apps) || config.apps.length !== APP_REGISTRY.length || new Set(config.apps.map(app => app.id)).size !== APP_REGISTRY.length || config.apps.some(app => !appIds.has(app.id) || !groupIds.has(app.groupId) || typeof app.hidden !== 'boolean')) throw new Error('홈 앱 구성을 다시 확인해 주세요.');
  return normalizeHomeConfig(config);
}

export function moveApp(config, id, groupId, offset = 0) {
  const result = structuredClone(config);
  const app = result.apps.find(item => item.id === id);
  if (!app || !groupIds.has(groupId)) return result;
  if (app.groupId !== groupId) {
    app.groupId = groupId;
    result.apps = result.apps.filter(item => item.id !== id).concat(app);
  } else if (offset) {
    const peers = result.apps.filter(item => item.groupId === groupId);
    const index = peers.findIndex(item => item.id === id);
    const target = peers[index + Math.sign(offset)];
    if (target) {
      const first = result.apps.indexOf(app), second = result.apps.indexOf(target);
      [result.apps[first], result.apps[second]] = [result.apps[second], result.apps[first]];
    }
  }
  return result;
}

export function moveGroup(config, id, offset) {
  const result = structuredClone(config), index = result.groups.findIndex(group => group.id === id), target = index + Math.sign(offset);
  if (index >= 0 && target >= 0 && target < result.groups.length) [result.groups[index], result.groups[target]] = [result.groups[target], result.groups[index]];
  return result;
}

export function koreanToday(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now);
  return ['year', 'month', 'day'].map(type => parts.find(part => part.type === type).value).join('-');
}
export function isDateOnly(value) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`)) && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;
}
export function dateDifference(date, today = koreanToday()) {
  return isDateOnly(date) && isDateOnly(today) ? Math.round((Date.parse(`${date}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86400000) : null;
}
export function dayLabel(date, today = koreanToday()) {
  const diff = dateDifference(date, today);
  return diff === null ? '날짜 확인' : diff > 0 ? `D-${diff}` : diff < 0 ? `D+${Math.abs(diff)}` : 'D-Day';
}
export function upcomingEvents(events, today = koreanToday()) {
  return events.filter(event => isDateOnly(event.date) && event.date >= today).sort((a, b) => a.date.localeCompare(b.date) || String(a.id).localeCompare(String(b.id))).slice(0, 3);
}
export function featuredEvents(events, today = koreanToday()) {
  const valid = events.filter(event => isDateOnly(event.date));
  const pinned = valid.filter(event => event.pinned === true);
  if (!pinned.length) {
    const wedding = valid.find(event => event.title === '결혼식') || valid.find(event => event.emoji === '💒');
    return wedding ? [wedding] : [];
  }
  return pinned.sort((a, b) => {
    const da = dateDifference(a.date, today), db = dateDifference(b.date, today);
    return (da >= 0) !== (db >= 0) ? (da >= 0 ? -1 : 1) : da - db;
  });
}
export function noteText(value) {
  const text = String(value ?? '').trim();
  if (!text || text.length > 500) throw new Error('메모는 1~500자로 작성해 주세요.');
  return text;
}
export function canDeleteNote(note, member) { return Boolean(member?.uid && note?.authorUid === member.uid); }
