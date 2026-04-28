import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
const root = process.cwd();
const candidates = [
  path.join(root,'node_modules','typescript','bin','tsc'),
  '/opt/nvm/versions/node/v22.16.0/lib/node_modules/typescript/bin/tsc',
  '/usr/local/lib/node_modules/typescript/bin/tsc'
];
const tsc = candidates.find(existsSync);
if (!tsc) { console.error('TypeScript compiler not found. Run npm install or provide global tsc.'); process.exit(1); }
const r = spawnSync(process.execPath, [tsc, ...process.argv.slice(2)], {cwd:root, encoding:'utf8'});
if (r.stdout) process.stdout.write(r.stdout);
if (r.stderr) process.stderr.write(r.stderr);
process.exit(r.status ?? 1);
