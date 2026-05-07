// Extract ACTIONS from FrameDataAction.ts and output JSON manifest
// Run: node scripts/extract-actions.mjs > src/data/manifest/actions/default.json

import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(__dirname, "..", "src", "combat", "actions", "FrameDataAction.ts"), "utf-8");

// Evaluate the module content by constructing a self-contained script
// that defines all TS types as no-ops and evaluates the actions

const evalScript = `
// Stub types
const asConst = (v) => v;

// Helper functions extracted from FrameDataAction.ts
function reaction(profile) { return profile; }
function lunge(frames, dx, dz = 0) {
  return frames.map(frame => ({ frame, dx, dz, collisionPolicy: "slide" }));
}
function hit(id, start, end, group, baseDamage, opts = {}) {
  return { id, start, end, hitGroupId: group, offsetX: 64, offsetZ: 0, offsetY: 30, w: 110, d: 40, h: 60, hitType: "slash", damageType: "physical", baseDamage, attackLevel: 1, controlPower: 1, canHitDowned: false, canLaunch: false, canKnockdown: false, canGrab: false, maxTargets: 6, impactSnapX: 4, visualRecoilFrames: 5, ...opts };
}
function movementAction(actionName, speedXPerTick) {
  const startup = [];
  const active = [];
  const recovery = [];
  return {
    actionName,
    totalFrames: 1,
    startup, active, emitters: active, recovery,
    timeline: { startup, emitters: active, recovery },
    cancelPolicy: { hitCancelFrom: 0, whiffCancelFrom: 0, into: combatCancelTargets },
    hitStopProfile: { frames: 0, bossCapFrames: 0, buildingCapFrames: 0 },
    recoilProfile: { frames: 0, canCancelRecoil: false },
    rootMotion: { frames: [], speedXPerTick, appliesEveryFrame: true },
    feedbackProfile: { sound: "", vfx: "", cameraShake: 0 },
    sourcePolicy
  };
}
function action(actionName, totalFrames, active, frames = 3, rootMotionFrames = []) {
  const startup = [{ start: 1, end: Math.max(1, (active[0]?.start ?? 1) - 1) }];
  const recovery = [{ start: (active.at(-1)?.end ?? 1) + 1, end: totalFrames }];
  return {
    actionName,
    totalFrames,
    startup,
    active,
    emitters: active,
    timeline: { startup, emitters: active, recovery },
    recovery,
    cancelPolicy: { hitCancelFrom: active[0]?.end, whiffCancelFrom: totalFrames - 4, into: combatCancelTargets },
    hitStopProfile: { frames, bossCapFrames: 2, buildingCapFrames: 1 },
    recoilProfile: { frames: Math.max(0, frames - 1), canCancelRecoil: false },
    rootMotion: rootMotionFrames.length ? { frames: rootMotionFrames } : undefined,
    feedbackProfile: { sound: "hit", vfx: "slash", cameraShake: frames },
    sourcePolicy
  };
}

const sourcePolicy = { sourceType: "baseline_tuning", confidence: "medium", requiresManualVerification: true };
const combatCancelTargets = ["NormalBasic1","NormalBasic2","NormalBasic3","DashAttack","Jump","JumpAttack","FrenzyBasic1","FrenzyBasic2","FrenzyBasic3","UpwardSlash","MountainousWheel","RagingFury","Bloodlust","GoreCross","OutrageBreak","ExtremeOverkill","RagingFury2","BloodRuin","BloodSword","BurstFury","EarthShatter","Backstep","Walk","Run","Idle"];

const lightStagger = reaction({ hitStunFrames: 13, knockbackX: 5.4, knockbackZ: 0.32, horizontalFriction: 0.70, downFrames: 0, getUpFrames: 0 });
const mediumStagger = reaction({ hitStunFrames: 15, knockbackX: 4.8, knockbackZ: 0.38, horizontalFriction: 0.72, downFrames: 0, getUpFrames: 0 });
const heavyStagger = reaction({ hitStunFrames: 20, knockbackX: 10.8, knockbackZ: 0.55, launchVelocityY: 0.35, horizontalFriction: 0.76, downFrames: 0, getUpFrames: 0 });
const heavyKnockdown = reaction({ hitStunFrames: 9, knockbackX: 6.2, knockbackZ: 0.65, launchVelocityY: 2.2, horizontalFriction: 0.78, downFrames: 26, getUpFrames: 14 });
const upperLaunch = reaction({ hitStunFrames: 0, knockbackX: 3.6, knockbackZ: 0.28, launchVelocityY: 8.2, horizontalFriction: 0.84, downFrames: 36, getUpFrames: 16 });
const bloodPillarLaunch = reaction({ hitStunFrames: 0, knockbackX: 0.45, knockbackZ: 0.08, launchVelocityY: 4.0, horizontalFriction: 0.90, downFrames: 26, getUpFrames: 12 });

const rfPillars = [15,17,19,21,23,25,27,29,31,33].map((f,i) => hit(\`rf_pillar_\${String(i+1).padStart(2,"0")}\`, f, f, \`rf_pillar_\${String(i+1).padStart(2,"0")}\`, 12, {
  hitType: "blood_pillar", offsetX: 48, w: 104, d: 46, h: 76, canHitDowned: true, canLaunch: true, reactionProfile: bloodPillarLaunch
}));
const mountainousWheelSlashes = [16,18,20].map((f,i) => hit(\`mw_slash_\${i+1}\`, f, f, "mw_slash", 11, { canKnockdown: i===2, reactionProfile: i===2 ? heavyKnockdown : mediumStagger }));
const enemyBasicAction = {
  actionName: "EnemyBasic",
  totalFrames: 36,
  startup: [{ start: 1, end: 8 }],
  active: [hit("enemy_basic", 9, 14, "enemy_basic_swing", 5, { offsetX: 44, w: 74, d: 32, h: 56, hitType: "slash", canHitDowned: false, canLaunch: false, canKnockdown: false, maxTargets: 1, reactionProfile: reaction({ hitStunFrames: 10, knockbackX: 3.2, knockbackZ: 0.2, horizontalFriction: 0.75 }) })],
  recovery: [{ start: 15, end: 36 }],
  cancelPolicy: { hitCancelFrom: 24, whiffCancelFrom: 30, into: [] },
  hitStopProfile: { frames: 4, bossCapFrames: 2, buildingCapFrames: 0 },
  recoilProfile: { frames: 6, canCancelRecoil: false },
  rootMotion: { frames: lunge([6,7,8], 2.5) },
  feedbackProfile: { sound: "hit", vfx: "enemy_slash", cameraShake: 4 },
  sourcePolicy
};

const ACTIONS = {
  Idle: action("Idle", 1, [], 0),
  Walk: movementAction("Walk", 2.45),
  Run: movementAction("Run", 4.15),
  NormalBasic1: action("NormalBasic1", 20, [hit("nb1",5,8,"normal_1",10,{offsetX:50,w:92,d:40,h:58,offsetY:30,impactSnapX:5,visualRecoilFrames:6,reactionProfile:lightStagger})], 4, lunge([3,4],0.85)),
  NormalBasic2: action("NormalBasic2", 22, [hit("nb2",6,9,"normal_2",14,{offsetX:64,w:118,d:42,h:62,offsetY:32,impactSnapX:6,visualRecoilFrames:7,reactionProfile:mediumStagger})], 5, lunge([4,5],1.05)),
  NormalBasic3: action("NormalBasic3", 31, [hit("nb3",8,13,"normal_3",24,{offsetX:82,w:156,d:46,h:70,offsetY:34,attackLevel:2,controlPower:2,impactSnapX:11,visualRecoilFrames:9,reactionProfile:heavyStagger})], 7, lunge([5,6,7],1.18)),
  DashAttack: action("DashAttack", 24, [hit("dash_attack",7,11,"dash_attack",18,{offsetX:78,w:150,d:44,h:62,offsetY:32,attackLevel:2,controlPower:2,impactSnapX:9,visualRecoilFrames:8,reactionProfile:mediumStagger})], 4, lunge([3,4,5,6,7],2.6)),
  Jump: { ...action("Jump",22,[],0,[{frame:2,dx:0.8,dz:0,dy:4,collisionPolicy:"slide"},{frame:3,dx:0.6,dz:0,dy:3,collisionPolicy:"slide"},{frame:4,dx:0.4,dz:0,dy:2,collisionPolicy:"slide"},{frame:12,dx:0.4,dz:0,dy:-2,collisionPolicy:"slide"},{frame:13,dx:0.6,dz:0,dy:-3,collisionPolicy:"slide"},{frame:14,dx:0.8,dz:0,dy:-4,collisionPolicy:"slide"}]), cancelPolicy:{ hitCancelFrom:1, whiffCancelFrom:1, into:["JumpAttack"] } },
  JumpAttack: action("JumpAttack", 26, [hit("jump_attack",6,10,"jump_attack",16,{offsetX:70,w:132,d:42,h:72,offsetY:40,impactSnapX:7,visualRecoilFrames:7,reactionProfile:mediumStagger})], 4, [{frame:3,dx:1.4,dz:0,dy:2,collisionPolicy:"slide"},{frame:4,dx:1.4,dz:0,dy:1,collisionPolicy:"slide"},{frame:12,dx:1.0,dz:0,dy:-1,collisionPolicy:"slide"},{frame:13,dx:0.8,dz:0,dy:-2,collisionPolicy:"slide"}]),
  FrenzyToggle: { ...action("FrenzyToggle",1,[],0), costProfile:{ mpCost:10, costTiming:"on_request" }, cooldownProfile:{ actionName:"FrenzyToggle", independentCooldownFrames:600, globalCooldownFrames:30, cooldownStartsAt:"on_action_enter", freezesDuringHitStop:true } },
  FrenzyBasic1: action("FrenzyBasic1", 18, [hit("fb1a",4,6,"frenzy_1a",12,{reactionProfile:reaction({ hitStunFrames:7, knockbackX:2.2, knockbackZ:0.2, horizontalFriction:0.75 })}), hit("fb1b",7,9,"frenzy_1b",12,{reactionProfile:reaction({ hitStunFrames:8, knockbackX:2.6, knockbackZ:0.25, horizontalFriction:0.75 })})], 3, lunge([3,4,5],1.8)),
  FrenzyBasic2: action("FrenzyBasic2", 20, [hit("fb2a",5,7,"frenzy_2a",14,{reactionProfile:reaction({ hitStunFrames:8, knockbackX:2.8, knockbackZ:0.25, horizontalFriction:0.76 })}), hit("fb2b",8,10,"frenzy_2b",14,{reactionProfile:reaction({ hitStunFrames:9, knockbackX:3.1, knockbackZ:0.3, horizontalFriction:0.76 })})], 3, lunge([4,5,6],2.0)),
  FrenzyBasic3: action("FrenzyBasic3", 28, [hit("fb3a",6,8,"frenzy_3a",13,{reactionProfile:mediumStagger}), hit("fb3b",9,11,"frenzy_3b",13,{reactionProfile:mediumStagger}), hit("fb3c",12,14,"frenzy_3c",16,{canKnockdown:true,reactionProfile:heavyKnockdown})], 4, lunge([5,6,7,8],2.2)),
  UpwardSlash: { ...action("UpwardSlash",27,[hit("upslash",7,11,"upslash",18,{offsetX:58,w:116,d:42,h:120,offsetY:52,canLaunch:true, attackLevel:2, controlPower:2, impactSnapX:7, visualRecoilFrames:8, reactionProfile:upperLaunch})],6,lunge([5,6,7],1.0)), cooldownProfile:{ actionName:"UpwardSlash", independentCooldownFrames:120, globalCooldownFrames:18, cooldownStartsAt:"on_action_enter", freezesDuringHitStop:true } },
  MountainousWheel: { ...action("MountainousWheel",45,[...mountainousWheelSlashes, hit("mw_shock",21,27,"mw_shock",28,{hitType:"shockwave", w:90, d:38, canHitDowned:true, canKnockdown:true,reactionProfile:reaction({ hitStunFrames:8, knockbackX:4.6, knockbackZ:0.3, launchVelocityY:1.8, horizontalFriction:0.80, downFrames:28, getUpFrames:12 })})],5,lunge([10,11,12,13,14,15],1.2)), costProfile:{ mpCost:17, costTiming:"on_request" }, cooldownProfile:{ actionName:"MountainousWheel", independentCooldownFrames:240, globalCooldownFrames:24, cooldownStartsAt:"on_action_enter", freezesDuringHitStop:true, canBeReducedByFrenzy:true } },
  RagingFury: { ...action("RagingFury",53,[hit("rf_shock",10,13,"rf_shockwave",30,{hitType:"shockwave", w:118, d:50, canHitDowned:true, canLaunch:true,reactionProfile:bloodPillarLaunch}), ...rfPillars],3), costProfile:{ mpCost:142, cubeCost:1, costTiming:"on_request" }, cooldownProfile:{ actionName:"RagingFury", independentCooldownFrames:780, globalCooldownFrames:30, cooldownStartsAt:"on_action_enter", freezesDuringHitStop:true, canBeReducedByFrenzy:true } },
  Bloodlust: { ...action("Bloodlust",34,[hit("bloodlust_grab",7,10,"bloodlust_grab",26,{hitType:"grab", offsetX:58, w:104, d:38, h:64, canGrab:true, attackLevel:2, controlPower:2, impactSnapX:8, visualRecoilFrames:8, reactionProfile:reaction({ hitStunFrames:16, knockbackX:6.4, knockbackZ:0.25, horizontalFriction:0.76 })})],5,lunge([4,5,6],1.0)), costProfile:{ mpCost:37, costTiming:"on_request" }, cooldownProfile:{ actionName:"Bloodlust", independentCooldownFrames:360, globalCooldownFrames:24, cooldownStartsAt:"on_action_enter", freezesDuringHitStop:true, canBeReducedByFrenzy:true } },
  Backstep: { ...action("Backstep",21,[],0), costProfile:{ mpCost:1, costTiming:"on_request" }, rootMotion:{frames:Array.from({length:9},(_,i)=>({frame:i+4, dx:-48/9, dz:0, collisionPolicy:"slide"}))} },
  QuickRebound: { ...action("QuickRebound",190,[],0), costProfile:{ mpCost:1, costTiming:"on_request" }, cooldownProfile:{ actionName:"QuickRebound", independentCooldownFrames:300, globalCooldownFrames:0, cooldownStartsAt:"on_action_enter", freezesDuringHitStop:true }, maxHoldFrames:180, invulnerableWindows:[{start:1,end:180}] },
  Derange: { ...action("Derange",1,[],0), cooldownProfile:{ actionName:"Derange", independentCooldownFrames:300, globalCooldownFrames:30, cooldownStartsAt:"on_action_enter", freezesDuringHitStop:true } },
  Diehard: { ...action("Diehard",1,[],0), costProfile:{ mpCost:40, costTiming:"on_request" }, cooldownProfile:{ actionName:"Diehard", independentCooldownFrames:600, globalCooldownFrames:30, cooldownStartsAt:"on_action_enter", freezesDuringHitStop:true } },
  DebugReset: action("DebugReset",1,[],0),
  ForceDownPlayer: action("ForceDownPlayer",1,[],0),
  ForceBleed: action("ForceBleed",1,[],0),
  SpawnTargets: action("SpawnTargets",1,[],0),
  RunScreenshotScenario: action("RunScreenshotScenario",1,[],0),
  GoreCross: { ...action("GoreCross",38,[
    hit("gc_slash1",8,11,"gore_cross_1",16,{offsetX:62,w:124,d:42,h:64,offsetY:34,reactionProfile:mediumStagger}),
    hit("gc_slash2",14,17,"gore_cross_2",18,{offsetX:70,w:136,d:44,h:66,offsetY:34,reactionProfile:heavyStagger}),
    hit("gc_cross",20,23,"gore_cross_3",24,{offsetX:82,w:156,d:48,h:72,offsetY:36,canLaunch:true,attackLevel:2,controlPower:2,reactionProfile:upperLaunch}),
  ],5,lunge([5,6,7,8,9,10,11,12,13],0.9)), costProfile:{ mpCost:25, costTiming:"on_request" }, cooldownProfile:{ actionName:"GoreCross", independentCooldownFrames:360, globalCooldownFrames:24, cooldownStartsAt:"on_action_enter", freezesDuringHitStop:true, canBeReducedByFrenzy:true } },
  OutrageBreak: { ...action("OutrageBreak",52,[
    hit("ob_slam",32,38,"outrage_break",42,{offsetX:90,w:180,d:52,h:80,offsetY:38,hitType:"shockwave",canHitDowned:true,canKnockdown:true,attackLevel:3,controlPower:3,reactionProfile:heavyKnockdown}),
  ],6,lunge([22,23,24,25,26,27,28],0.4)), costProfile:{ mpCost:55, costTiming:"on_request" }, cooldownProfile:{ actionName:"OutrageBreak", independentCooldownFrames:480, globalCooldownFrames:30, cooldownStartsAt:"on_action_enter", freezesDuringHitStop:true, canBeReducedByFrenzy:true }, maxHoldFrames:60 },
  ExtremeOverkill: { ...action("ExtremeOverkill",48,[
    hit("eo_leap",12,17,"extreme_overkill_leap",22,{offsetX:70,w:140,d:46,h:74,offsetY:42,reactionProfile:heavyStagger}),
    hit("eo_shatter",18,26,"extreme_overkill_shock",38,{offsetX:96,w:192,d:56,h:68,offsetY:28,hitType:"shockwave",canHitDowned:true,canLaunch:true,attackLevel:3,controlPower:3,reactionProfile:upperLaunch}),
  ],5,lunge([6,7,8,9,10,11,12,13,14,15,16,17],1.6)), costProfile:{ mpCost:68, costTiming:"on_request" }, cooldownProfile:{ actionName:"ExtremeOverkill", independentCooldownFrames:600, globalCooldownFrames:30, cooldownStartsAt:"on_action_enter", freezesDuringHitStop:true, canBeReducedByFrenzy:true } },
  RagingFury2: { ...action("RagingFury2",60,[
    hit("rf2_shock",10,14,"rf2_shockwave",42,{hitType:"shockwave",w:140,d:56,canHitDowned:true,canLaunch:true,attackLevel:3,controlPower:3,reactionProfile:bloodPillarLaunch}),
    ...[15,17,19,21,23,25,27,29,31,33,35,37].map((f,i)=>hit(\`rf2_pillar_\${String(i+1).padStart(2,"0")}\`,f,f,\`rf2_pillar_\${String(i+1).padStart(2,"0")}\`,16,{hitType:"blood_pillar",offsetX:56,w:116,d:50,h:84,canHitDowned:true,canLaunch:true,reactionProfile:bloodPillarLaunch})),
  ],4), costProfile:{ mpCost:200, cubeCost:2, costTiming:"on_request" }, cooldownProfile:{ actionName:"RagingFury2", independentCooldownFrames:900, globalCooldownFrames:30, cooldownStartsAt:"on_action_enter", freezesDuringHitStop:true, canBeReducedByFrenzy:true } },
  BloodRuin: { ...action("BloodRuin",40,[
    hit("br_field",12,40,"blood_ruin_field",8,{hitType:"blood_pillar",offsetX:64,w:128,d:46,h:72,offsetY:30,canHitDowned:true,attackLevel:2,reactionProfile:reaction({hitStunFrames:6,knockbackX:0.8,knockbackZ:0.1,horizontalFriction:0.88})}),
  ],3), costProfile:{ mpCost:45, costTiming:"on_request" }, cooldownProfile:{ actionName:"BloodRuin", independentCooldownFrames:480, globalCooldownFrames:24, cooldownStartsAt:"on_action_enter", freezesDuringHitStop:true, canBeReducedByFrenzy:true } },
  BloodSword: { ...action("BloodSword",55,[
    hit("bs_swing",25,35,"blood_sword",52,{offsetX:90,w:180,d:50,h:78,offsetY:36,canLaunch:true,attackLevel:3,controlPower:3,reactionProfile:upperLaunch}),
  ],6,lunge([18,19,20,21,22,23,24,25,26],0.7)), costProfile:{ mpCost:90, cubeCost:1, costTiming:"on_request" }, cooldownProfile:{ actionName:"BloodSword", independentCooldownFrames:720, globalCooldownFrames:30, cooldownStartsAt:"on_action_enter", freezesDuringHitStop:true, canBeReducedByFrenzy:true } },
  BurstFury: { ...action("BurstFury",42,[
    hit("bf_stab",10,13,"burst_fury_stab",16,{offsetX:58,w:110,d:38,h:60,offsetY:32,reactionProfile:heavyStagger}),
    hit("bf_detonate",28,35,"burst_fury_blast",38,{offsetX:86,w:172,d:52,h:76,offsetY:34,hitType:"shockwave",canHitDowned:true,canKnockdown:true,attackLevel:3,controlPower:3,reactionProfile:heavyKnockdown}),
  ],5,lunge([6,7,8,9],1.2)), costProfile:{ mpCost:40, costTiming:"on_request" }, cooldownProfile:{ actionName:"BurstFury", independentCooldownFrames:420, globalCooldownFrames:24, cooldownStartsAt:"on_action_enter", freezesDuringHitStop:true, canBeReducedByFrenzy:true } },
  EarthShatter: { ...action("EarthShatter",35,[
    hit("es_smash",8,12,"earth_shatter_smash",14,{offsetX:60,w:120,d:42,h:62,offsetY:30,reactionProfile:mediumStagger}),
    hit("es_wave",18,25,"earth_shatter_wave",22,{offsetX:82,w:164,d:48,h:56,offsetY:22,hitType:"shockwave",canHitDowned:true,canKnockdown:true,reactionProfile:heavyKnockdown}),
  ],4,lunge([4,5,6,7,8,9,10,11],1.8)), costProfile:{ mpCost:20, costTiming:"on_request" }, cooldownProfile:{ actionName:"EarthShatter", independentCooldownFrames:180, globalCooldownFrames:18, cooldownStartsAt:"on_action_enter", freezesDuringHitStop:true } },
  Thirst: { ...action("Thirst",1,[],0), costProfile:{ hpPercentCost:10, costTiming:"on_request", cannotReduceHpBelow:1 }, cooldownProfile:{ actionName:"Thirst", independentCooldownFrames:600, globalCooldownFrames:30, cooldownStartsAt:"on_action_enter", freezesDuringHitStop:true } },
  BloodMemory: { ...action("BloodMemory",1,[],0), costProfile:{ mpCost:50, costTiming:"on_request" }, cooldownProfile:{ actionName:"BloodMemory", independentCooldownFrames:900, globalCooldownFrames:30, cooldownStartsAt:"on_action_enter", freezesDuringHitStop:true } },
  VimAndVigor: action("VimAndVigor",1,[],0),
  EnemyBasic: enemyBasicAction
};

process.stdout.write(JSON.stringify(ACTIONS, null, 2));
`;

// Write the script to a temp file and execute with node
import { execSync } from "node:child_process";

const tmpScript = join(__dirname, "..", ".tmp", "eval-actions.js");
writeFileSync(tmpScript, evalScript);

try {
  const result = execSync("node " + tmpScript, { encoding: "utf-8", cwd: join(__dirname, "..") });
  const actions = JSON.parse(result);
  const capturedAt = "2026-05-03";
  const local = {
    sourceType: "local_baseline",
    confidence: "medium",
    sourceRef: "docs/design/tuning-baseline.md#action-frame-baseline",
    capturedAt,
    version: "combat-data-v1",
    requiresCalibration: true,
  };
  const defaults = {
    totalFrames: local,
    active: local,
    hitbox: local,
    reactionProfile: local,
    hitStopProfile: local,
    recoilProfile: local,
    cancelPolicy: local,
    rootMotion: local,
    costProfile: local,
    cooldownProfile: local,
    feedbackProfile: local,
  };
  const official = sourceRef => ({ sourceType: "official_api", confidence: "high", sourceRef, capturedAt, version: "combat-data-v1", requiresCalibration: false });
  for (const action of Object.values(actions)) {
    action.sourcePolicy = { sourceType: "local_baseline", confidence: "medium", requiresManualVerification: true };
    action.fieldProvenance = { ...defaults, ...(action.fieldProvenance ?? {}) };
  }
  for (const name of ["UpwardSlash", "MountainousWheel", "RagingFury", "Bloodlust"]) {
    const provenance = official(`src/data/official/berserkerSkillFacts.ts#${name}`);
    actions[name].fieldProvenance.costProfile = provenance;
    actions[name].fieldProvenance.cooldownProfile = provenance;
  }
  for (const name of ["QuickRebound", "Backstep", "FrenzyToggle", "Derange", "Diehard"]) {
    const provenance = official("src/data/official/berserkerSkillFacts.ts#common-berserker-skill-facts");
    actions[name].fieldProvenance.costProfile = provenance;
    actions[name].fieldProvenance.cooldownProfile = provenance;
  }
  writeFileSync(join(__dirname, "..", "src", "data", "manifest", "actions", "default.json"), `${JSON.stringify(actions, null, 2)}\n`);
  console.log("OK: actions/default.json written (" + Object.keys(actions).length + " actions)");
} catch (e) {
  console.error("FAILED:", e.stderr || e.message);
  process.exit(1);
}
