import { readFileSync, writeFileSync, mkdtempSync, rmSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import assert from 'node:assert/strict';
const decoder = new TextDecoder('utf-8', { fatal: true });
const sample = { title: '交大课程助手', reminder: '作业未提交，截止前30分钟提醒', math: '期望与方差 → 95%' };
const temp = mkdtempSync(join(tmpdir(), 'canvas-utf8-'));
try {
  const path = join(temp, '中文配置.json');
  writeFileSync(path, JSON.stringify(sample), 'utf8');
  const bytes = readFileSync(path);
  assert.notEqual(bytes.subarray(0, 3).toString('hex'), 'efbbbf');
  assert.deepEqual(JSON.parse(decoder.decode(bytes)), sample);
  let checked = 0;
  function scan(dir) {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) scan(path);
      else if (/\.(tsx?|css|json|mjs)$/.test(path)) {
        const source = decoder.decode(readFileSync(path));
        assert.ok(!source.includes('\uFFFD'), `Replacement character: ${path}`);
        if (!path.endsWith('check-encoding.mjs')) assert.ok(!/锟斤拷|烫烫烫|Ã¤|æ–‡/.test(source), `Mojibake: ${path}`);
        checked++;
      }
    }
  }
  scan('src');
  JSON.parse(decoder.decode(readFileSync('package.json')));
  assert.ok(decoder.decode(readFileSync('src/App.tsx')).includes('作业控制面板'));
  console.log(`UTF-8 PASS: Chinese JSON round-trip; no BOM; ${checked} source files; exact UI strings.`);
} finally { rmSync(temp, { recursive: true, force: true }); }
