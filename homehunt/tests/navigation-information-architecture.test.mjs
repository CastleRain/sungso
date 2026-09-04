import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const TEST_DIR = path.dirname(fileURLToPath(import.meta.url));
const HOMEHUNT_DIR = path.resolve(TEST_DIR, '..');

async function read(relativePath) {
  return readFile(path.join(HOMEHUNT_DIR, relativePath), 'utf8');
}

async function readOptional(relativePath) {
  try {
    return await read(relativePath);
  } catch (error) {
    if (error?.code === 'ENOENT') return '';
    throw error;
  }
}

function stripMarkup(value) {
  return String(value || '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&middot;|&#183;/gi, '·')
    .replace(/\s+/g, ' ')
    .trim();
}

function elementByClass(html, tagName, className) {
  const pattern = new RegExp(
    `<${tagName}\\b[^>]*class=["'][^"']*\\b${className}\\b[^"']*["'][^>]*>([\\s\\S]*?)<\\/${tagName}>`,
    'i',
  );
  return html.match(pattern)?.[1] || '';
}

function openingTagById(html, id) {
  return html.match(new RegExp(`<[^>]+\\bid=["']${id}["'][^>]*>`, 'i'))?.[0] || '';
}

function attribute(openingTag, name) {
  return openingTag.match(new RegExp(`\\b${name}=["']([^"']*)["']`, 'i'))?.[1] || '';
}

function navEntries(navHtml) {
  return [...navHtml.matchAll(/<button\b([^>]*)>([\s\S]*?)<\/button>/gi)]
    .filter(([, attrs]) => /\bportal-nav-item\b/.test(attribute(`<button ${attrs}>`, 'class')))
    .map(([, attrs, content]) => ({
      target: attribute(`<button ${attrs}>`, 'data-view-target'),
      label: stripMarkup(content),
    }));
}

function functionBody(source, functionName) {
  const match = new RegExp(`function\\s+${functionName}\\s*\\([^)]*\\)\\s*\\{`).exec(source);
  if (!match) return '';
  const openIndex = source.indexOf('{', match.index);
  let depth = 0;
  for (let index = openIndex; index < source.length; index += 1) {
    if (source[index] === '{') depth += 1;
    if (source[index] === '}') depth -= 1;
    if (depth === 0) return source.slice(openIndex + 1, index);
  }
  return '';
}

function hasDataHook(source, kebabName) {
  const camelName = kebabName.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
  return source.includes(`data-${kebabName}`)
    || new RegExp(`\\.dataset\\.${camelName}\\b`).test(source)
    || new RegExp(`setAttribute\\(\\s*['"]data-${kebabName}['"]`).test(source);
}

function mediaBlocks(css, maximumWidth = 760) {
  const blocks = [];
  let cursor = 0;
  while (cursor < css.length) {
    const atIndex = css.indexOf('@media', cursor);
    if (atIndex < 0) break;
    const openIndex = css.indexOf('{', atIndex);
    if (openIndex < 0) break;
    const condition = css.slice(atIndex, openIndex);
    let depth = 0;
    let closeIndex = openIndex;
    for (; closeIndex < css.length; closeIndex += 1) {
      if (css[closeIndex] === '{') depth += 1;
      if (css[closeIndex] === '}') depth -= 1;
      if (depth === 0) break;
    }
    const width = Number(condition.match(/max-width\s*:\s*(\d+)px/i)?.[1]);
    if (Number.isFinite(width) && width <= maximumWidth) {
      blocks.push(css.slice(openIndex + 1, closeIndex));
    }
    cursor = closeIndex + 1;
  }
  return blocks.join('\n');
}

test('데스크톱 전역 메뉴는 더보기 없이 여섯 사용자 목적만 노출한다', async () => {
  const html = await read('index.html');
  const nav = elementByClass(html, 'nav', 'portal-nav');
  assert.ok(nav, 'aria-label을 가진 .portal-nav 전역 메뉴가 필요합니다.');

  const entries = navEntries(nav);
  assert.equal(entries.length, 6, '전역 메뉴는 중복·더보기 없이 정확히 6개여야 합니다.');
  assert.deepEqual(entries.map(({ target }) => target), [
    'recommend', 'visits', 'market', 'supply', 'guide', 'connections',
  ]);
  const expectedLabels = ['집 찾기', '내 기록', '실거래', '분양·청약', '사용 안내', '연결 상태'];
  entries.forEach((entry, index) => {
    assert.ok(entry.label.includes(expectedLabels[index]), `${entry.target} 메뉴 이름은 '${expectedLabels[index]}'이어야 합니다.`);
  });
  assert.doesNotMatch(stripMarkup(nav), /더보기/);
  assert.ok(!entries.some(({ target }) => target === 'map'), '방문 지도는 전역 메뉴가 아니라 내 기록 하위여야 합니다.');
});

test('내 기록에서 지도·목록·비교 세 보기로 바로 전환할 수 있다', async () => {
  const html = await read('index.html');
  const tabs = [
    ['recordTabMap', 'map', /지도/],
    ['recordTabList', 'list', /목록/],
    ['recordTabCompare', 'compare', /비교/],
  ];

  for (const [id, mode, labelPattern] of tabs) {
    const tag = openingTagById(html, id);
    assert.ok(tag, `내 기록 하위 보기 #${id}가 필요합니다.`);
    assert.equal(attribute(tag, 'data-record-mode'), mode, `#${id}는 data-record-mode='${mode}'여야 합니다.`);
    const vicinity = html.slice(Math.max(0, html.indexOf(tag) - 80), html.indexOf(tag) + tag.length + 180);
    assert.match(stripMarkup(vicinity), labelPattern);
  }
});

test('집 찾기 지도는 다섯 종류의 결과 레이어를 사용자가 켜고 끌 수 있다', async () => {
  const html = await read('index.html');
  const layers = [
    ['recommendationLayerApartments', 'apartments'],
    ['recommendationLayerSupply', 'supply'],
    ['recommendationLayerVisits', 'visits'],
    ['recommendationLayerShortlist', 'shortlist'],
    ['recommendationLayerWorkplaces', 'workplaces'],
  ];

  for (const [id, value] of layers) {
    const tag = openingTagById(html, id);
    assert.ok(tag, `집 찾기 지도 레이어 토글 #${id}가 필요합니다.`);
    assert.equal(
      attribute(tag, 'data-recommendation-layer'),
      value,
      `#${id}는 data-recommendation-layer='${value}' 계약을 유지해야 합니다.`,
    );
    assert.ok(/<(?:button|input)\b/i.test(tag), `#${id}는 실제 조작 가능한 button 또는 input이어야 합니다.`);
  }
});

test('집 찾기·내 기록·분양 결과에서 해당 아파트 실거래로 교차 이동할 수 있다', async () => {
  const app = await read('js/app.js');
  const recommendationTemplate = functionBody(app, 'makeRecommendationCard');
  const visitTemplates = [functionBody(app, 'makePropertyCard'), functionBody(app, 'renderArchive')].join('\n');
  const supplyTemplate = functionBody(app, 'renderSupplyDetail');
  const sharedMarketBinding = functionBody(app, 'bindOpenMarketButton');
  const sharedMarketOpen = functionBody(app, 'openMarketForRecord');

  assert.ok(
    hasDataHook(recommendationTemplate, 'open-market-complex')
      || (/bindOpenMarketButton\s*\(/.test(recommendationTemplate)
        && hasDataHook(sharedMarketBinding, 'open-market-complex')),
    '집 찾기 후보의 실거래 버튼에는 data-open-market-complex 의미 훅이 필요합니다.',
  );
  assert.ok(
    /showRecommendationMarket|setView\(\s*['"]market['"]\s*\)/.test(recommendationTemplate)
      || (/bindOpenMarketButton\s*\(/.test(recommendationTemplate)
        && /openMarketForRecord\s*\(/.test(sharedMarketBinding)
        && /showRecommendationMarket|openMarketForVisit|setView\(\s*['"]market['"]\s*\)/.test(sharedMarketOpen)),
    '집 찾기 후보의 의미 훅은 실제 실거래 화면을 여는 공통 동작에 연결돼야 합니다.',
  );

  assert.ok(
    hasDataHook(visitTemplates, 'open-market-visit') || /openMarketForVisit\(\s*visit\s*\)/.test(visitTemplates),
    '내 기록 카드·목록에는 저장한 집의 면적 맞춤 실거래 진입이 필요합니다.',
  );

  assert.ok(
    hasDataHook(supplyTemplate, 'open-market-supply')
      || hasDataHook(supplyTemplate, 'open-market-complex')
      || hasDataHook(supplyTemplate, 'open-market')
      || (/bindOpenMarketButton\s*\(/.test(supplyTemplate)
        && hasDataHook(sharedMarketBinding, 'open-market-complex')),
    '분양 상세의 아파트에는 data-open-market 계열 실거래 진입 훅이 필요합니다.',
  );
});

test('모바일은 핵심 네 메뉴를 하단에 두고 안내·연결은 상단에서도 열 수 있다', async () => {
  const [html, styles, uiKit, supply, guide, navigationV25] = await Promise.all([
    read('index.html'), read('css/styles.css'), read('css/ui-kit.css'), read('css/supply.css'), read('css/guide.css'),
    readOptional('css/navigation-v25.css'),
  ]);
  assert.match(html, /css\/navigation-v25\.css(?:\?[^"']*)?["']/i, '2.5 내비게이션 스타일시트를 페이지에서 불러와야 합니다.');
  const mobileCss = mediaBlocks([styles, uiKit, supply, guide, navigationV25].join('\n'));
  const compactCss = mobileCss.replace(/\s+/g, ' ');

  assert.match(compactCss, /\.hh-app\s+\.portal-nav\s*\{[^}]*position\s*:\s*fixed[^}]*bottom\s*:/i);
  const navColumnDeclarations = [...compactCss.matchAll(/portal-nav\s*\{[^}]*grid-template-columns\s*:\s*repeat\((\d+)\s*,/gi)];
  assert.ok(navColumnDeclarations.length, '모바일 하단 내비게이션 열 수를 선언해야 합니다.');
  assert.equal(navColumnDeclarations.at(-1)[1], '4', '최종 모바일 cascade는 핵심 메뉴 4열이어야 합니다.');

  const hiddenRules = [...compactCss.matchAll(/([^{}]+)\{([^{}]*display\s*:\s*none[^{}]*)\}/gi)]
    .map(([, selector]) => selector)
    .join(' ');
  const hidesSecondaryTargets = /data-view-target\s*=\s*["']guide["']/i.test(hiddenRules)
    && /data-view-target\s*=\s*["']connections["']/i.test(hiddenRules);
  const hidesSemanticSecondaryClass = /(?:portal-nav-secondary|nav-secondary|secondary-nav|mobile-secondary|desktop-only-nav)/i.test(hiddenRules);
  assert.ok(
    hidesSecondaryTargets || hidesSemanticSecondaryClass,
    '760px 이하에서는 사용 안내·연결 상태 두 보조 항목을 하단 4칸에서 숨기는 의미 있는 규칙이 필요합니다.',
  );

  const headerActions = elementByClass(html, 'div', 'header-actions');
  assert.match(headerActions, /data-view-target=["']guide["']/i, '모바일 상단에 사용 안내 진입을 유지해야 합니다.');
  assert.match(headerActions, /data-view-target=["']connections["']/i, '모바일 상단에 연결 상태 진입을 유지해야 합니다.');
});
