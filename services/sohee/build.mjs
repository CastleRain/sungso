import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const cwd=fileURLToPath(new URL('./',import.meta.url));
for(const filename of ['server.mjs','snapshot.mjs','importer.mjs','migration.mjs','local-credentials.mjs','migrate.mjs','local-import.mjs']){const r=spawnSync(process.execPath,['--check',filename],{cwd,stdio:'inherit'});if(r.status!==0)process.exit(r.status||1);}
console.log('Private sales import service syntax checked; no remote requests.');
