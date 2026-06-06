import { spawn, spawnSync } from 'node:child_process';
import { mkdirSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import os from 'node:os';
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
let truthTests = [];
try { truthTests = walk(path.join(compiledRoot, 'tests', 'truth'), '.test.js'); } catch { /* truth dir optional */ }
const jsTests = walk(path.join(root, 'tests', 'static-js'), '.test.mjs');
// Each test file is a standalone Node process (no disk writes, no shared state) → safe to run in parallel.
const queue = [
  ...tests.map(f => ({ file: f, label: path.relative(compiledRoot, f) })),
  ...truthTests.map(f => ({ file: f, label: path.relative(compiledRoot, f) })),
  ...jsTests.map(f => ({ file: f, label: path.relative(root, f) })),
];

function runOne({ file, label }) {
  return new Promise(resolve => {
    const child = spawn(process.execPath, [file], { cwd: root });
    let stdout = '', stderr = '';
    child.stdout.on('data', d => { stdout += d; });
    child.stderr.on('data', d => { stderr += d; });
    child.on('close', status => resolve({ file: label, passed: status === 0, stdout, stderr, status: status ?? 1 }));
    child.on('error', err => resolve({ file: label, passed: false, stdout, stderr: stderr + String(err), status: 1 }));
  });
}

const CONCURRENCY = Math.max(2, Math.min(8, os.cpus()?.length ?? 4));
const results = [];
let next = 0;
async function worker() {
  while (next < queue.length) {
    const item = queue[next++];
    results.push(await runOne(item));
  }
}
await Promise.all(Array.from({ length: CONCURRENCY }, worker));
results.sort((a, b) => a.file.localeCompare(b.file)); // stable, order-independent report
const passed = results.every(r => r.passed);
const payload = {passed, command:'node scripts/run-tsc.mjs -p tsconfig.test.json && node .tmp/test-js/tests/static/*.test.js && node tests/static-js/*.test.mjs', status:passed?0:1, results};
mkdirSync(path.join(root,'.tmp'),{recursive:true}); writeFileSync(path.join(root,'.tmp','static-test-results.json'),JSON.stringify(payload,null,2));
if(!passed){ console.error(JSON.stringify(payload,null,2)); process.exit(1); }
console.log(JSON.stringify(payload,null,2));
