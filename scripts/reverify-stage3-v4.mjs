#!/usr/bin/env node
// v4: 提取正确的玩家角色基础动画和 attackinfo
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

function extract(file) {
  return runArgs(['--file', file]);
}

console.log('=== Reverify v4: 提取基础动画和 attackinfo ===\n');

const targets = [
  // 基础动画
  { path: 'character/swordman/dsanimation/attack1.ani', label: 'attack1 动画' },
  { path: 'character/swordman/dsanimation/attack2.ani', label: 'attack2 动画' },
  { path: 'character/swordman/dsanimation/attack3.ani', label: 'attack3 动画' },
  { path: 'character/swordman/dsanimation/dashattack.ani', label: 'dashattack 动画' },
  { path: 'character/swordman/dsanimation/jumpattack.ani', label: 'jumpattack 动画' },
  { path: 'character/swordman/dsanimation/hardattack.ani', label: 'hardattack 动画' },
  // attackinfo
  { path: 'character/swordman/attackinfo/attack1.atk', label: 'attack1 atk' },
  { path: 'character/swordman/attackinfo/attack2.atk', label: 'attack2 atk' },
  { path: 'character/swordman/attackinfo/attack3.atk', label: 'attack3 atk' },
  { path: 'character/swordman/attackinfo/dashattack.atk', label: 'dashattack atk' },
  { path: 'character/swordman/attackinfo/jumpattack.atk', label: 'jumpattack atk' },
  { path: 'character/swordman/attackinfo/hardattack.atk', label: 'hardattack atk' },
];

for (const { path, label } of targets) {
  console.log(`\n[${label}] ${path}`);
  const data = extract(path);

  if (!data || data.includes('ERROR')) {
    console.log('  ❌ 提取失败');
    continue;
  }

  const outFile = `${OUT_DIR}/${path.split('/').pop()}`;
  writeFileSync(outFile, data);

  const lines = data.split('\n');
  console.log(`  总行数: ${lines.length}`);

  // 搜索关键字段
  const keywords = ['cancel', 'combo', 'next', 'chain', 'hold', 'charge', 'input', 'command'];
  for (const kw of keywords) {
    const matches = lines.filter(l => new RegExp(kw, 'i').test(l));
    if (matches.length > 0) {
      console.log(`  "${kw}" 匹配: ${matches.length} 行`);
      matches.slice(0, 5).forEach(l => console.log(`    ${l.slice(0, 120)}`));
    }
  }

  // 看前 30 行结构
  console.log(`  前 30 行:`);
  lines.slice(0, 30).forEach((l, i) => console.log(`    ${i + 1}: ${l.slice(0, 100)}`));
}

console.log('\n=== Done ===');
