import test from 'node:test';
import assert from 'node:assert/strict';
import { CARD_SIZE, cardPalette, contrastRatio, validateCardUrls, coverCrop, wrapCardText, createInvitationCard } from '../js/invitation-card.mjs';

const wedding = { groom:'성우', bride:'소희', startsAt:'2027-03-06T15:30:00+09:00', venue:'부산 목화웨딩홀', room:'15층 벨리스홀', address:'부산광역시 연제구 중앙대로 1125 시티타워' };
const urls = { photoUrl:'/v6/assets/photos/forest-1440.webp', canonicalUrl:'https://sungso-wedding.vercel.app/lab/v6-1/a/', variant:'a', baseURI:'http://127.0.0.1:8024/lab/v6-1/a/' };

test('export accepts only same-origin photos and the matching published variant link', () => {
  assert.equal(validateCardUrls(urls).photoUrl, 'http://127.0.0.1:8024/v6/assets/photos/forest-1440.webp');
  for (const photoUrl of ['https://other.test/photo.jpg', 'data:image/png;base64,AAAA', 'javascript:alert(1)', 'http://user:password@127.0.0.1:8024/p.jpg']) {
    assert.throws(() => validateCardUrls({ ...urls, photoUrl }));
  }
  for (const canonicalUrl of ['https://sungso-wedding.vercel.app/homehunt/', 'https://sungso-wedding.vercel.app/lab/v6-1/b/', 'https://sungso-wedding.vercel.app/lab/v6-1/a/?x=1', 'https://fake.test/lab/v6-1/a/']) {
    assert.throws(() => validateCardUrls({ ...urls, canonicalUrl }));
  }
});

test('five default palettes keep readable text, and CSS color input cannot silently fall back', () => {
  for (const variant of ['a','b','c','d','e']) {
    const colors=cardPalette(variant); assert.ok(contrastRatio(colors.paper,colors.ink)>=4.5); assert.ok(contrastRatio(colors.paper,colors.muted)>=4.5);
  }
  assert.equal(cardPalette('a',{ink:'rgb(38, 56, 71)'}).ink,'rgb(38, 56, 71)');
  assert.equal(cardPalette('a',{ink:'#234'}).ink,'rgb(34, 51, 68)');
  assert.throws(() => cardPalette('a',{ink:'var(--ink)'}));
  assert.throws(() => cardPalette('a',{ink:'rgb(999,0,0)'}));
  assert.throws(() => cardPalette('a',{ink:'#fafafa'}));
  assert.throws(() => cardPalette('unknown'));
});

test('portrait and landscape crops stay within the real photo and preserve the target aspect ratio', () => {
  for (const [width,height] of [[1440,2159],[2159,1440],[640,960]]) {
    const crop=coverCrop(width,height,952,688);
    assert.ok(crop.x>=0 && crop.y>=0 && crop.x+crop.width<=width+.001 && crop.y+crop.height<=height+.001);
    assert.ok(Math.abs(crop.width/crop.height-952/688)<1e-10);
  }
  assert.throws(() => coverCrop(0,2159,952,688));
  assert.throws(() => coverCrop(NaN,2159,952,688));
});

test('Korean address wrapping never drops words and handles long unspaced text', () => {
  const text='부산광역시 연제구 중앙대로 1125 시티타워';
  const lines=wrapCardText(text,20,value=>value.length);
  assert.equal(lines.join(' '),text);
  assert.ok(lines.every(line=>line.length<=20));
  const tight=wrapCardText('아주긴한글주소도중간에잘리지않고이어져야합니다',8,value=>value.length);
  assert.equal(tight.join(''),'아주긴한글주소도중간에잘리지않고이어져야합니다');
  assert.ok(tight.every(line=>line.length<=8));
});

function mockDocument({ badFont=false, badPhoto=false, blankBlob=false, emptyBlob=false }={}) {
  const words=[], sizes=[], fontRequests=[];
  const gradient={addColorStop(){}};
  const context=new Proxy({
    measureText(text){return{width:Array.from(text).length*12};},
    fillText(text){words.push(text);}, createLinearGradient(){return gradient;},
  },{get(target,key){return key in target?target[key]:(()=>{});}});
  const canvas={width:0,height:0,getContext(){return context;},toBlob(callback,type){sizes.push([this.width,this.height,type]);callback(blankBlob?null:new Blob(emptyBlob?[]:['png-test'],{type}));}};
  const doc={baseURI:urls.baseURI,fonts:{ready:Promise.resolve(),load(descriptor){fontRequests.push(descriptor);return Promise.resolve(badFont?[]:[{}]);}},defaultView:{URL:{createObjectURL(){return'blob:test-card';}}},createElement(tag){
    if(tag==='canvas')return canvas;
    if(tag==='img')return{naturalWidth:1440,naturalHeight:2159,set src(value){queueMicrotask(()=>badPhoto?this.onerror?.():this.onload?.());},removeAttribute(){}};
    throw new Error(tag);
  }};
  return{doc,words,sizes,fontRequests,canvas};
}

test('card exports fixed PNG dimensions, exact wedding facts, fonts, and preview labeling without financial data', async () => {
  const mock=mockDocument();
  const card=await createInvitationCard({wedding,photoUrl:urls.photoUrl,variant:'a',themeName:'한 줄로 이어지는 초대',canonicalUrl:urls.canonicalUrl,doc:mock.doc});
  assert.deepEqual([card.width,card.height],[1080,1440]);assert.deepEqual(CARD_SIZE,{width:1080,height:1440});
  assert.deepEqual(mock.sizes,[[1080,1440,'image/png']]);assert.equal(card.blob.type,'image/png');assert.equal(card.url,'blob:test-card');
  assert.ok(mock.words.includes('성우  &  소희'));assert.ok(mock.words.includes('2027년 3월 6일 토요일'));assert.ok(mock.words.includes('오후 3시 30분'));
  assert.ok(mock.words.includes(wedding.venue));assert.ok(mock.words.includes(wedding.room));assert.ok(mock.words.includes('비교 시안'));
  assert.ok(mock.words.includes('sungso-wedding.vercel.app/lab/v6-1/a/'));
  assert.ok(mock.fontRequests.some(font=>font.includes('RIDIBatang')));assert.ok(mock.fontRequests.some(font=>font.includes('PinyonScript')));
  assert.equal(mock.canvas.width,0);assert.equal(mock.canvas.height,0);
});

test('font, photo, and encoding failures reject instead of exporting an empty or substituted card', async () => {
  for(const options of [{badFont:true},{badPhoto:true},{blankBlob:true},{emptyBlob:true}]) {
    const mock=mockDocument(options);
    await assert.rejects(()=>createInvitationCard({wedding,photoUrl:urls.photoUrl,variant:'a',themeName:'테스트',canonicalUrl:urls.canonicalUrl,doc:mock.doc}));
  }
});
