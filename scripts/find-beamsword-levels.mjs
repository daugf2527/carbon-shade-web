#!/usr/bin/env node
// 查找 beamsword 下的所有武器等级目录
import { spawnSync } from 'node:child_process';

const PVF = 'D:\\BaiduNetdiskDownload\\DNF客户端（2018年2月更新）\\地下城与勇士\\Script.pvf';
const TOOL = 'tools/dnf-extract.exe';

function listFilter(filter) {
  const r = spawnSync(TOOL, ['--pvf', PVF, '--list', '--filter', filter], {
    stdio: ['ignore', 'pipe', 'pipe'],
    maxBuffer: 64 * 1024 * 1024,
    encoding: 'buffer',
  });
  const out = r.stdout?.toString('utf8') || '';
  try {
    const j = JSON.parse(out);
    return j.files || [];
  } catch {
    return [];
  }
}

console.log('=== 查找 beamsword 武器等级 ===\n');

const all = listFilter('equipment/character/swordman/weapon/beamsword/');
console.log(`总文件: ${all.length}`);

// 提取所有唯一的武器等级目录（第二层子目录）
const dirs = new Set();
all.forEach(f => {
  // equipment/character/swordman/weapon/beamsword/<level>/<file>
  const parts = f.split('/');
  if (parts.length >= 7) {
    const level = parts[6];
    if (level && !level.includes('.')) {
      dirs.add(level);
    }
  }
});

console.log(`\n武器等级目录: ${dirs.size}`);
const sorted = [...dirs].sort();
sorted.forEach(d => console.log(`  ${d}`));

// 查找 beamswdb 和 beamswdc
const hasB = sorted.filter(d => d.includes('beamswdb'));
const hasC = sorted.filter(d => d.includes('beamswdc'));

console.log(`\n包含 beamswdb: ${hasB.length}`);
hasB.forEach(d => console.log(`  ${d}`));

console.log(`\n包含 beamswdc: ${hasC.length}`);
hasC.forEach(d => console.log(`  ${d}`));

// 查找 attack1.ani
const attack1Files = all.filter(f => f.endsWith('/attack1.ani'));
console.log(`\n包含 attack1.ani 的武器: ${attack1Files.length}`);
attack1Files.slice(0, 10).forEach(f => console.log(`  ${f}`));
