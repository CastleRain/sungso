import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {buildStudioV2} from '../../apps/invitation-studio-v2/build.mjs';
const output=await mkdtemp(path.join(tmpdir(),'studio-v2-'));
await buildStudioV2({outDir:output});
const model=await import(pathToFileURL(path.join(output,'model.mjs')));
const composition=await import(pathToFileURL(path.join(output,'js/composition.mjs')));
const content=await import(pathToFileURL(path.join(output,'js/content-draft.mjs')));
const saved=await import(pathToFileURL(path.join(output,'js/saved-library.mjs')));
test('V2 uses unchanged v1 URLs and keeps every required scene when optional ones move',()=>{
  const original=composition.readComposition('?version=1&palette=rose&font=modern&motionSpeed=.75&textScale=1.15&extras=day-pass&order=gallery,day-pass,invitation');
  const roundtrip=composition.readComposition(composition.compositionParams(original).toString());
  assert.deepEqual(roundtrip,original);
  const scenes=model.scenes(roundtrip);assert.equal(new Set(scenes.map(s=>s.id)).size,scenes.length);
  assert.deepEqual(scenes.filter(s=>s.movable).map(s=>s.id),roundtrip.order);
  for(const id of composition.DEFAULT_ORDER)assert.ok(scenes.some(s=>s.id===id));
});
test('whole-project history restores composition and text, coalesces gestures, and drops stale redo',()=>{
  const initial=model.snapshot(),h=model.createHistory(initial);
  const first=model.snapshot({...initial.composition,palette:'rose'},{text:{groom:'테스트'}});
  h.commit(first);h.commit(model.snapshot({...first.composition,textScale:1.1},first.content));
  h.commit(model.snapshot({...first.composition,textScale:1.2},first.content),{coalesce:true});
  assert.deepEqual(h.undo(),first);assert.equal(h.redo().composition.textScale,1.2);
  h.undo();h.commit(model.snapshot({...first.composition,font:'modern'},first.content));assert.equal(h.canRedo,false);
  h.undo();assert.deepEqual(h.undo(),initial);assert.equal(h.undo(),null);
  const copy=h.current;copy.content.text.groom='changed';assert.equal(h.current.content.text.groom,undefined);
});
test('project import rejects unknown versions and never admits data mode or arbitrary text fields',()=>{
  assert.throws(()=>model.validateSnapshot({version:2}),/지원하지/);
  assert.throws(()=>model.validateSnapshot({version:1,composition:{version:2}}),/지원하지/);
  assert.equal(model.validateSnapshot({version:1,content:{text:{endpoint:'bad'}}}).content.text.endpoint,undefined);
  const clean=model.validateSnapshot({version:1,composition:{mode:'published',endpoint:'https://evil.test',palette:'rose'},content:{}});
  assert.equal(clean.composition.palette,'rose');assert.equal(clean.composition.mode,undefined);assert.equal(clean.composition.endpoint,undefined);
});
test('forty legacy favorites retain metadata through export/import and load in V2',()=>{
  const items=Array.from({length:40},(_,i)=>({id:`fixture-${i}`,name:`조합 ${i}`,rating:i%6,note:`메모 ${i}`,createdAt:i,updatedAt:i,composition:{...composition.DEFAULT_COMPOSITION,palette:i%2?'rose':'mist'}}));
  const parsed=saved.parseImport(JSON.stringify({version:1,kind:'sungso-studio-library',items}));
  assert.equal(parsed.items.length,40);assert.equal(parsed.items[39].note,'메모 39');
  for(const row of parsed.items)assert.deepEqual(model.snapshot(row.composition).composition,row.composition);
});
test('V2 preview adds only editor bridge, reuses persistent runtime and legacy content schema',async()=>{
  const html=await readFile(path.join(output,'preview/index.html'),'utf8');assert.match(html,/preview-bridge\.mjs/);
  const old=await readFile(new URL('../../apps/invitation-studio/js/app.mjs',import.meta.url),'utf8');
  assert.ok((await readFile(path.join(output,'js/app.mjs'),'utf8')).startsWith(old));
  const snap=model.snapshot({},{text:{invitation:'새로운 초대 문구'},photos:[]});assert.deepEqual(content.normalizeContentDraft(snap.content),snap.content);
});

test('late parent handshake responds only to the same-origin parent and never remounts the preview',async()=>{
  const {mountPreviewHandshake}=await import('../../apps/invitation-studio-v2/preview-ready.mjs');
  const sent=[],handlers=new Set(),parent={postMessage:(data,origin)=>sent.push({data,origin})};
  const win={parent,location:{origin:'https://wedding.test'},addEventListener:(_,f)=>handlers.add(f),removeEventListener:(_,f)=>handlers.delete(f)};
  const dispose=mountPreviewHandshake({win,getState:()=>({composition:{palette:'mist'},motionReady:true})});
  const fire=event=>[...handlers].forEach(f=>f(event));
  fire({origin:'https://evil.test',source:parent,data:{type:'studio-v2:hello'}});
  fire({origin:win.location.origin,source:{},data:{type:'studio-v2:hello'}});assert.equal(sent.length,0);
  fire({origin:win.location.origin,source:parent,data:{type:'studio-v2:hello'}});
  assert.equal(sent.length,1);assert.equal(sent[0].data.motionReady,true);assert.equal(sent[0].origin,win.location.origin);
  dispose();assert.equal(handlers.size,0);
});
