import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createDemoAdapter, validateMessage, DATA_MODE, SAMPLE_ACCOUNTS } from '../js/demo-data.mjs';

function memoryStorage() {
  const rows=new Map();
  return {getItem:key=>rows.get(key)??null,setItem:(key,value)=>rows.set(key,value),rows};
}
const photos=[{id:'forest',src:'/v6/assets/photos/forest-1440.webp',alt:'두 사람의 사진'}];
const valid={name:'하객',message:'결혼을 축하해요!',consent:true};

test('demo comments persist only under their own variant and are isolated from operating keys', async () => {
  const storage=memoryStorage();
  storage.setItem('sungso_invitation_v3_guestbook','operating identity must survive');
  const a=createDemoAdapter({variant:'a',photos,storage,uuid:()=> 'message-a',now:()=>new Date('2026-10-28T10:00:00Z')});
  const b=createDemoAdapter({variant:'b',photos,storage,uuid:()=> 'message-b'});
  const saved=await a.write(valid);
  assert.deepEqual(await b.messages(),[]);
  const restored=createDemoAdapter({variant:'a',photos,storage});
  assert.deepEqual(await restored.messages(),[saved]);
  assert.equal(storage.getItem('sungso_invitation_v3_guestbook'),'operating identity must survive');
  assert.deepEqual([...storage.rows.keys()].sort(),['sungso_invitation_lab_6_1_a_guestbook','sungso_invitation_v3_guestbook']);
  assert.equal(a.persistent,true);
});

test('storage denial and quota failures keep usable, explicitly nonpersistent session data', async () => {
  for(const storage of [undefined,{getItem(){throw Error('blocked');},setItem(){throw Error('blocked');}},{getItem:()=>null,setItem(){throw Error('quota');}}]){
    const adapter=createDemoAdapter({variant:'c',photos,storage,uuid:()=> 'local-message'});
    const saved=await adapter.write(valid);
    assert.equal(adapter.persistent,false);
    assert.deepEqual(await adapter.messages(),[saved]);
    await adapter.remove(saved.id);
    assert.deepEqual(await adapter.messages(),[]);
  }
});

test('message validation handles boundaries, normalization, required consent and honeypot', () => {
  assert.equal(validateMessage({name:'가'.repeat(20),message:'나'.repeat(300),consent:true}).message.length,300);
  assert.equal(validateMessage({name:'  하객  ',message:'  축하해요  ',consent:true}).name,'하객');
  assert.equal(validateMessage({name:'가',message:'나',consent:true}).name,'가');
  assert.equal([...validateMessage({name:'😀'.repeat(20),message:'😀'.repeat(300),consent:true}).message].length,300);
  for(const invalid of [
    {...valid,name:''},{...valid,name:'   '},{...valid,name:'가'.repeat(21)},
    {...valid,message:''},{...valid,message:'\n\t'},{...valid,message:'가'.repeat(301)},
    {...valid,consent:false},{...valid,consent:undefined},{...valid,website:'https://spam.invalid'},
  ])assert.throws(()=>validateMessage(invalid));
});

test('only locally owned messages can be removed, and unknown IDs do not alter the list', async () => {
  const storage=memoryStorage();
  storage.setItem('sungso_invitation_lab_6_1_d_guestbook',JSON.stringify([
    {id:'foreign',name:'이전 글',message:'내 글이 아니에요',createdAt:'2026-10-01T00:00:00Z',owned:false},
  ]));
  const adapter=createDemoAdapter({variant:'d',photos,storage,uuid:()=> 'owned'});
  await adapter.write(valid);
  await assert.rejects(adapter.remove('foreign'),/이 기기/);
  await assert.rejects(adapter.remove('missing'),/이 기기/);
  assert.equal((await adapter.messages()).length,2);
  await adapter.remove('owned');
  assert.deepEqual((await adapter.messages()).map(message=>message.id),['foreign']);
});

test('message text remains data and returned objects cannot mutate the adapter', async () => {
  const adapter=createDemoAdapter({variant:'e',photos,storage:memoryStorage(),uuid:()=> 'literal'});
  const message='<img src=x onerror=alert(1)> & <script>unsafe()</script>';
  const saved=await adapter.write({name:'<b>하객</b>',message,consent:true});
  assert.equal(saved.message,message);
  saved.message='changed outside';
  const listed=await adapter.messages();
  assert.equal(listed[0].message,message);
  listed[0].message='also changed';
  assert.equal((await adapter.messages())[0].message,message);
  const album=await adapter.photos();album[0].src='/changed';
  assert.equal((await adapter.photos())[0].src,photos[0].src);
  const groups=await adapter.accounts();groups[0].accounts[0].bank='changed';
  assert.equal((await adapter.accounts())[0].accounts[0].bank,'예시은행');
});

test('all six account examples remain explicitly fictional without payment destinations', async () => {
  assert.equal(SAMPLE_ACCOUNTS.length,2);
  const accounts=SAMPLE_ACCOUNTS.flatMap(group=>group.accounts);
  assert.equal(accounts.length,6);
  assert.ok(accounts.every(account=>account.bank==='예시은행' && /^000-000-000[1-6]$/.test(account.number) && !account.paymentUrl));
  assert.deepEqual(accounts.map(account=>account.relation),['신랑','아버지','어머니','신부','아버지','어머니']);
});

test('demo adapter has no network/auth or URL-driven mode and rejects foreign variant paths', async () => {
  assert.equal(DATA_MODE,'demo');
  const adapter=createDemoAdapter({variant:'a',photos,storage:memoryStorage(),mode:'live',apiBase:'https://production.invalid'});
  assert.equal(adapter.mode,'demo');
  for(const variant of ['f','../a','a?mode=live','A',''])assert.throws(()=>createDemoAdapter({variant,photos}),/Unknown/);
  const source=await readFile(new URL('../js/demo-data.mjs',import.meta.url),'utf8');
  assert.doesNotMatch(source,/\b(?:fetch|XMLHttpRequest|WebSocket|sendBeacon|URLSearchParams)\s*\(|firebasejs|Authorization|location\.(?:search|hash)|https?:\/\//);
});

test('corrupt stored JSON does not block reading, writing or deleting a new local message', async () => {
  const storage=memoryStorage();
  storage.setItem('sungso_invitation_lab_6_1_b_guestbook','{broken json');
  const adapter=createDemoAdapter({variant:'b',photos,storage,uuid:()=> 'recovered'});
  assert.deepEqual(await adapter.messages(),[]);
  await adapter.write(valid);
  assert.equal((await adapter.messages()).length,1);
  await adapter.remove('recovered');
  assert.deepEqual(await adapter.messages(),[]);
});
