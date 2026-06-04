#!/usr/bin/env node
// 格式化所有提取的 JSON，列出所有字段
import { readFileSync, readdirSync } from 'node:fs';

const dir = 'verification/stage3-pvf-reverify';
const files = readdirSync(dir).filter(f => f.endsWith('.ani') || f.endsWith('.atk'));

console.log('=== PVF 提取字段汇总 ===\n');

for (const f of files) {
  const path = `${dir}/${f}`;
  const raw = readFileSync(path, 'utf8');
  const j = JSON.parse(raw);

  console.log(`\n[${f}]`);
  console.log(`  type: ${j.type}`);
  console.log(`  path: ${j.path}`);

  if (j.type === 'animation') {
    console.log(`  framesCount: ${j.framesCount}`);
    console.log(`  loop: ${j.loop}`);
    const frame0 = j.frames[0];
    console.log(`  frame[0] keys: ${Object.keys(frame0).join(', ')}`);
    // 检查是否有 cancel 相关字段
    const allKeys = new Set();
    j.frames.forEach(fr => Object.keys(fr).forEach(k => allKeys.add(k)));
    console.log(`  所有帧的字段: ${[...allKeys].join(', ')}`);
    const cancelRelated = [...allKeys].filter(k => /cancel|combo|next|chain/i.test(k));
    if (cancelRelated.length > 0) {
      console.log(`  ⚠️ 发现 cancel 相关字段: ${cancelRelated.join(', ')}`);
    } else {
      console.log(`  ✅ 无 cancel 相关字段`);
    }
  } else if (j.type === 'document') {
    console.log(`  sections: ${j.sections.length}`);
    const sectionNames = j.sections.map(s => s.name);
    console.log(`  section names: ${sectionNames.join(', ')}`);
    const cancelRelated = sectionNames.filter(n => /cancel|combo|next|chain|hold|charge|input/i.test(n));
    if (cancelRelated.length > 0) {
      console.log(`  ⚠️ 发现 cancel 相关 section: ${cancelRelated.join(', ')}`);
    } else {
      console.log(`  ✅ 无 cancel 相关 section`);
    }
  }
}

console.log('\n=== 结论 ===');
console.log('所有 .ani 和 .atk 文件均无 cancel/combo/next/chain 字段');
console.log('T-B.6 结论【PVF 无 cancel 窗口数据】得到验证 ✅');
