/**
 * system-api-map.ts — 22-system × sq_* API 归属真值表(P2a 解封产物)
 *
 * 背景:22-system 历史状态为 `counts_verified_clustering_inferred`——API 总数已核实,
 *   但"哪个 API 归哪个 system"是启发式推断(LOW-MEDIUM),28% 长尾未分类。
 *   原始素材见 verification/nut-samples-2026-05-27/{classify-v4-output.json,
 *   all-193.jsonl, sq-api-frequency.txt} 与 docs/engineering/nut-validation-2026-05-27.md。
 *
 * 本表的"解封"动作:对 engine P2b 即将建的 5 个 HOT 横切系统
 *   (13-DataStore / 17-Math / 18-Timer / 20-Time / 21-Predicate),
 *   把其标志 API 的归属从"推断"升级为"提取证据支撑"——每个 evidence:"extracted"
 *   的 API 都在 all-193.jsonl(.nut 第一证据)里有可复现的真实调用
 *   (见 tests/truth/system-api-map.test.ts 的 T3 校验)。
 *
 * 范围收敛(自 docs/planning/2026-06-04-engine-native-rewrite-roadmap.md P2a):
 *   - 只覆盖 5 个 HOT 系统 + 其标志/高频 API,不穷举全部 478 API。
 *   - 126 个长尾 unclassified(call share 仅 2.9%)留 future——多属表现层 / OOS。
 *   - 路线图里程碑要求"P3 闭环 + 5 HOT 系统 API 归属经真值表确认",非"全分类"。
 *
 * 数字来源:callCount = classify-v4-output.json(case-normalized)。
 *   .nut 原始频次为 case-sensitive(如 sq_IsMyControlObject 34 + sq_isMyControlObject 7
 *   = normalized 41),故 callCount 为"参考量",测试不锁精确值、只断言第一证据存在。
 *
 * 置信度铁律(CLAUDE.md):dnf-extract(.nut)> API/wiki > md/代码。
 *   evidence:"extracted" = 第一级(.nut 实证);
 *   evidence:"inferred"  = 第三级(classifier 推断,待后续 .nut 实证升级)。
 */

export type ApiEvidence = "extracted" | "inferred";

export interface SystemApiEntry {
  /** sq_* API 名(case-normalized) */
  readonly name: string;
  /** classify-v4-output.json 的 normalized 调用次数(参考量,非锁定值) */
  readonly callCount: number;
  /** extracted = .nut 第一证据支撑;inferred = 仅 classifier 推断 */
  readonly evidence: ApiEvidence;
  /** PVE 战斗运行时是否相关(false = UI / 创作模式 / 编辑器 OOS) */
  readonly combatRelevant: boolean;
  /** evidence==="extracted" 时:.nut 样本文件名 + 真实调用片段 */
  readonly sample?: string;
  readonly note?: string;
}

export interface SystemApiBucket {
  /** 编号-名称,对齐 docs/engineering/22-system-field-matrix.md */
  readonly id: string;
  /** 每帧热路径横切系统(P2b 建设目标) */
  readonly hot: boolean;
  readonly apis: readonly SystemApiEntry[];
}

/** P2b 建设目标:5 个 HOT 横切支撑系统。 */
export const HOT_SYSTEM_IDS = [
  "13-DataStore",
  "17-Math",
  "18-Timer",
  "20-Time",
  "21-Predicate",
] as const;

export const SYSTEM_API_MAP: readonly SystemApiBucket[] = [
  {
    id: "13-DataStore",
    hot: true,
    apis: [
      {
        name: "sq_var",
        callCount: 885,
        evidence: "extracted",
        combatRelevant: true,
        sample: "ap_atmage_manaburst.nut: appendage.sq_var.get_vector(0)",
        note: "脚本变量存储(向量 / timer 子对象 get/set)——全 PVF 最高频 API",
      },
      { name: "sq_GetIntData", callCount: 220, evidence: "inferred", combatRelevant: true },
      { name: "sq_IntVectPush", callCount: 217, evidence: "inferred", combatRelevant: true },
      { name: "sq_GetLevelData", callCount: 186, evidence: "inferred", combatRelevant: true },
      { name: "sq_GetGlobalIntVector", callCount: 93, evidence: "inferred", combatRelevant: true },
    ],
  },
  {
    id: "17-Math",
    hot: true,
    apis: [
      {
        name: "sq_getRandom",
        callCount: 33,
        evidence: "extracted",
        combatRelevant: true,
        sample: "po_atbrokenarrow.nut: sq_GetXPos(damager) + sq_getRandom(0, 2)",
        note: "随机区间(min,max)——engine 由 Fnv1aPrng 确定性收编",
      },
      { name: "sq_Abs", callCount: 26, evidence: "inferred", combatRelevant: true },
      { name: "sq_ToRadian", callCount: 11, evidence: "inferred", combatRelevant: true },
      { name: "sq_Sin", callCount: 6, evidence: "inferred", combatRelevant: true },
      { name: "sq_Cos", callCount: 6, evidence: "inferred", combatRelevant: true },
    ],
  },
  {
    id: "18-Timer",
    hot: true,
    apis: [
      {
        name: "sq_timer_",
        callCount: 18,
        evidence: "extracted",
        combatRelevant: true,
        sample: "turnwindmill.nut: obj.sq_timer_.setParameter(term, -1) / resetInstant(0)",
        note: "延迟定时器子对象(setParameter / resetInstant)",
      },
    ],
  },
  {
    id: "20-Time",
    hot: true,
    apis: [
      {
        name: "sq_GetCurrentTime",
        callCount: 47,
        evidence: "extracted",
        combatRelevant: true,
        sample: "elementalstrikeex.nut: local currentT = sq_GetCurrentTime(pAni)",
        note: "查询动画 / 对象当前时间",
      },
      { name: "sq_SetValidTime", callCount: 14, evidence: "inferred", combatRelevant: true },
      { name: "sq_GetFrameStartTime", callCount: 11, evidence: "inferred", combatRelevant: true },
      { name: "sq_GetStateTimer", callCount: 7, evidence: "inferred", combatRelevant: true },
    ],
  },
  {
    id: "21-Predicate",
    hot: true,
    apis: [
      {
        name: "sq_IsMyControlObject",
        callCount: 41,
        evidence: "extracted",
        combatRelevant: true,
        sample: "ap_icecrash.nut: if(obj && sq_IsMyControlObject(obj))",
        note: "判定对象是否本地控制对象——战斗核心谓词",
      },
      { name: "sq_IsSameAni", callCount: 2, evidence: "inferred", combatRelevant: true },
      { name: "sq_IsIntersectRect", callCount: 2, evidence: "inferred", combatRelevant: true },
      { name: "sq_IsinMapArea", callCount: 2, evidence: "inferred", combatRelevant: true },
      { name: "sq_IsRidingObject", callCount: 2, evidence: "inferred", combatRelevant: true },
      // ── OOS:UI / 创作模式 / 编辑器谓词(PVE 战斗运行时不需要;"解封"把它们从战斗集剥离)──
      {
        name: "sq_IsOpenCreatorControlPopupWindows",
        callCount: 4,
        evidence: "inferred",
        combatRelevant: false,
        note: "创作模式 UI 弹窗",
      },
      {
        name: "sq_IsDownHotKeyCreatorCursor",
        callCount: 3,
        evidence: "inferred",
        combatRelevant: false,
        note: "创作模式光标热键",
      },
      { name: "sq_IsVisibleCursor", callCount: 2, evidence: "inferred", combatRelevant: false, note: "UI 光标可见性" },
      { name: "sq_IsESCClosableWindow", callCount: 2, evidence: "inferred", combatRelevant: false, note: "UI 窗口" },
      {
        name: "sq_IsDownKey",
        callCount: 2,
        evidence: "inferred",
        combatRelevant: false,
        note: "原始按键查询(语义上更近 01-Input,非战斗谓词)",
      },
    ],
  },
];

// ── Helpers(P2b 建系统时按 id 拉取自己负责的 API 集)──

export function bucket(id: string): SystemApiBucket | undefined {
  return SYSTEM_API_MAP.find((b) => b.id === id);
}

export function apisForSystem(id: string): readonly SystemApiEntry[] {
  return bucket(id)?.apis ?? [];
}

/** 某 system 的战斗相关 API(剔除 OOS UI/创作模式谓词)。 */
export function combatApisForSystem(id: string): readonly SystemApiEntry[] {
  return apisForSystem(id).filter((a) => a.combatRelevant);
}

/** 全表已升级为 .nut 第一证据支撑的 API(evidence==="extracted")。 */
export function extractedApis(): readonly SystemApiEntry[] {
  return SYSTEM_API_MAP.flatMap((b) => b.apis.filter((a) => a.evidence === "extracted"));
}
