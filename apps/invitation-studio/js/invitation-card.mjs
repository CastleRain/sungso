import { formatWedding } from './core.mjs';
import { readComposition, compositionParams } from './composition.mjs';
import { APPEARANCE_FONTS, appearanceChoices } from './appearance.mjs';

export const CARD_SIZE = Object.freeze({ width: 1080, height: 1440 });
const palettes = Object.freeze({
  f: { paper: '#f9fbfd', ink: '#263847', accent: '#496b86', muted: '#5e7180', line: '#d7e1e9' },
  g: { paper: '#ffffff', ink: '#253c4d', accent: '#3f627b', muted: '#5a7080', line: '#d8e2eb' },
});

function colorChannels(value) {
  const input = String(value).trim();
  if (/^#[\da-f]{3}$/i.test(input)) return [...input.slice(1)].map(digit => parseInt(digit + digit, 16));
  if (/^#[\da-f]{6}$/i.test(input)) return [1, 3, 5].map(index => parseInt(input.slice(index, index + 2), 16));
  const rgb = input.match(/^rgb\(\s*(\d{1,3})(?:\s*,\s*|\s+)(\d{1,3})(?:\s*,\s*|\s+)(\d{1,3})\s*\)$/i);
  if (rgb && rgb.slice(1).every(channel => Number(channel) <= 255)) return rgb.slice(1).map(Number);
  throw new TypeError('이미지 색상은 불투명한 HEX 또는 RGB 값이어야 합니다.');
}
function luminance(channels) {
  const rgb = channels.map(value => { const unit = value / 255; return unit <= .04045 ? unit / 12.92 : ((unit + .055) / 1.055) ** 2.4; });
  return rgb[0] * .2126 + rgb[1] * .7152 + rgb[2] * .0722;
}
export function contrastRatio(first, second) {
  const values = [luminance(colorChannels(first)), luminance(colorChannels(second))].sort((a, b) => b - a);
  return (values[0] + .05) / (values[1] + .05);
}
export function cardPalette(variant, colors = {}) {
  if (!Object.hasOwn(palettes, variant)) throw new TypeError('알 수 없는 청첩장 시안입니다.');
  const palette = { ...palettes[variant] };
  for (const key of Object.keys(palette)) if (colors[key] != null) {
    const channels = colorChannels(colors[key]);
    palette[key] = `rgb(${channels.join(', ')})`;
  }
  if (contrastRatio(palette.ink, palette.paper) < 4.5 || contrastRatio(palette.muted, palette.paper) < 4.5 || contrastRatio(palette.accent, palette.paper) < 3) {
    throw new TypeError('이미지의 글자가 선명하게 보이도록 글자와 배경 색상 대비를 확인해 주세요.');
  }
  return palette;
}

export function validateCardUrls({ photoUrl, canonicalUrl, variant, baseURI }) {
  let base, photo, canonical;
  try { base = new URL(baseURI); photo = new URL(photoUrl, base); canonical = new URL(canonicalUrl); }
  catch { throw new TypeError('사진 또는 청첩장 주소를 확인해 주세요.'); }
  if (!['http:', 'https:'].includes(base.protocol) || !['http:', 'https:'].includes(photo.protocol) || photo.origin !== base.origin || photo.username || photo.password) {
    throw new TypeError('이미지 저장에는 현재 청첩장에서 제공하는 사진만 사용할 수 있어요.');
  }
  const query = canonical.search;
  const approvedQuery = query === '' || query === `?${compositionParams(readComposition(query)).toString()}`;
  if (canonical.origin !== 'https://sungso-wedding.vercel.app' || canonical.pathname !== '/lab/studio/preview/' || !approvedQuery || canonical.hash || canonical.username || canonical.password) {
    throw new TypeError('이 시안의 공개 청첩장 주소를 확인해 주세요.');
  }
  return { photoUrl: photo.href, canonicalUrl: canonical.href };
}

export function coverCrop(sourceWidth, sourceHeight, targetWidth, targetHeight, focalY = .44) {
  if (![sourceWidth, sourceHeight, targetWidth, targetHeight].every(value => Number.isFinite(value) && value > 0)) throw new TypeError('사진 크기를 읽지 못했어요.');
  const ratio = targetWidth / targetHeight;
  let width = sourceWidth, height = sourceWidth / ratio;
  if (height > sourceHeight) { height = sourceHeight; width = sourceHeight * ratio; }
  const y = (sourceHeight - height) * Math.min(1, Math.max(0, focalY));
  return { x: (sourceWidth - width) / 2, y, width, height };
}

export function wrapCardText(text, maxWidth, measure) {
  if (!(maxWidth > 0) || typeof measure !== 'function') throw new TypeError('텍스트 영역을 확인해 주세요.');
  const words = String(text).trim().split(/\s+/).filter(Boolean);
  const lines = []; let line = '';
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (measure(candidate) <= maxWidth) { line = candidate; continue; }
    if (line) { lines.push(line); line = ''; }
    if (measure(word) <= maxWidth) { line = word; continue; }
    for (const character of Array.from(word)) {
      if (line && measure(line + character) > maxWidth) { lines.push(line); line = ''; }
      line += character;
    }
  }
  if (line) lines.push(line);
  return lines;
}

function cleanText(value, label, maxLength) {
  const text = String(value ?? '').trim().replace(/\s+/g, ' ');
  if (!text || text.length > maxLength || /[\u0000-\u001f\u007f]/.test(text)) throw new TypeError(`${label} 정보를 확인해 주세요.`);
  return text;
}
function bounded(promise, milliseconds, message) {
  let timer;
  return Promise.race([promise, new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(message)), milliseconds); })])
    .finally(() => clearTimeout(timer));
}

async function loadFonts(doc, typography) {
  if (!doc.fonts?.load || !doc.fonts?.ready) throw new Error('이 브라우저에서는 청첩장 글꼴을 확인할 수 없어요. 최신 브라우저에서 다시 시도해 주세요.');
  await bounded(Promise.all([
    doc.fonts.load(`${typography.bodyWeight} 32px ${typography.body}`, '성우 소희 결혼식'),
    doc.fonts.load(`${typography.titleWeight} 54px ${typography.title}`, '성우 소희'),
    doc.fonts.load('400 82px PinyonScript', 'We are getting married'),
    doc.fonts.load('400 20px AnticDidone', 'SUNGWOO SOHEE 2027'),
  ]).then(results => {
    if (results.some(fonts => !fonts?.length)) throw new Error('청첩장 글꼴이 아직 준비되지 않았어요. 잠시 후 다시 시도해 주세요.');
    return doc.fonts.ready;
  }), 10_000, '글꼴을 불러오는 데 시간이 걸리고 있어요. 연결을 확인한 뒤 다시 시도해 주세요.');
}
function loadPhoto(doc, src) {
  return new Promise((resolve, reject) => {
    const image = doc.createElement('img');
    let timer;
    const clear = () => { clearTimeout(timer); image.onload = null; image.onerror = null; };
    image.onload = () => {
      clear();
      if (!image.naturalWidth || !image.naturalHeight) reject(new Error('사진 크기를 읽지 못했어요. 다른 사진으로 다시 시도해 주세요.'));
      else resolve(image);
    };
    image.onerror = () => { clear(); reject(new Error('사진을 불러오지 못했어요. 연결을 확인한 뒤 다시 시도해 주세요.')); };
    timer = setTimeout(() => { clear(); image.removeAttribute?.('src'); reject(new Error('사진을 불러오는 데 시간이 걸리고 있어요. 잠시 후 다시 시도해 주세요.')); }, 12_000);
    image.decoding = 'async'; image.src = src;
  });
}

function line(ctx, color, x1, y1, x2, y2, width = 1) {
  ctx.beginPath(); ctx.strokeStyle = color; ctx.lineWidth = width; ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
}
function textLine(ctx, text, { x = 540, y, size = 32, minimum = size, width = 920, font = 'RIDIBatang', weight = 400, color, align = 'center' }) {
  ctx.textAlign = align; ctx.textBaseline = 'alphabetic'; ctx.fillStyle = color;
  let current = size;
  do { ctx.font = `${weight} ${current}px ${font}`; if (ctx.measureText(text).width <= width) break; current--; } while (current >= minimum);
  if (current < minimum) throw new Error('입력된 정보를 이미지에 모두 담기 어려워요. 장소나 이름의 길이를 확인해 주세요.');
  ctx.fillText(text, x, y);
}
function photoShape(ctx, variant, box) {
  const { x, y, width, height } = box;
  ctx.beginPath();
  if (variant === 'g') {
    const radius = 146;
    ctx.moveTo(x, y + radius); ctx.bezierCurveTo(x, y + 40, x + 48, y, x + radius, y);
    ctx.lineTo(x + width - radius, y); ctx.bezierCurveTo(x + width - 48, y, x + width, y + 40, x + width, y + radius);
    ctx.lineTo(x + width, y + height); ctx.lineTo(x, y + height); ctx.closePath();
  } else ctx.rect(x, y, width, height);
}
function drawPhoto(ctx, image, variant, palette) {
  const box = { x: 64, y: 94, width: 952, height: 688 };
  ctx.save(); photoShape(ctx, variant, box); ctx.clip();
  const crop = coverCrop(image.naturalWidth, image.naturalHeight, box.width, box.height);
  ctx.drawImage(image, crop.x, crop.y, crop.width, crop.height, box.x, box.y, box.width, box.height);
  ctx.restore();
}
function drawMotif(ctx, variant, palette) {
  ctx.save(); ctx.strokeStyle = palette.accent; ctx.lineWidth = 1.5;
  if (variant === 'g') {
    ctx.beginPath(); ctx.moveTo(440, 1289); ctx.bezierCurveTo(492, 1269, 568, 1310, 626, 1289); ctx.stroke();
  } else line(ctx, palette.line, 450, 1288, 630, 1288);
  ctx.restore();
}

/** Native canvas export. The caller owns Object URL lifetime and share/download UI. */
export async function createInvitationCard({ wedding, photoUrl, variant, themeName, canonicalUrl, colors, font = 'letter', doc = document } = {}) {
  const palette = cardPalette(variant, colors);
  const typography = APPEARANCE_FONTS[appearanceChoices({ font }).font];
  const urls = validateCardUrls({ photoUrl, canonicalUrl, variant, baseURI: doc.baseURI });
  const details = {
    groom: cleanText(wedding?.groom, '신랑 이름', 30), bride: cleanText(wedding?.bride, '신부 이름', 30),
    venue: cleanText(wedding?.venue, '예식장', 80), room: cleanText(wedding?.room, '홀과 층', 60),
    address: cleanText(wedding?.address, '주소', 180), themeName: cleanText(themeName, '시안 이름', 50),
  };
  const date = formatWedding(wedding.startsAt);
  const [, photo] = await Promise.all([loadFonts(doc, typography), loadPhoto(doc, urls.photoUrl)]);
  const canvas = doc.createElement('canvas'); canvas.width = CARD_SIZE.width; canvas.height = CARD_SIZE.height;
  const ctx = canvas.getContext('2d');
  if (!ctx || typeof canvas.toBlob !== 'function') throw new Error('이 브라우저에서는 이미지를 만들 수 없어요. 최신 브라우저에서 다시 시도해 주세요.');
  ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
  const bodyText = (text, options) => textLine(ctx, text, { font: typography.body, weight: typography.bodyWeight, ...options });
  const titleText = (text, options) => textLine(ctx, text, { font: typography.title, weight: typography.titleWeight, ...options });
  try {
    ctx.fillStyle = palette.paper; ctx.fillRect(0, 0, canvas.width, canvas.height);
    textLine(ctx, 'With love', { x:64, y:59, size:34, font:'PinyonScript', color:palette.accent, align:'left' });
    textLine(ctx, 'VER6.1 — STUDIO', { x:1016, y:55, size:18, font:'AnticDidone', color:palette.muted, align:'right' });
    drawPhoto(ctx, photo, variant, palette);
    textLine(ctx, 'We are getting married', { y:859, size:82, minimum:68, font:'PinyonScript', color:palette.accent });
    titleText(`${details.groom}  &  ${details.bride}`, { y:939, size:54, minimum:36, color:palette.ink });
    bodyText(date.dateKorean, { y:1004, size:33, minimum:28, color:palette.ink });
    bodyText(date.time, { y:1048, size:31, color:palette.ink });
    titleText(details.venue, { y:1120, size:35, minimum:25, color:palette.ink });
    bodyText(details.room, { y:1163, size:29, minimum:22, color:palette.ink });
    let addressLines, addressSize = 27;
    do { ctx.font = `${typography.bodyWeight} ${addressSize}px ${typography.body}`; addressLines = wrapCardText(details.address, 920, text => ctx.measureText(text).width); if (addressLines.length <= 2) break; addressSize--; } while (addressSize >= 20);
    if (addressLines.length > 2) throw new Error('주소가 너무 길어 이미지에 모두 담기 어려워요. 예식장 주소를 확인해 주세요.');
    addressLines.forEach((text, index) => bodyText(text, { y:1215 + index*34, size:addressSize, color:palette.muted }));
    drawMotif(ctx, variant, palette);
    const visibleUrl = new URL(urls.canonicalUrl).origin.replace(/^https:\/\//, '') + '/lab/studio/';
    textLine(ctx, visibleUrl, { y:1340, size:21, minimum:18, font:'AnticDidone', color:palette.muted });
    bodyText('조합 미리보기', { y:1380, size:19, color:palette.muted });
    bodyText(details.themeName, { y:1411, size:17, minimum:14, color:palette.muted });
    const blob = await bounded(new Promise((resolve, reject) => {
      try { canvas.toBlob(value => value?.size > 0 && value.type === 'image/png' ? resolve(value) : reject(new Error('이미지를 저장하지 못했어요. 다시 시도해 주세요.')), 'image/png'); }
      catch { reject(new Error('사진을 이미지로 저장할 수 없어요. 청첩장을 새로 연 뒤 다시 시도해 주세요.')); }
    }), 10_000, '이미지를 만드는 데 시간이 걸리고 있어요. 다시 시도해 주세요.');
    const URLApi = doc.defaultView?.URL;
    if (!URLApi?.createObjectURL) throw new Error('이 브라우저에서는 이미지 저장 주소를 만들 수 없어요.');
    const url = URLApi.createObjectURL(blob);
    return { blob, url, filename:'sungso-wedding-studio-preview.png', ...CARD_SIZE };
  } finally { canvas.width = 0; canvas.height = 0; }
}
