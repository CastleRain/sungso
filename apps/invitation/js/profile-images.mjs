import { MAX_PHOTO_CHARS } from './profile-core.mjs?v=20260915-venue-map';

export async function preparePhoto(file, {document: doc = document, URL: urls = URL, Image: ImageClass = Image} = {}) {
  if (!file || !['image/jpeg','image/png','image/webp'].includes(file.type)) throw new Error('JPG·PNG·WebP 사진을 선택해주세요.');
  if (file.size > 25 * 1024 * 1024) throw new Error('사진 한 장은 25MB 이하로 선택해주세요.');
  const url = urls.createObjectURL(file);
  try {
    const image = new ImageClass(); image.src = url;
    await image.decode();
    if (!image.naturalWidth || !image.naturalHeight || image.naturalWidth * image.naturalHeight > 60000000) throw new Error('사진의 크기를 조금 줄여 다시 선택해주세요.');
    const canvas = doc.createElement('canvas');
    let scale = Math.min(1,1600 / Math.max(image.naturalWidth,image.naturalHeight));
    for (let pass=0;pass<7;pass++) {
      canvas.width = Math.max(1,Math.round(image.naturalWidth * scale));
      canvas.height = Math.max(1,Math.round(image.naturalHeight * scale));
      const context = canvas.getContext('2d');
      if (!context) throw new Error('이 브라우저에서 사진을 준비하지 못했어요. 다른 브라우저에서 다시 시도해주세요.');
      context.fillStyle = '#fff'; context.fillRect(0,0,canvas.width,canvas.height);
      context.drawImage(image,0,0,canvas.width,canvas.height);
      for (const quality of [.86,.76,.66,.56]) {
        const dataUrl = canvas.toDataURL('image/jpeg',quality);
        if (dataUrl.startsWith('data:image/jpeg;base64,') && dataUrl.length <= MAX_PHOTO_CHARS) return {dataUrl,width:canvas.width,height:canvas.height};
      }
      scale *= .78;
    }
    throw new Error('이 사진은 저장할 크기로 줄이지 못했어요. 작은 사진으로 다시 선택해주세요.');
  } finally { urls.revokeObjectURL(url); }
}
