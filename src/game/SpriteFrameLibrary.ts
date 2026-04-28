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
    if (req.dead || reaction === "dead") return spec(s, "death", req, "action", 8);
    if (reaction === "downed") return spec(s, "knockdown", req, "loop", 12);
    if (["light_stagger", "heavy_stagger", "knockback", "armor_feedback_only"].includes(reaction)) return spec(s, "hurt", req, "action", 2);
    if (action === "UpwardSlash") return spec(s, "upward_slash", req, "action", 2);
    if (action === "NormalBasic3" || action === "FrenzyBasic3" || action === "MountainousWheel" || action === "RagingFury") return spec(s, "attack3", req, "action", 2);
    if (action === "NormalBasic2" || action === "FrenzyBasic2" || action === "DashAttack" || action === "JumpAttack" || action === "Bloodlust") return spec(s, "attack2", req, "action", 2);
    if (action === "NormalBasic1" || action === "FrenzyBasic1") return spec(s, "attack1", req, "action", 2);
    if (action === "Jump") return spec(s, "jump", req, "loop", 1);
    if (action === "Backstep") return spec(s, "backstep", req, "action", 2);
    if (req.locomotion === "run") return spec(s, "run", req, "loop", 5);
    if (req.locomotion === "walk") return spec(s, "walk", req, "loop", 7);
    return spec(s, "idle", req, "loop", 10);
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
