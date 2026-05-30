#!/usr/bin/env node
/**
 * sync-atk-to-truth.mjs
 *
 * 从 verification/baseline-shards/players/swordman.json 提取 attacks 对象
 * 写入 src/data/manifest/truth/swordman-attacks.json
 *
 * Stage 3 Phase C - T-C.3
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = join(__dirname, '..');

const SOURCE = join(ROOT, 'verification/baseline-shards/players/swordman.json');
const TARGET = join(ROOT, 'src/data/manifest/truth/swordman-attacks.json');

console.log('[sync-atk-to-truth] 开始提取 attacks 对象');

// 读取源数据
const sourceData = JSON.parse(readFileSync(SOURCE, 'utf-8'));
if (!sourceData.attacks) {
  console.error('[ERROR] swordman.json 缺少 attacks 字段');
  process.exit(1);
}

const attacks = sourceData.attacks;
const attackCount = Object.keys(attacks).length;

console.log(`[INFO] 提取到 ${attackCount} 个 attack 条目`);

// 验证关键字段
const attack1 = attacks.attack1;
if (!attack1) {
  console.error('[ERROR] 缺少 attack1 条目');
  process.exit(1);
}

console.log('[VERIFY] attack1.liftUp.value =', attack1.liftUp?.value);
console.log('[VERIFY] attack1.pushAside.value =', attack1.pushAside?.value);
console.log('[VERIFY] attack1.hitReaction =', attack1.hitReaction);

if (attack1.liftUp?.value !== 75) {
  console.error('[ERROR] attack1.liftUp.value 预期 75，实际', attack1.liftUp?.value);
  process.exit(1);
}

// 写入目标文件
writeFileSync(TARGET, JSON.stringify(attacks, null, 2), 'utf-8');
console.log(`[SUCCESS] 写入 ${TARGET}`);
console.log(`[STATS] ${attackCount} attacks, ${JSON.stringify(attacks).length} bytes`);
