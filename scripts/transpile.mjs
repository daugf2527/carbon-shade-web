import { readdirSync, statSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
export function walk(dir){ const out=[]; for(const e of readdirSync(dir)){ const p=path.join(dir,e); const st=statSync(p); if(st.isDirectory()) out.push(...walk(p)); else if(p.endsWith('.ts') && !p.endsWith('.d.ts')) out.push(p); } return out; }
export function transpileTree(srcRoot, outRoot){ rmSync(outRoot,{recursive:true,force:true}); for(const f of walk(srcRoot)){ const rel=path.relative(srcRoot,f); const out=path.join(outRoot, rel.replace(/\.ts$/,'.js')); const r=spawnSync(process.execPath, [path.join(process.cwd(),'scripts','transpile-one.cjs'), f, out], {encoding:'utf8', timeout:10000}); if(r.status!==0){ throw new Error(`transpile failed ${f}\n${r.stderr}`); } } }
