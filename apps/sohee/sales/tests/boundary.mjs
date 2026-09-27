import assert from 'node:assert/strict';import { readFile,readdir } from 'node:fs/promises';import { createFilePlan, prepareAppBuilds } from '../../../../scripts/build-site.mjs';import { buildSales } from '../build.mjs';
await prepareAppBuilds();
const plan=await createFilePlan();assert.equal([...plan.files.values()].some(v=>v.source.startsWith('sohee/')||v.source.startsWith('services/sohee/')||v.source.startsWith('apps/sohee/prototype/')),false);
for(const entry of [...plan.files.values()].filter(v=>v.output.startsWith('sohee/')&&v.output.endsWith('.html'))){const shell=await readFile(new URL('../../../../'+entry.source,import.meta.url),'utf8');assert.ok(shell.includes('data-private-root hidden inert'));assert.ok(shell.includes('application/x-sungso-script'));}
assert.ok(plan.files.has('sohee/workspace/index.html'));assert.ok(plan.files.has('sohee/sales/data/index.html'));
const out=await buildSales();const html=await readFile(out+'/index.html','utf8'),js=await readFile(out+'/assets/app.js','utf8');
assert.ok(html.includes('data-private-root hidden inert'));assert.ok(html.includes('application/x-sungso-script'));assert.ok(html.includes('/shared/firebase/boot.mjs'));
for(const marker of ['sales-data','dashboard-data.json','synthetic-example.xlsx','synthetic-member','qa-connection'])assert.ok(!html.includes(marker)&&!js.includes(marker),marker);
assert.ok(js.includes('../../../shared/firebase/site-auth.mjs'));assert.ok(!js.includes('../../../../shared/firebase/site-auth.mjs'));
assert.equal((await readdir(out+'/assets')).some(name=>name.endsWith('.json')||name.endsWith('.csv')||name.endsWith('.map')),false);
// Compare private numeric sentinels locally without printing the values.
try {
 const data=JSON.parse(await readFile(new URL('../../../../sohee/combined/analysis/dashboard-data.json',import.meta.url),'utf8'));
 for(const value of [data.total,...data.monthly.map(v=>v.amount)].filter(v=>v>1000000))assert.ok(!js.includes(String(value)),'Private aggregate detected in public bundle');
} catch(error) { if(error.code!=='ENOENT')throw error; console.log('Private archive absent; private numeric sentinel scan skipped.'); }
console.log('PASS: public allowlist, auth-only shell, external shared auth identity, no private totals/data/QA fixture/source maps in production sales bundle.');
