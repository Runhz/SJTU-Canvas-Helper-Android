import { execFileSync } from 'node:child_process';
import { readFileSync, lstatSync, existsSync, readdirSync } from 'node:fs';
import { resolve, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

export const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
export function candidateFiles() {
  let gitRoot='';
  try { gitRoot=execFileSync('git',['rev-parse','--show-toplevel'],{cwd:root,encoding:'utf8',stdio:['ignore','pipe','ignore']}).trim(); } catch { /* Exported sources do not include Git history. */ }
  if (gitRoot && resolve(gitRoot) === root) return execFileSync('git',['ls-files','--cached','--others','--exclude-standard','-z'],{cwd:root,encoding:'utf8',maxBuffer:16*1024*1024}).split('\0').filter(Boolean).filter(p=>existsSync(resolve(root,p)) && lstatSync(resolve(root,p)).isFile());
  const found=[];
  function walk(dir) {
    for (const entry of readdirSync(resolve(root,dir),{withFileTypes:true})) {
      if (['.git','node_modules','dist','target','build','.gradle','.kotlin','.tauri','jniLibs','artifacts','local-diagnostics'].includes(entry.name)) continue;
      const path=dir ? `${dir}/${entry.name}` : entry.name;
      if (entry.isDirectory()) walk(path); else if (entry.isFile()) found.push(path);
    }
  }
  walk(''); return found;
}
export function publicFiles() {
  const rootFiles=new Set(['README.md','CONTRIBUTING.md','SECURITY.md','PRIVACY.md','UPSTREAM.md','THIRD_PARTY_NOTICES.md','CHANGELOG.md','LICENSE','.gitignore','.gitattributes','.editorconfig','package.json','yarn.lock','index.html','vite.config.ts','vitest.config.ts','tsconfig.json','tsconfig.node.json','eslint.config.js']);
  const docs=new Set(['BUILDING.md','RELEASING.md','ACCEPTANCE.md','RELEASE_0.4.0.md','RELEASE_0.5.0.md','PLAN_0.5.0.md','PLAN_0.5.1.md','RELEASE_0.5.1.md','PLAN_0.5.2.md','RELEASE_0.5.2.md','RELEASE_0.5.3.md','RELEASE_0.5.4.md','RELEASE_0.8.4.md','PLAN_WATER_FLUID.md','WATER_FLUID.md']);
  const tools=new Set(['android-ui-probe.cjs','build-mobile.ps1','build-android.ps1','public-source.mjs','public-source.test.mjs','check-public-source.mjs','export-open-source.mjs']);
  docs.add('RELEASE_0.8.7.md');
  docs.add('RELEASE_0.8.9.md');
  return candidateFiles().filter(p=> {
    if (rootFiles.has(p)) return true;
    if (p.startsWith('.github/')) return !p.startsWith('.github/workflows/windows-portable/');
    if (/^(src|public|images)\//.test(p)) return true;
    if (p.startsWith('demo/')) return !/^demo\/(node_modules|dist)\//.test(p) && !p.startsWith('demo/public/licenses/office/');
    if (p.startsWith('assets/branding/')) return ['app-icon.svg','ribbon-foreground.svg','approved-concept.png','icon-manifest.json','README.md'].includes(p.slice('assets/branding/'.length));
    if (p.startsWith('src-tauri/')) return !/\/(target|build|\.gradle|\.kotlin|jniLibs|\.tauri)\//.test(p) && !/(?:local|keystore|tauri)\.properties$/.test(p);
    if (/^docs\/screenshots\/(mobile-(phone|courses|recordings|tablet)|water-(pixel|soft))-0\.5\.1\.jpg$/.test(p)) return true;
    if (/^docs\/screenshots\/mobile-(phone|tablet)-0\.5\.2\.jpg$/.test(p)) return true;
    if (/^docs\/screenshots\/chat-history-(phone|pad)-0\.5\.4\.png$/.test(p)) return true;
    if (/^docs\/screenshots\/water-fluid-(phone|splash|pad|splash-pad-night)\.jpg$/.test(p)) return true;
    if (/^docs\/screenshots\/water-(continuous-(demo|full)|standalone-demo)\.jpg$/.test(p)) return true;
    if (p.startsWith('docs/')) return docs.has(p.slice(5)) || p.startsWith('docs/upstream/') || /^docs\/screenshots\/open-source-(phone|tablet|night)-0\.[45]\.0\.(?:png|jpg)$/.test(p) || p === 'docs/screenshots/android10-0.4.0-empty.png' || /^docs\/screenshots\/(water-quality-(phone|tablet)|courses-phone|semester-sheet|android10-(phone|tablet))-0\.5\.0\.(png|jpg)$/.test(p);
    return p.startsWith('tools/native-integration/') || p.startsWith('tools/ai-core-tests/') || p.startsWith('tools/') && tools.has(p.slice(6));
  });
}
export function scan(files) {
  const issues=[];
  for (const p of files) {
    const absolute=resolve(root,p), rel=relative(root,absolute);
    if (rel.startsWith('..'+sep) || lstatSync(absolute).isSymbolicLink()) { issues.push({path:p,kind:'outside source boundary'}); continue; }
    if (/(?:^|\/)(?:\.env(?:\..*)?|local\.properties|keystore\.properties|key\.properties)$|\.(?:jks|keystore|pem|p12|pfx)$/i.test(p)) { issues.push({path:p,kind:'private configuration or key'}); continue; }
    if (!/\.(?:[cm]?[jt]sx?|rs|kt|kts|gradle|json|ya?ml|md|toml|ps1|properties|xml|html|css)$/.test(p)) continue;
    let text;
    try { text=new TextDecoder('utf-8',{fatal:true}).decode(readFileSync(absolute)); }
    catch { issues.push({path:p,kind:'invalid UTF-8'}); continue; }
    if (/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/.test(text)) issues.push({path:p,kind:'private key content'});
    if (/\bsk-(?:proj-)?[A-Za-z0-9_-]{24,}/.test(text)) issues.push({path:p,kind:'possible model key'});
    const pattern=/(?:token|cookie|apiKey|api_key|password)\s*[:=]\s*["']([A-Za-z0-9_+\/=.:\-]{24,})["']/gi;
    for (const match of text.matchAll(pattern)) {
      if (!/^(?:test|mock|example|dummy|replace|your)[_-]/i.test(match[1])) issues.push({path:p,kind:'possible credential literal',line:text.slice(0,match.index).split('\n').length});
    }
  }
  return issues;
}
