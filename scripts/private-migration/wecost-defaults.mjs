import { readFile, writeFile } from 'node:fs/promises';
import vm from 'node:vm';
// Explicit recovery input, never import a default over an existing document.
export async function appendWeCostDefaults(sourceFilename, manifestFilename) {
  const source = await readFile(sourceFilename, 'utf8');
  const blocks = source.match(/const DEFAULT_(?:SETTINGS|SAVINGS) = \{[\s\S]*?\n\};/g);
  if (blocks?.length !== 2) throw new Error('Review the WeCost source format');
  const values = vm.runInNewContext(`${blocks.join('\n')}; ({settings:DEFAULT_SETTINGS,savings:DEFAULT_SAVINGS})`, {}, {timeout:1000});
  const manifest = JSON.parse(await readFile(manifestFilename, 'utf8'));
  for (const [key, data] of Object.entries(values)) {
    const path = `wecost_${key}/main`;
    if (!manifest.documents.some(item => item.path === path)) manifest.documents.push({path,data});
  }
  await writeFile(manifestFilename, JSON.stringify(manifest, null, 2));
  return { documentCount: manifest.documents.length };
}
