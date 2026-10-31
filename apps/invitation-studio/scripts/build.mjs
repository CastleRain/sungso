import { mkdir, readFile, writeFile, cp } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { wedding, family, storyChapters, music } from '../../invitation-v6/js/config.mjs';
import { defaultPhotos } from '../../../shared/invitation/album-core.mjs';
import { calendarDays, calendarEvent, formatWedding } from '../js/core.mjs';

const source = fileURLToPath(new URL('../', import.meta.url));
const e = value => String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
const replace = (template, values) => template.replace(/\{\{(\w+)\}\}/g, (_, key) => {
  if (!(key in values)) throw new Error(`Invitation lab template missing ${key}`);
  return values[key];
});

export async function buildInvitationStudio({ outDir, assetBase = '/v6/assets/', canonicalRoot = 'https://sungso-wedding.vercel.app/lab/studio/' } = {}) {
  if (!outDir) throw new TypeError('Explicit output directory required');
  if (!assetBase.startsWith('/') || !assetBase.endsWith('/') || assetBase.includes('..')) throw new TypeError('Expected public asset directory');
  const output = resolve(outDir);
  if (output === resolve(source) || !canonicalRoot.startsWith('https://sungso-wedding.vercel.app/')) throw new TypeError('Unsafe lab output/configuration');
  await mkdir(output, { recursive: true });
  await mkdir(join(output, 'assets'), { recursive: true });
  for (const directory of ['js', 'css', 'themes']) await cp(join(source, directory), join(output, directory), { recursive: true });
  for (const name of ['composition', 'fine-tuning', 'content-draft']) await cp(new URL('../../../shared/invitation/studio/' + name + '.mjs', import.meta.url), join(output, 'js', name + '.mjs'));
  const [template, handwriting] = await Promise.all([
    readFile(join(source, 'src/index.template.html'), 'utf8'), readFile(join(source, 'src/hero-handwriting.svg'), 'utf8'),
  ]);
  let photos = defaultPhotos.map(photo => ({ ...photo, src: `${assetBase}photos/${photo.id}-1440.webp`, thumb: `${assetBase}photos/${photo.id}-640.webp` }));
  try {
    const snapshot = JSON.parse(await readFile(join(source, 'src/album-snapshot.json'), 'utf8'));
    if (Array.isArray(snapshot) && snapshot.length) photos = snapshot.map(photo => ({ ...photo, src: photo.localFile ? `../assets/photos/${photo.localFile}` : `${assetBase}photos/${photo.id}-1440.webp`, thumb: photo.localFile ? `../assets/photos/${photo.thumbFile || photo.localFile}` : `${assetBase}photos/${photo.id}-640.webp` }));
    await cp(join(source, 'assets'), join(output, 'assets'), { recursive: true });
  } catch (error) { if (error.code !== 'ENOENT') throw error; }
  const chapters = storyChapters.map(chapter => ({ ...chapter, image: `${assetBase}photos/${chapter.image}` }));
  const data = { mode: 'demo', assetBase, canonicalRoot, wedding: { ...wedding, canonicalUrl: canonicalRoot }, family, chapters, photos, music: { ...music, src: `${assetBase}audio/wedding-day.mp3` } };
  await writeFile(join(output, 'runtime.mjs'), `// Build-selected preview data. URL/storage cannot change mode.\nexport default ${JSON.stringify(data, null, 2)};\n`);
  const typography = (await readFile(new URL('../../invitation-v6/css/typography.css', import.meta.url), 'utf8')).replaceAll('../assets/', assetBase);
  await writeFile(join(output, 'css/typography.css'), typography);
  const f = formatWedding(wedding.startsAt), calendar = calendarDays(wedding.startsAt);
  const calendarRows = Array.from({ length: calendar.cells.length / 7 }, (_, row) => `<tr>${calendar.cells.slice(row * 7, row * 7 + 7).map(cell => cell ? `<td${cell.wedding ? ' class="wedding-day"' : ''}><span${cell.wedding ? ' aria-label="3월 6일 결혼식"' : ''}>${cell.day}</span></td>` : '<td></td>').join('')}</tr>`).join('');
  for (const id of ['f']) {
    const theme = { name: '우리의 조합', english: 'Our wedding studio' };
    const canonical = `${canonicalRoot}preview/`;
    const values = {
      id, name: e(theme.name), english: e(theme.english), description: e(`${wedding.title} · ${f.dateKorean} ${f.time} · VER6.1 조립 시안`), canonical,
      assetBase, mapUrl: assetBase.replace(/assets\/$/, 'map.html'), heroHandwriting: handwriting, heroDecor: theme.heroDecor || '', storyDecor: theme.storyDecor || '', galleryDecor: theme.galleryDecor || '',
      dateKorean: f.dateKorean, time: f.time, venue: wedding.venue, room: wedding.room, address: wedding.address, phone: wedding.phone.replace(/\D/g, ''),
      naverUrl: `https://map.naver.com/p/search/${encodeURIComponent('부산 ' + wedding.venueSearchName)}`,
      familyRows: Object.values(family).map(person => `<div class="family-person"><p>${person.parents.map(e).join(' · ')}<span>의 ${person.relation}</span></p><p><small>${person.role}</small><strong>${person.name}</strong></p></div>`).join(''),
      calendarRows,
      gallery: photos.slice(0, 6).map((photo, index) => `<button class="gallery-photo" data-photo-index="${index}" aria-label="${index + 1}번째 사진 크게 보기"><img src="${e(photo.thumb)}" width="${photo.width}" height="${photo.height}" alt="${e(photo.alt)}" loading="lazy" decoding="async"><span aria-hidden="true">↗</span></button>`).join(''),
      photoCount: photos.length,
      chapters: chapters.map((chapter, index) => `<article class="story-page" data-chapter="${index}"${index ? ' hidden' : ''}><div class="story-page-photo"><img src="${chapter.image}" alt="${e(chapter.alt)}" width="1440" height="2159" loading="lazy"></div><div class="story-page-copy"><small>${chapter.kicker}</small><h3>${e(chapter.title)}</h3><p>${chapter.lines.map(e).join('<br>')}</p>${chapter.quote ? `<blockquote>${e(chapter.quote).replaceAll('\n', '<br>')}</blockquote>` : ''}<p class="story-note">${e(chapter.note)}</p></div></article>`).join(''),
      chapterButtons: chapters.map((chapter, index) => `<button data-chapter-open="${index}" aria-label="${index + 1}장 ${e(chapter.title)}"><span class="chapter-node" aria-hidden="true"></span><small>0${index + 1}</small><span>${['첫 만남', '확신', '그리고, 결혼'][index]}</span></button>`).join(''),
    };
    await mkdir(join(output, 'preview'), { recursive: true });
    await writeFile(join(output, 'preview', 'index.html'), replace(template, values));
    await writeFile(join(output, 'preview', 'wedding.ics'), calendarEvent({ ...wedding, canonicalUrl: canonical }));
  }
  const catalog = await readFile(join(source, 'catalog/index.html'), 'utf8');
  await writeFile(join(output, 'index.html'), replace(catalog, { canonicalRoot, assetBase }));
  for (const filename of ['catalog.css', 'catalog.mjs', 'guided-steps.mjs', 'inspector-model.mjs']) await cp(join(source, 'catalog', filename), join(output, filename));
  return { outDir: output, variants: ['preview'], mode: 'demo', photos: photos.length };
}

export const buildApp = ({ outdir }) => buildInvitationStudio({ outDir: outdir, assetBase: '/sungso/invitation-v6/assets/' });
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = await buildInvitationStudio({ outDir: process.argv[2] || join(source, 'dist') });
  console.log(`Invitation Studio: composition editor and preview -> ${result.outDir}`);
}
