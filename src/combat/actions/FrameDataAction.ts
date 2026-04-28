import type { FrameDataAction, HitBoxFrameWindow, ActionName, HitReactionProfile, RootMotionStep } from "../types.js";

const sourcePolicy = { sourceType:"baseline_tuning", confidence:"medium", requiresManualVerification:true } as const;
const combatCancelTargets: ActionName[] = ["NormalBasic1","NormalBasic2","NormalBasic3","DashAttack","Jump","JumpAttack","FrenzyBasic1","FrenzyBasic2","FrenzyBasic3","UpwardSlash","MountainousWheel","RagingFury","Bloodlust","Backstep","Walk","Run","Idle"];

function reaction(profile: HitReactionProfile): HitReactionProfile { return profile; }
function lunge(frames: number[], dx: number, dz = 0): RootMotionStep[] {
  return frames.map(frame => ({ frame, dx, dz, collisionPolicy:"slide" as const }));
}
function hit(id:string, start:number, end:number, group:string, baseDamage:number, opts: Partial<HitBoxFrameWindow>={}): HitBoxFrameWindow {
  return { id, start, end, hitGroupId:group, offsetX:64, offsetZ:0, offsetY:30, w:110, d:40, h:60, hitType:"slash", damageType:"physical", baseDamage, attackLevel:1, controlPower:1, canHitDowned:false, canLaunch:false, canKnockdown:false, canGrab:false, maxTargets:6, impactSnapX:4, visualRecoilFrames:5, ...opts };
}
function movementAction(actionName:"Walk" | "Run", speedXPerTick:number): FrameDataAction {
  return {
    actionName,
    totalFrames:1,
    startup:[], active:[], recovery:[],
    cancelPolicy:{ hitCancelFrom:0, whiffCancelFrom:0, into:combatCancelTargets },
    hitStopProfile:{frames:0, bossCapFrames:0, buildingCapFrames:0},
    recoilProfile:{frames:0, canCancelRecoil:false},
    rootMotion:{frames:[], speedXPerTick, appliesEveryFrame:true},
    feedbackProfile:{sound:"", vfx:"", cameraShake:0},
    sourcePolicy
  };
}
function action(actionName: ActionName, totalFrames:number, active:HitBoxFrameWindow[], frames=3, rootMotionFrames:RootMotionStep[]=[]): FrameDataAction {
  return {
    actionName,
    totalFrames,
    startup:[{start:1,end:Math.max(1,(active[0]?.start ?? 1)-1)}],
    active,
    recovery:[{start:(active.at(-1)?.end ?? 1)+1,end:totalFrames}],
    cancelPolicy:{hitCancelFrom: active[0]?.end, whiffCancelFrom: totalFrames-4, into:combatCancelTargets},
    hitStopProfile:{frames, bossCapFrames:2, buildingCapFrames:1},
    recoilProfile:{frames:Math.max(0,frames-1), canCancelRecoil:false},
    rootMotion: rootMotionFrames.length ? { frames:rootMotionFrames } : undefined,
    feedbackProfile:{sound:"hit", vfx:"slash", cameraShake:frames},
    sourcePolicy
  };
}

const lightStagger = reaction({ hitStunFrames:13, knockbackX:5.4, knockbackZ:0.32, horizontalFriction:0.70, downFrames:0, getUpFrames:0 });
const mediumStagger = reaction({ hitStunFrames:15, knockbackX:4.8, knockbackZ:0.38, horizontalFriction:0.72, downFrames:0, getUpFrames:0 });
const heavyStagger = reaction({ hitStunFrames:20, knockbackX:10.8, knockbackZ:0.55, launchVelocityY:0.35, horizontalFriction:0.76, downFrames:0, getUpFrames:0 });
const heavyKnockdown = reaction({ hitStunFrames:9, knockbackX:6.2, knockbackZ:0.65, launchVelocityY:2.2, horizontalFriction:0.78, downFrames:26, getUpFrames:14 });
const upperLaunch = reaction({ hitStunFrames:0, knockbackX:3.6, knockbackZ:0.28, launchVelocityY:8.2, horizontalFriction:0.84, downFrames:36, getUpFrames:16 });
const bloodPillarLaunch = reaction({ hitStunFrames:0, knockbackX:0.45, knockbackZ:0.08, launchVelocityY:4.0, horizontalFriction:0.90, downFrames:26, getUpFrames:12 });

const rfPillars = [15,17,19,21,23,25,27,29,31,33].map((f,i)=>hit(`rf_pillar_${String(i+1).padStart(2,"0")}`, f, f, `rf_pillar_${String(i+1).padStart(2,"0")}`, 12, {
  hitType:"blood_pillar", offsetX:48, w:104, d:46, h:76, canHitDowned:true, canLaunch:true, reactionProfile:bloodPillarLaunch
}));
const enemyBasicAction: FrameDataAction = {
  actionName:"EnemyBasic",
  totalFrames:36,
  startup:[{start:1,end:8}],
  active:[hit("enemy_basic",9,14,"enemy_basic_swing",5,{ offsetX:44, w:74, d:32, h:56, hitType:"slash", canHitDowned:false, canLaunch:false, canKnockdown:false, maxTargets:1, reactionProfile:reaction({ hitStunFrames:10, knockbackX:3.2, knockbackZ:0.2, horizontalFriction:0.75 }) })],
  recovery:[{start:15,end:36}],
  cancelPolicy:{ hitCancelFrom:24, whiffCancelFrom:30, into:[] },
  hitStopProfile:{frames:4, bossCapFrames:2, buildingCapFrames:0},
  recoilProfile:{frames:6, canCancelRecoil:false},
  rootMotion:{frames:lunge([6,7,8], 2.5)},
  feedbackProfile:{sound:"hit", vfx:"enemy_slash", cameraShake:4},
  sourcePolicy
};

export const ACTIONS: Record<ActionName, FrameDataAction> = {
  Idle: action("Idle",1,[],0),
  Walk: movementAction("Walk",2.45),
  Run: movementAction("Run",4.15),
  NormalBasic1: action("NormalBasic1",20,[hit("nb1",5,8,"normal_1",10,{offsetX:50,w:92,d:40,h:58,offsetY:30,impactSnapX:5,visualRecoilFrames:6,reactionProfile:lightStagger})],4,lunge([3,4],0.85)),
  NormalBasic2: action("NormalBasic2",22,[hit("nb2",6,9,"normal_2",14,{offsetX:64,w:118,d:42,h:62,offsetY:32,impactSnapX:6,visualRecoilFrames:7,reactionProfile:mediumStagger})],5,lunge([4,5],1.05)),
  NormalBasic3: action("NormalBasic3",31,[hit("nb3",8,13,"normal_3",24,{offsetX:82,w:156,d:46,h:70,offsetY:34,attackLevel:2,controlPower:2,impactSnapX:11,visualRecoilFrames:9,reactionProfile:heavyStagger})],7,lunge([5,6,7],1.18)),
  DashAttack: action("DashAttack",24,[hit("dash_attack",7,11,"dash_attack",18,{offsetX:78,w:150,d:44,h:62,offsetY:32,attackLevel:2,controlPower:2,impactSnapX:9,visualRecoilFrames:8,reactionProfile:mediumStagger})],4,lunge([3,4,5,6,7],2.6)),
  Jump: { ...action("Jump",22,[],0,[{frame:2,dx:0.8,dz:0,dy:4,collisionPolicy:"slide"},{frame:3,dx:0.6,dz:0,dy:3,collisionPolicy:"slide"},{frame:4,dx:0.4,dz:0,dy:2,collisionPolicy:"slide"},{frame:12,dx:0.4,dz:0,dy:-2,collisionPolicy:"slide"},{frame:13,dx:0.6,dz:0,dy:-3,collisionPolicy:"slide"},{frame:14,dx:0.8,dz:0,dy:-4,collisionPolicy:"slide"}]), cancelPolicy:{ hitCancelFrom:1, whiffCancelFrom:1, into:["JumpAttack"] } },
  JumpAttack: action("JumpAttack",26,[hit("jump_attack",6,10,"jump_attack",16,{offsetX:70,w:132,d:42,h:72,offsetY:40,impactSnapX:7,visualRecoilFrames:7,reactionProfile:mediumStagger})],4,[{frame:3,dx:1.4,dz:0,dy:2,collisionPolicy:"slide"},{frame:4,dx:1.4,dz:0,dy:1,collisionPolicy:"slide"},{frame:12,dx:1.0,dz:0,dy:-1,collisionPolicy:"slide"},{frame:13,dx:0.8,dz:0,dy:-2,collisionPolicy:"slide"}]),
  FrenzyToggle: action("FrenzyToggle",1,[],0),
  FrenzyBasic1: action("FrenzyBasic1",18,[hit("fb1a",4,6,"frenzy_1a",12,{reactionProfile:reaction({ hitStunFrames:7, knockbackX:2.2, knockbackZ:0.2, horizontalFriction:0.75 })}), hit("fb1b",7,9,"frenzy_1b",12,{reactionProfile:reaction({ hitStunFrames:8, knockbackX:2.6, knockbackZ:0.25, horizontalFriction:0.75 })})],3,lunge([3,4,5],1.8)),
  FrenzyBasic2: action("FrenzyBasic2",20,[hit("fb2a",5,7,"frenzy_2a",14,{reactionProfile:reaction({ hitStunFrames:8, knockbackX:2.8, knockbackZ:0.25, horizontalFriction:0.76 })}), hit("fb2b",8,10,"frenzy_2b",14,{reactionProfile:reaction({ hitStunFrames:9, knockbackX:3.1, knockbackZ:0.3, horizontalFriction:0.76 })})],3,lunge([4,5,6],2.0)),
  FrenzyBasic3: action("FrenzyBasic3",28,[hit("fb3a",6,8,"frenzy_3a",13,{reactionProfile:mediumStagger}), hit("fb3b",9,11,"frenzy_3b",13,{reactionProfile:mediumStagger}), hit("fb3c",12,14,"frenzy_3c",16,{canKnockdown:true,reactionProfile:heavyKnockdown})],4,lunge([5,6,7,8],2.2)),
  UpwardSlash: action("UpwardSlash",27,[hit("upslash",7,11,"upslash",18,{offsetX:58,w:116,d:42,h:120,offsetY:52,canLaunch:true, attackLevel:2, controlPower:2, impactSnapX:7, visualRecoilFrames:8, reactionProfile:upperLaunch})],6,lunge([5,6,7],1.0)),
  MountainousWheel: action("MountainousWheel",45,[hit("mw_slash",16,21,"mw_slash",32,{canKnockdown:true,reactionProfile:heavyKnockdown}), hit("mw_shock",21,27,"mw_shock",28,{hitType:"shockwave", w:90, d:38, canHitDowned:true, canKnockdown:true,reactionProfile:reaction({ hitStunFrames:8, knockbackX:4.6, knockbackZ:0.3, launchVelocityY:1.8, horizontalFriction:0.80, downFrames:28, getUpFrames:12 })})],5,lunge([10,11,12,13,14,15],1.2)),
  RagingFury: { ...action("RagingFury",53,[hit("rf_shock",10,13,"rf_shockwave",30,{hitType:"shockwave", w:118, d:50, canHitDowned:true, canLaunch:true,reactionProfile:bloodPillarLaunch}), ...rfPillars],3), costProfile:{ cubeCost:1, costTiming:"on_request" }, cooldownProfile:{ actionName:"RagingFury", independentCooldownFrames:90, globalCooldownFrames:30, cooldownStartsAt:"on_action_enter", freezesDuringHitStop:true, canBeReducedByFrenzy:true } },
  Bloodlust: { ...action("Bloodlust",34,[hit("bloodlust_grab",7,10,"bloodlust_grab",26,{hitType:"grab", offsetX:58, w:104, d:38, h:64, canGrab:true, attackLevel:2, controlPower:2, impactSnapX:8, visualRecoilFrames:8, reactionProfile:reaction({ hitStunFrames:16, knockbackX:6.4, knockbackZ:0.25, horizontalFriction:0.76 })})],5,lunge([4,5,6],1.0)), cooldownProfile:{ actionName:"Bloodlust", independentCooldownFrames:72, globalCooldownFrames:24, cooldownStartsAt:"on_action_enter", freezesDuringHitStop:true, canBeReducedByFrenzy:true } },
  Backstep: { ...action("Backstep",21,[],0), rootMotion:{frames:Array.from({length:9},(_,i)=>({frame:i+4, dx:-48/9, dz:0, collisionPolicy:"slide" as const}))} },
  QuickRebound: { ...action("QuickRebound",190,[],0), maxHoldFrames:180, invulnerableWindows:[{start:1,end:180}] },
  Derange: { ...action("Derange",1,[],0), cooldownProfile:{ actionName:"Derange", independentCooldownFrames:120, globalCooldownFrames:30, cooldownStartsAt:"on_action_enter", freezesDuringHitStop:true } },
  Diehard: action("Diehard",1,[],0), DebugReset: action("DebugReset",1,[],0), ForceDownPlayer: action("ForceDownPlayer",1,[],0), ForceBleed: action("ForceBleed",1,[],0), SpawnTargets: action("SpawnTargets",1,[],0), RunScreenshotScenario: action("RunScreenshotScenario",1,[],0),
  EnemyBasic: enemyBasicAction
};
export function getAction(name: ActionName): FrameDataAction { return ACTIONS[name]; }
