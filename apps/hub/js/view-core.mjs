import { APP_REGISTRY, normalizeHomeConfig } from '../../../shared/home/home-core.mjs';
import { LIFE_APP_REGISTRY } from '../../../shared/life/registry.mjs';

export const SHORTCUT_LIMIT = 4;

const definitions = new Map(APP_REGISTRY.map(app => [app.id, app]));
const searchText = value => String(value ?? '').normalize('NFKC').toLocaleLowerCase('ko-KR').replace(/\s+/gu, ' ').trim();

function viewApp(app, groups) {
  const definition = definitions.get(app.id);
  return {
    ...definition,
    ...app,
    groupName: groups.find(group => group.id === app.groupId).name,
  };
}

// Reading older six-visible-app settings only limits the view; it never rewrites them.
export function getHomeShortcuts(config) {
  const clean = normalizeHomeConfig(config ?? {});
  return clean.apps.filter(app => !app.hidden).slice(0, SHORTCUT_LIMIT).map(app => viewApp(app, clean.groups));
}

export function getLibraryApps(config, { query = '', groupId = 'all' } = {}) {
  const clean = normalizeHomeConfig(config ?? {});
  const needle = searchText(query);
  return clean.groups
    .filter(group => groupId === 'all' || group.id === groupId)
    .flatMap(group => clean.apps.filter(app => app.groupId === group.id).map(app => viewApp(app, clean.groups)))
    .filter(app => !needle || searchText(`${app.title} ${app.name} ${app.description} ${app.groupName}`).includes(needle));
}

export function getBrowsableApps(config, { query = '', groupId = 'all' } = {}) {
  const clean = normalizeHomeConfig(config ?? {});
  const shared = getLibraryApps(clean);
  const needle = searchText(query);
  return clean.groups.filter(group => groupId === 'all' || group.id === groupId)
    .flatMap(group => [...shared.filter(app => app.groupId === group.id), ...LIFE_APP_REGISTRY.filter(app => app.groupId === group.id).map(app => ({ ...app, groupName: group.name }))])
    .filter(app => !needle || searchText(`${app.title} ${app.name} ${app.description} ${app.groupName}`).includes(needle));
}

// Call only for an explicit apply action; hidden continues using the existing stored schema.
export function withHomeShortcuts(config, selectedIds) {
  if (!Array.isArray(selectedIds) || selectedIds.length > SHORTCUT_LIMIT
    || new Set(selectedIds).size !== selectedIds.length || selectedIds.some(id => !definitions.has(id))) {
    throw new Error('홈 바로가기는 서로 다른 앱을 최대 4개까지 골라 주세요.');
  }
  const clean = normalizeHomeConfig(config ?? {});
  const selected = new Set(selectedIds);
  const apps = new Map(clean.apps.map(app => [app.id, app]));
  return {
    ...clean,
    apps: [
      ...selectedIds.map(id => ({ ...apps.get(id), hidden: false })),
      ...clean.apps.filter(app => !selected.has(app.id)).map(app => ({ ...app, hidden: true })),
    ],
  };
}

export function paginateApps(items, { page = 1, pageSize = 9 } = {}) {
  const list = Array.isArray(items) ? items : [];
  const size = Number.isFinite(pageSize) ? Math.max(1, Math.min(50, Math.floor(pageSize))) : 9;
  const pageCount = Math.max(1, Math.ceil(list.length / size));
  const currentPage = Number.isFinite(page) ? Math.max(1, Math.min(pageCount, Math.floor(page))) : 1;
  return {
    items: list.slice((currentPage - 1) * size, currentPage * size),
    page: currentPage,
    pageCount,
    total: list.length,
  };
}
