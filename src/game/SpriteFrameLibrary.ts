export type SpriteSpec = { key: string; frame: number; scale: number; offsetY?: number };
type SheetSpec = {
  key: string;
  scale: number;
  offsetY: number;
  cellW: number;
  cellH: number;
  frames: Record<string, number[]>;
};
type ActorSpriteRequest = {
  id: string;
  action: string | null;
  reaction: string;
  locomotion?: string;
  tick: number;
  localFrame?: number;
  dead?: boolean;
};

// ── DNF .ani-driven action registry ──────────────────────────────────
// Each action = N PNGs (one per .ani frame), loaded as individual Phaser
// textures with `this.load.image()`. Per-frame delay drives tick→frame
// lookup; per-frame anchor → offsetY so feet sit at the actor position.

export type DnfFrameMeta = {
  key: string;        // Phaser texture key for this frame
  delay: number;      // ms until next frame
  width: number;
  height: number;
  anchorX: number;    // feet anchor inside PNG (px, from origin top-left)
  anchorY: number;
};
export type DnfActionMeta = {
  name: string;
  loop: boolean;
  scale: number;
  frames: DnfFrameMeta[];
  totalDuration: number;
  stableOffsetY: number; // median below-feet offset for loop anims, avoids per-frame jitter
};
type DnfMetaJson = {
  source: { framesCount: number; loop: boolean };
  frames: Array<{
    width: number;
    height: number;
    aniOffset: { x: number; y: number };
    imgAnchor: { x: number; y: number };
    delay: number;
  }>;
};

const DNF_ACTIONS: Record<string, DnfActionMeta> = {};
const DEFAULT_DNF_SCALE = 2.5;
const MS_PER_TICK = 1000 / 60;

export function registerDnfAction(name: string, meta: DnfMetaJson, keyPrefix: string, scale = DEFAULT_DNF_SCALE): void {
  const frames: DnfFrameMeta[] = meta.frames.map((f, idx) => ({
    key: `${keyPrefix}_${String(idx).padStart(2, "0")}`,
    delay: Math.max(1, f.delay),
    width: f.width,
    height: f.height,
    anchorX: -f.aniOffset.x - f.imgAnchor.x,
    anchorY: -f.aniOffset.y - f.imgAnchor.y,
  }));
  // Stable offsetY = median of (height - anchorY) clamped ≥ 0, scaled
  const belowFeet = frames.map(f => Math.max(0, f.height - f.anchorY)).sort((a, b) => a - b);
  const median = belowFeet[Math.floor(belowFeet.length / 2)]!;
  DNF_ACTIONS[name] = {
    name,
    loop: meta.source.loop,
    scale,
    frames,
    totalDuration: frames.reduce((s, f) => s + f.delay, 0),
    stableOffsetY: median * scale,
  };
}

export function getDnfAction(name: string): DnfActionMeta | undefined {
  return DNF_ACTIONS[name];
}

export let _debugLastPlayerSprite = { action: "", reaction: "", locomotion: "", dnfAction: "", frameKey: "", tick: 0 };

function pickDnfSpriteSpec(action: DnfActionMeta, tick: number): SpriteSpec {
  let ms = tick * MS_PER_TICK;
  if (action.loop) ms = ((ms % action.totalDuration) + action.totalDuration) % action.totalDuration;
  else if (ms > action.totalDuration) ms = action.totalDuration;
  let idx = action.frames.length - 1;
  let acc = 0;
  for (let i = 0; i < action.frames.length; i++) {
    acc += action.frames[i]!.delay;
    if (ms < acc) { idx = i; break; }
  }
  const f = action.frames[idx]!;
  return {
    key: f.key,
    frame: 0,
    scale: action.scale,
    offsetY: action.stableOffsetY,
  };
}

function pickDnfActionSpec(action: DnfActionMeta, localFrame: number): SpriteSpec {
  const f = pickDnfFrame(action, localFrame);
  return {
    key: f.key,
    frame: 0,
    scale: action.scale,
    offsetY: Math.max(0, f.height - f.anchorY) * action.scale,
  };
}

function pickDnfFrame(action: DnfActionMeta, localFrame: number): DnfFrameMeta {
  if (action.name === "swordman_jump") {
    if (localFrame <= 6) return action.frames[Math.min(1, Math.max(0, Math.floor((Math.max(1, localFrame) - 1) / 3)))]!;
    if (localFrame <= 24) return action.frames[Math.min(7, Math.max(2, Math.floor((localFrame - 7) / 3) + 2))]!;
    if (localFrame <= 29) return action.frames[7]!;
    if (localFrame <= 51) return action.frames[Math.min(14, Math.max(8, Math.floor((localFrame - 30) / 3) + 8))]!;
    return action.frames[15]!;
  }

  const ms = Math.max(0, localFrame - 1) * MS_PER_TICK;
  let idx = action.frames.length - 1;
  let acc = 0;
  for (let i = 0; i < action.frames.length; i++) {
    acc += action.frames[i]!.delay;
    if (ms < acc) { idx = i; break; }
  }
  return action.frames[idx]!;
}

export const NORMALIZED_SPRITE_SHEETS: Record<string, { key: string; url: string; cellW: number; cellH: number }> = {
  player: { key: "player_berserker_norm", url: "assets/sprites/normalized/player_berserker_norm.png", cellW: 448, cellH: 432 },
  goblin: { key: "goblin_norm", url: "assets/sprites/normalized/goblin_norm.png", cellW: 672, cellH: 272 },
  skeleton: { key: "skeleton_shield_norm", url: "assets/sprites/normalized/skeleton_shield_norm.png", cellW: 272, cellH: 272 },
  imp: { key: "flying_imp_norm", url: "assets/sprites/normalized/flying_imp_norm.png", cellW: 288, cellH: 272 },
  boss: { key: "minotaur_boss_norm", url: "assets/sprites/normalized/minotaur_boss_norm.png", cellW: 512, cellH: 288 },
};

const SHEETS: Record<string, SheetSpec> = {
  "player": {
    "key": "player_berserker_norm",
    "scale": 0.62,
    "offsetY": 4,
    "cellW": 448,
    "cellH": 432,
    "frames": {
      "idle": [
        0,
        1,
        2,
        3,
        4,
        5
      ],
      "walk": [
        6,
        7,
        8,
        9,
        10,
        11,
        12,
        13
      ],
      "run": [
        14,
        15,
        16,
        17,
        18,
        19,
        20,
        21
      ],
      "attack1": [
        22,
        23,
        24,
        25
      ],
      "attack2": [
        26,
        27,
        28,
        29,
        30
      ],
      "attack3": [
        31,
        32,
        33,
        34,
        35,
        36,
        37
      ],
      "upward_slash": [
        38,
        39,
        40,
        41,
        42,
        43
      ],
      "backstep": [
        44,
        45,
        46,
        47
      ],
      "hurt": [
        48,
        49,
        50,
        51
      ],
      "knockdown": [
        52,
        53,
        54,
        55,
        56
      ],
      "wakeup": [
        57,
        58,
        59,
        60,
        61
      ],
      "death": [
        62,
        63,
        64,
        65,
        66,
        67
      ]
    }
  },
  "goblin": {
    "key": "goblin_norm",
    "scale": 0.36,
    "offsetY": 4,
    "cellW": 672,
    "cellH": 272,
    "frames": {
      "idle": [
        0,
        1,
        2,
        3
      ],
      "walk": [
        4,
        5,
        6,
        7,
        8
      ],
      "attack": [
        9,
        10,
        11,
        12,
        13,
        14
      ],
      "hurt_light": [
        15,
        16,
        17
      ],
      "hurt_heavy": [
        18,
        19,
        20,
        21
      ],
      "knockback": [
        22,
        23,
        24,
        25,
        26
      ],
      "launch": [
        27,
        28,
        29,
        30,
        31
      ],
      "fall": [
        32,
        33,
        34,
        35
      ],
      "downed": [
        36,
        37,
        38,
        39
      ],
      "wakeup": [
        40,
        41,
        42,
        43
      ],
      "death": [
        44,
        45,
        46,
        47
      ]
    }
  },
  "skeleton": {
    "key": "skeleton_shield_norm",
    "scale": 0.34,
    "offsetY": 4,
    "cellW": 272,
    "cellH": 272,
    "frames": {
      "idle": [
        0,
        1,
        2,
        3
      ],
      "walk": [
        4,
        5,
        6,
        7
      ],
      "block": [
        8,
        9,
        10,
        11
      ],
      "guard_hit": [
        12,
        13
      ],
      "hurt": [
        14,
        15,
        16
      ],
      "knockdown": [
        17,
        18,
        19
      ],
      "death": [
        20,
        21,
        22,
        23
      ]
    }
  },
  "imp": {
    "key": "flying_imp_norm",
    "scale": 0.34,
    "offsetY": -52,
    "cellW": 288,
    "cellH": 272,
    "frames": {
      "idle": [
        0,
        1,
        2,
        3
      ],
      "fly": [
        4,
        5,
        6,
        7
      ],
      "attack": [
        8,
        9,
        10,
        11
      ],
      "hurt": [
        12,
        13
      ],
      "fall": [
        14,
        15
      ],
      "death": [
        16,
        17,
        18,
        19
      ]
    }
  },
  "boss": {
    "key": "minotaur_boss_norm",
    "scale": 0.7,
    "offsetY": 6,
    "cellW": 512,
    "cellH": 288,
    "frames": {
      "idle": [
        0,
        1,
        2,
        3,
        4,
        5
      ],
      "walk": [
        6,
        7,
        8,
        9,
        10,
        11
      ],
      "attack_windup": [
        12,
        13,
        14,
        15,
        16,
        17
      ],
      "slam_attack": [
        18,
        19,
        20,
        21,
        22,
        23
      ],
      "charge_punch": [
        24,
        25,
        26,
        27,
        28
      ],
      "armor_hit": [
        29,
        30,
        31,
        32
      ],
      "stagger": [
        33,
        34,
        35,
        36
      ],
      "knockdown": [
        37,
        38,
        39,
        40
      ],
      "death": [
        41,
        42,
        43,
        44,
        45,
        46,
        47,
        48
      ]
    }
  }
};

function fallbackFrame(): number { return 0; }

function pickLoop(frames: readonly number[], tick: number, step = 8): number {
  if (!frames.length) return fallbackFrame();
  return frames[Math.floor(tick / step) % frames.length] ?? frames[0] ?? fallbackFrame();
}

function pickAction(frames: readonly number[], localFrame = 0, step = 2): number {
  if (!frames.length) return fallbackFrame();
  const index = Math.min(frames.length - 1, Math.floor(Math.max(0, localFrame - 1) / step));
  return frames[index] ?? frames[frames.length - 1] ?? fallbackFrame();
}

function spec(sheet: SheetSpec, anim: string, req: ActorSpriteRequest, mode: "loop" | "action" = "loop", step = 8): SpriteSpec {
  const frames = sheet.frames[anim] ?? sheet.frames.idle ?? Object.values(sheet.frames)[0] ?? [];
  return {
    key: sheet.key,
    frame: mode === "action" ? pickAction(frames, req.localFrame, step) : pickLoop(frames, req.tick, step),
    scale: sheet.scale,
    offsetY: sheet.offsetY,
  };
}

export function getCombatSpriteSpec(req: ActorSpriteRequest): SpriteSpec | null {
  if (req.id === "building") return null;
  const action = req.action;
  const reaction = req.reaction;

  if (req.id === "player") {
    const s = SHEETS.player;
    const lf = req.localFrame ?? 0;
    const dbg = (dnfName: string, result: SpriteSpec): SpriteSpec => {
      _debugLastPlayerSprite = { action: action ?? "", reaction, locomotion: req.locomotion ?? "", dnfAction: dnfName, frameKey: result.key, tick: req.tick };
      return result;
    };

    if (req.dead || reaction === "dead" || reaction === "downed") {
      const dnf = DNF_ACTIONS["swordman_down"];
      if (dnf) return dbg("swordman_down", pickDnfActionSpec(dnf, lf));
      return dbg("fallback:death", spec(s, "death", req, "action", 8));
    }


    if (reaction === "quick_rebound" || reaction === "getting_up" || action === "QuickRebound") {
      const dnf = DNF_ACTIONS["swordman_overturn"];
      if (dnf) return dbg("swordman_overturn", pickDnfActionSpec(dnf, lf));
    }

    // Hit reactions
    if (reaction === "micro_stagger" || reaction === "light_stagger" || reaction === "armor_feedback_only") {
      const dnf = DNF_ACTIONS["swordman_damage1"];
      if (dnf) return dbg("swordman_damage1", pickDnfActionSpec(dnf, lf));
      return dbg("fallback:hurt", spec(s, "hurt", req, "action", 2));
    }
    if (["heavy_stagger", "knockback"].includes(reaction)) {
      const dnf = DNF_ACTIONS["swordman_hitback"];
      if (dnf) return dbg("swordman_hitback", pickDnfActionSpec(dnf, lf));
      return dbg("fallback:hurt", spec(s, "hurt", req, "action", 2));
    }

    // Attacks
    if (action === "UpwardSlash" || action === "NormalBasic3" || action === "FrenzyBasic3" || action === "MountainousWheel" || action === "RagingFury") {
      const dnf = DNF_ACTIONS["swordman_attack3"];
      if (dnf) return dbg("swordman_attack3", pickDnfActionSpec(dnf, lf));
      return dbg("fallback:attack3", spec(s, "attack3", req, "action", 2));
    }
    if (action === "NormalBasic2" || action === "FrenzyBasic2" || action === "DashAttack" || action === "JumpAttack" || action === "Bloodlust") {
      const dnf = DNF_ACTIONS["swordman_attack2"];
      if (dnf) return dbg("swordman_attack2", pickDnfActionSpec(dnf, lf));
      return dbg("fallback:attack2", spec(s, "attack2", req, "action", 2));
    }
    if (action === "NormalBasic1" || action === "FrenzyBasic1") {
      const dnf = DNF_ACTIONS["swordman_attack1"];
      if (dnf) return dbg("swordman_attack1", pickDnfActionSpec(dnf, lf));
      return dbg("fallback:attack1", spec(s, "attack1", req, "action", 2));
    }

    // Jump
    if (action === "Jump") {
      const dnf = DNF_ACTIONS["swordman_jump"];
      if (dnf) return dbg("swordman_jump", pickDnfActionSpec(dnf, lf));
      return dbg("fallback:jump", spec(s, "jump", req, "loop", 1));
    }

    // Backstep — use damage2 as visual stand-in
    if (action === "Backstep") {
      const dnf = DNF_ACTIONS["swordman_damage2"];
      if (dnf) return dbg("swordman_damage2", pickDnfActionSpec(dnf, lf));
      return dbg("fallback:backstep", spec(s, "backstep", req, "action", 2));
    }

    // Locomotion
    if (req.locomotion === "run") {
      const dnf = DNF_ACTIONS["swordman_dash"];
      if (dnf) return dbg("swordman_dash", pickDnfSpriteSpec(dnf, req.tick));
      return dbg("fallback:run", spec(s, "run", req, "loop", 5));
    }
    if (req.locomotion === "walk") {
      const dnf = DNF_ACTIONS["swordman_dash"];
      if (dnf) return dbg("swordman_dash", pickDnfSpriteSpec(dnf, req.tick));
      return dbg("fallback:walk", spec(s, "walk", req, "loop", 7));
    }

    // Idle
    const dnfStay = DNF_ACTIONS["swordman_stay"];
    if (dnfStay) return dbg("swordman_stay", pickDnfSpriteSpec(dnfStay, req.tick));
    return dbg("fallback:idle", spec(s, "idle", req, "loop", 10));
  }

  if (req.id === "boss") {
    const s = SHEETS.boss;
    if (req.dead || reaction === "dead") return spec(s, "death", req, "action", 8);
    if (reaction === "downed") return spec(s, "knockdown", req, "action", 10);
    if (reaction === "armor_feedback_only") return spec(s, "armor_hit", req, "action", 2);
    if (["light_stagger", "heavy_stagger", "knockback"].includes(reaction)) return spec(s, "stagger", req, "action", 2);
    if (action === "EnemyBasic") return spec(s, "slam_attack", req, "action", 2);
    if (req.locomotion === "walk" || req.locomotion === "run") return spec(s, "walk", req, "loop", 8);
    return spec(s, "idle", req, "loop", 10);
  }

  if (req.id === "dummy") {
    const s = SHEETS.skeleton;
    if (req.dead || reaction === "dead") return spec(s, "death", req, "action", 8);
    if (reaction === "armor_feedback_only") return spec(s, "guard_hit", req, "action", 2);
    if (["light_stagger", "heavy_stagger", "knockback"].includes(reaction)) return spec(s, "hurt", req, "action", 2);
    if (reaction === "downed") return spec(s, "knockdown", req, "action", 10);
    if (action === "EnemyBasic") return spec(s, "block", req, "action", 2);
    if (req.locomotion === "walk" || req.locomotion === "run") return spec(s, "walk", req, "loop", 8);
    return spec(s, "idle", req, "loop", 10);
  }

  if (req.id === "imp") {
    const s = SHEETS.imp;
    if (req.dead || reaction === "dead") return spec(s, "death", req, "action", 8);
    if (["launch", "falling", "downed", "knockback"].includes(reaction)) return spec(s, "fall", req, "action", 2);
    if (["light_stagger", "heavy_stagger"].includes(reaction)) return spec(s, "hurt", req, "action", 2);
    if (action === "EnemyBasic") return spec(s, "attack", req, "action", 2);
    if (req.locomotion === "walk" || req.locomotion === "run") return spec(s, "fly", req, "loop", 6);
    return spec(s, "idle", req, "loop", 8);
  }

  const s = SHEETS.goblin;
  if (req.dead || reaction === "dead") return spec(s, "death", req, "action", 8);
  if (reaction === "downed") return spec(s, "downed", req, "action", 10);
  if (["launch", "air_hitstun", "falling"].includes(reaction)) return spec(s, "launch", req, "action", 2);
  if (reaction === "knockback") return spec(s, "knockback", req, "action", 2);
  if (reaction === "heavy_stagger") return spec(s, "hurt_heavy", req, "action", 2);
  if (reaction === "light_stagger") return spec(s, "hurt_light", req, "action", 2);
  if (action === "EnemyBasic") return spec(s, "attack", req, "action", 2);
  if (req.locomotion === "walk" || req.locomotion === "run") return spec(s, "walk", req, "loop", 7);
  return spec(s, "idle", req, "loop", 10);
}
