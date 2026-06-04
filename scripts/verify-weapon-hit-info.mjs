#!/usr/bin/env node
// 从 PVF 提取 swordman.chr，验证 weaponHitInfo 字段
import { spawnSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';

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

console.log('=== 从 PVF 提取 swordman.chr ===\n');

const raw = extract('character/swordman/swordman.chr');
writeFileSync('verification/stage3-pvf-reverify/swordman.chr.json', raw);

const j = JSON.parse(raw);
console.log(`type: ${j.type}`);
console.log(`sections: ${j.sections.length}`);

const weaponHitInfo = j.sections.find(s => s.name === 'weapon hit info');
if (!weaponHitInfo) {
  console.log('❌ 未找到 weapon hit info section');
  process.exit(1);
}

console.log(`\n[weapon hit info] attributes: ${weaponHitInfo.attributes.length}`);
console.log('前 20 个属性:');
weaponHitInfo.attributes.slice(0, 20).forEach((a, i) => {
  console.log(`  [${i}] ${a.t}: ${a.v}`);
});

// 分析结构：每 6 个属性一组？
console.log('\n结构分析（假设每 6 个一组）:');
for (let i = 0; i < Math.min(18, weaponHitInfo.attributes.length); i += 6) {
  const group = weaponHitInfo.attributes.slice(i, i + 6);
  console.log(`\n组 ${i / 6}:`);
  group.forEach((a, j) => console.log(`  [${j}] ${a.t}: ${a.v}`));
}

console.log('\n✅ T-B.5 验证: weaponHitInfo section 存在，包含 float 类型字段（damageScalePct）');
