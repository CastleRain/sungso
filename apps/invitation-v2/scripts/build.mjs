import { readFile, writeFile } from 'node:fs/promises';
import { wedding, photos, accountGroups } from '../js/config.mjs';
import { calendarDays, calendarEvent, formatWedding, publishedAccounts } from '../js/core.mjs';
import { weddingLettering } from '../js/wedding-lettering.mjs';

const escape = text => String(text).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
const format = formatWedding(wedding.startsAt), month = calendarDays(wedding.startsAt);
const rows = Array.from({ length: month.cells.length / 7 }, (_, row) => `<tr>${month.cells.slice(row * 7, row * 7 + 7).map(cell => cell ? `<td${cell.wedding ? ' class="wedding-day"' : ''}><span${cell.wedding ? ` aria-label="${cell.day}일, 결혼식"` : ''}>${cell.day}</span></td>` : '<td></td>').join('')}</tr>`).join('');
const gallery = photos.slice(1, 4).map((photo, i) => `<button class="gallery-item reveal${i === 2 ? ' gallery-wide' : ''}" type="button" data-photo="${i + 1}" aria-label="${escape(photo.alt)} · 크게 보기"><img src="${photo.thumb}" srcset="${photo.thumb} 640w, ${photo.src} 1440w" sizes="(min-width: 480px) ${i === 2 ? '416px' : '204px'}, ${i === 2 ? '100vw' : '50vw'}" width="${photo.width}" height="${photo.height}" alt="${escape(photo.alt)}" loading="lazy" decoding="async"><span class="photo-caption">${['01 / 너의 가장 가까이', '02 / 같은 마음으로', '03 / 우리, 결혼해요'][i]}</span></button>`).join('');
const query = encodeURIComponent(`부산 ${wedding.venueSearchName}`);
const accounts = accountGroups.map(group => {
  const ready = publishedAccounts(group);
  return `<details class="account-group"><summary><span>${escape(group.label)} <small>마음 전하기</small></span><img class="icon" src="./assets/icons/chevron-down.svg" width="16" height="16" alt=""></summary><div class="account-body">${ready.length ? ready.map((account, index) => `<div class="account-row"><div><p class="account-holder"><span>${escape(account.relation)}</span> ${escape(account.holder)}</p><p class="account-number"><span>${escape(account.bank)}</span> <b>${escape(account.number)}</b></p></div><button class="copy-account" data-account="${escape(group.id)}-${index}" type="button" aria-label="${escape(account.relation)} ${escape(account.holder)} 계좌번호 복사">복사<img class="icon" src="./assets/icons/copy.svg" width="15" height="15" alt=""></button></div>`).join('') : '<p class="account-empty">계좌 정보는 추후 안내드릴게요.<br><span>축복해 주시는 마음에 감사드립니다.</span></p>'}</div></details>`;
}).join('');
const values = {
  title: escape(wedding.title), description: escape(`${format.dateKorean} ${format.time}, ${wedding.venue} ${wedding.room}`), canonical: wedding.canonicalUrl,
  iso: wedding.startsAt, date: format.date, dateKorean: format.dateKorean, time: format.time, weekday: format.weekday,
  groom: wedding.groom, bride: wedding.bride, venue: wedding.venue, room: wedding.room, address: wedding.address,
  calendarRows: rows, gallery, calendarYear: month.year, calendarMonth: String(month.month).padStart(2, '0'),
  calendarLabel: `${month.year}년 ${month.month}월 달력, ${month.day}일 ${format.weekday} 결혼식`,
  naverUrl: `https://map.naver.com/p/search/${query}`, kakaoUrl: `https://map.kakao.com/link/search/${query}`,
  lettering: weddingLettering({ variant: 'photo' }), accounts, mapTimestamp: wedding.map.timestamp, mapKey: wedding.map.key,
};
let template = await readFile(new URL('../src/index.template.html', import.meta.url), 'utf8');
template = template.replace(/\{\{(\w+)\}\}/g, (_, key) => {
  if (!(key in values)) throw new Error(`Missing template value: ${key}`);
  return values[key];
});
await writeFile(new URL('../index.html', import.meta.url), template);
const mapTemplate = await readFile(new URL('../src/map.template.html', import.meta.url), 'utf8');
await writeFile(new URL('../map.html', import.meta.url), mapTemplate.replace(/\{\{(mapTimestamp|mapKey)\}\}/g, (_, key) => values[key]));
await writeFile(new URL('../wedding.ics', import.meta.url), calendarEvent(wedding));
console.log(`Invitation VER2: ${format.dateKorean} ${format.time} · ${wedding.room}`);
