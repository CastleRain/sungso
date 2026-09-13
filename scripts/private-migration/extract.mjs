import { readFile, writeFile, mkdir, readdir, copyFile } from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import vm from 'node:vm';
import { pathToFileURL } from 'node:url';

const hash = value => createHash('sha256').update(value).digest('hex');
const evaluate = (source, names) => vm.runInNewContext(`${source.replace(/^export /gm, '')}; ({${names.join(',')}})`, {}, { timeout: 3000 });
const between = (source, start, end) => source.slice(source.indexOf(start), source.indexOf(end, source.indexOf(start)));
async function walk(root, relative = '') {
  const files = [];
  for (const entry of await readdir(path.join(root, relative), { withFileTypes: true })) {
    const name = path.posix.join(relative, entry.name);
    if (entry.isDirectory()) files.push(...await walk(root, name)); else files.push(name);
  }
  return files;
}

// Only run against the reviewed pre-migration checkout. The output contains private
// information: keep it outside Git and never publish it as a deployment artifact.
export async function extractPrivateSource(sourceRoot, outputRoot) {
  const source = path.resolve(sourceRoot), output = path.resolve(outputRoot);
  if (output === source || source.startsWith(`${output}${path.sep}`)) throw new Error('Separate output directory required');
  await mkdir(output, { recursive: true });
  await writeFile(path.join(output, '.gitignore'), '*\n');
  const read = file => readFile(path.join(source, file), 'utf8');
  const trip = evaluate(await read('shared/travel/trip-data.mjs'), ['HOTELS', 'PLACES', 'TRIP_DAYS', 'DECISIONS']);
  const resorts = evaluate(await read('apps/honeymoon/js/resorts-data.js'), ['TRIP_INFO', 'AGENCIES', 'RESORTS']);
  const html = await read('apps/travel/index.html');
  const calendar = await read('apps/travel/calendar.mjs');
  const app = await read('apps/travel/app.mjs');
  const readiness = await read('apps/travel/readiness.mjs');
  const budget = await read('apps/travel/budget.mjs');
  const locations = evaluate(between(calendar, 'export const TRAVEL_LOCATIONS =', '\nexport function calendarDates'), ['TRAVEL_LOCATIONS']).TRAVEL_LOCATIONS;
  const preparations = evaluate(between(readiness, 'const GUIDE_URL =', '\nfunction element'), ['PREPARATIONS']).PREPARATIONS;
  const explanations = evaluate(`${between(readiness, 'const GUIDE_URL =', '\nconst PREPARATIONS')}${between(readiness, 'const explanations =', '\n  for (const [text, label, href]')}`, ['explanations']).explanations;
  const flightUrl = app.match(/\$\('#flight-search'\)\.href = '([^']+)'/)?.[1];
  const quoteNumbers = budget.match(/row\.amount=type==='flight'\?(\d+):(\d+)/);
  const quoteNotes = budget.match(/row\.note=type==='flight'\?'([^']+)':'([^']+)'/);
  const travel = { schemaVersion: 1, reference: { ...trip, TRAVEL_LOCATIONS: locations, PREPARATIONS: preparations, READINESS_SOURCES: explanations,
    TRIP_SETTINGS: { weddingDate: calendar.match(/const WEDDING_DATE = '([^']+)'/)?.[1], arrivalEnd: trip.TRIP_DAYS[1].date, flightUrl },
    BUDGET_QUOTES: { flight: { amount: Number(quoteNumbers?.[1]), currency: 'KRW', note: quoteNotes?.[1] }, cruise: { amount: Number(quoteNumbers?.[2]), currency: 'USD', note: quoteNotes?.[2] } } },
    bodyHtml: html.match(/<body[^>]*>([\s\S]*?)<\/body>/i)[1].replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '') };
  const pdfGroups = evaluate(between(await read('apps/honeymoon/js/tab-pdf.js'), 'const PDF_FILES =', '\nlet currentPdfDoc'), ['PDF_FILES']).PDF_FILES;
  const files = [], originalFiles = await walk(path.join(source, 'apps/honeymoon/data'));
  for (const relative of originalFiles.filter(file => file.endsWith('.pdf'))) {
    const bytes = await readFile(path.join(source, 'apps/honeymoon/data', relative));
    const sha256 = hash(bytes), id = `quote_${sha256.slice(0, 24)}`;
    const match = pdfGroups.flatMap(group => group.files).find(item => item.file === `data/${relative}`);
    const target = path.join(output, 'files', `${id}.pdf`);
    await mkdir(path.dirname(target), { recursive: true }); await writeFile(target, bytes);
    if (hash(await readFile(target)) !== sha256) throw new Error('PDF backup validation failed');
    files.push({ id, label: match?.label || '견적 파일', originalPath: `apps/honeymoon/data/${relative}`, sha256, bytes: bytes.length, localFile: `files/${id}.pdf`, driveFileId: null, sharingVerifiedAt: null });
  }
  // User retained public GitHub PDFs for this rollout; keep their existing URLs.
  const backupPaths = ['shared/travel', 'apps/travel', 'apps/honeymoon', 'archive/honeymoon'];
  const backupInventory = [];
  for (const directory of backupPaths) for (const relative of await walk(path.join(source, directory))) {
    const name = path.posix.join(directory, relative), target = path.join(output, 'source', name);
    await mkdir(path.dirname(target), { recursive: true }); await copyFile(path.join(source, name), target);
    const original = await readFile(path.join(source, name)), copied = await readFile(target);
    if (hash(original) !== hash(copied)) throw new Error('Source backup validation failed');
    backupInventory.push({ path: name, bytes: copied.length, sha256: hash(copied) });
  }
  // A JSON string preserves nested tuple arrays, which Firestore cannot store as arrays of arrays.
  const documents = [ { path: 'private_data/travel_reference', data: { schemaVersion: 1, payload: JSON.stringify(travel) } }, { path: 'private_data/honeymoon_reference', data: { schemaVersion: 1, payload: JSON.stringify({ schemaVersion: 1, ...resorts }) } } ];
  await writeFile(path.join(output, 'migration.json'), JSON.stringify({ schemaVersion: 1, documents, files }, null, 2));
  await writeFile(path.join(output, 'source-inventory.json'), JSON.stringify(backupInventory, null, 2));
  const evidence = { schemaVersion: 1, documentCount: documents.length, pdfCount: files.length, pdfBytes: files.reduce((sum, file) => sum + file.bytes, 0), sourceFileCount: backupInventory.length, sourceInventorySha256: hash(JSON.stringify(backupInventory)), migrationSha256: hash(await readFile(path.join(output, 'migration.json'))), pdfHashes: files.map(({ sha256, bytes }) => ({ sha256, bytes })) };
  await writeFile(path.join(output, 'evidence.json'), JSON.stringify(evidence, null, 2));
  return evidence;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const [, , source, output] = process.argv;
  if (!source || !output) throw new Error('Usage: node extract.mjs SOURCE_CHECKOUT PRIVATE_OUTPUT');
  console.log(JSON.stringify(await extractPrivateSource(source, output)));
}
