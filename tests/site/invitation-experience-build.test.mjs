import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, mkdtemp, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { buildInvitation, verifyInvitation, verifyPreservedExperienceBaseline, INVITATION_ORIGIN } from '../../scripts/build-invitation-vercel.mjs';
import { PROJECT_ROOT, loadRegistry } from '../../scripts/build-site.mjs';
import { createInvitationPreview } from '../../deploy/invitation/preview.mjs';
import { createDemoAdapter } from '../../apps/invitation-experience/js/demo-data.mjs';
import { cardPalette, validateCardUrls, contrastRatio } from '../../apps/invitation-experience/js/invitation-card.mjs';

test('F/G image export accepts only this collection and readable palettes', () => {
  for (const variant of ['f','g']) {
    const colors=cardPalette(variant);
    assert.ok(contrastRatio(colors.ink,colors.paper)>=4.5);
    assert.ok(contrastRatio(colors.muted,colors.paper)>=4.5);
    const urls={variant,photoUrl:'/v6/assets/photos/date-1440.webp',canonicalUrl:`${INVITATION_ORIGIN}/lab/experience/${variant}/`,baseURI:`${INVITATION_ORIGIN}/lab/experience/${variant}/`};
    assert.equal(validateCardUrls(urls).canonicalUrl,urls.canonicalUrl);
    for(const canonicalUrl of [`${INVITATION_ORIGIN}/lab/v6-1/${variant}/`,`${INVITATION_ORIGIN}/homehunt/`,`${INVITATION_ORIGIN}/lab/experience/${variant==='f'?'g':'f'}/`])
      assert.throws(()=>validateCardUrls({...urls,canonicalUrl}));
  }
  assert.throws(()=>cardPalette('a'));
});

test('new F/G data adapters isolate device storage from old studies and each other', async () => {
  const store = new Map();
  const storage = {getItem:key=>store.get(key)??null,setItem:(key,value)=>store.set(key,value)};
  const oldKey='sungso_invitation_lab_6_1_a_guestbook';
  store.set(oldKey,'do not touch');
  const make=variant=>createDemoAdapter({variant,photos:[],storage,uuid:()=>`${variant}-message`,now:()=>new Date('2026-10-28T00:00:00Z')});
  assert.throws(()=>make('a'),/Unknown/);
  const f=make('f'),g=make('g');
  await f.write({name:'체험',message:'새로운 축하',consent:true});
  assert.equal((await f.messages()).length,1);
  assert.equal((await g.messages()).length,0);
  assert.equal(store.get(oldKey),'do not touch');
  assert.ok([...store.keys()].some(key=>key.startsWith('sungso_invitation_experience_')));
});

test('F/G registration exposes only generated invitations, never source or private managers', async () => {
  const registry=await loadRegistry();
  const app=registry.apps.find(entry=>entry.id==='invitation-experience');
  assert.equal(app.output,'lab/experience');
  assert.equal(app.build,'apps/invitation-experience/scripts/build.mjs');
  assert.ok(app.files.includes('f')&&app.files.includes('g'));
  assert.ok(!app.files.some(file=>['scripts','src','tests','manage.html','accounts.html'].includes(file)));
});

test('round two preserves all 177 existing files and serves two isolated experiential invitations', async t => {
  const temp=await mkdtemp(path.join(os.tmpdir(),'sungso-experience-'));
  t.after(()=>rm(temp,{recursive:true,force:true}));
  const result=await buildInvitation({distDir:path.join(temp,'dist')});
  assert.equal((await verifyPreservedExperienceBaseline(result.distDir)).preservedFiles,177);
  const baseline=JSON.parse(await readFile(path.join(PROJECT_ROOT,'docs/invitation-experience/baseline.json'),'utf8'));
  const old=new Set(baseline.files.map(entry=>entry.path));
  const added=result.files.filter(file=>!old.has(file));
  assert.ok(added.length>10);
  assert.ok(added.every(file=>file.startsWith('lab/experience/')||file.startsWith('lab/studio/')));
  assert.ok(!added.some(file=>/\.(mp3|ttf|woff2)$/.test(file)));
  const server=createInvitationPreview(result.distDir);
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  t.after(()=>{server.closeAllConnections();server.close();});
  const origin=`http://127.0.0.1:${server.address().port}`;
  for(const id of ['f','g']){
    const response=await fetch(`${origin}/lab/experience/${id}/`);
    assert.equal(response.status,200);
    const html=await response.text();
    assert.ok(html.includes(`data-variant="${id}"`));
    assert.ok(html.includes('data-mode="demo"'));
    assert.ok(html.includes("connect-src 'self'"));
    assert.ok(html.includes("form-action 'none'"));
    assert.ok(html.includes(`${INVITATION_ORIGIN}/lab/experience/${id}/`));
    for(const section of ['wedding-day','location','gallery','accounts','guestbook'])assert.ok(html.includes(`id="${section}"`));
    assert.doesNotMatch(html,/firebasejs|site-auth|auth-boot|data-private-root/);
    const event=await fetch(`${origin}/lab/experience/${id}/wedding.ics`);
    assert.equal(event.status,200);
    assert.ok((await event.text()).includes(`URL:${INVITATION_ORIGIN}/lab/experience/${id}/`));
  }
  assert.equal((await fetch(`${origin}/lab/experience/`)).status,200);
  for(const blocked of ['manage.html','accounts.html','scripts/build.mjs','src/index.template.html','tests/','z/','homehunt/','wecost/','honeymoon/'])
    assert.equal((await fetch(`${origin}/lab/experience/${blocked}`)).status,404,blocked);
  const oldPath=path.join(result.distDir,'lab/v6-1/a/index.html');
  const oldHtml=await readFile(oldPath,'utf8');
  await writeFile(oldPath,oldHtml+'<!-- changed -->');
  await assert.rejects(verifyPreservedExperienceBaseline(result.distDir),/Preserved invitation collection changed/);
  await writeFile(oldPath,oldHtml);
  const runtimePath=path.join(result.distDir,'lab/experience/runtime.mjs');
  const runtime=await readFile(runtimePath,'utf8');
  await writeFile(runtimePath,runtime.replace('"mode": "demo"','"mode": "live"'));
  await assert.rejects(verifyInvitation(result.distDir),/build-selected demo/);
});
