import { writeFileSync, mkdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
const root=process.cwd();
const command = 'node scripts/run-tsc.mjs -p tsconfig.json --noEmit';
const r = spawnSync(process.execPath, [path.join(root, 'scripts', 'run-tsc.mjs'), '-p', path.join(root, 'tsconfig.json'), '--noEmit'], { cwd: root, encoding: 'utf8' });
const passed = r.status === 0;
const result = { passed, command, status: r.status ?? 1, stdout: r.stdout, stderr: r.stderr };
mkdirSync(path.join(root,'.tmp'),{recursive:true}); writeFileSync(path.join(root,'.tmp','typecheck-results.json'),JSON.stringify(result,null,2));
if(!passed){ console.error(JSON.stringify(result,null,2)); process.exit(r.status ?? 1); }
console.log(JSON.stringify(result,null,2));
