import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync, realpathSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { root, scan, publicFiles } from './public-source.mjs';

test('public export excludes local evidence and generated artifacts', () => {
  const files=publicFiles();
  assert.ok(files.includes('LICENSE'));
  assert.ok(files.includes('src-tauri/gen/android/app/src/main/java/com/canvas/sjtu/mobile/CanvasPlugin.kt'));
  assert.ok(!files.some(p=>p.startsWith('artifacts/') || p.includes('/node_modules/') || p.includes('/jniLibs/')));
  assert.ok(!files.includes('docs/AUTH_ACCEPTANCE.md'));
  assert.ok(!files.some(p=>p.endsWith('.jks') || p.endsWith('local.properties')));
  assert.ok(files.includes('docs/RELEASE_0.8.4.md'));
  assert.ok(files.includes('assets/branding/app-icon.svg'));
  assert.ok(!files.some(p=>p.startsWith('demo/public/licenses/office/')));
});

test('credential, key and invalid UTF-8 checks report categories without values', () => {
  const dir=mkdtempSync(join(root,'.public-check-'));
  try {
    const key='sk-'+'A'.repeat(40);
    const file=join(dir,'fixture.json'); writeFileSync(file,JSON.stringify({apiKey:key}),'utf8');
    const issues=scan([relative(root,file).split(sep).join('/')]);
    assert.ok(issues.some(i=>i.kind==='possible model key'));
    assert.ok(!JSON.stringify(issues).includes(key));
    writeFileSync(file,Buffer.from([0xff,0xfe,0x00]));
    assert.equal(scan([relative(root,file).split(sep).join('/')])[0].kind,'invalid UTF-8');
    const privateFile=join(dir,'local.properties'); writeFileSync(privateFile,'sdk.dir=example','utf8');
    assert.equal(scan([relative(root,privateFile).split(sep).join('/')])[0].kind,'private configuration or key');
  } finally {
    const target=realpathSync(dir);
    assert.ok(target.startsWith(realpathSync(root)+sep) && target.includes('.public-check-'));
    rmSync(target,{recursive:true,force:true});
  }
});
