// Run after npm run build:invitation. Disk gzip estimates, not browser timing.
import {readFile,writeFile} from 'node:fs/promises';
import {gzipSync} from 'node:zlib';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const here=path.dirname(fileURLToPath(import.meta.url));
const root=path.resolve(here,'../..'), dist=path.join(root,'deploy/invitation/dist');
const origin='https://invitation.invalid/';
const urlFor=file=>new URL(file,origin);
const local=(ref,from)=>new URL(ref,urlFor(from)).pathname.slice(1);
async function measured(file){const bytes=await readFile(path.join(dist,file));return {file,raw:bytes.length,gzip:gzipSync(bytes,{level:9}).length};}
async function modules(seeds){
  const seen=new Set(),rows=[];
  while(seeds.length){
    const file=seeds.shift();if(seen.has(file))continue;seen.add(file);
    const source=await readFile(path.join(dist,file),'utf8');rows.push(await measured(file));
    for(const match of source.matchAll(/(?:\bfrom\s*|\bimport\s*\(|\bimport\s*)(['"])([^'"\n]+)\1/g)){
      if(!match[2].startsWith('.')&&!match[2].startsWith('/'))continue;
      const dependency=local(match[2],file);if(/\.(?:mjs|js)$/.test(dependency))seeds.push(dependency);
    }
  }
  return rows.sort((a,b)=>a.file.localeCompare(b.file));
}
const fontNames=['RIDIBatang-Regular.woff2','Hahmlet-Medium.woff2','PinyonScript-Regular.ttf','AnticDidone-Regular.ttf'];
const fonts=await Promise.all(fontNames.map(name=>measured('v6/assets/fonts/'+name)));
async function edition(id){
  const file=id==='baseline'?'v6/index.html':`lab/experience/${id}/index.html`, html=await readFile(path.join(dist,file),'utf8');
  const htmlSize=await measured(file),css=[];
  for(const match of html.matchAll(/<link\b[^>]*rel="stylesheet"[^>]*href="([^"]+)"/g))css.push(await measured(local(match[1],file)));
  const seeds=[...html.matchAll(/<script\b[^>]*src="([^"]+)"/g)].map(match=>local(match[1],file));
  if(id!=='baseline')seeds.push(`lab/experience/themes/${id}.mjs`);
  const js=await modules(seeds),hero=await measured(id==='baseline'?'v6/assets/photos/date-1440.webp':'v6/assets/photos/forest-960.webp');
  const sums={htmlGzip:htmlSize.gzip,cssGzip:css.reduce((n,v)=>n+v.gzip,0),jsGzip:js.reduce((n,v)=>n+v.gzip,0),heroRaw:hero.raw,fontsRaw:fonts.reduce((n,v)=>n+v.raw,0)};
  const total=Object.values(sums).reduce((a,b)=>a+b,0);
  return {id,...sums,total,passes:{javascript:sums.jsGzip<150000,critical:total<1800000},files:{html:htmlSize,css,js,hero,fonts}};
}
const editions=await Promise.all(['baseline','f','g'].map(edition));
const report={measuredAt:new Date().toISOString(),method:'Per-resource gzip level 9 for HTML including inline SVG, linked CSS, all reachable local JS including the selected dynamic theme; hero and four fonts counted at raw file size. No cache assumed.',limits:{jsGzip:150000,critical:1800000},excluded:['deferred whole MP3','map iframe and third-party map','lazy gallery and story photos','catalog comparison host'],limitations:['These are build resource estimates, not actual HTTP transfer or performance timing.','Responsive hero srcset may select a different image; lab accounting uses requested forest-960.webp.','Baseline uses its actual date-1440.webp hero. LCP, CLS and real-device timing are unverified.'],editions};
await writeFile(path.join(here,'resource-budget.json'),JSON.stringify(report,null,2)+'\n');
console.log(editions.map(row=>`${row.id}: ${row.total} bytes critical, ${row.jsGzip} bytes JS gzip, ${row.files.js.length} modules`).join('\n'));
if(editions.some(row=>row.id!=='baseline'&&(!row.passes.javascript||!row.passes.critical)))process.exitCode=1;
