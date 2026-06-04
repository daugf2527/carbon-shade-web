#!/usr/bin/env node
// 直接 spawn 不走 shell，避免 Git Bash 的路径转换问题
import { spawnSync } from 'node:child_process';
import { writeFileSync, mkdirSync } from 'node:fs';

const PVF = 'D:\\BaiduNetdiskDownload\\DNF客户端（2018年2月更新）\\地下城与勇士\\Script.pvf';
const TOOL = 'tools/dnf-extract.exe';
const OUT_DIR = 'verification/stage3-pvf-reverify';
mkdirSync(OUT_DIR, { recursive: true });

function runArgs(args) {
  const r = spawnSync(TOOL, ['--pvf', PVF, ...args], {
    stdio: ['ignore', 'pipe', 'pipe'],
    maxBuffer: 64 * 1024 * 1024,
    encoding: 'buffer',
  });
  return r.stdout?.toString('utf8') || '';
}

function listFilter(filter) {
  const out = runArgs(['--list', '--filter', filter]);
  try {
    const j = JSON.parse(out);
    return j.files || [];
  } catch {
    return [];
  }
}

function extract(file) {
  return runArgs(['--file', file]);
}

console.log('=== Reverify v2 (no shell) ===\n');

// 试不同的 filter
const filters = [
  'character/swordman',
  'swordman/atk',
  'swordman/animation',
  '/atk1.ani',
  'atk1',
];

for (const f of filters) {
  const files = listFilter(f);
  console.log(`filter "${f}" → ${files.length} files`);
  if (files.length > 0 && files.length < 30) {
    files.forEach(x => console.log(`  ${x}`));
  } else if (files.length > 0) {
    files.slice(0, 5).forEach(x => console.log(`  ${x}`));
    console.log(`  ... +${files.length - 5} more`);
  }
}
