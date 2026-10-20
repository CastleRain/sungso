export async function prepareAlbumPhoto(file) {
  if (!['image/jpeg','image/png','image/webp'].includes(file?.type) || file.size>25*1024*1024) throw Error('25MB 이하의 JPG·PNG·WebP 사진을 선택해 주세요.');
  const url=URL.createObjectURL(file);
  try {
    const image=new Image();image.src=url;await image.decode();
    if(!image.naturalWidth||image.naturalWidth*image.naturalHeight>60000000)throw Error('사진 크기를 조금 줄여 주세요.');
    function encode(maxEdge,limit) {
      const canvas=document.createElement('canvas');let scale=Math.min(1,maxEdge/Math.max(image.naturalWidth,image.naturalHeight));
      for(let pass=0;pass<7;pass++){
        canvas.width=Math.max(1,Math.round(image.naturalWidth*scale));canvas.height=Math.max(1,Math.round(image.naturalHeight*scale));
        const context=canvas.getContext('2d');if(!context)throw Error('이 브라우저에서 사진을 준비하지 못했어요.');
        context.fillStyle='#fff';context.fillRect(0,0,canvas.width,canvas.height);context.drawImage(image,0,0,canvas.width,canvas.height);
        for(const quality of [.86,.76,.66,.56]){const data=canvas.toDataURL('image/jpeg',quality);if(data.startsWith('data:image/jpeg;base64,')&&data.length<=limit)return{data,width:canvas.width,height:canvas.height};}
        scale*=.8;
      }
      throw Error('사진을 웹용 크기로 줄이지 못했어요.');
    }
    const full=encode(1600,360000),thumb=encode(480,60000);
    return {full:full.data,thumb:thumb.data,width:full.width,height:full.height};
  } finally {URL.revokeObjectURL(url);}
}
