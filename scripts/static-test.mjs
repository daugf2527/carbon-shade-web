import { spawnSync } from 'node:child_process';
import { mkdirSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
const root=process.cwd();
const compiledRoot = path.join(root,'.tmp','test-js');
rmSync(compiledRoot, { recursive: true, force: true });
const compile = spawnSync(process.execPath, [path.join(root, 'scripts', 'run-tsc.mjs'), '-p', path.join(root, 'tsconfig.test.json')], { cwd: root, encoding: 'utf8' });
if (compile.status !== 0) {
  const failed = { passed:false, command:'node scripts/run-tsc.mjs -p tsconfig.test.json', status:compile.status ?? 1, stdout:compile.stdout, stderr:compile.stderr, results:[] };
  mkdirSync(path.join(root,'.tmp'),{recursive:true}); writeFileSync(path.join(root,'.tmp','static-test-results.json'),JSON.stringify(failed,null,2));
  console.error(JSON.stringify(failed,null,2));
  process.exit(compile.status ?? 1);
}

function walk(dir, suffix){ const out=[]; for(const entry of readdirSync(dir)){ const file=path.join(dir, entry); const st=statSync(file); if(st.isDirectory()) out.push(...walk(file, suffix)); else if(file.endsWith(suffix)) out.push(file); } return out.sort(); }
const tests = walk(path.join(compiledRoot, 'tests', 'static'), '.test.js');
const jsTests = walk(path.join(root, 'tests', 'static-js'), '.test.mjs');
let passed=true; const results=[];
for(const file of tests){ const r=spawnSync(process.execPath,[file],{cwd:root,encoding:'utf8'}); const ok=r.status===0; results.push({file:path.relative(compiledRoot,file),passed:ok,stdout:r.stdout,stderr:r.stderr,status:r.status ?? 1}); if(!ok) passed=false; }
for(const file of jsTests){ const r=spawnSync(process.execPath,[file],{cwd:root,encoding:'utf8'}); const ok=r.status===0; results.push({file:path.relative(root,file),passed:ok,stdout:r.stdout,stderr:r.stderr,status:r.status ?? 1}); if(!ok) passed=false; }
const payload = {passed, command:'node scripts/run-tsc.mjs -p tsconfig.test.json && node .tmp/test-js/tests/static/*.test.js && node tests/static-js/*.test.mjs', status:passed?0:1, results};
mkdirSync(path.join(root,'.tmp'),{recursive:true}); writeFileSync(path.join(root,'.tmp','static-test-results.json'),JSON.stringify(payload,null,2));
if(!passed){ console.error(JSON.stringify(payload,null,2)); process.exit(1); }
console.log(JSON.stringify(payload,null,2));
