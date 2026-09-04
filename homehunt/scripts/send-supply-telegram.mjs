import { createHash } from 'node:crypto';
import { appendFile, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { PYEONG_TO_M2 } from '../js/recommendation-core.mjs';
import { matchesSupplyAlertPreferences } from '../js/supply-core.mjs';

const scriptPath = fileURLToPath(import.meta.url);
const scriptDir = path.dirname(scriptPath);
const projectDir = path.resolve(scriptDir, '..');

export const DEFAULT_SNAPSHOT_PATH = path.join(projectDir, 'data', 'home-supply.json');
export const DEFAULT_LEDGER_PATH = path.join(projectDir, 'data', 'supply-alert-ledger.json');
export const TELEGRAM_API_ORIGIN = 'https://api.telegram.org';
export const HOMEHUNT_SUPPLY_URL = 'https://castlerain.github.io/sungso/homehunt/';
export const TELEGRAM_MESSAGE_LIMIT = 3500;
export const TELEGRAM_MESSAGE_COUNT_LIMIT = 5;
export const LEDGER_ENTRY_LIMIT = 2000;

const SOURCE_LABELS = Object.freeze({
  applyhome: '청약홈',
  lh: 'LH',
  sh: 'SH',
});

const OFFICIAL_HOSTS_BY_SOURCE = Object.freeze({
  applyhome: new Set(['applyhome.co.kr', 'www.applyhome.co.kr']),
  lh: new Set(['apply.lh.or.kr', 'lh.or.kr', 'www.lh.or.kr']),
  sh: new Set(['i-sh.co.kr', 'www.i-sh.co.kr']),
});

export const IMPORTANT_UPDATE_FIELDS = new Set([
  'status',
  'providerStatus',
  'noticeDate',
  'closeDate',
  'schedule',
  'schedules',
  'applicationStartDate',
  'applicationEndDate',
  'applyStart',
  'applyEnd',
  'specialApplyStart',
  'specialApplyEnd',
  'firstPriorityApplyStart',
  'firstPriorityApplyEnd',
  'secondPriorityApplyStart',
  'secondPriorityApplyEnd',
  'winnerAnnouncementDate',
  'contractStart',
  'contractEnd',
  'totalSupplyUnits',
  'newlywedUnits',
  'newbornUnits',
  'eligibilityTags',
  'targetGroups',
  'newlywedSupplyAvailable',
  'price',
  'models',
]);

const UPDATE_FIELD_LABELS = Object.freeze({
  status: '접수 상태',
  providerStatus: '기관 공고 상태',
  noticeDate: '공고일',
  closeDate: '마감일',
  schedule: '청약 일정',
  schedules: '청약 일정',
  applicationStartDate: '접수 시작일',
  applicationEndDate: '접수 마감일',
  applyStart: '접수 시작일',
  applyEnd: '접수 마감일',
  specialApplyStart: '특별공급 시작일',
  specialApplyEnd: '특별공급 마감일',
  firstPriorityApplyStart: '1순위 시작일',
  firstPriorityApplyEnd: '1순위 마감일',
  secondPriorityApplyStart: '2순위 시작일',
  secondPriorityApplyEnd: '2순위 마감일',
  winnerAnnouncementDate: '당첨 발표일',
  contractStart: '계약 시작일',
  contractEnd: '계약 마감일',
  totalSupplyUnits: '공급 세대수',
  newlywedUnits: '신혼부부 배정',
  newbornUnits: '신생아 배정',
  eligibilityTags: '특별공급 대상',
  targetGroups: '공급 대상',
  newlywedSupplyAvailable: '신혼 공급 여부',
  price: '분양가',
  models: '주택형·분양가',
});

const ALERT_VARIABLE_NAMES = Object.freeze({
  regions: 'HOMEHUNT_ALERT_REGIONS',
  districts: 'HOMEHUNT_ALERT_DISTRICTS',
  newlywedOnly: 'HOMEHUNT_ALERT_NEWLYWED_ONLY',
  maxPriceEok: 'HOMEHUNT_ALERT_MAX_PRICE_EOK',
  minPyeong: 'HOMEHUNT_ALERT_MIN_PYEONG',
  maxPyeong: 'HOMEHUNT_ALERT_MAX_PYEONG',
  minUnits: 'HOMEHUNT_ALERT_MIN_UNITS',
  includeUnknownPrice: 'HOMEHUNT_ALERT_INCLUDE_UNKNOWN_PRICE',
  includeUnknownArea: 'HOMEHUNT_ALERT_INCLUDE_UNKNOWN_AREA',
  includeUnknownUnits: 'HOMEHUNT_ALERT_INCLUDE_UNKNOWN_UNITS',
});

export class SupplyTelegramError extends Error {
  constructor(message, code, details = {}) {
    super(message);
    this.name = 'SupplyTelegramError';
    this.code = code;
    this.details = details;
  }
}

function cleanInlineText(value, maxLength = 240) {
  return String(value ?? '')
    .replace(/[\u0000-\u001f\u007f-\u009f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLength);
}

function cleanId(value) {
  return cleanInlineText(value, 300);
}

function uniqueStrings(values) {
  return [...new Set(values.map((value) => cleanInlineText(value, 80)).filter(Boolean))];
}

function commaList(value, limit = 20) {
  return uniqueStrings(String(value || '').split(/[,，]/)).slice(0, limit);
}

function booleanVariable(environment, name, defaultValue, warnings) {
  const raw = cleanInlineText(environment?.[name], 40).toLowerCase();
  if (!raw) return defaultValue;
  if (['true', '1', 'yes', 'on'].includes(raw)) return true;
  if (['false', '0', 'no', 'off'].includes(raw)) return false;
  warnings.push(`${name}: true/false 형식이 아니라 기본값을 사용했습니다.`);
  return defaultValue;
}

function positiveVariable(environment, name, warnings, { integer = false } = {}) {
  const raw = cleanInlineText(environment?.[name], 80);
  if (!raw) return null;
  if (!/^(?:\d+(?:\.\d+)?|\.\d+)$/.test(raw)) {
    warnings.push(`${name}: 양수 숫자 형식이 아니라 조건에서 제외했습니다.`);
    return null;
  }
  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0 || (integer && !Number.isInteger(value))) {
    warnings.push(`${name}: 유효한 ${integer ? '양의 정수' : '양수'}가 아니라 조건에서 제외했습니다.`);
    return null;
  }
  return value;
}

export function parseAlertPreferences(environment = process.env) {
  const warnings = [];
  const requestedRegions = commaList(environment?.[ALERT_VARIABLE_NAMES.regions], 20);
  const normalizedRegions = requestedRegions.map((region) => {
    if (['서울', '서울시', '서울특별시', '11'].includes(region)) return '서울';
    if (['경기', '경기도', '41'].includes(region)) return '경기';
    return '';
  }).filter(Boolean);
  if (requestedRegions.length && normalizedRegions.length !== requestedRegions.length) {
    warnings.push(`${ALERT_VARIABLE_NAMES.regions}: 서울·경기 이외 값은 제외했습니다.`);
  }
  const regions = uniqueStrings(normalizedRegions).slice(0, 2);
  if (!regions.length) regions.push('서울', '경기');

  const districts = commaList(environment?.[ALERT_VARIABLE_NAMES.districts], 12);
  const maxPriceEok = positiveVariable(environment, ALERT_VARIABLE_NAMES.maxPriceEok, warnings);
  let minPyeong = positiveVariable(environment, ALERT_VARIABLE_NAMES.minPyeong, warnings);
  let maxPyeong = positiveVariable(environment, ALERT_VARIABLE_NAMES.maxPyeong, warnings);
  const minUnits = positiveVariable(environment, ALERT_VARIABLE_NAMES.minUnits, warnings, { integer: true });
  if (minPyeong !== null && maxPyeong !== null && minPyeong > maxPyeong) {
    warnings.push('HOMEHUNT_ALERT_MIN_PYEONG/MAX_PYEONG: 최소값이 최대값보다 커서 면적 조건을 제외했습니다.');
    minPyeong = null;
    maxPyeong = null;
  }

  return {
    preferences: {
      regions,
      districts,
      newlywedOnly: booleanVariable(
        environment,
        ALERT_VARIABLE_NAMES.newlywedOnly,
        false,
        warnings,
      ),
      maxPriceManWon: maxPriceEok === null ? null : maxPriceEok * 10_000,
      minAreaM2: minPyeong === null ? null : minPyeong * PYEONG_TO_M2,
      maxAreaM2: maxPyeong === null ? null : maxPyeong * PYEONG_TO_M2,
      minSupplyUnits: minUnits,
      includeUnknownPrice: booleanVariable(
        environment,
        ALERT_VARIABLE_NAMES.includeUnknownPrice,
        true,
        warnings,
      ),
      includeUnknownArea: booleanVariable(
        environment,
        ALERT_VARIABLE_NAMES.includeUnknownArea,
        true,
        warnings,
      ),
      includeUnknownUnits: booleanVariable(
        environment,
        ALERT_VARIABLE_NAMES.includeUnknownUnits,
        true,
        warnings,
      ),
      excludeClosed: true,
    },
    warnings,
  };
}

export function describeAlertPreferences(preferences = {}) {
  const descriptions = [];
  const regions = uniqueStrings(Array.isArray(preferences.regions) ? preferences.regions : []);
  const districts = uniqueStrings(Array.isArray(preferences.districts) ? preferences.districts : []);
  if (regions.length) descriptions.push(`지역 ${regions.join('·')}`);
  if (districts.length) descriptions.push(`시군구 ${districts.join('·')}`);
  if (preferences.newlywedOnly === true) descriptions.push('신혼 대상만');
  if (Number(preferences.maxPriceManWon) > 0) descriptions.push(`분양가 ${Number(preferences.maxPriceManWon) / 10_000}억원 이하`);
  if (Number(preferences.minAreaM2) > 0) descriptions.push(`최소 ${(Number(preferences.minAreaM2) / PYEONG_TO_M2).toFixed(1).replace(/\.0$/, '')}평`);
  if (Number(preferences.maxAreaM2) > 0) descriptions.push(`최대 ${(Number(preferences.maxAreaM2) / PYEONG_TO_M2).toFixed(1).replace(/\.0$/, '')}평`);
  if (Number(preferences.minSupplyUnits) > 0) descriptions.push(`${Number(preferences.minSupplyUnits)}세대 이상`);
  return descriptions.join(' · ') || '전체 공고';
}

function assertSnapshot(snapshot) {
  if (!snapshot || typeof snapshot !== 'object' || !Array.isArray(snapshot.notices)) {
    throw new SupplyTelegramError('분양 공고 저장본 형식을 확인할 수 없습니다.', 'INVALID_SNAPSHOT');
  }
  if (!snapshot.changes || typeof snapshot.changes !== 'object') {
    throw new SupplyTelegramError('분양 공고 변경 목록을 확인할 수 없습니다.', 'INVALID_CHANGES');
  }
}

export function normalizeLedger(value) {
  if (value === null || value === undefined) return { schemaVersion: 1, sent: [] };
  if (!value || typeof value !== 'object' || value.schemaVersion !== 1 || !Array.isArray(value.sent)) {
    throw new SupplyTelegramError('분양 알림 중복 장부 형식을 확인할 수 없습니다.', 'INVALID_LEDGER');
  }
  const sent = [];
  const seen = new Set();
  for (const entry of value.sent) {
    const hash = String(entry || '').toLowerCase();
    if (!/^[a-f0-9]{64}$/.test(hash)) {
      throw new SupplyTelegramError('분양 알림 중복 장부에 해시가 아닌 값이 있습니다.', 'INVALID_LEDGER');
    }
    if (!seen.has(hash)) {
      seen.add(hash);
      sent.push(hash);
    }
  }
  return { schemaVersion: 1, sent: sent.slice(-LEDGER_ENTRY_LIMIT) };
}

export async function readLedger(filePath = DEFAULT_LEDGER_PATH) {
  try {
    return normalizeLedger(JSON.parse(await readFile(filePath, 'utf8')));
  } catch (error) {
    if (error?.code === 'ENOENT') return normalizeLedger(null);
    if (error instanceof SupplyTelegramError) throw error;
    throw new SupplyTelegramError('분양 알림 중복 장부를 읽지 못했습니다.', 'INVALID_LEDGER');
  }
}

async function atomicWriteJson(filePath, value) {
  const temporaryPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  await rename(temporaryPath, filePath);
}

export function appendLedgerEntries(ledger, keys) {
  const normalized = normalizeLedger(ledger);
  const sent = [...normalized.sent];
  const known = new Set(sent);
  for (const key of keys) {
    const hash = String(key || '').toLowerCase();
    if (!/^[a-f0-9]{64}$/.test(hash) || known.has(hash)) continue;
    known.add(hash);
    sent.push(hash);
  }
  return { schemaVersion: 1, sent: sent.slice(-LEDGER_ENTRY_LIMIT) };
}

export function noticeAlertKey(kind, notice) {
  const normalizedKind = kind === 'updated' ? 'updated' : kind === 'new' ? 'new' : '';
  const id = cleanId(notice?.id);
  const fingerprint = cleanInlineText(notice?.fingerprint, 256).toLowerCase();
  if (!normalizedKind || !id || !/^[a-f0-9]{64}$/.test(fingerprint)) return '';
  return createHash('sha256')
    .update(normalizedKind)
    .update('\0')
    .update(id)
    .update('\0')
    .update(fingerprint)
    .digest('hex');
}

export function officialNoticeUrl(source, value) {
  const allowedHosts = OFFICIAL_HOSTS_BY_SOURCE[source];
  if (!allowedHosts) return '';
  try {
    const url = new URL(String(value || ''));
    if (url.protocol !== 'https:' || url.username || url.password || url.port) return '';
    const hostname = url.hostname.toLowerCase();
    if (!allowedHosts.has(hostname)) return '';
    url.hash = '';
    return url.toString();
  } catch (_) {
    return '';
  }
}

export function importantChangedFields(change) {
  if (!Array.isArray(change?.changedFields)) return [];
  return uniqueStrings(change.changedFields).filter((field) => IMPORTANT_UPDATE_FIELDS.has(field));
}

function scheduleText(notice) {
  const schedule = notice?.schedule || {};
  const start = cleanInlineText(schedule.applyStart ?? notice?.applicationStartDate, 20);
  const end = cleanInlineText(schedule.applyEnd ?? notice?.applicationEndDate, 20);
  if (start && end && start !== end) return `${start} ~ ${end}`;
  return start || end || '';
}

function noticeLocation(notice) {
  return uniqueStrings([
    notice?.regionName,
    notice?.district,
  ]).join(' ');
}

function formatAlertBlock(alert) {
  const { kind, notice, officialUrl } = alert;
  const title = cleanInlineText(notice.name || notice.title || '제목 없는 공고', 120);
  const source = cleanInlineText(SOURCE_LABELS[notice.source] || notice.sourceLabel || notice.source, 30);
  const category = cleanInlineText(notice.categoryLabel, 40);
  const location = noticeLocation(notice);
  const noticeDate = cleanInlineText(notice.noticeDate, 20);
  const application = scheduleText(notice);
  const tags = uniqueStrings([
    ...(Array.isArray(notice.eligibilityTags) ? notice.eligibilityTags : []),
    ...(Array.isArray(notice.targetGroups) ? notice.targetGroups : []),
  ]).slice(0, 5);
  const heading = kind === 'new' ? '🏠 새 분양 공고' : '🔔 분양 공고 중요 변경';
  const lines = [
    heading,
    `[${[source, location].filter(Boolean).join(' · ')}] ${title}`,
  ];
  if (category) lines.push(`유형: ${category}`);
  if (noticeDate) lines.push(`공고일: ${noticeDate}`);
  if (application) lines.push(`접수: ${application}`);
  if (tags.length) lines.push(`대상: ${tags.join(' · ')}`);
  if (kind === 'updated') {
    const labels = uniqueStrings(alert.changedFields.map((field) => UPDATE_FIELD_LABELS[field] || field));
    if (labels.length) lines.push(`바뀐 내용: ${labels.slice(0, 8).join(' · ')}`);
  }
  lines.push(`공식 공고: ${officialUrl}`);
  return lines.join('\n');
}

export function collectEligibleAlerts(snapshot, ledger = normalizeLedger(null), options = {}) {
  assertSnapshot(snapshot);
  const normalizedLedger = normalizeLedger(ledger);
  if (snapshot.changes.baselineRun === true) return [];

  const suppressedSources = new Set(
    Array.isArray(snapshot.changes.suppressedSources) ? snapshot.changes.suppressedSources : [],
  );
  const noticesById = new Map(snapshot.notices.map((notice) => [cleanId(notice?.id), notice]));
  const alreadySent = new Set(normalizedLedger.sent);
  const alerts = [];
  const seenNoticeIds = new Set();

  const addChange = (kind, change) => {
    const id = cleanId(change?.id);
    if (!id || seenNoticeIds.has(id)) return;
    const notice = noticesById.get(id);
    if (!notice || suppressedSources.has(notice.source)) return;
    if (notice.stale === true || notice.dataStatus === 'stale' || notice.notificationEligible === false) return;
    if (kind === 'updated' && importantChangedFields(change).length === 0) return;
    if (options.preferences && !matchesSupplyAlertPreferences(
      notice,
      options.preferences,
      options.now || new Date(),
    )) return;
    const officialUrl = officialNoticeUrl(notice.source, notice.officialUrl);
    if (!officialUrl) return;
    const key = noticeAlertKey(kind, notice);
    if (!key || alreadySent.has(key)) return;
    seenNoticeIds.add(id);
    alerts.push({
      key,
      kind,
      notice,
      officialUrl,
      changedFields: kind === 'updated' ? importantChangedFields(change) : [],
    });
  };

  for (const change of Array.isArray(snapshot.changes.new) ? snapshot.changes.new : []) {
    addChange('new', change);
  }
  for (const change of Array.isArray(snapshot.changes.updated) ? snapshot.changes.updated : []) {
    addChange('updated', change);
  }
  return alerts;
}

export function packAlertMessages(alerts, options = {}) {
  const maxChars = Math.max(500, Math.min(Number(options.maxChars) || TELEGRAM_MESSAGE_LIMIT, 4096));
  const maxMessages = Math.max(1, Math.min(
    Math.round(Number(options.maxMessages) || TELEGRAM_MESSAGE_COUNT_LIMIT),
    TELEGRAM_MESSAGE_COUNT_LIMIT,
  ));
  const chunks = [];
  let current = null;

  for (const alert of alerts) {
    const text = formatAlertBlock(alert);
    if (text.length > maxChars) {
      throw new SupplyTelegramError('분양 공고 알림 한 건이 메시지 안전 길이를 초과했습니다.', 'MESSAGE_TOO_LONG');
    }
    const combined = current ? `${current.text}\n\n${text}` : text;
    if (current && combined.length > maxChars) {
      chunks.push(current);
      current = { text, alerts: [alert] };
    } else if (current) {
      current.text = combined;
      current.alerts.push(alert);
    } else {
      current = { text, alerts: [alert] };
    }
  }
  if (current) chunks.push(current);
  if (chunks.length <= maxMessages) return chunks;

  const individuallyDelivered = chunks.slice(0, Math.max(0, maxMessages - 1));
  const overflowAlerts = chunks.slice(Math.max(0, maxMessages - 1)).flatMap(({ alerts: values }) => values);
  const summaryText = [
    `📋 분양 공고 ${overflowAlerts.length}건이 더 있어요.`,
    '메시지 과다 발송을 막기 위해 나머지는 HomeHunt에서 확인해주세요.',
    HOMEHUNT_SUPPLY_URL,
  ].join('\n');
  return [...individuallyDelivered, { text: summaryText, alerts: overflowAlerts, summary: true }];
}

function validToken(value) {
  return /^\d{5,}:[A-Za-z0-9_-]{20,}$/.test(String(value || '').trim());
}

function validChatId(value) {
  return /^(?:-?\d{1,30}|@[A-Za-z][A-Za-z0-9_]{4,31})$/.test(String(value || '').trim());
}

async function telegramResponseBody(response) {
  try {
    const value = await response.json();
    return value && typeof value === 'object' ? value : {};
  } catch (_) {
    return {};
  }
}

export async function sendTelegramMessage(options) {
  const token = String(options?.token || '').trim();
  const chatId = String(options?.chatId || '').trim();
  const text = String(options?.text || '');
  if (!validToken(token) || !validChatId(chatId)) {
    throw new SupplyTelegramError('Telegram GitHub Secrets 형식이 올바르지 않습니다.', 'INVALID_CONFIG');
  }
  if (!text || text.length > TELEGRAM_MESSAGE_LIMIT) {
    throw new SupplyTelegramError('Telegram 메시지 길이가 안전 범위를 벗어났습니다.', 'INVALID_MESSAGE');
  }

  const fetchImpl = options.fetchImpl || fetch;
  const sleepImpl = options.sleepImpl || ((milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)));
  const timeoutMs = Math.max(1000, Math.min(Number(options.timeoutMs) || 10_000, 30_000));
  const endpoint = `${TELEGRAM_API_ORIGIN}/bot${token}/sendMessage`;

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    let response;
    try {
      response = await fetchImpl(endpoint, {
        method: 'POST',
        redirect: 'error',
        signal: controller.signal,
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          text,
          link_preview_options: { is_disabled: true },
        }),
      });
    } catch (_) {
      throw new SupplyTelegramError('Telegram 전송 요청에 실패했습니다.', 'NETWORK_ERROR');
    } finally {
      clearTimeout(timer);
    }

    const body = await telegramResponseBody(response);
    if (response.status === 429 && attempt === 0) {
      const retryAfterSeconds = Math.max(1, Math.min(
        Number(body?.parameters?.retry_after) || 1,
        60,
      ));
      await sleepImpl(retryAfterSeconds * 1000);
      continue;
    }
    if (!response.ok || body.ok !== true) {
      throw new SupplyTelegramError('Telegram이 메시지를 승인하지 않았습니다.', 'API_ERROR', {
        status: Number(response.status) || 0,
      });
    }
    return { ok: true, status: response.status };
  }
  throw new SupplyTelegramError('Telegram 전송 재시도에 실패했습니다.', 'API_ERROR');
}

async function appendStepSummary(lines, summaryPath = process.env.GITHUB_STEP_SUMMARY) {
  if (!summaryPath) return;
  try {
    await appendFile(summaryPath, `${lines.join('\n')}\n`, 'utf8');
  } catch (_) {
    // A missing Actions summary file must never turn a successful notification into a failure.
  }
}

function dryRunLine(alert) {
  const title = cleanInlineText(alert.notice?.name || alert.notice?.title || '제목 없음', 60);
  const id = cleanId(alert.notice?.id);
  return `- ${alert.kind} · ${id} · ${title}`;
}

export async function runSupplyTelegram(options = {}) {
  const snapshotPath = options.snapshotPath || DEFAULT_SNAPSHOT_PATH;
  const ledgerPath = options.ledgerPath || DEFAULT_LEDGER_PATH;
  let snapshot;
  try {
    snapshot = options.snapshot || JSON.parse(await readFile(snapshotPath, 'utf8'));
  } catch (_) {
    throw new SupplyTelegramError('분양 공고 저장본을 읽지 못했습니다.', 'INVALID_SNAPSHOT');
  }
  const ledger = options.ledger || await readLedger(ledgerPath);
  const preferenceResult = options.preferenceResult || parseAlertPreferences(options.environment || process.env);
  const { preferences, warnings } = preferenceResult;
  const alerts = collectEligibleAlerts(snapshot, ledger, { preferences, now: options.now });
  const packets = packAlertMessages(alerts);
  const preferenceSummary = describeAlertPreferences(preferences);
  const warningLines = warnings.map((warning) => `- 경고: ${warning}`);

  if (options.notify !== true) {
    const lines = [
      `Telegram dry run: ${alerts.length} eligible alert(s), ${packets.length} message(s).`,
      `Filters: ${preferenceSummary}`,
      ...warningLines,
      ...alerts.slice(0, 20).map(dryRunLine),
      ...(alerts.length > 20 ? [`- ... ${alerts.length - 20}건 더 있음`] : []),
    ];
    (options.stdout || process.stdout).write(`${lines.join('\n')}\n`);
    await appendStepSummary([
      '## HomeHunt Telegram 알림 점검',
      '',
      `- Dry run: 전송 대상 ${alerts.length}건 · 예상 메시지 ${packets.length}개`,
      `- 맞춤 조건: ${preferenceSummary}`,
      ...warningLines,
      '- 실제 메시지는 전송하지 않았고 중복 장부도 변경하지 않았습니다.',
    ], options.summaryPath);
    return { status: 'dry_run', alerts, packets, ledger };
  }

  const token = options.token ?? process.env.TELEGRAM_BOT_TOKEN;
  const chatId = options.chatId ?? process.env.TELEGRAM_CHAT_ID;
  if (!String(token || '').trim() || !String(chatId || '').trim()) {
    (options.stdout || process.stdout).write('Telegram notification skipped: required GitHub Secrets are not configured.\n');
    await appendStepSummary([
      '## HomeHunt Telegram 알림',
      '',
      '- 경고: TELEGRAM_BOT_TOKEN 또는 TELEGRAM_CHAT_ID Secret이 없어 전송을 건너뛰었습니다.',
      `- 미전송 대상: ${alerts.length}건`,
      `- 맞춤 조건: ${preferenceSummary}`,
      ...warningLines,
    ], options.summaryPath);
    return { status: 'skipped_missing_secrets', alerts, packets, ledger };
  }

  if (!packets.length) {
    (options.stdout || process.stdout).write('No eligible HomeHunt supply alerts to send.\n');
    await appendStepSummary([
      '## HomeHunt Telegram 알림',
      '',
      '- 신규 또는 중요 변경 알림 대상이 없습니다.',
      `- 맞춤 조건: ${preferenceSummary}`,
      ...warningLines,
    ], options.summaryPath);
    return { status: 'nothing_to_send', alerts, packets, ledger };
  }

  let nextLedger = ledger;
  for (const packet of packets) {
    await sendTelegramMessage({
      token,
      chatId,
      text: packet.text,
      fetchImpl: options.fetchImpl,
      sleepImpl: options.sleepImpl,
      timeoutMs: options.timeoutMs,
    });
    nextLedger = appendLedgerEntries(nextLedger, packet.alerts.map(({ key }) => key));
  }
  await atomicWriteJson(ledgerPath, nextLedger);
  (options.stdout || process.stdout).write(
    `Telegram notification sent: ${alerts.length} alert(s) in ${packets.length} message(s).\n`,
  );
  await appendStepSummary([
    '## HomeHunt Telegram 알림',
    '',
    `- 전송 완료: 공고 ${alerts.length}건 · 메시지 ${packets.length}개`,
    `- 맞춤 조건: ${preferenceSummary}`,
    `- 중복 장부: 최근 ${nextLedger.sent.length}개 공개 공고 해시`,
    ...warningLines,
  ], options.summaryPath);
  return { status: 'sent', alerts, packets, ledger: nextLedger };
}

function parseArgs(argv) {
  const notify = argv.includes('--notify');
  const dryRun = argv.includes('--dry-run');
  if (notify && dryRun) {
    throw new SupplyTelegramError('--notify와 --dry-run은 함께 사용할 수 없습니다.', 'INVALID_ARGUMENT');
  }
  const unknown = argv.filter((value) => value !== '--notify' && value !== '--dry-run');
  if (unknown.length) {
    throw new SupplyTelegramError('지원하지 않는 실행 옵션입니다.', 'INVALID_ARGUMENT');
  }
  return { notify };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  await runSupplyTelegram(args);
}

if (path.resolve(process.argv[1] || '') === path.resolve(scriptPath)) {
  main().catch((error) => {
    const code = error instanceof SupplyTelegramError ? error.code : 'UNEXPECTED_ERROR';
    process.stderr.write(`HomeHunt Telegram notification failed (${code}).\n`);
    process.exitCode = 1;
  });
}
