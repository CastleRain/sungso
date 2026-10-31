import {mkdir,readFile,writeFile,cp} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {buildInvitationStudio} from '../invitation-studio/scripts/build.mjs';
const source=fileURLToPath(new URL('./',import.meta.url));
export async function buildStudioV2({outDir,assetBase='/v6/assets/'}={}) {
  if(!outDir||resolve(outDir)===resolve(source))throw Error('Explicit generated output required');
  await buildInvitationStudio({outDir,assetBase,canonicalRoot:'https://sungso-wedding.vercel.app/lab/studio-v2/'});
  for(const file of ['index.html','studio.css','studio.mjs','model.mjs','library.mjs','preview-bridge.mjs','preview-ready.mjs','recommendations.mjs'])await cp(join(source,file),join(outDir,file));
  const app=join(outDir,'js/app.mjs');
  await writeFile(app,(await readFile(app,'utf8'))+`\nimport {mountPreviewHandshake} from '../preview-ready.mjs';\nmountPreviewHandshake({getState:()=>({composition,motionReady:Boolean(themeController)})});\n`);
  const preview=join(outDir,'preview/index.html');
  let html=await readFile(preview,'utf8');
  html=html.replace('</head>','<script type="module" src="../preview-bridge.mjs"></script></head>');
  await writeFile(preview,html);
  return {outDir,editorVersion:2,schemaVersion:1};
}
