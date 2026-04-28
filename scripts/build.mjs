import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';

const root = process.cwd();
const distDir = path.join(root, 'dist');
const verificationDir = path.join(root, 'verification');
const buildCommand = 'node scripts/run-tsc.mjs -p tsconfig.build.json';

function writeResult(result) {
  mkdirSync(verificationDir, { recursive: true });
  writeFileSync(path.join(verificationDir, 'build.json'), JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result, null, 2));
}

rmSync(distDir, { recursive: true, force: true });

const tsc = spawnSync(process.execPath, [path.join(root, 'scripts', 'run-tsc.mjs'), '-p', path.join(root, 'tsconfig.build.json')], {
  cwd: root,
  encoding: 'utf8'
});

if (tsc.status !== 0) {
  const failed = {
    passed: false,
    command: buildCommand,
    status: tsc.status ?? 1,
    stdout: tsc.stdout,
    stderr: tsc.stderr,
    dist: 'dist/index.html'
  };
  writeResult(failed);
  process.exit(tsc.status ?? 1);
}

const builtMain = path.join(distDir, 'assets', 'main.js');
if (!existsSync(builtMain)) {
  const failed = {
    passed: false,
    command: buildCommand,
    status: 1,
    stdout: tsc.stdout,
    stderr: `${tsc.stderr ?? ''}\ndist/assets/main.js was not emitted`.trim(),
    dist: 'dist/index.html'
  };
  writeResult(failed);
  process.exit(1);
}

mkdirSync(distDir, { recursive: true });
const indexHtml = readFileSync(path.join(root, 'index.html'), 'utf8').replace('/src/main.ts', './assets/main.js');
writeFileSync(path.join(distDir, 'index.html'), indexHtml);

const passed = {
  passed: true,
  command: buildCommand,
  status: 0,
  dist: 'dist/index.html',
  assets: ['dist/assets/main.js']
};
writeResult(passed);
