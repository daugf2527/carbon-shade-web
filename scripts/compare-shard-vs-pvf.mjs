#!/usr/bin/env node
// 对比 shard 里 beamswdc/attack1 的 attackBox 和 PVF 真值
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';

const PVF = 'D:\\BaiduNetdiskDownload\\DNF客户端（2018年2月更新）\\地下城与勇士\\Script.pvf';
const TOOL = 'tools/dnf-extract.exe';

function extract(file) {
  const r = spawnSync(TOOL, ['--pvf', PVF, '--file', file], {
    stdio: ['ignore', 'pipe', 'pipe'],
    maxBuffer: 64 * 1024 * 1024,
    encoding: 'buffer',
  });
  return r.stdout?.toString('utf8') || '';
}

console.log('=== 对比 shard vs PVF: beamswdc/attack1.ani ===\n');

// 1. 提取 PVF
const pvfPath = 'equipment/character/swordman/weapon/beamsword/beamswdc/attack1.ani';
console.log(`[PVF] 提取 ${pvfPath}`);
const raw = extract(pvfPath);
writeFileSync('verification/stage3-pvf-reverify/beamswdc-attack1.ani', raw);
const pvf = JSON.parse(raw);
console.log(`  framesCount: ${pvf.framesCount}`);
console.log(`  loop: ${pvf.loop}`);

// frame[4].dmg
if (pvf.frames && pvf.frames[4]) {
  const f4 = pvf.frames[4];
  console.log(`\n[PVF] frame[4]:`);
  console.log(`  delay: ${f4.delay}`);
  console.log(`  imgId: ${f4.imgId}`);
  console.log(`  dmg: ${JSON.stringify(f4.dmg)}`);
}

// 2. 读 shard
console.log('\n[shard] verification/baseline-shards/players/swordman.json');
const shard = JSON.parse(readFileSync('verification/baseline-shards/players/swordman.json', 'utf8'));

const shardAni = shard.weaponAnimations?.['beamsword/beamswdc']?.['attack1'];
if (!shardAni) {
  console.log('❌ shard 中找不到 beamsword/beamswdc/attack1');
  process.exit(1);
}
console.log(`  framesCount: ${shardAni.framesCount || shardAni.frames?.length}`);

if (shardAni.frames && shardAni.frames[4]) {
  const sf4 = shardAni.frames[4];
  console.log(`\n[shard] frame[4]:`);
  console.log(`  delay: ${sf4.delay}`);
  console.log(`  attackBoxes: ${JSON.stringify(sf4.attackBoxes || sf4.dmg)}`);
}

// 3. 对比
console.log('\n=== 对比结论 ===');
const pvfFrame4Dmg = JSON.stringify(pvf.frames?.[4]?.dmg);
const shardFrame4 = JSON.stringify(shardAni.frames?.[4]?.attackBoxes || shardAni.frames?.[4]?.dmg);
console.log(`PVF frame[4].dmg = ${pvfFrame4Dmg}`);
console.log(`shard frame[4].attackBoxes = ${shardFrame4}`);

if (pvfFrame4Dmg && shardFrame4 && pvfFrame4Dmg === shardFrame4) {
  console.log('✅ shard 数据匹配 PVF 真值');
} else {
  console.log('⚠️ shard 与 PVF 不匹配 - 需要进一步检查');
}
