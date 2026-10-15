import { mkdirSync, readFileSync, writeFileSync, copyFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { root, publicFiles, scan } from './public-source.mjs';

const version=JSON.parse(readFileSync(join(root,'demo/package.json'),'utf8')).version;
const files=publicFiles().sort();
const issues=scan(files);
if (issues.length) { console.error(JSON.stringify({ok:false,issues},null,2)); process.exit(1); }
for (const required of ['LICENSE','UPSTREAM.md','README.md','docs/BUILDING.md','src-tauri/gen/android/app/src/main/java/com/canvas/sjtu/mobile/CanvasPlugin.kt']) {
  if (!files.includes(required)) throw new Error(`Missing public source: ${required}`);
}
const suffix=new Date().toISOString().replace(/[-:.TZ]/g,'');
const name=`Canvas-Suixing-${version}-source-${suffix}`;
const destination=join(root,'artifacts',name);
if (existsSync(destination)) throw new Error('Export already exists; refusing to overwrite.');
mkdirSync(destination,{recursive:true});
const manifest=[];
for (const path of files) {
  const target=join(destination,path); mkdirSync(dirname(target),{recursive:true}); copyFileSync(join(root,path),target);
  manifest.push(`${createHash('sha256').update(readFileSync(target)).digest('hex')}  ${path}`);
}
writeFileSync(join(destination,'SOURCE-SHA256SUMS.txt'),manifest.join('\n')+'\n','utf8');
const archive=join(root,'artifacts',name+'.tar.gz');
execFileSync('tar',['-czf',archive,'-C',destination,'.'],{stdio:'inherit'});
const checksum=createHash('sha256').update(readFileSync(archive)).digest('hex');
writeFileSync(archive+'.sha256',`${checksum}  ${name}.tar.gz\n`,'utf8');
console.log(JSON.stringify({source:destination,archive,sha256:checksum,files:files.length,historyIncluded:false},null,2));
