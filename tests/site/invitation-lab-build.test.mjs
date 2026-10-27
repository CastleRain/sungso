import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import os from 'node:os';
import { buildInvitation, verifyInvitation, verifyPreservedInvitation, INVITATION_ORIGIN } from '../../scripts/build-invitation-vercel.mjs';
import { PROJECT_ROOT, loadRegistry } from '../../scripts/build-site.mjs';
import { createInvitationPreview } from '../../deploy/invitation/preview.mjs';
import { criteria, normalizeNotes, isTrustedFrameMessage, setupCatalog } from '../../apps/invitation-lab/catalog/catalog.mjs';

function catalogFixture() {
  const messages=[], nodes=new Map(), windowEvents=new Map();
  function node(tag='div') {
    const events=new Map();
    const result={tagName:tag,children:[],value:'',dataset:{},hidden:false,events,
      classList:{toggle(){}},setAttribute(){},scrollIntoView(){},remove(){this.removed=true;},
      append(...children){this.children.push(...children);},replaceChildren(...children){this.children=children;},
      addEventListener(type,fn){events.set(type,fn);},querySelector(){return {disabled:false};}};
    if(tag==='iframe')result.contentWindow={postMessage(message,origin){messages.push({frame:result,...message,origin});}};
    return result;
  }
  const byId=id=>{if(!nodes.has(id))nodes.set(id,node());return nodes.get(id);};
  byId('section-select').value='top';byId('section-select').selectedOptions=[{textContent:'첫 화면'}];
  const narrow={matches:false,addEventListener(){}};
  const doc={getElementById:byId,createElement:node,querySelectorAll(){return [];},
    querySelector(selector){return selector.includes('data-pane')?byId('right-pane'):null;},addEventListener(){}};
  const win={location:{origin:INVITATION_ORIGIN},localStorage:{getItem(){return null;},setItem(){}},
    matchMedia(){return narrow;},setTimeout,addEventListener(type,fn){windowEvents.set(type,fn);}};
  const catalog=setupCatalog(doc,win);
  return {catalog,messages,byId,ready(frame){windowEvents.get('message')({origin:INVITATION_ORIGIN,source:frame.contentWindow,data:{type:'invitation-lab:ready'}});},
    change(id,value){const target=byId(id);target.value=value;target.events.get('change')({target});}};
}

test('selected catalog audio survives child ready-before-load and replacement without activating the other pane', () => {
  const fixture=catalogFixture();
  const {catalog,messages,byId,ready,change}=fixture;
  try {
    byId('split-view').events.get('click')();
    change('audio-select','left');
    const previous=catalog.panes.left.frame;
    change('left-study','c');
    const replacement=catalog.panes.left.frame, other=catalog.panes.right.frame;
    assert.equal(previous.removed,true);
    ready(replacement); // A fast cached module can announce ready before iframe load.
    replacement.events.get('load')();
    const commands=messages.filter(message=>message.frame===replacement&&message.action==='audio');
    assert.equal(commands.at(-1).enabled,true);
    assert.ok(!messages.some(message=>message.frame===other&&message.action==='audio'&&message.enabled));
    assert.ok(messages.every(message=>message.origin===INVITATION_ORIGIN));
    ready(previous); // A late event from an unmounted document cannot take ownership.
    assert.equal(catalog.panes.left.frame,replacement);
  } finally {catalog.destroy();}
});

test('comparison notes reject foreign IDs and invalid scores while keeping bounded user text', () => {
  assert.deepEqual(normalizeNotes(null), {});
  const long = '좋아요'.repeat(700);
  const clean = normalizeNotes({a:{text:long, ratings:{mood:5,motion:'5',usability:0,performance:6,maintainability:3,secret:9}}, z:{text:'wrong'}});
  assert.equal(clean.a.text.length,1500);
  assert.deepEqual(clean.a.ratings,{mood:5,maintainability:3});
  assert.ok(!('z' in clean));
  assert.equal(criteria.reduce((sum,criterion)=>sum+criterion[2],0),100);
});

test('comparison commands trust only mounted frames of the exact origin', () => {
  const left={},right={},old={};
  const panes={left:{frame:{contentWindow:left}},right:{frame:{contentWindow:right}}};
  assert.equal(isTrustedFrameMessage({source:left,origin:INVITATION_ORIGIN},panes,INVITATION_ORIGIN),true);
  assert.equal(isTrustedFrameMessage({source:right,origin:INVITATION_ORIGIN},panes,INVITATION_ORIGIN),true);
  for(const event of [{source:old,origin:INVITATION_ORIGIN},{source:left,origin:INVITATION_ORIGIN+'.evil.test'},{source:null,origin:INVITATION_ORIGIN}])
    assert.equal(isTrustedFrameMessage(event,panes,INVITATION_ORIGIN),false);
  panes.right.frame=null;
  assert.equal(isTrustedFrameMessage({source:right,origin:INVITATION_ORIGIN},panes,INVITATION_ORIGIN),false);
});

test('five studies are a registered generated app without hub or source publication', async () => {
  const registry=await loadRegistry();
  const app=registry.apps.find(entry=>entry.id==='invitation-lab');
  assert.equal(app.output,'lab/v6-1');
  assert.equal(app.source,'apps/invitation-lab/dist');
  assert.equal(app.build,'apps/invitation-lab/scripts/build.mjs');
  for(const item of ['a','b','c','d','e'])assert.ok(app.files.includes(item));
  assert.ok(!app.files.some(item=>['tests','scripts','src','AGENTS.md'].includes(item)));
  const hub=await readFile(path.join(PROJECT_ROOT,'apps/hub/index.html'),'utf8');
  assert.doesNotMatch(hub,/lab\/v6-1/);
});

test('additive invitation build preserves every original byte and serves five isolated studies', async t => {
  const root=await mkdtemp(path.join(os.tmpdir(),'sungso-invitation-lab-'));
  t.after(()=>rm(root,{recursive:true,force:true}));
  const result=await buildInvitation({distDir:path.join(root,'dist')});
  const baseline=JSON.parse(await readFile(path.join(PROJECT_ROOT,'docs/invitation-lab/baseline.json'),'utf8'));
  assert.equal(baseline.fileCount,140);
  assert.equal((await verifyPreservedInvitation(result.distDir)).preservedFiles,140);
  for(const entry of baseline.files){
    const bytes=await readFile(path.join(result.distDir,entry.path));
    assert.equal(createHash('sha256').update(bytes).digest('hex'),entry.sha256,entry.path);
  }
  const added=result.files.filter(file=>!baseline.files.some(entry=>entry.path===file));
  assert.ok(added.length>15);
  assert.ok(added.every(file=>file.startsWith('lab/v6-1/')));
  assert.ok(!added.some(file=>/\.(mp3|ttf|woff2)$/.test(file)));
  const server=createInvitationPreview(result.distDir);
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  t.after(()=>{server.closeAllConnections();server.close();});
  const origin=`http://127.0.0.1:${server.address().port}`;
  for(const id of ['a','b','c','d','e']){
    const response=await fetch(`${origin}/lab/v6-1/${id}/`);
    assert.equal(response.status,200);
    const html=await response.text();
    assert.match(html,new RegExp(`data-variant="${id}"`));
    assert.ok(html.includes(`${INVITATION_ORIGIN}/lab/v6-1/${id}/`));
    assert.ok(html.includes('/v6/assets/'));
    assert.doesNotMatch(html,/firebasejs|site-auth|auth-boot|data-private-root/);
    const calendar=await fetch(`${origin}/lab/v6-1/${id}/wedding.ics`);
    assert.equal(calendar.status,200);
    assert.ok((await calendar.text()).includes(`URL:${INVITATION_ORIGIN}/lab/v6-1/${id}/`));
  }
  assert.equal((await fetch(`${origin}/lab/v6-1/`)).status,200);
  for(const forbidden of ['/homehunt/','/wecost/','/honeymoon/','/lab/v6-1/manage.html','/lab/v6-1/accounts.html','/lab/v6-1/src/','/lab/v6-1/tests/','/lab/v6-1/scripts/build.mjs','/lab/v6-1/.env','/lab/v6-1/z/'])
    assert.equal((await fetch(origin+forbidden)).status,404,forbidden);
  const old=await readFile(path.join(result.distDir,'v6/index.html'),'utf8');
  await writeFile(path.join(result.distDir,'v6/index.html'),old.replace('6.1.0','6.1.99'));
  await assert.rejects(verifyPreservedInvitation(result.distDir),/Preserved invitation changed/);
  await writeFile(path.join(result.distDir,'v6/index.html'),old);
  const runtimePath=path.join(result.distDir,'lab/v6-1/runtime.mjs');
  const runtime=await readFile(runtimePath,'utf8');
  await writeFile(runtimePath,runtime.replace('"mode": "demo"','"mode": "live"'));
  await assert.rejects(verifyInvitation(result.distDir),/build-selected demo/);
});
