import qrcode from './vendor/qrcode-generator.mjs';
/** 85 × 55 mm at 300 pixels per inch. Canvas export adds a PNG pHYs chunk. */
export const TICKET_SIZE={width:1004,height:650,dpi:300};
function crc32(bytes){let c=0xffffffff;for(const b of bytes){c^=b;for(let i=0;i<8;i++)c=(c>>>1)^((c&1)?0xedb88320:0);}return(c^0xffffffff)>>>0;}
export function pngResolution(bytes,dpi=300){
  const input=new Uint8Array(bytes);if(input.length<33||input[0]!==137||String.fromCharCode(...input.slice(1,4))!=='PNG')throw Error('PNG 형식을 확인해 주세요.');
  const chunk=new Uint8Array(21),view=new DataView(chunk.buffer);view.setUint32(0,9);chunk.set([112,72,89,115],4);const ppm=Math.round(dpi/.0254);view.setUint32(8,ppm);view.setUint32(12,ppm);chunk[16]=1;view.setUint32(17,crc32(chunk.slice(4,17)));const out=new Uint8Array(input.length+chunk.length);out.set(input.slice(0,33));out.set(chunk,33);out.set(input.slice(33),54);return out;
}
export async function createPrintTicket({doc=document,wedding,colors={},font='RIDIBatang,serif',routeSteps=[],url='https://sungso-wedding.vercel.app/'}){
  await doc.fonts?.ready;const canvas=doc.createElement('canvas');canvas.width=TICKET_SIZE.width;canvas.height=TICKET_SIZE.height;const ctx=canvas.getContext('2d');if(!ctx)throw Error('이미지를 만들 수 없어요.');
  ctx.fillStyle=colors.paper||'#ffffff';ctx.fillRect(0,0,1004,650);ctx.strokeStyle=colors.accent||'#496f8d';ctx.lineWidth=2;ctx.strokeRect(28,28,948,594);ctx.fillStyle=colors.ink||'#203d52';ctx.textBaseline='top';
  const text=(copy,x,y,font,maxWidth=570)=>{ctx.font=font;ctx.fillText(copy,x,y,maxWidth);};
  text('A DAY FOR US',64,65,'24px serif');text(`${wedding.groom} & ${wedding.bride}`,64,122,'44px '+font);text(wedding.startsAt.slice(0,10).replaceAll('-','. ')+'  '+wedding.startsAt.slice(11,16),64,203,'28px '+font);text(wedding.venue,64,269,'30px '+font);text(wedding.room,64,318,'28px '+font);
  ctx.font='21px '+font;let line='',y=390;for(const char of wedding.address){if(ctx.measureText(line+char).width>555){ctx.fillText(line,64,y);line='';y+=35;}line+=char;}ctx.fillText(line,64,y);
  // A route sequence from the verified arrival copy, never a fabricated geographic map.
  if(routeSteps.length&&y<440){ctx.strokeStyle=colors.accent||'#496f8d';ctx.beginPath();ctx.moveTo(74,465);ctx.lineTo(554,465);ctx.stroke();routeSteps.slice(0,3).forEach((label,i)=>{const x=74+i*240;ctx.fillStyle=colors.accent||'#496f8d';ctx.beginPath();ctx.arc(x,465,5,0,Math.PI*2);ctx.fill();ctx.fillStyle=colors.ink||'#203d52';ctx.textAlign=i===2?'right':i===1?'center':'left';text(label,x,484,'17px '+font,220);});ctx.textAlign='left';}
  text('청첩장과 상세 지도를 QR로 확인해 주세요.',64,556,'19px '+font);
  const qr=qrcode(0,'M');qr.addData(url);qr.make();const count=qr.getModuleCount(),scale=Math.floor(280/(count+8)),size=(count+8)*scale,x=660,yQr=185;ctx.fillStyle='white';ctx.fillRect(x,yQr,size,size);ctx.fillStyle='black';for(let r=0;r<count;r++)for(let c=0;c<count;c++)if(qr.isDark(r,c))ctx.fillRect(x+(c+4)*scale,yQr+(r+4)*scale,scale,scale);
  const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));if(!blob)throw Error('이미지를 저장하지 못했어요.');return new Blob([pngResolution(await blob.arrayBuffer())],{type:'image/png'});
}
