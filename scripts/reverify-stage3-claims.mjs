#!/usr/bin/env node
// 反推质疑 Stage 3 Phase B 的 5 个 claim
// 用项目内 tools/dnf-extract.exe 直接从 Script.pvf 提取真值

import { execSync } from 'node:child_process';
import { writeFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

const PVF = 'D:\\BaiduNetdiskDownload\\DNF客户端（2018年2月更新）\\地下城与勇士\\Script.pvf';
const TOOL = 'tools/dnf-extract.exe';
const OUT_DIR = 'verification/stage3-pvf-reverify';
mkdirSync(OUT_DIR, { recursive: true });

function run(args, capture = true) {
  try {
    const cmd = `${TOOL} --pvf "${PVF}" ${args}`;
    const out = execSync(cmd, { stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 64 * 1024 * 1024 });
    return out.toString('utf8');
  } catch (e) {
    return `ERROR: ${e.message}`;
  }
}

function listFilter(filter) {
  const out = run(`--list --filter "${filter}"`);
  try {
    const j = JSON.parse(out);
    return j.files || [];
  } catch {
    return [];
  }
}

function extract(file) {
  const out = run(`--file "${file}"`);
  return out;
}

console.log('=== Stage 3 Phase B Reverify ===\n');

// 1. 列 swordman 角色 .ani 文件（不是 sdcharacter）
console.log('[1] character/swordman/animation/ 下的 ani 文件');
const playerAnis = listFilter('character/swordman/animation/');
const aniFiles = playerAnis.filter(f => f.endsWith('.ani'));
console.log(`  count: ${aniFiles.length}`);
console.log(`  samples: ${aniFiles.slice(0, 10).join('\n           ')}`);
writeFileSync(`${OUT_DIR}/swordman-anis.json`, JSON.stringify(aniFiles, null, 2));

// 找普攻 attack1/2/3
const attackAnis = aniFiles.filter(f => /\/(attack[1-3]|hardattack|dashattack|jumpattack)\.ani$/i.test(f));
console.log(`\n[2] 普攻/dash/jump 类 ani: ${attackAnis.length}`);
attackAnis.forEach(f => console.log(`  ${f}`));

// 3. 提取 attack1.ani 看里面字段
const attack1 = attackAnis.find(f => /\/attack1\.ani$/.test(f));
if (attack1) {
  console.log(`\n[3] 提取 ${attack1} → 看里面所有字段`);
  const data = extract(attack1);
  writeFileSync(`${OUT_DIR}/attack1-raw.json`, data);
  // 找有 "cancel" 子串的字段
  const lines = data.split('\n');
  const cancelLines = lines.filter(l => /cancel/i.test(l));
  console.log(`  cancel 相关行数: ${cancelLines.length}`);
  cancelLines.slice(0, 20).forEach(l => console.log(`    ${l.slice(0, 200)}`));
}

// 4. 列 .atk 文件，看是否真的没 cancel
console.log(`\n[4] 列 character/swordman/ 下 .atk 文件`);
const allSwordman = listFilter('character/swordman/');
const atks = allSwordman.filter(f => f.endsWith('.atk'));
console.log(`  count: ${atks.length}`);
atks.slice(0, 10).forEach(f => console.log(`    ${f}`));
writeFileSync(`${OUT_DIR}/swordman-atks.json`, JSON.stringify(atks, null, 2));

// 5. 提取一个 .atk 看字段
if (atks.length > 0) {
  const atk = atks[0];
  console.log(`\n[5] 提取 ${atk} 看所有 section/key`);
  const data = extract(atk);
  writeFileSync(`${OUT_DIR}/atk-sample-raw.json`, data);
  // grep cancel/charge/hold
  const lines = data.split('\n');
  const interesting = lines.filter(l => /cancel|charge|hold|next|combo|whiff/i.test(l));
  console.log(`  cancel/charge/hold/next/combo/whiff 行数: ${interesting.length}`);
  interesting.slice(0, 30).forEach(l => console.log(`    ${l.slice(0, 200)}`));
}

// 6. 列 swordman 的 .skl 文件 + atk1/2/3 技能定义
console.log(`\n[6] 列 swordman .skl 文件`);
const skls = allSwordman.filter(f => f.endsWith('.skl'));
console.log(`  count: ${skls.length}`);
skls.slice(0, 15).forEach(f => console.log(`    ${f}`));
writeFileSync(`${OUT_DIR}/swordman-skls.json`, JSON.stringify(skls, null, 2));

// 7. 找 attack1 / hardattack 的 skl
const atk1Skls = skls.filter(f => /atk1|attack1|hardattack/i.test(f));
console.log(`\n[7] atk1/hardattack 相关 skl: ${atk1Skls.length}`);
atk1Skls.forEach(f => console.log(`    ${f}`));

console.log('\n=== Done. Artifacts in', OUT_DIR);
