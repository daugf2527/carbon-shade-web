#!/usr/bin/env node
// T-B.8: 验证 14 个核心动画的 attackBoxes 覆盖率
import { readFileSync } from 'fs';

const CORE_14_ANIMATIONS = [
  'stay', 'move', 'dash', 'jump',
  'attack1', 'attack2', 'attack3',
  'hardattack', 'jumpattack', 'dashattack',
  'damage1', 'damage2', 'down', 'overturn'
];

const shard = JSON.parse(readFileSync('verification/baseline-shards/players/swordman.json', 'utf8'));
const weaponAnims = shard.weaponAnimations || {};

console.log('# AttackBoxes Coverage Report\n');
console.log(`Total weaponAnimations keys: ${Object.keys(weaponAnims).length}\n`);

let totalCovered = 0;
let totalAnimations = 0;

for (const weaponKey of Object.keys(weaponAnims)) {
  const weapon = weaponAnims[weaponKey];
  console.log(`## ${weaponKey}\n`);

  for (const aniName of CORE_14_ANIMATIONS) {
    totalAnimations++;
    const ani = weapon[aniName];
    if (!ani) {
      console.log(`- ${aniName}: ❌ not found`);
      continue;
    }

    const framesWithAtk = ani.frames.filter(f => f.attackBoxes && f.attackBoxes.length > 0);
    if (framesWithAtk.length > 0) {
      totalCovered++;
      const frameIndices = framesWithAtk.map(f => f.index).join(',');
      console.log(`- ${aniName}: ✅ ${framesWithAtk.length}/${ani.framesCount} frames (${frameIndices})`);
    } else {
      console.log(`- ${aniName}: ⚠️  0/${ani.framesCount} frames with attackBoxes`);
    }
  }
  console.log('');
}

const coverage = ((totalCovered / totalAnimations) * 100).toFixed(1);
console.log(`\n## Summary\n`);
console.log(`- Total animations: ${totalAnimations}`);
console.log(`- With attackBoxes: ${totalCovered}`);
console.log(`- Coverage: ${coverage}%`);
console.log(`- Target: >50% (${Math.ceil(totalAnimations * 0.5)} animations)`);
console.log(`- Status: ${totalCovered >= totalAnimations * 0.5 ? '✅ PASS' : '❌ FAIL'}`);
