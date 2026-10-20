export const ALBUM_PATH = '/api/invitation/v3/album';
export const MAX_ALBUM_PHOTOS = 20;
export const MAX_SAVED_PHOTOS = 60;
export const PHOTO_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export const isAlbumRoute = path => path === ALBUM_PATH || [ALBUM_PATH+'/manage',ALBUM_PATH+'/upload',ALBUM_PATH+'/publish'].includes(path) || new RegExp('^'+ALBUM_PATH+'/(?:manage/)?photos/[0-9a-f-]{36}/(?:full|thumb)$','i').test(path);
export class AlbumError extends Error { constructor(code,message,status=400) { super(message); this.code=code;this.status=status; } }
export function albumFail(code,message,status) { throw new AlbumError(code,message,status); }
export function photoCaption(value) {
  if (typeof value !== 'string' || [...value].length>160 || /[\x00-\x1f\x7f]/.test(value)) albumFail('INVALID_CAPTION','사진 설명은 160자 이내로 입력해 주세요.');
  return value.trim().normalize('NFC') || '성우와 소희의 사진';
}
export function validRevision(value) { if (!Number.isSafeInteger(value) || value<0) albumFail('INVALID_REVISION','최신 사진첩을 먼저 불러와 주세요.'); return value; }
export function validateAlbumItems(items) {
  if (!Array.isArray(items) || items.length>MAX_ALBUM_PHOTOS) albumFail('ALBUM_LIMIT','사진첩에는 최대 20장을 넣을 수 있어요.');
  const ids=new Set();
  return items.map(item=>{
    if (!item || Object.keys(item).some(k=>!['id','kind','alt'].includes(k)) || typeof item.id!=='string' || ids.has(item.id)) albumFail('INVALID_PHOTO','사진 목록을 확인해 주세요.');
    ids.add(item.id);
    if (item.kind==='static' ? !defaultPhotos.some(p=>p.id===item.id) : item.kind!=='upload' || !PHOTO_UUID.test(item.id)) albumFail('INVALID_PHOTO','선택한 사진을 확인해 주세요.');
    return {id:item.id,kind:item.kind,alt:photoCaption(item.alt)};
  });
}
export const defaultPhotos = Object.freeze([
  { id: 'forest', src: './assets/photos/forest-1440.webp', thumb: './assets/photos/forest-640.webp', width: 1440, height: 2159, alt: '초록빛 산책길에서 손을 잡고 나란히 걷는 성우와 소희' },
  { id: 'bouquet', src: './assets/photos/bouquet-1440.webp', thumb: './assets/photos/bouquet-640.webp', width: 1440, height: 2159, alt: '작은 꽃다발을 사이에 두고 서로를 바라보는 두 사람' },
  { id: 'promise', src: './assets/photos/promise-1440.webp', thumb: './assets/photos/promise-640.webp', width: 1440, height: 2159, alt: '색색의 꽃다발 옆에서 손을 포개는 두 사람' },
  { id: 'date', src: './assets/photos/date-1440.webp', thumb: './assets/photos/date-640.webp', width: 1440, height: 2159, alt: '나무 아래에서 0306 풍선을 들고 결혼 날짜를 전하는 두 사람' },
  { id: 'walk', src: './assets/photos/walk-1440.webp', thumb: './assets/photos/walk-640.webp', width: 1440, height: 2159, alt: '햇살이 비치는 골목에서 손을 잡고 나란히 걷는 두 사람' },
  { id: 'sea', src: './assets/photos/sea-1440.webp', thumb: './assets/photos/sea-640.webp', width: 1440, height: 2159, alt: '바닷가에서 빨간 하트 풍선을 들고 마주 보는 두 사람' },
]);
