#!/usr/bin/env node
/**
 * Stage 3 T-A.4: 真值 shard → TS 模块同步脚本
 *
 * 输入: verification/baseline-shards/players/swordman.json (Stage 1 产物)
 * 输出: src/data/manifest/truth/swordman.ts (TS 模块, tree-shake 友好)
 *
 * 策略 (D7=A 嵌入 bundle + Stage 3 选项 B TS 模块):
 *   - TS 模块作为 SOT, runtime 通过 import { SWORDMAN_TRUTH } from "./truth/swordman.js" 取数
 *   - tree-shake 友好: 未引用字段会被 vite 删除
 *   - typed: 通过 TruthShape 接口约束 (Stage 3 Phase A 阶段定义最小集)
 *
 * 裁剪策略 (PoC 阶段):
 *   - keep:  chr.growth (level 表) / chr.widthBox / chr.weaponHitInfo
 *   - keep:  attacks (全部 .atk 属性, 体积小)
 *   - keep:  animations (核心战斗动画: stay/move/jump/attack1-3/dash/dashattack/jumpattack/hardattack/damage1-2/down/overturn)
 *   - keep:  weaponAnimations (同名核心动画)
 *   - drop:  skills (1.6MB, PoC 不用)
 *   - drop:  非战斗 animations (hundredswordmoveslash / spirit / waveeye 等衍生招式, Phase C/D 再补)
 *   - drop:  provenance 详细字段 (tier3 标记保留, sectionName 等元数据丢弃, 节省 70% 体积)
 *
 * Usage:
 *   node scripts/sync-truth-to-manifest.mjs
 *   node scripts/sync-truth-to-manifest.mjs --job swordman --out src/data/manifest/truth/swordman.ts
 */

import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";

const ROOT = process.cwd();

const args = process.argv.slice(2);
function arg(name, def) {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : def;
}

const JOB = arg("job", "swordman");
const IN_PATH = arg("in", path.join(ROOT, "verification/baseline-shards/players", `${JOB}.json`));
const OUT_PATH = arg("out", path.join(ROOT, "src/data/manifest/truth", `${JOB}.ts`));

// PoC 阶段保留的核心战斗动画 (DNF 命名)
const CORE_ANIMS = new Set([
  "stay", "move", "dash", "jump",
  "attack1", "attack2", "attack3",
  "dashattack", "jumpattack", "hardattack",
  "damage1", "damage2", "down", "overturn",
]);

console.log(`[sync-truth] job=${JOB}`);
console.log(`[sync-truth] in=${path.relative(ROOT, IN_PATH)}`);
console.log(`[sync-truth] out=${path.relative(ROOT, OUT_PATH)}`);

const shard = JSON.parse(await readFile(IN_PATH, "utf8"));

// ─── 裁剪逻辑 ─────────────────────────────────────────────────────────

/** 保留 PvfFact 的 value/unit/sourceType, 丢弃 provenance 元数据 (节省体积) */
function trimFact(fact) {
  if (fact == null || typeof fact !== "object") return fact;
  if (!("value" in fact)) return fact;
  const out = { value: fact.value };
  if (fact.unit !== undefined) out.unit = fact.unit;
  if (fact.sourceType !== undefined) out.sourceType = fact.sourceType;
  if (fact.requiresManualVerification) out.requiresManualVerification = true;
  return out;
}

/** 裁剪 chr: 只保留 growth + widthBox + weaponHitInfo + 关键物理参数 */
function trimChr(chr) {
  return {
    job: trimFact(chr.job),
    jumpPower: trimFact(chr.jumpPower),
    jumpSpeed: trimFact(chr.jumpSpeed),
    moveSpeed: trimFact(chr.moveSpeed),
    attackSpeed: trimFact(chr.attackSpeed),
    weight: trimFact(chr.weight),
    widthBox: chr.widthBox,
    growth: chr.growth,                  // 17 段成长曲线, 重要
    weaponHitInfo: chr.weaponHitInfo,    // 武器 hit 倍率
  };
}

/** 裁剪 atk: 战斗用得到的字段 */
function trimAtk(atk) {
  return {
    path: atk.path,
    liftUp: trimFact(atk.liftUp),
    pushAside: trimFact(atk.pushAside),
    damageBonus: trimFact(atk.damageBonus),
    attackKind: atk.attackKind,
    element: atk.element,
    hitReaction: atk.hitReaction,
    causesDown: atk.causesDown,
    causesStun: atk.causesStun,
    causesBounce: atk.causesBounce,
    causesStuck: atk.causesStuck,
    knuckBack: trimFact(atk.knuckBack),
  };
}

/** 裁剪 ani: frame 数组保留, 但删 raw 元数据 */
function trimAni(ani) {
  return {
    path: ani.path,
    framesCount: ani.framesCount,
    loop: ani.loop,
    frames: ani.frames.map(fr => ({
      index: fr.index,
      anchor: fr.anchor,
      delay: fr.delay,
      imgId: fr.imgId,
      imgParam: fr.imgParam,
      sprite: fr.sprite,
      attackBoxes: fr.attackBoxes ?? [],
      damageBoxes: fr.damageBoxes ?? [],
    })),
  };
}

// ─── 核心裁剪 ─────────────────────────────────────────────────────────

const trimmed = {
  shape_version: shard.shape_version,
  job: shard.job,
  parentJob: shard.parentJob,
  chr: trimChr(shard.chr),
  attacks: {},
  animations: {},
  weaponAnimations: {},
};

// 全部 attacks (体积小)
for (const [name, atk] of Object.entries(shard.attacks ?? {})) {
  trimmed.attacks[name] = trimAtk(atk);
}

// 只保留核心 animations
for (const [name, ani] of Object.entries(shard.animations ?? {})) {
  if (CORE_ANIMS.has(name)) trimmed.animations[name] = trimAni(ani);
}

// weaponAnimations 同样裁剪
for (const [weaponRef, anims] of Object.entries(shard.weaponAnimations ?? {})) {
  const trimmedWeapon = {};
  for (const [name, ani] of Object.entries(anims)) {
    if (CORE_ANIMS.has(name)) trimmedWeapon[name] = trimAni(ani);
  }
  if (Object.keys(trimmedWeapon).length > 0) {
    trimmed.weaponAnimations[weaponRef] = trimmedWeapon;
  }
}

// ─── 生成 TS 模块 ─────────────────────────────────────────────────────

const json = JSON.stringify(trimmed, null, 2);
const tsContent = `/**
 * AUTO-GENERATED by scripts/sync-truth-to-manifest.mjs
 * Source: ${path.relative(ROOT, IN_PATH).replace(/\\\\/g, "/")}
 * Job: ${JOB}
 * Generated at: ${new Date().toISOString()}
 *
 * Stage 3 T-A.4: 真值 SOT for ${JOB}
 * 不要手改 — 改 verification shard 后重跑 sync 脚本.
 *
 * Tree-shake 友好: vite 会 dead-code-eliminate 未引用字段.
 */

import type { JobTruth } from "./types.js";

export const ${JOB.toUpperCase()}_TRUTH: JobTruth = ${json} as const;

export default ${JOB.toUpperCase()}_TRUTH;
`;

await mkdir(path.dirname(OUT_PATH), { recursive: true });
await writeFile(OUT_PATH, tsContent, "utf8");

// ─── 统计 ─────────────────────────────────────────────────────────────

const stats = {
  bytes_in: (await readFile(IN_PATH)).length,
  bytes_out: tsContent.length,
  attacks: Object.keys(trimmed.attacks).length,
  animations: Object.keys(trimmed.animations).length,
  weaponRefs: Object.keys(trimmed.weaponAnimations).length,
  weaponAnims: Object.values(trimmed.weaponAnimations).reduce((n, a) => n + Object.keys(a).length, 0),
};

console.log(`[sync-truth] done:`);
console.log(`  in:  ${(stats.bytes_in / 1024).toFixed(1)} KB`);
console.log(`  out: ${(stats.bytes_out / 1024).toFixed(1)} KB  (${(100 * stats.bytes_out / stats.bytes_in).toFixed(1)}% of in)`);
console.log(`  attacks: ${stats.attacks}`);
console.log(`  animations: ${stats.animations}`);
console.log(`  weaponRefs: ${stats.weaponRefs}`);
console.log(`  weaponAnims (total): ${stats.weaponAnims}`);
