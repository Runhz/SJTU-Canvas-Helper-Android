import { publicFiles, scan } from './public-source.mjs';
const files=publicFiles(), issues=scan(files);
if (issues.length) { console.error(JSON.stringify({ok:false,issues},null,2)); process.exitCode=1; }
else console.log(`Public source checks PASS: ${files.length} candidate files; UTF-8 and basic credential/key checks. Git history is not audited.`);
