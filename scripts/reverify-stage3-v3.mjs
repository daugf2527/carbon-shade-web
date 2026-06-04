#!/usr/bin/env node
// v3: 精确找玩家角色 swordman 的 animation 和 atk 文件
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

console.log('=== Reverify v3: 玩家角色 swordman ===\n');

// 1. 列所有 character/swordman 文件
const all = listFilter('character/swordman');
console.log(`[1] character/swordman 总文件: ${all.length}`);

// 过滤：不是 creature/sdcharacter，是真正的玩家角色
const player = all.filter(f => !f.startsWith('creature/') && !f.startsWith('passiveobject/'));
console.log(`[2] 排除 creature/passiveobject 后: ${player.length}`);
player.slice(0, 30).forEach(f => console.log(`  ${f}`));
writeFileSync(`${OUT_DIR}/player-swordman-all.json`, JSON.stringify(player, null, 2));

// 找 .ani
const anis = player.filter(f => f.endsWith('.ani'));
console.log(`\n[3] .ani 文件: ${anis.length}`);
anis.slice(0, 30).forEach(f => console.log(`  ${f}`));

// 找 attack 类
const attacks = anis.filter(f => /attack|atk\d|dash|jump|hard/i.test(f));
console.log(`\n[4] attack/dash/jump/hard 类: ${attacks.length}`);
attacks.forEach(f => console.log(`  ${f}`));

// 找 .atk
const atks = player.filter(f => f.endsWith('.atk'));
console.log(`\n[5] .atk 文件: ${atks.length}`);
atks.forEach(f => console.log(`  ${f}`));

// 找 .skl
const skls = player.filter(f => f.endsWith('.skl'));
console.log(`\n[6] .skl 文件: ${skls.length}`);
skls.slice(0, 20).forEach(f => console.log(`  ${f}`));

// 提取第一个 attack ani
if (attacks.length > 0) {
  const f = attacks[0];
  console.log(`\n[7] 提取 ${f}`);
  const data = extract(f);
  writeFileSync(`${OUT_DIR}/attack-sample.json`, data);
  const lines = data.split('\n');
  const cancelLines = lines.filter(l => /cancel|combo|next|chain/i.test(l));
  console.log(`  cancel/combo/next/chain 行: ${cancelLines.length}`);
  cancelLines.slice(0, 30).forEach(l => console.log(`    ${l.slice(0, 150)}`));
}

// 提取第一个 .atk
if (atks.length > 0) {
  const f = atks[0];
  console.log(`\n[8] 提取 ${f}`);
  const data = extract(f);
  writeFileSync(`${OUT_DIR}/atk-sample.json`, data);
  const lines = data.split('\n');
  const interesting = lines.filter(l => /cancel|combo|next|chain|hold|charge/i.test(l));
  console.log(`  cancel/combo/next/chain/hold/charge 行: ${interesting.length}`);
  interesting.slice(0, 30).forEach(l => console.log(`    ${l.slice(0, 150)}`));
}

console.log('\n=== Done ===');
